# Milestone 4 verification

Run on 27 September 2026 in Windows. The project working tree was clean before this
milestone. Ollama was not installed or reachable locally, so **no real Phi-3 Mini
generation was executed**. The automated tests use explicit mocked Ollama HTTP
responses or a test-only fake Ollama server; these are not evidence of real model
quality, acceptance rate or speed.

## Automated results

From `backend/`:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

The backend suite covers M1–M3 regression plus M4 validation, role controls,
activity state, WebSocket responses and a slow AI request. The frontend suite
includes one browser test with a clearly labelled fake Ollama HTTP fixture;
existing classroom, feedback, document and rejoin browser tests also run.
The latest run had **33 backend tests passed, 0 failed; 7 browser tests passed,
0 failed; frontend production build passed**. One earlier browser run failed
because a new panel made an existing `Extracted text` selector ambiguous; the
selector was made exact and the full suite passed from a fresh backend.

To repeat the browser run without a real model, use four terminals:

```powershell
# Terminal 1: test-only Ollama fixture
cd C:\Users\user\Documents\fyp\Code\backend
.\.venv\Scripts\python.exe -m uvicorn tests.fake_ollama:app --host 127.0.0.1 --port 11435

# Terminal 2: application backend
cd C:\Users\user\Documents\fyp\Code\backend
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11435'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# Terminal 3: frontend
cd C:\Users\user\Documents\fyp\Code\frontend
npm.cmd run dev

# Terminal 4: browser tests
cd C:\Users\user\Documents\fyp\Code\frontend
$env:CLASSROOM_FAKE_OLLAMA = '1'
npm.cmd run test:e2e
npm.cmd run build
```

Run the browser tests only when no other active in-memory session exists on that
backend. The test fixture must never be used to claim genuine AI generation.

| Scenario | Automated result | Real Phi-3 Mini |
| --- | --- | --- |
| M4-T01 Ollama connection | Passed with mocked HTTP `/api/tags` | Not executed |
| M4-T02 configured model available | Passed with mocked model list; missing-model error tested | Not executed |
| M4-T03 two MCQs from one slide | Passed with mocked response and source grounding | Not executed |
| M4-T04 fill-in-the-blank | Passed with mocked response | Not executed |
| M4-T05 structure and slide association | Passed | Not executed |
| M4-T06 unusable source | Passed | Not executed |
| M4-T07 invalid JSON | Passed | Not executed |
| M4-T08 stopped service and missing model | Passed with mocked failures | Not executed |
| M4-T09 edit question | Passed via HTTP and browser | Not executed |
| M4-T10 approve or discard | Passed via HTTP and browser | Not executed |
| M4-T11 release gate and student privacy | Passed via WebSocket and browser | Not executed |
| M4-T12 two student answers | Passed via WebSocket and browser | Not executed |
| M4-T13 repeated submission remains one student | Passed | Not executed |
| M4-T14 live result totals | Passed | Not executed |
| M4-T15 slide association | Passed via presentation ID and slide index | Not executed |
| M4-T16 presentation replacement | Passed via HTTP and browser | Not executed |
| M4-T17 M1–M3 regression | Passed in existing backend/browser suites | Not executed with real model |
| M4-T18 slow request leaves slides live | Passed with delayed fake AI | Not executed |
| M4-T19 no automatic explanation | Passed by existing rule test; no explanation route added | Not executed |
| M4-T20 original versus edited version | Passed via HTTP and browser | Not executed |

The API requests JSON with `format: "json"` and `stream: false` from Ollama.
Pydantic requires an MCQ with four distinct options and a valid correct index,
or a fill-in question with one `____` and an answer. Correct answer text must
occur in the selected slide's extracted text; obvious unrelated or duplicated
questions are discarded. Valid partial results are retained with warnings.
This cannot prove factual correctness, so lecturer review is required.

## Manual run with the real local model

1. Install Ollama and run `ollama pull phi3:mini`; confirm `ollama list` shows
   `phi3:mini`. Start the Ollama app or `ollama serve` if the service is stopped.
2. Start the backend and frontend using the README, without the test-only
   `OLLAMA_BASE_URL` override. In a lecturer browser, create a session and upload
   a short, text-rich PDF or PPTX.
3. Join with two independent student browser windows. As lecturer, select a slide,
   inspect its extracted text and click **Generate questions**. Time the request
   separately if assessing the under-10-second FYP target.
4. Inspect each MCQ's four options and correct answer, and each fill-in answer.
   Edit one, save and approve it; discard another. Confirm neither appears for
   students until you explicitly release the approved question.
5. Release a question. Both student windows should receive it without refresh.
   Submit different answers. Check lecturer totals/distribution and change one
   student's answer; the total should remain two.
6. Navigate slides while a generation request is running. Existing slide sync and
   understanding feedback should still work. Replace the presentation and check
   that the old activities disappear.
7. Repeat with an image-only or badly extracted slide, stopped Ollama, and a
   missing model to observe the warnings/errors. Do not treat a passing UI check
   as evidence that generated questions are correct without reviewing them.

The known M2-T14 manual rejoining limitation remains: a browser without its
original student token is treated as a new participant. Complex PDF/PPTX extraction
and a few embedded table previews also remain imperfect. No explanation generation,
training, fine-tuning, MySQL or authentication upgrade is part of this milestone.
