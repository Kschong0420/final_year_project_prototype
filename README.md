# Adaptive Classroom — Milestones 1–4.1

A local classroom presentation prototype for the FYP **AI-Based Adaptive Interactive Learning Platform for Real-Time Classroom Engagement**.

## Scope

React + Tailwind CSS frontend, FastAPI backend, and WebSocket slide synchronisation.
One active lecture session, a six-character join code, five sample slides, lecturer navigation,
student follow mode, late joining, automatic reconnection, live connection counts and ending a session.
Students can submit Understand or Not Understand on the current slide. The lecturer sees live,
slide-specific totals, percentages and rule-based confusion flags.
The lecturer can replace the sample presentation with a PDF or PPTX. PDF pages are shown as
page images with extracted text available below them. PPTX slides use visual previews when
LibreOffice is installed, with structured source text extracted separately by python-pptx.
Without LibreOffice, PPTX slides use a clearly labelled text view.
The lecturer can prepare local AI-generated MCQs and fill-in-the-blank questions before
class, or request additional questions during class, then edit, approve and release individual questions.
Students answer released questions; the lecturer sees aggregate responses.

This is a face-to-face classroom tool. It has no video, audio, screen sharing or recording.
No AI explanations, attendance or database integration is implemented.

## Run on Windows (PowerShell)

Prerequisites: Node.js 20.19+ or 22.12+ and Python 3.12 (or uv, which can install Python).

For Milestone 4 question generation, install [Ollama for Windows](https://ollama.com/download/windows)
if it is missing, then open a PowerShell terminal and download the initial pretrained model:

```powershell
ollama pull phi3:mini
ollama list
```

Ollama normally runs in the background on Windows at `http://127.0.0.1:11434`.
If it is not running, open the Ollama application or run `ollama serve` in a separate terminal.
The model download is about 2.2 GB; no training or fine-tuning is performed.
The [official Ollama Windows guide](https://docs.ollama.com/windows) and
[Phi-3 Mini model page](https://ollama.com/library/phi3:mini) have current setup details.
Question generation will show a useful error if Ollama or the configured model is unavailable;
the rest of the classroom still works.

Backend terminal:

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
uv venv --python 3.12 .venv
uv pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

The first two commands are only needed for initial setup. If uv is unavailable, use
`py -3.12 -m venv .venv` and `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`.
Exact tested Python dependencies are also recorded in requirements-lock.txt.
The existing `httpx` dependency calls Ollama's local HTTP API; no Python AI package is needed.
Set these optional variables in the **backend** terminal before starting Uvicorn:

```powershell
$env:OLLAMA_BASE_URL = 'http://127.0.0.1:11434'
$env:OLLAMA_MODEL = 'phi3:mini'
$env:AI_TIMEOUT_SECONDS = '45'
$env:AI_TEMPERATURE = '0.2'
$env:AI_NUM_PREDICT = '700'
$env:AI_MCQ_COUNT = '2'
$env:AI_BLANK_COUNT = '1'
```

These are defaults, so you can omit them. `backend/.env.example` is not loaded automatically.
Changing the model requires only `OLLAMA_MODEL` and `ollama pull MODEL_NAME`.
The question-count settings allow 0–5 per type, with at least one question in total.
The timeout allows slow local machines; the FYP's under-10-second generation target is an
evaluation target, not a guarantee.

Frontend terminal:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. The frontend proxies HTTP and WebSockets to the backend,
so student devices only need access to frontend port 5173.
The backend API documentation is at http://127.0.0.1:8000/docs.

Upload files are saved under `backend/storage/uploads/`; generated slide previews are saved under
`backend/storage/previews/`. Both paths are ignored by Git. Original files are not publicly
served. Slide preview requests require the current session's temporary lecturer or student token.
The default upload size limit is 25 MB. To set a 30 MB limit, set
`$env:MAX_UPLOAD_MB = "30"` before starting the backend. The size check runs before parsing.

For visual PPTX previews, install the **LibreOffice desktop application** on the backend PC.
It is a separate local executable, not a Python package. The backend looks for `soffice` on
`PATH` and at the standard Windows install locations. If it is installed elsewhere, set its
path in the backend PowerShell terminal before starting Uvicorn:

```powershell
$env:LIBREOFFICE_PATH = 'C:\Program Files\LibreOffice\program\soffice.exe'
$env:LIBREOFFICE_TIMEOUT_SECONDS = '60'
```

Use the actual path to `soffice.exe` on your PC. The backend starts LibreOffice in headless
mode with a separate temporary profile and a conversion timeout; it renders the resulting PDF
pages with PyMuPDF. If LibreOffice is absent or conversion fails, the PPTX remains usable in
text view and the lecturer sees why visual rendering was unavailable. A successful conversion
still needs manual comparison with the original presentation because fonts, animations and
some PowerPoint effects can render differently. LibreOffice was used in the latest tests with a
generated embedded-table slide and an uploaded 27-slide deck. A source OLE preview may itself
be cropped, so check complex tables against the original PowerPoint file.
`backend/.env.example` lists these settings but is not loaded automatically.

Use one backend worker. Do not enable reload during the demonstration: restarting the
backend clears all server-side sessions and feedback. The default confusion rule flags a slide when at least
two students have responded and at least 50% of those responses are Not Understand.
To change it, set these environment variables in the backend PowerShell terminal **before**
starting Uvicorn:

```powershell
$env:CONFUSION_THRESHOLD_PERCENT = "50"
$env:CONFUSION_MIN_RESPONSES = "2"
```

The backend reads the values at startup. `backend/.env.example` lists them, but the file is not
loaded automatically. The threshold must be 0–100 and the minimum at least 1.

## Demonstration

### Milestone 4.1: prepare first, release during class

Pre-class preparation already works in the existing single active session: no student needs
to be connected to upload, generate, edit, approve or discard. No second session system or
new lifecycle gate is needed. **Start class** means sharing the existing code with students;
there is no separate Start class button. Anyone with the code can join while you prepare,
but students never receive unreleased questions. Joining does not change approval or release state.

1. Create a lecture session in the lecturer window. Upload a PDF or PPTX before sharing the code.
2. Preview the slides and extracted text. Under **Classroom activities**, choose a source slide.
   Classroom slide changes automatically update this source selector. Selecting another source does not move the classroom slide.
3. Inspect the visible source text. Optionally add factual **Additional teaching notes**, including
   relevant adjacent-slide text labelled with its slide number. Choose Basic, Intermediate or Advanced.
4. **Generate questions**, review and edit, **Save edits**, then **Approve** to save for later;
   discard unsuitable questions. An edit requires approval again. Nothing releases automatically.
5. Start class by sharing the code. Open two independent student windows and join. Both show no
   activities until the lecturer explicitly selects **Release to students** on an approved question.
6. Navigate the live presentation. Select any question source slide to retrieve its saved questions
   without generating again; the selector lists the approved count for each slide.
7. Release a saved activity. Submit different answers in the two student windows and inspect live
   submission totals. Submit understanding feedback and check the lecturer totals without refreshing.
8. Generate additional questions during class. While waiting, navigate slides, submit understanding
   feedback and answer an already released activity. New questions enter **Awaiting review** and must
   be edited as needed and approved before an explicit release, exactly as during preparation.

Generation requests run outside the session lock. Generation controls are unavailable while
a request is running; review, slide controls and student interaction remain available. A replacement
presentation invalidates old activities and any generation response for the old presentation.

Prompts preserve factual relationships in paragraphs, bullet/numbered lists, definitions and accurately
extracted tables. Short factual text is allowed; headings alone should return no questions. Basic asks
for recall/understanding, Intermediate for comprehension/application and Advanced for reasoning/application
where supported. The model may fall back to basic questions; selected difficulty is a request, not a
verified rating. Answer matching is only a heuristic and cannot establish factual correctness.

Lecturer-only records retain the original valid AI question, current edited version, edit/approval/discard/
release history, original source text, separate teaching notes, requested difficulty, model and generation
duration (including the model availability check). Expand **Generation context and review record** to inspect
them. Records are temporary: replacing material or restarting the backend loses them. Rejected raw model
responses are not archived. There is no persistent evaluation dataset. Neither 70% acceptance nor generation
under 10 seconds is claimed. See [Milestone 4.1 tests](docs/milestone-4.1-tests.md).

### Existing classroom checks

1. On the lecturer browser, create a lecture session and note the displayed code.
2. In two independent tabs or browser windows, select the student form and enter that code.
3. Change slides as the lecturer. Both students follow automatically.
4. Join another student after changing slides; they receive the current slide.
5. Refresh a student tab; its temporary credentials restore the current session.
6. Briefly disconnect a student device, change slides, then reconnect it. The client retries
   automatically and fetches current state. A silent interruption may take about 15 seconds
   to be detected, followed by retries up to five seconds apart.
7. On slide 1, have student A select Understand. The lecturer sees one response and no flag.
8. Have student B select Not Understand. The lecturer sees one of each, 50% Not Understand,
   and a potential confusion flag. The lecturer view shows totals only.
9. Have student B change to Understand. The total stays at two and the flag clears.
10. Move to slide 2. It starts with no feedback; slide 1 remains in the flagged-slides list only
    if its current responses still meet the rule. Return to slide 1 to see its saved feedback.
11. Refresh or reconnect a student window. Their choice for each slide is restored while the
    backend remains running. End the session from the lecturer interface.

For Milestone 3, choose **Upload material** in the lecturer panel, select a PDF or PPTX, and
submit it. Wait for the ready message. The new presentation starts at slide 1 in every connected
view. Uploading another file clears feedback from the previous presentation. Have two students
respond on the uploaded slide, navigate and return to check slide-specific totals. Joining late
or reconnecting with the same temporary credentials restores the current slide.

For Milestone 4, upload a PDF or PPTX with selectable text, then choose its slide in
**Classroom activities**. The source follows classroom slide changes; selecting another source does not move the live presentation. Inspect
**Extracted text used for generation**, then click **Generate questions**. Review each
question and answer, edit if needed, **Save edits**, **Approve**, and **Release to students**.
Edits require approval again. **Discard** keeps the question's record but never releases it.
Each student sees only released questions and may submit or change one current answer per
question. A response is confirmed only after the backend acknowledges it. The lecturer sees
totals, MCQ option counts and submitted fill-in answers; fill-in answers are not semantically
graded. Replacing the presentation clears its questions and responses as well as understanding
feedback. Refreshing or reconnecting with the same temporary token restores activity answers.

If a student presses **Leave session** and joins the same code again in the same browser tab,
the app reuses that tab's temporary student token. Their earlier choice remains one response.
The student view shows **Response saved** only after the backend acknowledges a submission.
While disconnected, the feedback buttons are disabled and the view says feedback cannot be sent.

A confusion flag only informs the lecturer. It does not request or generate an AI explanation.

For separate physical devices, use http://YOUR-PC-LAN-IP:5173 on the same local network.
The frontend binds to 0.0.0.0. Allow Node on your private-network firewall if prompted.
Wi-Fi client isolation may prevent access. The local development server is not a public deployment.

## Tests

With dependencies installed:

```powershell
cd C:\Users\user\Documents\fyp\Code\backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

This starts an isolated backend on port 8768 for the existing tests. The material tests use
generated disposable PDF/PPTX files and an isolated FastAPI test client. The real LibreOffice
table test runs when LibreOffice is installed and is skipped otherwise.
Leave port 8768 free.

With the demo backend and frontend running and no active lecture session:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
```

The browser tests use three isolated browser contexts and end their lectures when successful.
The visual PPTX table test uses a synthetic fixture at `frontend/tests/fixtures/ole-table.pptx`;
it is skipped if the backend reports that LibreOffice is not installed.
If interrupted, restart the in-memory backend before rerunning.
See docs/milestone-1-tests.md, docs/milestone-2-tests.md, docs/milestone-3-tests.md and
docs/milestone-4-tests.md for results.

## Structure and design

- backend/app/routes.py: session creation and joining
- backend/app/store.py: in-memory session state and ordered state broadcasts
- backend/app/realtime.py: token validation, slide commands, heartbeat and disconnect handling
- backend/app/feedback.py: configurable classroom-wide confusion rule
- backend/app/slides.py: sample lecture
- backend/app/materials.py: lecturer-only upload, file-size checks and authenticated PDF previews
- backend/app/document_processing.py: PyMuPDF page previews, structured python-pptx extraction,
  optional isolated LibreOffice conversion and embedded-object preview placement
- backend/app/reading_order.py: conservative column-aware ordering and nearby numbered-label grouping
- backend/app/ai_generation.py: configurable local Ollama client, question prompt and validation
- backend/app/activities.py: lecturer review, release and aggregate activity results
- frontend/src/pages: home, lecturer and student views (LivePage renders role-specific controls)
- frontend/src/hooks/useSessionSocket.js: connection lifecycle, retry and heartbeat
- frontend/src/components/SlideViewer.jsx: presentation display
- frontend/src/components/MaterialUpload.jsx: lecturer upload form and processing status
- frontend/src/components/UnderstandingFeedback.jsx: student choice and lecturer aggregate view
- frontend/src/components/LecturerActivities.jsx: extracted-text review and question approval
- frontend/src/components/StudentActivities.jsx: released questions and confirmed submissions
- frontend/src/services/api.js: HTTP requests and errors

The server is authoritative: clients receive current state on connection, slide change and feedback.
Student commands cannot move slides. A per-session random lecturer token restricts controls.
Tokens are sent in the initial WebSocket frame and retained in sessionStorage for refresh recovery.
Feedback is stored as one current choice per student token per slide. Changing a choice replaces
the previous value. The denominator for percentages is the number of responses submitted for that
slide; students who did not respond are not counted as Understand. The lecturer receives only
aggregate feedback, and students receive only their own current-slide choice.
Replacing a presentation changes its ID, resets slide navigation to 1 and clears prior feedback.
Feedback for an old presentation ID is rejected, so delayed messages cannot appear under new slides.
Activity generation runs asynchronously outside the session lock; slide sync and feedback remain live.
The model receives the selected slide's extracted text and separately labelled optional teaching notes. Its JSON is validated, malformed or
ungrounded questions are rejected, and partial valid results are marked for lecturer review.
Original AI questions remain separate from lecturer edits in temporary session state. Student
WebSocket snapshots omit correct answers and all pending, approved and discarded questions.

## Limitations

- Temporary role selection is NOT secure account authentication. Anyone with local access can
  create a session when none is active. Treat session tokens as temporary capabilities.
- In-memory sessions and feedback are lost on backend restart and do not support multiple backend workers.
- The saved upload files and PDF previews remain on disk after a restart, but temporary session
  metadata is lost. Create a new session and upload the file again. Remove old files from
  `backend/storage/` manually when no longer needed.
- Keep the lecturer tab open. Closing it loses its sessionStorage credentials; if there is no
  surviving lecturer tab, restart the backend to clear the orphaned session.
- Multiple tabs copied from the same student tab may share its credentials and count as one
  student; use independent tabs from the address bar or browser contexts for the demo.
- A new tab or device without the earlier session token is treated as a new participant, even
  if the person is the same. Without accounts or a recovery code the system cannot identify
  that person safely. Same-tab manual rejoining and automatic reconnection retain the token.
- Counts represent connected student tokens, not verified identities or attendance.
- Feedback uses temporary student tokens to avoid duplicate counting. This is not complete
  database-level anonymity or identity verification. Do not use it for sensitive evaluation data.
- PPTX visual previews require LibreOffice. Without it, the text view preserves titles, list
  levels, and table rows/cells but cannot show images or exact layout. Even with LibreOffice,
  fonts, animations, and some PowerPoint effects may differ from Microsoft PowerPoint.
  Embedded Excel/OLE objects are placed from their PPTX preview image because LibreOffice can
  shrink them to a small square near the upper-left. A PPTX preview image can itself be cropped
  or low-resolution; this repair cannot reconstruct content missing from that preview.
- PDF and PPTX text extraction uses layout cues for clear two-column pages and joins nearby
  numbered labels to their text. PDF table extraction uses PyMuPDF's strict drawn-line strategy:
  this avoids treating coloured paragraph panels as tables, but borderless tables may be left
  as ordinary text. Unusual layouts, overlapping or grouped shapes, and inherited list
  formatting can still have ambiguous reading order. Native PPTX tables retain rows and cells;
  raster and embedded OLE table text needs a separate extraction or OCR step. Each structured
  block records its slide number. Visual slide rendering does not depend on extracted text order.
- Older `.ppt` files must be converted to `.pptx`. PDF pages without selectable text still show
  a page image, but OCR is not performed. PyMuPDF may recover slightly damaged PDFs; genuinely
  unreadable files are rejected. Complex or very large pages may take longer to render.
- The manual M2-T14 report remains outstanding: manually rejoining without the original student
  token may create a new participant and an extra response. Automated tests cover same-token
  reconnection, but this does not prove the reported manual path is resolved.
- Generated questions may still be incomplete, ambiguous or factually wrong despite JSON
  checks and source-answer matching. The lecturer must inspect the extracted text and each
  question before release. Image-only slides and some complex PPTX/PDF layouts have incomplete
  extracted text; OCR is not included. The acceptance and generation-time FYP targets have not
  yet been measured with the real model.
- Questions, edits, review decisions and student answers are in memory and disappear on backend
  restart. Replacing the active presentation clears them. This prototype has no persistent
  evaluation dataset, MySQL, legacy `.ppt` conversion or secure accounts.
- Confusion detection is rule-based and classroom-wide. Explanations remain a future,
  lecturer-requested feature. Model training/fine-tuning is outside scope.
