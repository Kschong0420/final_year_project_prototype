import asyncio
import json
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from .slides import SLIDES

router = APIRouter()


@router.websocket("/ws/sessions/{code}")
async def session_socket(websocket: WebSocket, code: str):
    await websocket.accept()
    store = websocket.app.state.store
    session = None
    registered = False
    try:
        # Token travels in the first frame, not URLs/access logs.
        auth = await asyncio.wait_for(websocket.receive_json(), timeout=10)
        token = auth.get("token") if isinstance(auth, dict) else None
        async with store.lock:
            try:
                session = store.find(code)
            except HTTPException as exc:
                await websocket.close(code=4404, reason=exc.detail)
                return
            if not isinstance(token, str):
                await websocket.close(code=4403, reason="Invalid session credentials.")
                return
            if secrets_equal(token, session.lecturer_token):
                role = "lecturer"
            elif token in session.students:
                role = "student"
            else:
                await websocket.close(code=4403, reason="Invalid session credentials.")
                return
            session.connections[websocket] = (role, token)
            registered = True
            await session.broadcast()

        while True:
            try:
                message = await asyncio.wait_for(websocket.receive_json(), timeout=30)
            except json.JSONDecodeError:
                async with store.lock:
                    await websocket.send_json({"type": "error", "message": "Message must be valid JSON."})
                continue
            async with store.lock:
                if not isinstance(message, dict):
                    await websocket.send_json({"type": "error", "message": "Message must be an object."})
                    continue
                action = message.get("type")
                if action == "ping":
                    await websocket.send_json({"type": "pong"})
                    continue
                if session.status != "active":
                    await websocket.send_json({"type": "error", "message": "Session has ended."})
                    continue
                if action == "submit_feedback":
                    if role != "student":
                        await websocket.send_json({"type": "error", "message": "Only students can submit understanding feedback."})
                        continue
                    slide_index = message.get("slide_index")
                    choice = message.get("choice")
                    if type(slide_index) is not int or slide_index != session.current_slide:
                        await websocket.send_json({"type": "error", "message": "The slide has changed. Submit feedback for the current slide."})
                        continue
                    if choice not in ("understand", "not_understand"):
                        await websocket.send_json({"type": "error", "message": "Choose Understand or Not Understand."})
                        continue
                    request_id = message.get("request_id")
                    if request_id is not None and (type(request_id) is not int or request_id < 1):
                        await websocket.send_json({"type": "error", "message": "Invalid feedback request."})
                        continue
                    responses = session.feedback.setdefault(slide_index, {})
                    if responses.get(token) != choice:
                        responses[token] = choice
                        await session.broadcast()
                    await websocket.send_json({
                        "type": "feedback_ack", "slide_index": slide_index,
                        "choice": choice, "request_id": request_id,
                    })
                    continue
                if role != "lecturer":
                    await websocket.send_json({"type": "error", "message": "Only the lecturer can control the session."})
                    continue
                if action == "set_slide":
                    index = message.get("index")
                    if type(index) is not int or not 0 <= index < len(SLIDES):
                        await websocket.send_json({"type": "error", "message": "Invalid slide number."})
                        continue
                    session.current_slide = index
                    await session.broadcast()
                elif action == "end_session":
                    session.status = "ended"
                    await session.broadcast()
                    for socket in list(session.connections):
                        try:
                            await socket.close(code=1000, reason="Session ended.")
                        except Exception:
                            pass
                    session.connections.clear()
                    return
                else:
                    await websocket.send_json({"type": "error", "message": "Unknown session command."})
    except (WebSocketDisconnect, asyncio.TimeoutError, json.JSONDecodeError, RuntimeError):
        pass
    finally:
        if registered:
            async with store.lock:
                session.connections.pop(websocket, None)
                if session.status == "active":
                    await session.broadcast()
        try:
            await websocket.close()
        except Exception:
            pass


def secrets_equal(left, right):
    import secrets
    return secrets.compare_digest(left, right)
