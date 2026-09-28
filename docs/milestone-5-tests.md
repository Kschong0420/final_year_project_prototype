# Milestone 5: adaptive explanations and anonymous questions

## Inspection and scope

The approved Prepare / Live class / Results redesign was already implemented. Git was clean
at the start of this milestone. No anonymous-question or explanation implementation existed.
The existing confusion rule, feedback bar, Ollama question service, activity workflow, temporary
credentials and single in-memory session were reused. No dependencies, database, authentication
system, analytics, rendering changes or new UI redesign were introduced.

Confusion still means at least two responses and at least 50% Not Understand by default. These
values remain configurable. Percentages describe respondents' self-reports, not a confirmed
misunderstanding diagnosis. No feedback threshold invokes Ollama.

## Workflow and safeguards

Lecturer: **Live class → Explain this slide**, or **Explanations → Explanation source slide**.
Inspect the selected source, click **Generate explanation**, review/edit, save edits, approve,
then explicitly share. Approval and sharing are separate actions. Editing resets approval;
unsaved drafts block approval/sharing. Failed save/share requests preserve the draft and display
errors. Discarded explanations remain private. Shared/discarded versions cannot be edited.

The original output, edited text, source text/quote, presentation and slide, model, generation
seconds, version and review history are retained. Optimistic version checks reject actions from
stale lecturer windows. Students receive only shared text, ID, presentation and slide. Late joins
and reconnections obtain shared content from normal WebSocket snapshots. No viewer settings
or navigation commands are sent as a side effect of generating or sharing an explanation.

Generation checks source size and obvious fragmentation, then calls the existing async Ollama
transport outside the classroom lock. Model output must contain usable explanation text and a
supporting source quote; a topic-overlap check rejects obviously unrelated output. These checks
do not establish semantic grounding. The prompt instructs the model to refuse headings/fragments,
use simple language, avoid missing facts, and use examples only when supported by the slide.

Anonymous questions use a student-authenticated HTTP submission and the existing WebSocket
broadcast to the lecturer. The record schema is exactly `id`, `session_code`, `presentation_id`,
`slide_index`, `text`. No student token/ID, network address, author reference or persistent identity
is stored in the record. No new code logs submitted text or authorization headers. Questions are
not sent to other students. Ordinary server access logs still include network metadata; this is
not a network anonymity guarantee. Students should avoid identifying themselves in the text.

Question text is trimmed, must be nonempty and at most 1,000 characters. Only the current slide
can receive a question. Stale slide/presentation requests are rejected. Browser drafts stay with
their slide. There is no automatic retry or identity-linked deduplication; an uncertain network
acknowledgement may require checking with the lecturer before resending.

Replacing material clears both record collections. Generation that started against an old
presentation is rejected before saving. Restarting the backend loses the session and all these
records, including drafts saved on the server. Uploaded files alone cannot restore session data.

## Executed validation

- Full backend regression: **46 passed**, 10.898 seconds (36 existing + 10 new tests).
- M5 backend rerun after adding the concurrent activity-answer assertion: **10 passed**, 0.323 seconds.
- Focused M5 browser flow after layout/cleanup fixes: **1 passed**, 3.9 seconds.
- Full browser suite: **10 passed**, 34.1 seconds, including the additional save/share-failure checks.
- Production build: **passed**, 42 modules, with `npm.cmd run build -- --configLoader runner`.
- Ordinary `npm.cmd run build`: blocked by the existing managed-workspace directory access
  restriction in Vite's bundled config loader. Runner mode built the same app successfully.

Backend generation tests use a fake AI service or `httpx.MockTransport`. Browser tests use the
explicit fake Ollama HTTP fixture on port 11435 with FastAPI on 8769 and Vite on 5174. Browser
coverage is Chromium. PDF/PPTX regression tests exercise the installed local rendering pipeline;
these tests do not claim that every real-world presentation renders/extracts perfectly.

### Required cases

| Case | Automated verification |
| --- | --- |
| M5-T01 | Two responses reach the inclusive confusion threshold. |
| M5-T02 | Lecturer counts, flag, percentages and source slide are checked in backend and browser. |
| M5-T03 | Fake AI call count stays zero at threshold; browser observes no generation request. |
| M5-T04 | Explicit generation for the flagged slide succeeds. Opening the panel alone makes no request. |
| M5-T05 | Explicit generation for another unflagged slide succeeds without moving the classroom. |
| M5-T06 | Model prompt, stored source and one-based model slide number match the selected slide. |
| M5-T07 | Edit, reapproval, discard and stale-version rejection are exercised. |
| M5-T08 | Pending/approved/discarded explanations stay out of student snapshots and DOM. |
| M5-T09 | Explicit share sends the approved version to two connected students. |
| M5-T10 | Both students display shared content without reload; reload restores it afterward. |
| M5-T11 | Empty/short/numeric/fragmented/overlong sources and unusable model output are rejected. |
| M5-T12 | Mocked service absence, missing model, timeout and malformed output give useful errors; retry works. |
| M5-T13 | Delayed generation allows real WebSocket slide changes, feedback, anonymous submission and activity answers. |
| M5-T14 | A student submits a question for the active slide; browser shows acknowledgement. |
| M5-T15 | Lecturer receives text and slide only; stored schema contains no author reference. Other students receive no question list. |
| M5-T16 | Blank/oversized text, invalid slide types, stale slides/presentations, extra identity fields and wrong roles are rejected. |
| M5-T17 | Explanations/questions retain their original slide while navigation and source selection change. |
| M5-T18 | Material replacement clears records; delayed old generation cannot recreate them. |
| M5-T19 | All 46 backend and all 10 browser tests passed, including existing classroom, rendering, activity and viewer regressions. |
| M5-T20 | A fresh application has no previous session; joining with the old code returns 404. Existing restart/file tests also run. |

### Failures found during development

- The first M5 browser run found a mobile textarea extending beyond the viewport. Existing
  workspace child margins combined with `width: 100%`; the direct-child textarea now uses the
  same margin-aware width as the source selector. Mobile screenshot inspection and the width
  assertion passed after the fix.
- A test cleanup race clicked End after the test had already ended the session. Cleanup now
  tracks successful completion. An intermediate diagnostic assertion had a syntax typo; it was
  corrected before further execution.
- The first full browser regression counted Vite imports of `LecturerExplanations.jsx` and
  `AnonymousQuestions.jsx` as AI calls. The existing no-AI-on-upload check now restricts itself
  to `/api/` requests, retaining the intended regression check.
- FastAPI/Starlette emitted an existing `httpx` TestClient deprecation warning. Tests passed;
  dependency migration is not part of this milestone.

## Real Ollama run, separate from mocks

Three direct `OllamaClient.explain` requests were executed against the installed local
`phi3:mini` model, using one short photosynthesis source. The running Ollama service was reused.
The default timeout was 45 seconds, temperature 0.2 and output budget 700 tokens.

| Attempt | Duration | Inspection |
| --- | --- | --- |
| Initial prompt | 6.94 s | Returned valid JSON, but added unsupported facts (green pigment, plant growth, oxygen we breathe). Grounding review failed. |
| Stronger source-only wording | 2.12 s | Still added unsupported background (food, oxygen release, plant growth). Grounding review failed. |
| Final shorter prompt, source-relative length | 2.74 s | No obvious external additions on developer inspection; mainly a paraphrase, so additional clarity is limited. |

All three outputs and their source are retained in [milestone-5-real-model.json](milestone-5-real-model.json).
Valid JSON/source quotes did not prevent the first two grounding failures. The final prompt is
not a guarantee of model quality. This is a small smoke test, not an independently scored
relevance/clarity study, latency benchmark or evidence of improved student learning.

Desktop and 390×844 mobile screenshots from the automated browser run were inspected. A manual
classroom demonstration on physical student devices, cross-browser validation, independent
lecturer assessment and before/after learning evaluation were **not performed**. No unexecuted
manual test is counted as passed. Existing extraction, rendering, image-only and M2-T14 limits
remain unresolved unless verified by their own tests.

## Start the real system (PowerShell)

Dependencies should already be installed using the README setup. Start Ollama only if it is not
already running (a port-in-use message means another instance is listening):

```powershell
ollama serve
```

In another terminal, confirm the model; pull it once only if it is missing:

```powershell
ollama list
ollama pull phi3:mini
```

Backend:

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
$env:OLLAMA_BASE_URL='http://127.0.0.1:11434'
$env:OLLAMA_MODEL='phi3:mini'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend, in another terminal:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
npm.cmd run dev
```

Open `http://localhost:5173`. If the config-loader directory restriction occurs, use
`npm.cmd run dev -- --configLoader runner`. Use one backend worker without reload. `.env.example`
is illustrative and is not loaded automatically. No configuration additions are required for M5.

## Manual demonstration: one lecturer and two students

1. Create a lecture, upload a PDF/PPTX with sufficient factual source text, and enter **Live class**.
2. Join the displayed code from two independent student browser contexts/devices. On other devices
   use `http://LECTURER-PC-LAN-IP:5173` on the same reachable local network.
3. Submit Not Understand from both students. Check the red bar, two responses, 100% and flag.
   Observe that no explanation generation starts automatically.
4. Select **Explain this slide**, inspect the text and explicitly **Generate explanation**. While
   waiting, navigate and submit feedback. Check that the response keeps the original source slide.
5. Edit the explanation and save it. Verify both students still have no shared explanation.
   Approve it; verify it remains private. Then **Share explanation**.
6. On both students open **Explanations (1)** in class tools. Check the text and slide number
   without refreshing. Refresh one student and verify the shared text remains.
7. Generate another explanation for an unflagged slide, then discard it. Verify it is not shared.
8. Use **Ask a question** on both students. Check acknowledgement and the lecturer's **Questions (N)**
   panel, grouped by slide with no identities. Check blank submission is disabled.
9. Navigate between slides; confirm explanations/questions keep their associations. Prepare,
   approve, release and answer an ordinary activity, then inspect Results.
10. Replace the presentation and verify old explanations/questions disappear. Finally stop/restart
    the backend: the old session cannot be resumed. Create a fresh session and upload again.

## Reproduce automated checks

Backend (does not require real Ollama):

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

For browser checks, use the isolated fake-Ollama/backend/frontend commands in
[Milestone 4.1 tests](milestone-4.1-tests.md), adding `-- --configLoader runner` to `npm.cmd run dev`
if needed. Keep ports 11435, 8769 and 5174 free before starting those services. Then:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
$env:CLASSROOM_TEST_URL='http://127.0.0.1:5174'
$env:CLASSROOM_FAKE_OLLAMA='1'
npm.cmd run test:e2e -- --max-failures=1
npm.cmd run build -- --configLoader runner
```

## Files changed in this milestone

Created:

- `backend/app/adaptive.py`
- `backend/app/explanation_generation.py`
- `backend/tests/test_adaptive.py`
- `frontend/src/components/LecturerExplanations.jsx`
- `frontend/src/components/AnonymousQuestions.jsx`
- `frontend/tests/adaptive.spec.js`
- `docs/milestone-5-tests.md`
- `docs/milestone-5-real-model.json`

Modified:

- `backend/.env.example`
- `backend/app/ai_generation.py`
- `backend/app/main.py`
- `backend/app/materials.py`
- `backend/app/routes.py`
- `backend/app/store.py`
- `backend/tests/fake_ollama.py`
- `backend/tests/test_live.py`
- `frontend/src/components/UnderstandingFeedback.jsx`
- `frontend/src/pages/LivePage.jsx`
- `frontend/src/services/api.js`
- `frontend/src/styles.css`
- `frontend/tests/activities.spec.js`
- `frontend/tests/materials.spec.js`
- `README.md`
