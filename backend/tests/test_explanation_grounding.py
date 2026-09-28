"""Point-form grounding and bounded real-client retry behaviour (mocked HTTP)."""
import json
import unittest
from unittest.mock import patch

import httpx

from app.ai_generation import AIError, OllamaClient
from app.explanation_generation import explanation_prompt, source_error, validate_support


PARAGRAPH = ("Photosynthesis converts light energy into chemical energy in plants. "
             "Chlorophyll absorbs light in the chloroplast. Plants use carbon dioxide and "
             "water to produce glucose and oxygen.")
BULLETS = ("Photosynthesis:\n• Chlorophyll absorbs light.\n• Light energy becomes chemical "
           "energy.\n• Plants use carbon dioxide and water.\n• Glucose and oxygen are produced.")
EXPLANATION = ("Chlorophyll absorbs light. Light energy becomes chemical energy. "
               "Plants use carbon dioxide and water to produce glucose and oxygen.")
QUOTE = "Chlorophyll absorbs light."


def payload(explanation=EXPLANATION, quote=QUOTE):
    return json.dumps({"explanation": explanation, "source_quote": quote})


class GroundingRulesTests(unittest.TestCase):
    def test_paragraph_and_multiple_short_bullets(self):
        self.assertIsNone(source_error(PARAGRAPH))
        self.assertIsNone(source_error(BULLETS))
        validate_support(EXPLANATION, QUOTE, PARAGRAPH)
        validate_support(EXPLANATION, QUOTE, BULLETS)

    def test_punctuation_bullets_and_numbered_points(self):
        source = ("1) Chlorophyll: absorbs light!\n2) Light energy becomes chemical energy; "
                  "3) Plants use carbon dioxide and water.\n4) Glucose and oxygen are produced.")
        self.assertIsNone(source_error(source))
        validate_support(EXPLANATION, "Chlorophyll absorbs light", source)
        self.assertIn("bullets and sentence fragments", explanation_prompt(source, 1))

    def test_quote_spanning_line_breaks(self):
        source = ("Chlorophyll\n\nabsorbs light in the chloroplast.\n\n"
                  "Plants use carbon dioxide and water to produce glucose and oxygen.")
        validate_support("Chlorophyll absorbs light in the chloroplast. Plants use carbon dioxide and water.",
                         "Chlorophyll absorbs light in the chloroplast", source)

    def test_quote_from_a_single_bullet_supports_combined_explanation(self):
        validate_support(EXPLANATION, "Light energy becomes chemical energy", BULLETS)

    def test_rejects_unsupported_claims_and_numbers(self):
        cases = [
            ("Satellites orbit distant planets and transmit signals.", QUOTE),
            ("Chlorophyll absorbs light on Mars during photosynthesis.", QUOTE),
            ("Photosynthesis converts 90% of light energy into chemical energy.", QUOTE),
            (EXPLANATION, "An unrelated phrase from elsewhere"),
            (EXPLANATION, "Plants use"),
        ]
        for explanation, quote in cases:
            with self.subTest(explanation=explanation, quote=quote), self.assertRaises(ValueError):
                validate_support(explanation, quote, BULLETS)

    def test_insufficient_source_never_looks_plausible(self):
        for source in ("Introduction", "one", "\n• Title\n• Overview", "   "):
            with self.subTest(source=source):
                self.assertIsNotNone(source_error(source))


class GroundingRetryTests(unittest.IsolatedAsyncioTestCase):
    async def call_model(self, outputs, retry_allowed=None):
        calls = []

        def handler(request):
            if request.url.path == "/api/tags":
                return httpx.Response(200, json={"models": [{"name": "phi3:mini"}]})
            body = json.loads(request.content)
            calls.append(body["prompt"])
            response = outputs[len(calls) - 1]
            if isinstance(response, Exception):
                raise response
            return httpx.Response(200, json={"response": response})

        real = httpx.AsyncClient
        with patch("app.ai_generation.httpx.AsyncClient",
                   side_effect=lambda **kw: real(transport=httpx.MockTransport(handler), **kw)):
            client = OllamaClient()
            try:
                result = await client.explain(BULLETS, 1, retry_allowed=retry_allowed)
                return result, calls
            except AIError as exc:
                return exc, calls

    async def test_valid_bullets_do_not_retry(self):
        result, calls = await self.call_model([payload()])
        self.assertEqual(result[:2], (EXPLANATION, QUOTE))
        self.assertEqual(len(calls), 1)

    async def test_grounding_failure_gets_one_corrective_retry(self):
        result, calls = await self.call_model([payload(quote="An invented supporting phrase"), payload()])
        self.assertEqual(result[:2], (EXPLANATION, QUOTE))
        self.assertEqual(len(calls), 2)
        self.assertIn("previous response could not be verified", calls[1])

    async def test_second_grounding_failure_stops(self):
        result, calls = await self.call_model([payload(quote="An invented supporting phrase")] * 2)
        self.assertIsInstance(result, AIError)
        self.assertEqual(len(calls), 2)

    async def test_malformed_response_does_not_retry(self):
        result, calls = await self.call_model(["not JSON"])
        self.assertIsInstance(result, AIError)
        self.assertEqual(len(calls), 1)

    async def test_timeout_does_not_retry(self):
        result, calls = await self.call_model([httpx.ReadTimeout("slow")])
        self.assertEqual(result.status, 504)
        self.assertEqual(len(calls), 1)

    async def test_changed_presentation_disallows_corrective_retry(self):
        result, calls = await self.call_model([payload(quote="An invented supporting phrase")],
                                              retry_allowed=lambda: False)
        self.assertEqual(result.status, 409)
        self.assertEqual(len(calls), 1)
