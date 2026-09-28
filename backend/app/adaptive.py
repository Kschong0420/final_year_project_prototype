"""Explicit lecturer explanations and identity-free student question records."""
import secrets
from dataclasses import asdict, dataclass, field

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .ai_generation import AIError, OllamaClient
from .explanation_generation import source_error

router = APIRouter(prefix="/api/sessions/{code}")


@dataclass
class Explanation:
    id: str
    presentation_id: str
    slide_index: int
    source_text: str
    original: str
    current: str
    source_quote: str
    model: str
    generation_seconds: float
    status: str = "pending"
    version: int = 1
    review_history: list[dict] = field(default_factory=list)

    def lecturer_view(self):
        return asdict(self)

    def student_view(self):
        return {"id": self.id, "presentation_id": self.presentation_id,
                "slide_index": self.slide_index, "text": self.current}


@dataclass(frozen=True)
class AnonymousQuestion:
    # Authorisation happens before construction. No token, student ID, IP or author reference.
    id: str
    session_code: str
    presentation_id: str
    slide_index: int
    text: str


class SlideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    presentation_id: str
    slide_index: int = Field(ge=0, strict=True)


class VersionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=1, strict=True)


class EditExplanation(VersionRequest):
    text: str = Field(min_length=1, max_length=3000)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value):
        if not value.strip():
            raise ValueError("Enter explanation text before saving.")
        return value.strip()


class QuestionRequest(SlideRequest):
    text: str = Field(min_length=1, max_length=1000)

    @field_validator("text")
    @classmethod
    def clean_text(cls, value):
        if not value.strip():
            raise ValueError("Enter a question before submitting.")
        return value.strip()


def authorised_session(store, code, authorization, role):
    session = store.find(code)
    token = authorization[7:] if authorization.startswith("Bearer ") else ""
    valid = (token and secrets.compare_digest(token, session.lecturer_token)) if role == "lecturer" else token in session.students
    if not valid:
        raise HTTPException(403, f"Valid {role} session credentials are required.")
    return session


def validate_slide(session, body):
    if body.presentation_id != session.presentation_id:
        raise HTTPException(409, "The presentation changed. Select a slide from the current presentation.")
    if body.slide_index >= len(session.slides):
        raise HTTPException(422, "Select a valid slide.")


@router.post("/explanations/generate", status_code=201)
async def generate_explanation(code: str, body: SlideRequest, request: Request, authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = authorised_session(store, code, authorization, "lecturer")
        validate_slide(session, body)
        source = session.slides[body.slide_index].get("text", "")
        problem = source_error(source)
        if problem:
            raise HTTPException(422, problem)
        if session.explanation_generation_in_progress:
            raise HTTPException(409, "Explanation generation is already in progress.")
        session.explanation_generation_in_progress = True
        await session.broadcast()
    # Never hold the classroom lock during a model request.
    try:
        ai = request.app.state.ai
        # Test doubles keep the original two-argument interface; the real client can avoid
        # a corrective retry after this in-memory presentation has changed.
        if isinstance(ai, OllamaClient):
            original, quote, seconds, model = await ai.explain(
                source, body.slide_index + 1,
                retry_allowed=lambda: store.session is session and session.status == "active"
                and session.presentation_id == body.presentation_id)
        else:
            original, quote, seconds, model = await ai.explain(source, body.slide_index + 1)
        async with store.lock:
            if store.session is not session or session.status != "active" or session.presentation_id != body.presentation_id:
                raise HTTPException(409, "The session or presentation changed during generation. Nothing was saved.")
            explanation = Explanation(secrets.token_hex(8), body.presentation_id, body.slide_index,
                                      source, original, original, quote, model, seconds)
            session.explanations[explanation.id] = explanation
            await session.broadcast()
            return explanation.lecturer_view()
    except AIError as exc:
        raise HTTPException(exc.status, str(exc)) from exc
    finally:
        async with store.lock:
            session.explanation_generation_in_progress = False
            if store.session is session and session.status == "active":
                await session.broadcast()


def editable_explanation(session, explanation_id, version):
    item = session.explanations.get(explanation_id)
    if item is None or item.presentation_id != session.presentation_id:
        raise HTTPException(404, "Explanation not found for this presentation.")
    if item.version != version:
        raise HTTPException(409, "This explanation changed in another window. Review the latest version before continuing.")
    return item


@router.put("/explanations/{explanation_id}")
async def edit_explanation(code: str, explanation_id: str, body: EditExplanation, request: Request,
                           authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = authorised_session(store, code, authorization, "lecturer")
        item = editable_explanation(session, explanation_id, body.version)
        if item.status not in ("pending", "approved"):
            raise HTTPException(409, "Shared or discarded explanations cannot be edited.")
        item.current = body.text
        item.status = "pending"
        item.version += 1
        item.review_history.append({"action": "edit", "text": body.text})
        await session.broadcast()
        return item.lecturer_view()


@router.post("/explanations/{explanation_id}/{action}")
async def review_explanation(code: str, explanation_id: str, action: str, body: VersionRequest,
                             request: Request, authorization: str = Header(default="")):
    allowed = {"approve": ("pending",), "share": ("approved",), "discard": ("pending", "approved")}
    if action not in allowed:
        raise HTTPException(404, "Unknown explanation action.")
    store = request.app.state.store
    async with store.lock:
        session = authorised_session(store, code, authorization, "lecturer")
        item = editable_explanation(session, explanation_id, body.version)
        if item.status not in allowed[action]:
            raise HTTPException(409, "Review and approve an explanation before sharing; shared or discarded versions are final.")
        item.status = {"approve": "approved", "share": "shared", "discard": "discarded"}[action]
        item.version += 1
        item.review_history.append({"action": action, "text": item.current})
        await session.broadcast()
        return item.lecturer_view()


@router.post("/anonymous-questions", status_code=201)
async def submit_question(code: str, body: QuestionRequest, request: Request, authorization: str = Header(default="")):
    store = request.app.state.store
    async with store.lock:
        session = authorised_session(store, code, authorization, "student")
        validate_slide(session, body)
        if body.slide_index != session.current_slide:
            raise HTTPException(409, "The classroom moved to another slide. Review your question for the current slide before sending again.")
        item = AnonymousQuestion(secrets.token_hex(8), session.code, session.presentation_id,
                                 body.slide_index, body.text)
        session.anonymous_questions.append(item)
        await session.broadcast()
        return {"id": item.id, "slide_index": item.slide_index, "message": "Question sent anonymously."}
