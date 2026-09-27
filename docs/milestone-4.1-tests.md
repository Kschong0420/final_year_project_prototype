# Milestone 4.1: preparation and live question generation

The existing session supports preparation with zero students. Class begins by sharing its code;
no new session state or Start class gate was added. Questions always require explicit lecturer
approval and release. Classroom slide changes update the question source automatically. Selecting
another source does not move the classroom slide.

## Automated coverage

Executed on 2026-09-27:

- Full backend suite: **36 passed**, 11.680 seconds; includes the installed LibreOffice test.
- Full browser suite: **7 passed**, 20.3 seconds, using the fake Ollama HTTP fixture.
- Focused browser rerun after adding two-slide navigation assertions: **1 passed**, 3.6 seconds.
- Corrected source-follow behavior: Next/Previous classroom navigation updates the source; manual source selection leaves all classroom views unchanged. Focused browser test **passed**, 3.7 seconds (fake Ollama).
- Frontend production build: **passed**, 39 modules transformed.
- Final activity-suite rerun after context-limit/message adjustments: **13 passed**, 0.552 seconds.
- `git diff --check`: passed (Windows line-ending notices only).

The first browser run failed on an incorrectly encoded test assertion and left its temporary
session active, causing subsequent session-creation failures. The assertion was corrected,
the isolated backend restarted, and the full suite passed. The build required a sandbox
file-access retry. No real Ollama generation test was executed for this milestone.

All AI tests use FakeAI, httpx.MockTransport, or the explicit fake Ollama HTTP fixture.
They do not measure real Phi-3 Mini quality, acceptance or generation time.

| Scenario | Evidence |
| --- | --- |
| M4.1-T01 prepare material before joining | API setup and browser upload before student join |
| M4.1-T02 generate during preparation | API and browser, no students connected |
| M4.1-T03 edit, approve, discard before class | Preparation API test; browser approval before joining |
| M4.1-T04 approved questions stay saved | Student snapshots and browser show no activities before release |
| M4.1-T05 class start preserves questions | Two students join the same prepared session; approved status remains |
| M4.1-T06 unreleased questions private | Student snapshots omit lecturer context, answers and unreleased questions |
| M4.1-T07 release saved activity | API and browser explicit release after joining |
| M4.1-T08 two student answers | WebSocket integration and browser test |
| M4.1-T09 live results | WebSocket broadcasts and browser distribution assertions |
| M4.1-T10 bullet content | Short factual bullets accepted; mocked model prompt and output validation. Real quality untested |
| M4.1-T11 insufficient source | Empty/very short content rejected, invalid/ungrounded model output rejected. No semantic guarantee |
| M4.1-T12 difficulty | Request validation, AI argument capture, model prompt inspection and browser Advanced selection |
| M4.1-T13 preserve original | Original/current separation and review history assertions |
| M4.1-T14 presentation replacement | Existing API/browser replacement tests clear old activities |
| M4.1-T15 classroom regression | Existing M1–4 suite plus delayed generation with slide sync, two-student feedback, confusion flag and an existing activity answer |
| M4.1-T16 no automatic explanation | Existing feedback regression and unchanged rule-only confusion handling |
| Additional live generation | Browser generates after release; new questions remain awaiting review and students see only previously released activities |
| Generation status | Delayed AI test checks busy state, rejects duplicate requests and checks final cleared state |

## Commands

Backend regression suite:

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

For isolated browser tests, run these in separate terminals (no active session on the test backend):

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
.\.venv\Scripts\python.exe -m uvicorn tests.fake_ollama:app --host 127.0.0.1 --port 11435
```

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
$env:OLLAMA_BASE_URL='http://127.0.0.1:11435'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8769
```

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
$env:CLASSROOM_API_TARGET='http://127.0.0.1:8769'
$env:CLASSROOM_FRONTEND_PORT='5174'
npm.cmd run dev
```

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
$env:CLASSROOM_TEST_URL='http://127.0.0.1:5174'
$env:CLASSROOM_FAKE_OLLAMA='1'
npm.cmd run test:e2e -- --max-failures=1
npm.cmd run build
```

For a real model demonstration, use the ordinary README service commands and its one-lecturer,
two-student Milestone 4.1 walkthrough. Use the real Ollama URL (11434), not the fixture (11435).
Record quality judgements and wall-clock request duration separately; fake timings are not evaluation data.

## Remaining limitations

Complex PDF/PPTX extraction and some PPTX table rendering remain imperfect. No OCR/image understanding
was added. Source-answer matching and prompt instructions cannot prove grounding or difficulty. Review
every question. Temporary questions and evaluation records disappear on replacement/restart. The M2-T14
manual rejoining report is not declared resolved; a new identity without the original token can add a
participant. Milestone 5 and automatic explanations are not implemented.

## Files changed for this milestone

Existing uncommitted Milestone 4 work was retained. This milestone modified:

- `README.md`
- `backend/app/activities.py`
- `backend/app/ai_generation.py`
- `backend/tests/test_activities.py`
- `frontend/src/components/LecturerActivities.jsx`
- `frontend/src/pages/HomePage.jsx`
- `frontend/src/pages/LivePage.jsx`
- `frontend/tests/activities.spec.js`

Created: `docs/milestone-4.1-tests.md`. No document extraction/rendering or Milestone 5 files changed.
