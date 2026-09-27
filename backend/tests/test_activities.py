"""Milestone 4 question quality, review and live classroom integration."""
import asyncio
import io
import json
import threading
import unittest
from contextlib import ExitStack
from unittest.mock import patch

import httpx
import pymupdf
from fastapi.testclient import TestClient

from app.ai_generation import AIError, OllamaClient, parse_questions, source_quality
from app.main import create_app


SOURCE = ("Photosynthesis converts light energy into chemical energy in plants. "
          "Chlorophyll absorbs light in the chloroplast. Plants use carbon dioxide and water "
          "to produce glucose and oxygen during photosynthesis.")
QUESTIONS = [
    {"type": "mcq", "prompt": "Which pigment absorbs light in the chloroplast?",
     "options": ["Chlorophyll", "Oxygen", "Water", "Glucose"], "correct_index": 0},
    {"type": "mcq", "prompt": "Which product do plants produce during photosynthesis?",
     "options": ["Glucose", "Chloroplast", "Light", "Carbon dioxide"], "correct_index": 0},
    {"type": "fill_blank", "prompt": "Plants use carbon dioxide and water to produce ____ and oxygen.",
     "expected_answer": "glucose"},
]


def pdf_bytes(text=SOURCE):
    document = pymupdf.open()
    page = document.new_page()
    page.insert_textbox(pymupdf.Rect(60, 60, 520, 280), text, fontsize=12)
    result = document.tobytes()
    document.close()
    return result


def receive(socket, predicate):
    for _ in range(40):
        state = socket.receive_json()
        if predicate(state):
            return state
    raise AssertionError("Expected WebSocket message was not received")


class FakeAI:
    model = "phi3:mini"

    async def status(self):
        return {"model": self.model, "available": True}

    async def generate(self, source, slide_number, **options):
        assert slide_number >= 1 and "Photosynthesis" in source
        return QUESTIONS, [], 0.25, self.model


class AIValidationTests(unittest.IsolatedAsyncioTestCase):
    def test_valid_mcqs_and_blank_are_source_grounded(self):
        accepted, warnings = parse_questions(json.dumps({"questions": QUESTIONS}), SOURCE, 2, 1)
        self.assertEqual((accepted, warnings), (QUESTIONS, []))
        self.assertEqual(accepted[2]["expected_answer"], "glucose")

    def test_invalid_json_partial_and_ungrounded_questions(self):
        with self.assertRaisesRegex(AIError, "invalid JSON"):
            parse_questions("{broken", SOURCE, 2, 1)
        invalid = {"type": "mcq", "prompt": "Which colour does the moon have at noon?",
                   "options": ["Purple", "Blue", "Green", "Orange"], "correct_index": 0}
        malformed = {"type": "fill_blank", "prompt": "No blank here", "expected_answer": "oxygen"}
        accepted, warnings = parse_questions(json.dumps({"questions": [QUESTIONS[0], invalid, malformed]}), SOURCE, 2, 1)
        self.assertEqual(accepted, [QUESTIONS[0]])
        self.assertGreaterEqual(len(warnings), 3)
        with self.assertRaisesRegex(AIError, "any valid"):
            parse_questions(json.dumps({"questions": [invalid]}), SOURCE, 2, 1)
        self.assertIsNotNone(source_quality("Image only"))

    async def test_real_http_shape_is_mocked_for_tags_and_generate(self):
        calls = []

        def handler(request):
            calls.append(request)
            if request.url.path == "/api/tags":
                return httpx.Response(200, json={"models": [{"name": "phi3:mini"}]})
            payload = json.loads(request.content)
            self.assertEqual(payload["model"], "phi3:mini")
            self.assertEqual(payload["format"], "json")
            self.assertFalse(payload["stream"])
            self.assertIn(SOURCE, payload["prompt"])
            return httpx.Response(200, json={"response": json.dumps({"questions": QUESTIONS})})

        real_client = httpx.AsyncClient
        def mocked_client(*args, **kwargs):
            return real_client(transport=httpx.MockTransport(handler), **kwargs)

        with patch("app.ai_generation.httpx.AsyncClient", side_effect=mocked_client):
            questions, warnings, seconds, model = await OllamaClient().generate(SOURCE, 1)
        self.assertEqual((questions, warnings, model), (QUESTIONS, [], "phi3:mini"))
        self.assertGreaterEqual(seconds, 0)
        self.assertEqual([call.url.path for call in calls], ["/api/tags", "/api/generate"])

    async def test_stopped_service_and_missing_model_errors(self):
        def unavailable(_request):
            raise httpx.ConnectError("offline")
        def missing(_request):
            return httpx.Response(200, json={"models": []})
        real_client = httpx.AsyncClient
        for handler, expected in ((unavailable, "Cannot reach Ollama"), (missing, "unavailable")):
            with patch("app.ai_generation.httpx.AsyncClient", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
                with self.assertRaisesRegex(AIError, expected):
                    await OllamaClient().status()

    async def test_difficulty_and_separate_context_reach_model_prompt(self):
        source = "Photosynthesis:\n1. Chlorophyll absorbs light.\n2. Plants produce glucose and oxygen."
        notes = "Plants use carbon dioxide and water during photosynthesis."
        def handler(request):
            if request.url.path == "/api/tags":
                return httpx.Response(200, json={"models": [{"name": "phi3:mini"}]})
            prompt = json.loads(request.content)["prompt"]
            self.assertIn("Requested difficulty: advanced", prompt)
            self.assertIn(f"<slide>\n{source}\n</slide>", prompt)
            self.assertIn(f"<teaching_notes>\n{notes}\n</teaching_notes>", prompt)
            self.assertIn("do not infer missing relationships", prompt)
            return httpx.Response(200, json={"response": json.dumps({"questions": [QUESTIONS[2]]})})
        real_client = httpx.AsyncClient
        with patch("app.ai_generation.httpx.AsyncClient", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
            questions, warnings, _, _ = await OllamaClient().generate(source, 1, "advanced", notes)
        self.assertEqual(questions, [QUESTIONS[2]])
        self.assertTrue(any("not a verified rating" in warning for warning in warnings))

    async def test_generation_timeout_has_clear_error(self):
        def handler(request):
            if request.url.path == "/api/tags":
                return httpx.Response(200, json={"models": [{"name": "phi3:mini"}]})
            raise httpx.ReadTimeout("slow model")
        real_client = httpx.AsyncClient
        with patch("app.ai_generation.httpx.AsyncClient", side_effect=lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)):
            with self.assertRaisesRegex(AIError, "timed out"):
                await OllamaClient().generate(SOURCE, 1)


class ActivityWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app())
        self.client.app.state.ai = FakeAI()
        self.lecturer = self.client.post("/api/sessions", json={"title": "Biology"}).json()
        self.code = self.lecturer["code"]
        self.base = f"/api/sessions/{self.code}/activities"
        self.headers = {"Authorization": f"Bearer {self.lecturer['token']}"}
        upload = self.client.post(f"/api/sessions/{self.code}/materials", headers=self.headers,
                                  files={"file": ("lesson.pdf", pdf_bytes(), "application/pdf")})
        self.assertEqual(upload.status_code, 201, upload.text)
        self.presentation_id = upload.json()["presentation_id"]

    def tearDown(self):
        self.client.close()

    def generate(self):
        return self.client.post(self.base + "/generate", headers=self.headers,
                                json={"slide_index": 0, "presentation_id": self.presentation_id})

    def connect(self, stack, credentials):
        socket = stack.enter_context(self.client.websocket_connect(f"/ws/sessions/{self.code}"))
        socket.send_json({"token": credentials["token"]})
        receive(socket, lambda state: state.get("type") == "state")
        return socket

    def join(self):
        return self.client.post(f"/api/sessions/{self.code}/join").json()

    def test_review_release_two_students_results_and_privacy(self):
        with ExitStack() as stack:
            teacher = self.connect(stack, self.lecturer)
            student_a_credentials, student_b_credentials = self.join(), self.join()
            a = self.connect(stack, student_a_credentials)
            b = self.connect(stack, student_b_credentials)
            generated = self.generate()
            self.assertEqual(generated.status_code, 201, generated.text)
            ids = generated.json()["created_ids"]
            self.assertEqual(len(ids), 3)
            pending = receive(teacher, lambda state: len(state.get("activities", [])) == 3)
            self.assertTrue(all(item["status"] == "pending" for item in pending["activities"]))
            self.assertEqual(receive(a, lambda state: "released_activities" in state)["released_activities"], [])
            self.assertEqual(receive(b, lambda state: "released_activities" in state)["released_activities"], [])
            self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/release", headers=self.headers).status_code, 409)
            edited = dict(QUESTIONS[0], prompt="Which pigment takes in light in a chloroplast?")
            saved = self.client.put(f"{self.base}/{ids[0]}", headers=self.headers, json={"question": edited})
            self.assertEqual(saved.status_code, 200, saved.text)
            self.assertTrue(saved.json()["edited"])
            self.assertEqual(saved.json()["original"], QUESTIONS[0])
            self.assertEqual(saved.json()["current"], edited)
            self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/approve", headers=self.headers).status_code, 200)
            released = self.client.post(f"{self.base}/{ids[0]}/release", headers=self.headers)
            self.assertEqual(released.status_code, 200)
            self.assertEqual(self.client.post(f"{self.base}/{ids[1]}/discard", headers=self.headers).status_code, 200)
            self.assertEqual(self.client.post(f"{self.base}/{ids[2]}/approve", headers=self.headers).status_code, 200)
            self.assertEqual(self.client.post(f"{self.base}/{ids[2]}/release", headers=self.headers).status_code, 200)
            for socket in (a, b):
                public = receive(socket, lambda state: len(state.get("released_activities", [])) == 2)
                self.assertNotIn("correct_index", json.dumps(public["released_activities"]))
                self.assertNotIn("expected_answer", json.dumps(public["released_activities"]))
                self.assertEqual({item["id"] for item in public["released_activities"]}, {ids[0], ids[2]})
                self.assertNotIn("activities", public)
            self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/approve", headers={"Authorization": f"Bearer {student_a_credentials['token']}"}).status_code, 403)
            for socket, answer, request_id in ((a, 0, 1), (b, 1, 1)):
                socket.send_json({"type": "submit_activity", "activity_id": ids[0], "answer": answer,
                                  "presentation_id": self.presentation_id, "request_id": request_id})
                receive(socket, lambda item: item.get("type") == "activity_ack" and item.get("request_id") == request_id)
            totals = receive(teacher, lambda state: any(item["id"] == ids[0] and item["total_submissions"] == 2 for item in state.get("activities", [])))
            item = next(item for item in totals["activities"] if item["id"] == ids[0])
            self.assertEqual(item["distribution"], [1, 1, 0, 0])
            a.send_json({"type": "submit_activity", "activity_id": ids[0], "answer": 2,
                         "presentation_id": self.presentation_id, "request_id": 2})
            receive(a, lambda item: item.get("type") == "activity_ack" and item.get("request_id") == 2)
            changed = receive(teacher, lambda state: any(item["id"] == ids[0] and item["distribution"] == [0, 1, 1, 0] for item in state.get("activities", [])))
            self.assertEqual(next(item for item in changed["activities"] if item["id"] == ids[0])["total_submissions"], 2)
            a.send_json({"type": "submit_activity", "activity_id": ids[2], "answer": "Glucose",
                         "presentation_id": self.presentation_id, "request_id": 3})
            receive(a, lambda item: item.get("type") == "activity_ack" and item.get("request_id") == 3)
            filled = receive(teacher, lambda state: any(item["id"] == ids[2] and item["total_submissions"] == 1 for item in state.get("activities", [])))
            self.assertEqual(next(item for item in filled["activities"] if item["id"] == ids[2])["answers"],
                             [{"answer": "Glucose", "count": 1}])
            self.assertEqual(filled["current_feedback"]["total"], 0)

    def test_validation_stale_generation_and_replacement(self):
        self.assertEqual(self.client.get(self.base + "/ai-status", headers=self.headers).json()["model"], "phi3:mini")
        self.assertEqual(self.client.post(self.base + "/generate", headers=self.headers,
                                          json={"slide_index": 0, "presentation_id": "old"}).status_code, 409)
        ids = self.generate().json()["created_ids"]
        invalid = self.client.put(f"{self.base}/{ids[0]}", headers=self.headers,
                                  json={"question": dict(QUESTIONS[0], options=["same"] * 4)})
        self.assertEqual(invalid.status_code, 422)
        self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/approve", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.put(f"{self.base}/{ids[0]}", headers=self.headers,
                                         json={"question": dict(QUESTIONS[0], prompt="Which pigment absorbs light in plants?")}).json()["status"], "pending")
        self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/release", headers=self.headers).status_code, 409)
        replacement = self.client.post(f"/api/sessions/{self.code}/materials", headers=self.headers,
                                       files={"file": ("replacement.pdf", pdf_bytes(), "application/pdf")})
        self.assertEqual(replacement.status_code, 201)
        session = self.client.app.state.store.session
        self.assertEqual(session.activities, {})
        self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/approve", headers=self.headers).status_code, 404)
        self.assertEqual(self.client.post(self.base + "/generate", headers=self.headers,
                                          json={"slide_index": 0, "presentation_id": self.presentation_id}).status_code, 409)

    def test_questions_keep_the_selected_slide_number(self):
        session = self.client.app.state.store.session
        session.slides.append(dict(session.slides[0], title="Second lesson page"))
        generated = self.client.post(self.base + "/generate", headers=self.headers,
                                     json={"slide_index": 1, "presentation_id": self.presentation_id})
        self.assertEqual(generated.status_code, 201, generated.text)
        activity_id = generated.json()["created_ids"][0]
        self.assertEqual(session.activities[activity_id].slide_index, 1)
        self.assertEqual(self.client.post(f"{self.base}/{activity_id}/approve", headers=self.headers).status_code, 200)
        self.assertEqual(self.client.post(f"{self.base}/{activity_id}/release", headers=self.headers).status_code, 200)
        student = self.join()
        state = session.snapshot("student", student["token"])
        self.assertEqual(state["current_slide"], 0)
        self.assertEqual(state["released_activities"][0]["slide_index"], 1)

    def test_ai_error_and_unusable_source_do_not_save(self):
        class FailedAI(FakeAI):
            async def generate(self, *_args, **_options):
                raise AIError("Ollama returned invalid JSON. No questions were saved.")
        self.client.app.state.ai = FailedAI()
        failed = self.generate()
        self.assertEqual(failed.status_code, 502)
        self.assertEqual(self.client.app.state.store.session.activities, {})
        self.assertFalse(self.client.app.state.store.session.activity_generation_in_progress)
        self.client.app.state.store.session.slides[0]["text"] = "No selectable text"
        self.assertEqual(self.generate().status_code, 422)

    def test_slow_generation_does_not_block_websocket_navigation(self):
        prepared_id = self.generate().json()["created_ids"][0]
        self.client.post(f"{self.base}/{prepared_id}/approve", headers=self.headers)
        self.client.post(f"{self.base}/{prepared_id}/release", headers=self.headers)
        started, release = threading.Event(), threading.Event()
        class SlowAI(FakeAI):
            async def generate(self, source, slide_number, **options):
                started.set()
                await asyncio.to_thread(release.wait, 5)
                return await super().generate(source, slide_number)
        self.client.app.state.ai = SlowAI()
        # Give the material a second slide for a live navigation command.
        self.client.app.state.store.session.slides.append(dict(self.client.app.state.store.session.slides[0]))
        result = {}
        with ExitStack() as stack:
            teacher = self.connect(stack, self.lecturer)
            student = self.connect(stack, self.join())
            second_student = self.connect(stack, self.join())
            thread = threading.Thread(target=lambda: result.setdefault("response", self.generate()), daemon=True)
            thread.start()
            try:
                self.assertTrue(started.wait(3))
                teacher.send_json({"type": "set_slide", "index": 1})
                self.assertEqual(receive(student, lambda state: state.get("current_slide") == 1)["current_slide"], 1)
                student.send_json({"type": "submit_feedback", "slide_index": 1,
                                   "choice": "not_understand", "presentation_id": self.presentation_id,
                                   "request_id": 1})
                receive(student, lambda state: state.get("type") == "feedback_ack")
                feedback = receive(teacher, lambda state: state.get("current_feedback", {}).get("total") == 1)
                self.assertTrue(feedback["activity_generation_in_progress"])
                second_student.send_json({"type": "submit_feedback", "slide_index": 1,
                                          "choice": "not_understand", "presentation_id": self.presentation_id,
                                          "request_id": 1})
                receive(second_student, lambda state: state.get("type") == "feedback_ack")
                flagged = receive(teacher, lambda state: state.get("current_feedback", {}).get("flagged"))
                self.assertEqual(flagged["current_feedback"]["total"], 2)
                student.send_json({"type": "submit_activity", "activity_id": prepared_id,
                                   "answer": 0, "presentation_id": self.presentation_id, "request_id": 2})
                receive(student, lambda state: state.get("type") == "activity_ack")
                receive(teacher, lambda state: any(item["total_submissions"] == 1 for item in state.get("activities", [])))
                self.assertEqual(self.generate().status_code, 409)
            finally:
                release.set()
                thread.join(5)
        self.assertEqual(result["response"].status_code, 201)
        session = self.client.app.state.store.session
        self.assertFalse(session.activity_generation_in_progress)
        new_ids = result["response"].json()["created_ids"]
        self.assertTrue(all(session.activities[item_id].status == "pending" for item_id in new_ids))
        self.assertEqual(session.activities[prepared_id].status, "released")

    def test_preparation_context_difficulty_and_saved_questions_survive_join(self):
        session = self.client.app.state.store.session
        self.assertFalse(session.students)
        calls = []
        class RecordingAI(FakeAI):
            async def generate(self, source, slide_number, **options):
                calls.append((source, slide_number, options))
                return await super().generate(source, slide_number, **options)
        self.client.app.state.ai = RecordingAI()
        response = self.client.post(self.base + "/generate", headers=self.headers, json={
            "presentation_id": self.presentation_id, "slide_index": 0,
            "difficulty": "advanced", "teaching_notes": "Additional context from slide 2."})
        self.assertEqual(response.status_code, 201, response.text)
        ids = response.json()["created_ids"]
        self.assertEqual(calls[0][2]["difficulty"], "advanced")
        edited = dict(QUESTIONS[0], prompt="Which pigment absorbs light in plant chloroplasts?")
        self.client.put(f"{self.base}/{ids[0]}", headers=self.headers, json={"question": edited})
        approved = self.client.post(f"{self.base}/{ids[0]}/approve", headers=self.headers).json()
        self.client.post(f"{self.base}/{ids[1]}/discard", headers=self.headers)
        self.assertEqual(approved["original"], QUESTIONS[0])
        self.assertEqual(approved["source_text"], calls[0][0])
        self.assertEqual(approved["teaching_notes"], calls[0][2]["teaching_notes"])
        self.assertEqual([entry["action"] for entry in approved["review_history"]], ["edit", "approve"])
        for _ in range(2):
            student = self.join()
            public = session.snapshot("student", student["token"])
            self.assertEqual(public["released_activities"], [])
            self.assertNotIn("teaching_notes", json.dumps(public))
        self.assertEqual(session.activities[ids[0]].status, "approved")
        self.assertEqual(self.client.post(f"{self.base}/{ids[0]}/release", headers=self.headers).status_code, 200)
        self.assertEqual(len(session.snapshot("student", student["token"])["released_activities"]), 1)

    def test_short_factual_bullets_and_notes_are_allowed_but_empty_content_is_rejected(self):
        session = self.client.app.state.store.session
        session.slides[0]["text"] = "Photosynthesis:\n- Chlorophyll absorbs light."
        self.assertEqual(self.generate().status_code, 201)
        session.slides[0]["text"] = ""
        self.assertEqual(self.generate().status_code, 422)
        response = self.client.post(self.base + "/generate", headers=self.headers, json={
            "presentation_id": self.presentation_id, "slide_index": 0, "difficulty": "impossible"})
        self.assertEqual(response.status_code, 422)
