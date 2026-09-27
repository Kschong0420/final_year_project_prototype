"""Lecturer-reviewed classroom questions and aggregate student answers."""
import secrets
from collections import Counter
from copy import deepcopy
from dataclasses import dataclass, field
from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from .ai_generation import AIError, source_quality, validate_question

router = APIRouter(prefix="/api/sessions/{code}/activities")


@dataclass
class Activity:
    id: str
    presentation_id: str
    slide_index: int
    original: dict
    current: dict
    model: str
    generation_seconds: float
    source_text: str = ""
    teaching_notes: str = ""
    difficulty: str = "basic"
    review_history: list[dict] = field(default_factory=list)
    status: str = "pending"
    responses: dict[str, int | str] = field(default_factory=dict)

    def lecturer_view(self):
        result = {"id": self.id, "presentation_id": self.presentation_id,
                  "slide_index": self.slide_index, "original": self.original,
                  "current": self.current, "model": self.model,
                  "generation_seconds": self.generation_seconds,
                  "source_text": self.source_text, "teaching_notes": self.teaching_notes,
                  "difficulty": self.difficulty, "review_history": self.review_history,
                  "status": self.status, "edited": self.current != self.original,
                  "total_submissions": len(self.responses)}
        if self.current["type"] == "mcq":
            counts = Counter(answer for answer in self.responses.values() if type(answer) is int)
            result["distribution"] = [counts.get(index, 0) for index in range(4)]
        else:
            counts = Counter(answer.strip() for answer in self.responses.values() if isinstance(answer, str))
            result["answers"] = [{"answer": answer, "count": count} for answer, count in counts.most_common()]
        return result

    def student_view(self, token):
        question = self.current
        result = {"id": self.id, "presentation_id": self.presentation_id,
                  "slide_index": self.slide_index, "type": question["type"],
                  "prompt": question["prompt"], "my_answer": self.responses.get(token)}
        if question["type"] == "mcq":
            result["options"] = question["options"]
        return result


class GenerateRequest(BaseModel):
    presentation_id: str
    slide_index: int = Field(ge=0)
    teaching_notes: str = Field(default="", max_length=4000)
    difficulty: Literal["basic", "intermediate", "advanced"] = "basic"


class EditRequest(BaseModel):
    question: dict


def _lecturer(store, code, authorization):
    session = store.find(code)
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not token or not secrets.compare_digest(token, session.lecturer_token):
        raise HTTPException(403, "Only the lecturer controlling this session can manage activities.")
    return session


def _activity(session, activity_id):
    activity = session.activities.get(activity_id)
    if not activity or activity.presentation_id != session.presentation_id:
        raise HTTPException(404, "Activity not found for this presentation.")
    return activity


@router.get("/ai-status")
async def ai_status(code: str, request: Request, authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        _lecturer(store, code, authorization)
    try:
        return await request.app.state.ai.status()
    except AIError as exc:
        raise HTTPException(exc.status, str(exc)) from exc


@router.post("/generate", status_code=201)
async def generate(code: str, body: GenerateRequest, request: Request, authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = _lecturer(store, code, authorization)
        if not session.active_material or body.presentation_id != session.presentation_id:
            raise HTTPException(409, "Upload material first or select the current presentation.")
        if body.slide_index >= len(session.slides):
            raise HTTPException(422, "Select a valid slide.")
        source = session.slides[body.slide_index].get("text", "")
        notes = body.teaching_notes.strip()
        context = source + ("\n" + notes if notes else "")
        quality = source_quality(context)
        if quality and (len(" ".join(context.split())) < 30 or len(context.split()) < 4 or len(context) > 10000):
            raise HTTPException(422, quality)
        if session.activity_generation_in_progress:
            raise HTTPException(409, "Question generation is already in progress.")
        session.activity_generation_in_progress = True
        presentation_id = session.presentation_id
        await session.broadcast()
    try:
        questions, warnings, duration, model = await request.app.state.ai.generate(
            source, body.slide_index + 1, difficulty=body.difficulty, teaching_notes=notes)
        async with store.lock:
            if store.session is not session or session.status != "active" or session.presentation_id != presentation_id:
                raise HTTPException(409, "The presentation changed while questions were generating. Nothing was saved.")
            created = []
            for question in questions:
                activity = Activity(secrets.token_hex(8), presentation_id, body.slide_index,
                                    deepcopy(question), deepcopy(question), model, duration,
                                    source_text=source, teaching_notes=notes, difficulty=body.difficulty)
                session.activities[activity.id] = activity
                created.append(activity.id)
            await session.broadcast()
        return {"created_ids": created, "warnings": warnings, "generation_seconds": duration,
                "model": model, "source_warning": quality}
    except AIError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    finally:
        async with store.lock:
            session.activity_generation_in_progress = False
            if store.session is session and session.status == "active":
                await session.broadcast()


@router.put("/{activity_id}")
async def edit(code: str, activity_id: str, body: EditRequest, request: Request,
               authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        activity = _activity(_lecturer(store, code, authorization), activity_id)
        if activity.status not in ("pending", "approved"):
            raise HTTPException(409, "Released or discarded questions cannot be edited.")
        try:
            updated = validate_question(body.question)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        if updated["type"] != activity.current["type"]:
            raise HTTPException(422, "Question type cannot be changed.")
        activity.current = updated
        activity.status = "pending"  # Any edit requires a fresh approval.
        activity.review_history.append({"action": "edit", "question": deepcopy(updated)})
        await store.session.broadcast()
        return activity.lecturer_view()


@router.post("/{activity_id}/{action}")
async def change_status(code: str, activity_id: str, action: str, request: Request,
                        authorization: str = Header(default="")):
    if action not in ("approve", "discard", "release"):
        raise HTTPException(404, "Unknown activity action.")
    store = request.app.state.store
    async with store.lock:
        session = _lecturer(store, code, authorization)
        activity = _activity(session, activity_id)
        allowed = {"approve": ("pending",), "discard": ("pending", "approved"),
                   "release": ("approved",)}
        if activity.status not in allowed[action]:
            verb = {"approve": "approved", "discard": "discarded", "release": "released"}[action]
            raise HTTPException(409, f"A {activity.status} question cannot be {verb}.")
        # Validate again at release, even though edits and generation were validated.
        if action == "release":
            try:
                validate_question(activity.current)
            except ValueError as exc:
                raise HTTPException(422, str(exc)) from exc
        activity.status = {"approve": "approved", "discard": "discarded", "release": "released"}[action]
        activity.review_history.append({"action": action, "question": deepcopy(activity.current)})
        await session.broadcast()
        return activity.lecturer_view()
