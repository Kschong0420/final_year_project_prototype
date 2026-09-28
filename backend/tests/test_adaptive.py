"""Milestone 5 deterministic model, authorization, privacy and live workflow tests."""
import asyncio
import json
import threading
import unittest
from contextlib import ExitStack
from dataclasses import asdict
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from app.ai_generation import AIError, OllamaClient
from app.activities import Activity
from app.explanation_generation import source_error
from app.main import create_app
from tests.test_activities import SOURCE, QUESTIONS, pdf_bytes, receive

OUTPUT = "Plants use photosynthesis to turn light energy into chemical energy. Chlorophyll absorbs light."
QUOTE = "Chlorophyll absorbs light in the chloroplast."


class FakeExplanationAI:
    def __init__(self):
        self.calls = []

    async def explain(self, source, slide):
        self.calls.append((source, slide))
        return OUTPUT, source, 0.1, "phi3:mini"


class ExplanationClientTests(unittest.IsolatedAsyncioTestCase):
    async def run_model(self, result=None, failure=None):
        def handler(request):
            if request.url.path == '/api/tags':
                if failure == 'offline':
                    raise httpx.ConnectError('offline')
                return httpx.Response(200, json={'models': [] if failure == 'missing' else [{'name': 'phi3:mini'}]})
            data = json.loads(request.content)
            self.assertIn(SOURCE, data['prompt'])
            self.assertIn('Selected slide 2', data['prompt'])
            self.assertFalse(data['stream'])
            if failure == 'timeout':
                raise httpx.ReadTimeout('slow')
            return httpx.Response(200, json=result)
        real = httpx.AsyncClient
        with patch('app.ai_generation.httpx.AsyncClient', side_effect=lambda **kw: real(transport=httpx.MockTransport(handler), **kw)):
            return await OllamaClient().explain(SOURCE, 2)

    async def test_prompt_and_valid_response(self):
        output, quote, duration, model = await self.run_model({'response': json.dumps({'explanation': OUTPUT, 'source_quote': QUOTE})})
        self.assertEqual((output, quote, model), (OUTPUT, QUOTE, 'phi3:mini'))
        self.assertGreaterEqual(duration, 0)

    async def test_offline_missing_and_timeout(self):
        for failure, status in [('offline', 503), ('missing', 503), ('timeout', 504)]:
            with self.subTest(failure=failure), self.assertRaises(AIError) as caught:
                await self.run_model(failure=failure)
            self.assertEqual(caught.exception.status, status)

    async def test_empty_malformed_unexpected_and_unsupported_responses(self):
        for result in [None, [], {}, {'response': ''}, {'response': '{}'}, {'response': '[]'},
                       {'response': json.dumps({'explanation': '', 'source_quote': ''})},
                       {'response': json.dumps({'explanation': 42, 'source_quote': QUOTE})},
                       {'response': json.dumps({'explanation': OUTPUT, 'source_quote': 'This is not in the source.'})},
                       {'response': json.dumps({'explanation': 'Satellites orbit distant planets.', 'source_quote': QUOTE})}]:
            with self.subTest(result=result), self.assertRaises(AIError):
                await self.run_model(result)

    async def test_unusable_source_never_calls_ollama(self):
        for source in ['', 'Introduction', 'x' * 80, '123 456 ' * 20, ('cell | ' * 50), SOURCE * 100]:
            self.assertIsNotNone(source_error(source))
            with patch.object(OllamaClient, 'status') as status, self.assertRaises(AIError):
                await OllamaClient().explain(source, 1)
            status.assert_not_called()


class AdaptiveWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(create_app())
        self.client.__enter__()
        self.addCleanup(self.client.__exit__, None, None, None)
        self.ai = FakeExplanationAI()
        self.client.app.state.ai = self.ai
        self.teacher = self.client.post('/api/sessions', json={'title': 'M5 lesson'}).json()
        self.base = f"/api/sessions/{self.teacher['code']}"
        self.headers = {'Authorization': 'Bearer ' + self.teacher['token']}
        self.session = self.client.app.state.store.session
        self.session.slides = [{'title': 'Plants', 'text': SOURCE}, {'title': 'Another concept', 'text': SOURCE + ' Light is absorbed by chlorophyll.'}]
        self.a = self.client.post(self.base + '/join').json()
        self.b = self.client.post(self.base + '/join').json()

    def generate(self, slide=0):
        return self.client.post(self.base + '/explanations/generate', headers=self.headers,
                                json={'slide_index': slide, 'presentation_id': self.session.presentation_id})

    def action(self, item, action):
        return self.client.post(f"{self.base}/explanations/{item['id']}/{action}", headers=self.headers, json={'version': item['version']})

    def question(self, text='Could you explain this step?', **changes):
        body = {'text': text, 'presentation_id': self.session.presentation_id, 'slide_index': self.session.current_slide, **changes}
        return self.client.post(self.base + '/anonymous-questions', headers={'Authorization': 'Bearer ' + self.a['token']}, json=body)

    def connect(self, stack, credentials):
        socket = stack.enter_context(self.client.websocket_connect('/ws/sessions/' + self.teacher['code']))
        socket.send_json({'token': credentials['token']})
        receive(socket, lambda message: message.get('type') == 'state')
        return socket

    def test_confusion_never_calls_ai_and_manual_other_slide(self):
        with ExitStack() as stack:
            teacher = self.connect(stack, self.teacher)
            for credentials, choice in [(self.a, 'understand'), (self.b, 'not_understand')]:
                socket = self.connect(stack, credentials)
                socket.send_json({'type': 'submit_feedback', 'slide_index': 0, 'presentation_id': 'sample', 'choice': choice, 'request_id': 1})
                receive(socket, lambda message: message.get('type') == 'feedback_ack')
            state = receive(teacher, lambda message: message.get('current_feedback', {}).get('total') == 2)
            self.assertEqual(state['flagged_slides'], [0])
            self.assertEqual(state['current_feedback']['not_understand_percent'], 50)
            self.assertEqual(state['current_feedback']['understand'], 1)
            self.assertEqual(state['current_feedback']['not_understand'], 1)
            self.assertEqual(self.ai.calls, [])
            self.assertEqual(self.generate().status_code, 201)
            item = self.generate(1).json()
            self.assertEqual(item['slide_index'], 1)
            self.assertEqual(item['source_text'], self.session.slides[1]['text'])
            self.assertEqual(self.ai.calls[-1], (self.session.slides[1]['text'], 2))
            self.assertEqual(self.session.current_slide, 0)

    def test_review_private_until_approved_and_shared_two_students_and_late_join(self):
        item = self.generate().json()
        self.assertEqual(self.action(item, 'share').status_code, 409)
        item = self.action(item, 'approve').json()
        private = self.session.snapshot('student', self.a['token'])
        self.assertEqual(private['shared_explanations'], [])
        self.assertNotIn('explanations', private)
        old_version = item['version']
        edit = self.client.put(f"{self.base}/explanations/{item['id']}", headers=self.headers,
                               json={'text': 'Lecturer: ' + OUTPUT, 'version': old_version}).json()
        self.assertEqual(edit['original'], OUTPUT)
        self.assertEqual(edit['status'], 'pending')
        self.assertEqual(self.action(item, 'share').status_code, 409)
        item = self.action(edit, 'approve').json()
        with ExitStack() as stack:
            sockets = [self.connect(stack, credentials) for credentials in [self.a, self.b]]
            shared = self.action(item, 'share')
            self.assertEqual(shared.status_code, 200)
            for socket in sockets:
                state = receive(socket, lambda message: bool(message.get('shared_explanations')))
                public = state['shared_explanations'][0]
                self.assertEqual(public['text'], 'Lecturer: ' + OUTPUT)
                self.assertEqual(set(public), {'id', 'presentation_id', 'slide_index', 'text'})
                self.assertEqual(state['current_slide'], 0)
            late = self.client.post(self.base + '/join').json()
            self.assertEqual(self.session.snapshot('student', late['token'])['shared_explanations'][0], public)
        discarded = self.action(self.generate(1).json(), 'discard').json()
        self.assertEqual(discarded['status'], 'discarded')
        self.assertEqual(self.action(discarded, 'approve').status_code, 409)

    def test_student_authorization_validation_and_anonymous_record(self):
        with ExitStack() as stack:
            teacher = self.connect(stack, self.teacher)
            self.assertEqual(self.question().status_code, 201)
            state = receive(teacher, lambda message: len(message.get('anonymous_questions', [])) == 1)
            record = state['anonymous_questions'][0]
            self.assertEqual(set(record), {'id', 'session_code', 'presentation_id', 'slide_index', 'text'})
            self.assertEqual(asdict(self.session.anonymous_questions[0]), record)
            self.assertNotIn(self.a['token'], json.dumps(record))
            self.assertNotIn('anonymous_questions', self.session.snapshot('student', self.b['token']))
        for text in ['', '   ', 'x' * 1001]:
            self.assertEqual(self.question(text).status_code, 422)
        self.assertEqual(self.question(slide_index=True).status_code, 422)
        self.assertEqual(self.question(slide_index=1).status_code, 409)
        self.assertEqual(self.question(presentation_id='old').status_code, 409)
        self.assertEqual(self.question(student_id='unwanted').status_code, 422)
        payload = {'presentation_id': 'sample', 'slide_index': 0, 'text': 'A question'}
        self.assertEqual(self.client.post(self.base + '/anonymous-questions', headers=self.headers, json=payload).status_code, 403)
        item = self.generate().json()
        student_headers = {'Authorization': 'Bearer ' + self.a['token']}
        for action in ['approve', 'share', 'discard']:
            self.assertEqual(self.client.post(f"{self.base}/explanations/{item['id']}/{action}", headers=student_headers,
                                              json={'version': item['version']}).status_code, 403)
        self.assertEqual(self.client.put(f"{self.base}/explanations/{item['id']}", headers=student_headers,
                                         json={'version': item['version'], 'text': OUTPUT}).status_code, 403)
        self.assertEqual(self.client.post(self.base + '/explanations/generate', headers=student_headers,
                                          json={'presentation_id': 'sample', 'slide_index': 0}).status_code, 403)
        self.assertEqual(len(self.session.anonymous_questions), 1)

    def test_failure_preserves_session_retry_and_source_validation(self):
        for status in [502, 503, 504]:
            async def fail(*args):
                raise AIError('Ollama failure; retry explicitly.', status)
            with patch.object(self.ai, 'explain', side_effect=fail):
                self.assertEqual(self.generate().status_code, status)
            self.assertFalse(self.session.explanation_generation_in_progress)
            self.assertEqual(self.session.status, 'active')
            self.assertEqual(self.session.explanations, {})
        self.assertEqual(self.generate().status_code, 201)
        self.session.slides[1]['text'] = ''
        self.assertEqual(self.generate(1).status_code, 422)
        self.assertEqual(len(self.ai.calls), 1)

    def test_slow_generation_live_navigation_feedback_and_replacement(self):
        self.session.activities['prepared'] = Activity('prepared', 'sample', 0, QUESTIONS[0], QUESTIONS[0], 'fixture', 0.1, status='released')
        started, release = threading.Event(), threading.Event()
        original = self.ai.explain
        async def slow(source, slide):
            started.set()
            await asyncio.to_thread(release.wait, 8)
            return await original(source, slide)
        self.ai.explain = slow
        result = {}
        with ExitStack() as stack:
            teacher = self.connect(stack, self.teacher)
            student = self.connect(stack, self.a)
            thread = threading.Thread(target=lambda: result.setdefault('response', self.generate()), daemon=True)
            thread.start()
            try:
                self.assertTrue(started.wait(3))
                self.assertEqual(self.generate().status_code, 409)
                teacher.send_json({'type': 'set_slide', 'index': 1})
                receive(student, lambda message: message.get('current_slide') == 1)
                student.send_json({'type': 'submit_feedback', 'slide_index': 1, 'presentation_id': 'sample', 'choice': 'not_understand', 'request_id': 1})
                state = receive(teacher, lambda message: message.get('current_feedback', {}).get('total') == 1)
                self.assertTrue(state['explanation_generation_in_progress'])
                student.send_json({'type': 'submit_activity', 'activity_id': 'prepared', 'answer': 0,
                                   'presentation_id': 'sample', 'request_id': 2})
                receive(student, lambda message: message.get('type') == 'activity_ack')
                self.assertEqual(self.session.activities['prepared'].responses[self.a['token']], 0)
                self.assertEqual(self.question().status_code, 201)
                upload = self.client.post(self.base + '/materials', headers=self.headers, files={'file': ('new.pdf', pdf_bytes(), 'application/pdf')})
                self.assertEqual(upload.status_code, 201)
                self.assertEqual(self.session.anonymous_questions, [])
            finally:
                release.set()
                thread.join(5)
        self.assertEqual(result['response'].status_code, 409)
        self.assertFalse(self.session.explanation_generation_in_progress)
        self.assertEqual(self.session.explanations, {})
        self.assertEqual(self.generate().status_code, 201)

    def test_replacement_clears_shared_records_and_restart_loses_session(self):
        item = self.action(self.generate().json(), 'approve').json()
        self.action(item, 'share')
        self.question()
        response = self.client.post(self.base + '/materials', headers=self.headers, files={'file': ('new.pdf', pdf_bytes(), 'application/pdf')})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.session.explanations, {})
        self.assertEqual(self.session.anonymous_questions, [])
        self.assertEqual(self.action(item, 'share').status_code, 404)
        with TestClient(create_app()) as restarted:
            self.assertEqual(restarted.post(self.base + '/join').status_code, 404)
            self.assertIsNone(restarted.app.state.store.session)
