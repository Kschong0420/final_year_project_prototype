import asyncio
import secrets
from dataclasses import dataclass, field
from fastapi import HTTPException, WebSocket
from .slides import SLIDES
from .feedback import ConfusionRules, summarise


@dataclass
class Session:
    code: str
    title: str
    lecturer_token: str
    current_slide: int = 0
    status: str = "active"
    revision: int = 0
    students: set[str] = field(default_factory=set)
    connections: dict[WebSocket, tuple[str, str]] = field(default_factory=dict)
    feedback: dict[int, dict[str, str]] = field(default_factory=dict)
    confusion_rules: ConfusionRules = field(default_factory=ConfusionRules)

    def snapshot(self, role, token):
        state = {
            "type": "state", "code": self.code, "title": self.title,
            "status": self.status, "current_slide": self.current_slide,
            "slides": SLIDES, "revision": self.revision,
            "connected_students": len({token for role, token in self.connections.values() if role == "student"}),
            "lecturer_connected": any(role == "lecturer" for role, _ in self.connections.values()),
        }
        if role == "lecturer":
            state["current_feedback"] = summarise(
                self.feedback.get(self.current_slide, {}), self.confusion_rules
            )
            state["flagged_slides"] = [
                index for index in range(len(SLIDES))
                if summarise(self.feedback.get(index, {}), self.confusion_rules)["flagged"]
            ]
            state["confusion_rules"] = {
                "threshold_percent": self.confusion_rules.threshold_percent,
                "min_responses": self.confusion_rules.min_responses,
            }
        else:
            state["my_feedback"] = self.feedback.get(self.current_slide, {}).get(token)
        return state

    async def broadcast(self):
        # Called under Store.lock to preserve event ordering.
        self.revision += 1
        async def deliver(socket):
            try:
                role, token = self.connections[socket]
                await asyncio.wait_for(socket.send_json(self.snapshot(role, token)), timeout=2)
            except (Exception,):
                self.connections.pop(socket, None)
                try:
                    await socket.close(code=1011)
                except Exception:
                    pass
        await asyncio.gather(*(deliver(socket) for socket in list(self.connections)))


class Store:
    def __init__(self):
        self.session: Session | None = None
        self.used_codes: set[str] = set()
        self.lock = asyncio.Lock()
        self.confusion_rules = ConfusionRules.from_environment()

    def create(self, title):
        if self.session and self.session.status == "active":
            raise HTTPException(409, "An active session already exists. End it from its lecturer tab first.")
        alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
        code = "".join(secrets.choice(alphabet) for _ in range(6))
        while code in self.used_codes:
            code = "".join(secrets.choice(alphabet) for _ in range(6))
        self.used_codes.add(code)
        self.session = Session(code, title, secrets.token_urlsafe(32), confusion_rules=self.confusion_rules)
        return self.session

    def find(self, code):
        session = self.session
        if not session or session.code != code.strip().upper():
            raise HTTPException(404, "Session code not found. Check the code with your lecturer.")
        if session.status != "active":
            raise HTTPException(410, "This lecture session has ended.")
        return session
