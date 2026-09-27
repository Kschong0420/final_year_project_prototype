import secrets
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field, field_validator

router = APIRouter(prefix="/api")


class CreateSession(BaseModel):
    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def validate_title(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Enter a lecture title.")
        return value


class JoinSession(BaseModel):
    previous_token: str | None = None


@router.get("/health")
async def health():
    return {"status": "ok", "storage": "in-memory", "milestone": 2}


@router.post("/sessions", status_code=201)
async def create_session(body: CreateSession, request: Request):
    store = request.app.state.store
    async with store.lock:
        session = store.create(body.title)
        return {"code": session.code, "token": session.lecturer_token, "role": "lecturer"}


@router.post("/sessions/{code}/join")
async def join_session(code: str, request: Request, body: JoinSession | None = None):
    store = request.app.state.store
    async with store.lock:
        session = store.find(code)
        previous_token = body.previous_token if body else None
        if previous_token is not None and previous_token in session.students:
            token = previous_token
        else:
            token = secrets.token_urlsafe(32)
            session.students.add(token)
        return {"code": session.code, "token": token, "role": "student"}
