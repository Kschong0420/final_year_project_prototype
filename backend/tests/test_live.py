"""Real HTTP/WebSocket integration checks against an isolated Uvicorn process."""
import asyncio
import json
import subprocess
import sys
import time
import unittest
from pathlib import Path
import httpx
from websockets.asyncio.client import connect
from websockets.exceptions import ConnectionClosed

ROOT = Path(__file__).resolve().parents[1]
HTTP = "http://127.0.0.1:8768"
WS = "ws://127.0.0.1:8768"


async def receive_until(socket, predicate):
    async with asyncio.timeout(5):
        while True:
            message = json.loads(await socket.recv())
            if predicate(message):
                return message


async def state_at(socket, index):
    return await receive_until(socket, lambda m: m.get("type") == "state" and m["current_slide"] == index)


class LiveClassroomTest(unittest.IsolatedAsyncioTestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8768"],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            if cls.server.poll() is not None:
                raise RuntimeError("Test server failed to start (port 8768 may be occupied).")
            try:
                if httpx.get(HTTP + "/api/health", timeout=0.5).status_code == 200:
                    return
            except httpx.HTTPError:
                pass
            time.sleep(0.1)
        cls.server.terminate()
        raise RuntimeError("Test server did not become ready.")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)

    async def test_a_understanding_feedback(self):
        sockets = []
        async def open_socket(credentials):
            socket = await connect(WS + "/ws/sessions/" + credentials["code"])
            sockets.append(socket)
            await socket.send(json.dumps({"token": credentials["token"]}))
            return socket

        async def submit(socket, slide_index, choice):
            await socket.send(json.dumps({
                "type": "submit_feedback", "slide_index": slide_index, "choice": choice,
            }))

        async with httpx.AsyncClient(base_url=HTTP) as client:
            try:
                lecturer = (await client.post("/api/sessions", json={"title": "Feedback lecture"})).json()
                teacher = await open_socket(lecturer)
                initial = await state_at(teacher, 0)
                self.assertEqual(initial["current_feedback"]["total"], 0)
                self.assertEqual(initial["current_feedback"]["not_understand_percent"], 0)
                self.assertFalse(initial["current_feedback"]["flagged"])
                self.assertEqual(initial["confusion_rules"], {"threshold_percent": 50, "min_responses": 2})

                first = (await client.post(f"/api/sessions/{lecturer['code']}/join")).json()
                second = (await client.post(f"/api/sessions/{lecturer['code']}/join")).json()
                student1 = await open_socket(first)
                first_state = await state_at(student1, 0)
                self.assertIsNone(first_state["my_feedback"])
                self.assertNotIn("current_feedback", first_state)
                student2 = await open_socket(second)
                await state_at(student2, 0)

                await submit(student1, 0, "understand")
                one_understand = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("understand") == 1)
                self.assertEqual(one_understand["current_feedback"]["total"], 1)
                self.assertFalse(one_understand["current_feedback"]["flagged"])
                self.assertEqual((await receive_until(student1, lambda m: m.get("my_feedback") == "understand"))["my_feedback"], "understand")

                await submit(student1, 0, "not_understand")
                one_not_understand = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("not_understand") == 1)
                self.assertEqual(one_not_understand["current_feedback"]["total"], 1)
                self.assertEqual(one_not_understand["current_feedback"]["not_understand_percent"], 100)
                self.assertFalse(one_not_understand["current_feedback"]["flagged"])

                await submit(student1, 0, "understand")
                await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("understand") == 1)
                await submit(student2, 0, "not_understand")
                mixed = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("total") == 2 and m["current_feedback"]["not_understand"] == 1)
                self.assertEqual(mixed["current_feedback"]["not_understand_percent"], 50)
                self.assertTrue(mixed["current_feedback"]["flagged"])
                self.assertEqual(mixed["flagged_slides"], [0])
                self.assertNotIn(first["token"], json.dumps(mixed))
                self.assertNotIn(second["token"], json.dumps(mixed))
                self.assertNotIn("my_feedback", mixed)
                self.assertNotIn("current_feedback", await receive_until(student2, lambda m: m.get("my_feedback") == "not_understand"))

                await submit(student2, 0, "understand")
                cleared = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("understand") == 2)
                self.assertEqual(cleared["current_feedback"]["total"], 2)
                self.assertFalse(cleared["current_feedback"]["flagged"])
                self.assertEqual(cleared["flagged_slides"], [])

                await submit(student1, 0, "not_understand")
                restored = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("not_understand") == 1 and m["current_feedback"]["total"] == 2)
                self.assertTrue(restored["current_feedback"]["flagged"])
                await submit(student1, 0, "not_understand")
                await teacher.send(json.dumps({"type": "set_slide", "index": 1}))
                slide_two = await state_at(teacher, 1)
                self.assertEqual(slide_two["current_feedback"]["total"], 0)
                self.assertEqual(slide_two["flagged_slides"], [0])
                await state_at(student1, 1)
                await submit(student1, 1, "understand")
                slide_two_feedback = await receive_until(teacher, lambda m: m.get("current_slide") == 1 and m.get("current_feedback", {}).get("total") == 1)
                self.assertEqual(slide_two_feedback["current_feedback"]["understand"], 1)
                self.assertFalse(slide_two_feedback["current_feedback"]["flagged"])

                await submit(student1, 0, "not_understand")
                stale = await receive_until(student1, lambda m: m.get("type") == "error")
                self.assertIn("current slide", stale["message"])
                await submit(student1, 1, "invalid")
                await receive_until(student1, lambda m: m.get("type") == "error" and "Choose" in m["message"])
                await submit(teacher, 1, "understand")
                await receive_until(teacher, lambda m: m.get("type") == "error" and "Only students" in m["message"])

                await student1.close()
                await teacher.send(json.dumps({"type": "set_slide", "index": 0}))
                returned = await state_at(teacher, 0)
                self.assertEqual(returned["current_feedback"]["total"], 2)
                self.assertEqual(returned["current_feedback"]["not_understand"], 1)
                self.assertTrue(returned["current_feedback"]["flagged"])
                student1 = await open_socket(first)
                reconnected = await state_at(student1, 0)
                self.assertEqual(reconnected["my_feedback"], "not_understand")
                self.assertNotIn("current_feedback", reconnected)
                print("PASS: per-slide feedback, updates, thresholds, privacy, live broadcast and reconnect")
                print("PASS: confusion flag is a rule result; no automatic explanation event")

                await teacher.send(json.dumps({"type": "end_session"}))
                await receive_until(teacher, lambda m: m.get("status") == "ended")
            finally:
                for socket in sockets:
                    await socket.close()

    async def test_b_rejoin_does_not_duplicate_feedback(self):
        sockets = []

        async def open_socket(credentials):
            socket = await connect(WS + "/ws/sessions/" + credentials["code"])
            sockets.append(socket)
            await socket.send(json.dumps({"token": credentials["token"]}))
            await state_at(socket, 0)
            return socket

        async def submit(socket, choice, request_id):
            await socket.send(json.dumps({
                "type": "submit_feedback", "slide_index": 0,
                "choice": choice, "request_id": request_id,
            }))
            acknowledgement = await receive_until(socket, lambda m: m.get("type") == "feedback_ack" and m.get("request_id") == request_id)
            self.assertEqual(acknowledgement["choice"], choice)

        async with httpx.AsyncClient(base_url=HTTP) as client:
            try:
                lecturer = (await client.post("/api/sessions", json={"title": "Rejoin regression"})).json()
                teacher = await open_socket(lecturer)
                first = (await client.post(f"/api/sessions/{lecturer['code']}/join")).json()
                second = (await client.post(f"/api/sessions/{lecturer['code']}/join")).json()
                student_a = await open_socket(first)
                student_b = await open_socket(second)

                await submit(student_a, "understand", 1)
                await submit(student_b, "understand", 1)
                two = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("understand") == 2)
                self.assertEqual(two["current_feedback"]["total"], 2)

                await student_a.close()
                with self.assertRaises(ConnectionClosed):
                    await student_a.send(json.dumps({"type": "submit_feedback", "slide_index": 0, "choice": "not_understand"}))

                rejoined = (await client.post(
                    f"/api/sessions/{lecturer['code']}/join", json={"previous_token": first["token"]}
                )).json()
                self.assertEqual(rejoined["token"], first["token"])
                student_a = await open_socket(rejoined)
                await submit(student_a, "understand", 2)
                await teacher.send(json.dumps({"type": "set_slide", "index": 1}))
                await state_at(teacher, 1)
                await teacher.send(json.dumps({"type": "set_slide", "index": 0}))
                unchanged = await state_at(teacher, 0)
                self.assertEqual(unchanged["current_feedback"]["total"], 2)
                self.assertEqual(unchanged["current_feedback"]["understand"], 2)

                await submit(student_a, "not_understand", 3)
                changed = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("not_understand") == 1)
                self.assertEqual(changed["current_feedback"]["total"], 2)
                self.assertEqual(changed["current_feedback"]["understand"], 1)
                self.assertEqual((await receive_until(student_b, lambda m: m.get("my_feedback") == "understand"))["my_feedback"], "understand")

                third = (await client.post(f"/api/sessions/{lecturer['code']}/join")).json()
                self.assertNotIn(third["token"], [first["token"], second["token"]])
                student_c = await open_socket(third)
                await submit(student_c, "understand", 1)
                three = await receive_until(teacher, lambda m: m.get("current_feedback", {}).get("total") == 3)
                self.assertEqual(three["current_feedback"]["understand"], 2)
                self.assertEqual(three["current_feedback"]["not_understand"], 1)
                print("PASS: same-token rejoin updates one response; independent third student adds one")

                await teacher.send(json.dumps({"type": "end_session"}))
                await receive_until(teacher, lambda m: m.get("status") == "ended")
            finally:
                for socket in sockets:
                    await socket.close()

    async def test_complete_classroom_workflow(self):
        sockets = []
        async def open_socket(credentials):
            socket = await connect(WS + "/ws/sessions/" + credentials["code"])
            sockets.append(socket)
            await socket.send(json.dumps({"token": credentials["token"]}))
            return socket

        async with httpx.AsyncClient(base_url=HTTP) as client:
            try:
                invalid = await client.post("/api/sessions/ZZZZZZ/join")
                self.assertEqual(invalid.status_code, 404)
                blank = await client.post("/api/sessions", json={"title": "   "})
                self.assertEqual(blank.status_code, 422)
                print("PASS: invalid session code and empty title rejected")

                response = await client.post("/api/sessions", json={"title": "Integration lecture"})
                self.assertEqual(response.status_code, 201)
                lecturer = response.json()
                self.assertEqual(len(lecturer["code"]), 6)
                duplicate = await client.post("/api/sessions", json={"title": "Another lecture"})
                self.assertEqual(duplicate.status_code, 409)
                print("PASS: unique session creation and one-active-session rule")

                teacher = await open_socket(lecturer)
                await state_at(teacher, 0)
                creds = []
                for _ in range(2):
                    joined = await client.post("/api/sessions/" + lecturer["code"].lower() + "/join")
                    self.assertEqual(joined.status_code, 200)
                    creds.append(joined.json())
                student1 = await open_socket(creds[0])
                await state_at(student1, 0)
                student2 = await open_socket(creds[1])
                await state_at(student2, 0)
                await receive_until(teacher, lambda m: m.get("connected_students") == 2)
                print("PASS: two students joined with correct connected count")

                await student1.send(json.dumps({"type": "set_slide", "index": 4}))
                rejected = await receive_until(student1, lambda m: m.get("type") == "error")
                self.assertIn("lecturer", rejected["message"])
                print("PASS: student navigation rejected by backend")

                await teacher.send(json.dumps({"type": "set_slide", "index": 2}))
                for socket in [teacher, student1, student2]:
                    await state_at(socket, 2)
                print("PASS: slide synchronisation to two students")

                late = (await client.post("/api/sessions/" + lecturer["code"] + "/join")).json()
                late_socket = await open_socket(late)
                await state_at(late_socket, 2)
                print("PASS: late join receives current slide")

                await student1.close()
                await receive_until(teacher, lambda m: m.get("connected_students") == 2)
                await teacher.send(json.dumps({"type": "set_slide", "index": 3}))
                await state_at(student2, 3)
                student1 = await open_socket(creds[0])
                restored = await state_at(student1, 3)
                self.assertEqual(restored["connected_students"], 3)
                print("PASS: disconnected student reconnects to latest slide without double counting")

                await teacher.close()
                await receive_until(student2, lambda m: m.get("type") == "state" and not m["lecturer_connected"])
                teacher = await open_socket(lecturer)
                await state_at(teacher, 3)
                print("PASS: lecturer reconnect restores controls and state")

                for bad in [-1, 100, True, "2"]:
                    await teacher.send(json.dumps({"type": "set_slide", "index": bad}))
                    error = await receive_until(teacher, lambda m: m.get("type") == "error")
                    self.assertEqual(error["message"], "Invalid slide number.")
                await teacher.send("not json")
                await receive_until(teacher, lambda m: m.get("type") == "error")
                await teacher.send(json.dumps({"type": "ping"}))
                await receive_until(teacher, lambda m: m.get("type") == "pong")
                print("PASS: slide bounds, malformed input and heartbeat")

                bad_socket = await connect(WS + "/ws/sessions/" + lecturer["code"])
                await bad_socket.send(json.dumps({"token": "wrong-token"}))
                with self.assertRaises(ConnectionClosed):
                    await bad_socket.recv()
                self.assertEqual(bad_socket.close_code, 4403)
                print("PASS: invalid session token rejected")

                await teacher.send(json.dumps({"type": "end_session"}))
                for socket in [teacher, student1, student2, late_socket]:
                    await receive_until(socket, lambda m: m.get("status") == "ended")
                ended_join = await client.post("/api/sessions/" + lecturer["code"] + "/join")
                self.assertEqual(ended_join.status_code, 410)
                again = await client.post("/api/sessions", json={"title": "Next lecture"})
                self.assertEqual(again.status_code, 201)
                self.assertNotEqual(again.json()["code"], lecturer["code"])
                print("PASS: end-session broadcast, ended join rejection and new unique code")
            finally:
                for socket in sockets:
                    await socket.close()


if __name__ == "__main__":
    unittest.main(verbosity=2)
