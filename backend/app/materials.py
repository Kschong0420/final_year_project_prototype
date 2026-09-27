"""Lecturer-only material upload and authenticated PDF preview delivery."""
import asyncio
import os
import secrets
import shutil
import time
from pathlib import Path

from fastapi import APIRouter, File, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from .document_processing import ProcessingError, prepare_pptx, process_pdf


router = APIRouter(prefix="/api")
STORAGE_ROOT = Path(__file__).resolve().parents[1] / "storage"
UPLOAD_ROOT = STORAGE_ROOT / "uploads"
PREVIEW_ROOT = STORAGE_ROOT / "previews"
TEMP_ROOT = STORAGE_ROOT / "tmp"


def max_upload_bytes():
    try:
        value = int(os.getenv("MAX_UPLOAD_MB", "25"))
        return value * 1024 * 1024 if value > 0 else 25 * 1024 * 1024
    except ValueError:
        return 25 * 1024 * 1024


def lecturer_session(store, code, authorization):
    session = store.find(code)
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not token or not secrets.compare_digest(token, session.lecturer_token):
        raise HTTPException(403, "Only the lecturer controlling this session can upload material.")
    return session


def _remove_under(root: Path, target: Path):
    if target.resolve().is_relative_to(root.resolve()) and target.exists():
        for attempt in range(5):
            try:
                if target.is_dir():
                    shutil.rmtree(target)
                else:
                    target.unlink()
                return
            except OSError:
                if attempt < 4:
                    time.sleep(0.05)
                # Cleanup is best effort; never replace the useful validation error.


@router.post("/sessions/{code}/materials", status_code=201)
async def upload_material(code: str, request: Request, file: UploadFile = File(...), authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = lecturer_session(store, code, authorization)
        if session.upload_in_progress:
            raise HTTPException(409, "A material is already being processed. Please wait.")
        session.upload_in_progress = True

    path = None
    preview_dir = None
    try:
        name = Path(file.filename or "").name
        extension = Path(name).suffix.lower()
        if extension == ".ppt":
            raise HTTPException(415, "Legacy .ppt files are not supported. Convert the file to .pptx and upload it again.")
        if extension not in (".pdf", ".pptx"):
            raise HTTPException(415, "Upload a PDF or PPTX file.")
        material_id = secrets.token_hex(16)
        path = UPLOAD_ROOT / session.code / f"{material_id}{extension}"
        preview_dir = PREVIEW_ROOT / session.code / material_id
        path.parent.mkdir(parents=True, exist_ok=True)
        limit = max_upload_bytes()
        size = 0
        with path.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, f"File is too large. The limit is {limit // (1024 * 1024)} MB.")
                output.write(chunk)
        if not size:
            raise HTTPException(422, "The selected file is empty.")
        rendering = "visual"
        warning = None
        try:
            if extension == ".pdf":
                slides = await asyncio.to_thread(process_pdf, path, preview_dir, material_id)
            else:
                slides, rendering, warning = await asyncio.to_thread(
                    prepare_pptx, path, preview_dir, material_id, TEMP_ROOT
                )
        except ProcessingError as exc:
            raise HTTPException(422, str(exc)) from exc
        if not slides:
            raise HTTPException(422, "This file contains no usable slides.")
        if rendering == "text-only":
            _remove_under(STORAGE_ROOT, preview_dir)
        async with store.lock:
            if store.session is not session or session.status != "active":
                raise HTTPException(410, "This lecture session has ended.")
            session.slides = slides
            session.presentation_id = material_id
            session.active_material = {"id": material_id, "filename": name, "kind": extension[1:].upper(),
                                       "slide_count": len(slides), "rendering": rendering, "warning": warning}
            session.current_slide = 0
            session.feedback.clear()
            session.activities.clear()
            await session.broadcast()
        return {"filename": name, "slide_count": len(slides), "presentation_id": material_id,
                "rendering": rendering, "warning": warning}
    except Exception:
        if path:
            _remove_under(STORAGE_ROOT, path)
        if preview_dir:
            _remove_under(STORAGE_ROOT, preview_dir)
        raise
    finally:
        await file.close()
        async with store.lock:
            session.upload_in_progress = False


@router.get("/materials/{material_id}/slides/{slide_number}/image")
async def slide_image(material_id: str, slide_number: int, request: Request, authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = store.session
        token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
        if not session or session.status != "active" or not session.active_material or session.presentation_id != material_id:
            raise HTTPException(404, "Slide image not found.")
        if token != session.lecturer_token and token not in session.students:
            raise HTTPException(403, "Session credentials are required to view this slide.")
        if not 1 <= slide_number <= len(session.slides) or not session.slides[slide_number - 1].get("image_url"):
            raise HTTPException(404, "Slide image not found.")
        path = PREVIEW_ROOT / session.code / material_id / f"slide-{slide_number}.png"
        if not path.is_file():
            raise HTTPException(404, "Slide image not found.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "no-store"})
