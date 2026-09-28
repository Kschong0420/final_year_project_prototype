# Adaptive Classroom — Milestones 1–5

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
Lecturers can also request a simplified AI explanation, review/edit it, approve it and explicitly
share it. Students can send anonymous text questions to the lecturer, grouped by slide.
Explanation generation accepts factual bullet points and tolerates harmless punctuation and line
break differences in supporting quotes. Unsupported claims still fail validation; one corrective
model retry is allowed only for a structured response that fails source support checks.
Results includes **Session Analytics**: current connections, released activities, answer
submissions, feedback, anonymous questions and explanation counts from the live session.

The interface follows a **lecture desk** flow: create a lecture, prepare its material and
questions, teach with the live slide, then inspect responses. The home screen provides a
separate, direct path for lecturers and students. The lecturer workspace shows the next
relevant action based on uploaded material and question status, with a session-code copy
control for sharing the class. Stage navigation remains available on narrow screens.

The frontend uses **Prepare / Live class / Results** workspaces. The shared slide viewer
supports Standard, Half-screen, Expanded and browser Full screen, with local 75–200% zoom.
These are interface views, not new session states. See
[workspace and viewer verification](docs/ui-workspace-tests.md) and [Milestone 5 validation](docs/milestone-5-tests.md).

This is a face-to-face classroom tool. It has no video, audio, screen sharing or recording.
Attendance and database integration are not implemented.

## First-time Windows setup

Install Python 3.12 (or `uv` with Python 3.12 available), Node.js 20.19+ or 22.12+ with npm,
and Ollama. LibreOffice is optional: PPTX slides use a labelled text view without it.
From a PowerShell terminal in the repository root:

```powershell
.\setup.ps1
.\check.ps1
.\run.ps1
```

`setup.ps1` creates the backend virtual environment when needed, satisfies
`backend/requirements.txt`, and uses `frontend/package-lock.json` with `npm ci` when frontend
packages need installation. It can be run again safely. It does **not** download the model
automatically. To explicitly install the configured model (default `phi3:mini`), run
`.\setup.ps1 -InstallModel`, or run `ollama pull phi3:mini` yourself. `check.ps1` reports
readiness without installing anything. `run.ps1` checks ports, starts the local services,
verifies `/api/health`, prints the lecturer and available LAN URLs, and displays logs.
Keep its terminal open during class; press Ctrl+C to stop only the services it started.

Students open the printed frontend URL from the **same reachable LAN** and enter the lecturer's
session code. The frontend binds on port 5173; the backend remains on loopback port 8000.
`run.ps1` does not change firewall rules. Its optional Ollama startup uses the local
`ollama serve` command when the app is installed but stopped. If Ollama is unavailable,
slides, feedback and already prepared activities still work; AI generation needs the
configured model. PDF and PPTX are supported. Legacy `.ppt` files are **not** supported.
Environment variables are read from the shell; `.env.example` is illustrative and is not
loaded automatically. The commands below remain available for manual development startup.

## Run on Windows (PowerShell)

Prerequisites: Node.js 20.19+ or 22.12+ and Python 3.12 (or uv, which can install Python).

For question and explanation generation, install [Ollama for Windows](https://ollama.com/download/windows)
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
   Prepare shows a local preview of the selected source. Classroom slide changes automatically update
   this source selector. Selecting another source never moves the students' classroom slide.
3. Inspect the visible source text. Optionally add factual **Additional teaching notes**, including
   relevant adjacent-slide text labelled with its slide number. Choose Basic, Intermediate or Advanced.
4. **Generate questions**, review and edit, **Save edits**, then **Approve** to save for later;
   discard unsuitable questions. An edit requires approval again. Nothing releases automatically.
5. Select **Live class** and share the code. Open two independent student windows and join. Both show no
   activities until the lecturer explicitly selects **Release activity** on an approved question in
   the Activities panel (or **Release to students** in its review editor).
6. Navigate the live presentation. Select any question source slide to retrieve its saved questions
   without generating again; the selector lists the approved count for each slide.
7. Release a saved activity. Submit different answers in the two student windows and inspect the
   **Results** tab. Select an activity to see its live submission totals and responses. Submit
   understanding feedback and check the lecturer sidebar without refreshing.
8. Generate additional questions during class. While waiting, navigate slides, submit understanding
   feedback and answer an already released activity. New questions enter **Awaiting review** and must
   be edited as needed and approved before an explicit release, exactly as during preparation.

The Live class sidebar keeps understanding feedback above **Activities / Generate / Review**.
Secondary panels scroll independently on desktop. Prepare includes a collapsible upload/replace
form and **Generate / Review** tabs; select a question summary to open one editor. Hidden editors
remain mounted, preserving unsaved drafts across tabs and source changes. Teaching notes remain
associated with their source slide until the presentation is replaced. A question with unsaved edits
cannot be released through the compact Activities panel. Results shows existing aggregate counts,
MCQ option distributions and fill-in answer frequencies, not grades or named student reports.

### Slide viewing controls

- **Standard:** slide and classroom sidebar; **Half-screen:** approximately equal columns on desktop.
- **Expanded:** uses most of the app, with a Class controls toggle and a Return to standard view button.
  Connection status and a lecturer feedback summary remain visible. Escape returns to Standard.
- **Full screen:** enters the browser Fullscreen API from the viewer toolbar. The lecturer retains
  Previous/Next in Live class; students never receive navigation controls. Exit Full Screen, Escape
  or browser exit restores Standard. Unsupported or rejected requests fall back to Expanded with a message.
- **− / +:** zoom in 25-point steps between 75% and 200%. **Reset** and **Fit** return to 100%,
  where the complete image fits the available viewer. Fitting adapts to window/layout size. Larger
  images scroll inside the viewer. Aspect ratio is preserved; zoom cannot recover missing source detail.
- Mode and zoom belong to each browser only. Slide changes still synchronise to all students.
  Zoom persists across slide changes; scroll position resets. Viewing settings reset on a page reload,
  while existing temporary credentials restore server state. Text-only PPTX previews remain text,
  with scalable text and scrolling rather than an invented original slide layout.

On student mobile screens, use **Slide / Class tools** tabs; understanding feedback identifies the
current classroom slide and stays accessible in either view. Unsubmitted activity drafts survive tab
and mode changes. All released questions remain available, including questions from earlier slides.
Half-screen stacks its areas on narrow screens. No view change releases questions or resets responses.

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
3. Select **Live class** and change slides as the lecturer. Both students follow automatically.
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

For Milestone 3, choose **Upload material** in **Prepare**, select a PDF or PPTX, and
submit it. Wait for the ready message. Use **Replace material** to reopen the form after an upload.
The new presentation starts at slide 1 in every connected
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

A confusion flag only informs the lecturer. It never requests or generates an AI explanation automatically.

### Milestone 5: lecturer-requested explanations and anonymous questions

The default confusion rule remains at least two submitted responses and at least 50% Not
Understand. Green/red portions of the shared bar show the proportions among respondents, not
the whole class. This is self-reported understanding, not a diagnosis of misunderstanding.

In **Live class**, select **Explain this slide**, or open **Explanations** and select any source
slide (including an unflagged slide). Source selection does not move the live presentation.
Inspect **Explanation source text**, then explicitly click **Generate explanation**. The model
uses only that slide's extracted text; activity teaching notes are not included. Empty, very
short, excessively long or heavily fragmented sources are rejected. Headings-only content is
also rejected when the model reports insufficient information. These are conservative checks,
not a guarantee of complete extraction or factual grounding.

The explanation starts in **Awaiting review** and is private to the lecturer. Read it, edit if
needed, **Save explanation edits**, then **Approve explanation** and **Share explanation**.
Approval alone does not publish. Unsaved edits disable approval/sharing; a saved edit requires
fresh approval. **Discard explanation** keeps a private record. Shared/discarded versions are
final; a new explanation can be generated. Original output, source text and quote, slide index,
model name, generation duration and review actions are retained separately in memory.

Students receive shared explanations through the existing WebSocket state without refreshing.
Open **Explanations (N)** under class tools. Explanations remain labelled with their source slide
when the lecturer moves on, and are available to late joiners and reconnecting students. New
explanations never change the current slide or anyone's local viewing mode. The tab count and
screen-reader announcement indicate newly available content; the app does not force a tab switch.

Students use **Ask a question**, enter up to 1,000 characters and select **Send question
anonymously**. On mobile, open **Class tools** first. The lecturer's **Questions (N)** panel updates
in real time, grouped by slide. Only authenticated temporary student credentials can submit,
but each stored record contains only a random question ID, session code, presentation ID, slide
index and text: no student token, student ID, IP or author reference. Other students do not
receive these questions. Text may still identify its author if they put personal details in it.
The app does not log question bodies or authorization headers; ordinary server access logs can
still contain network addresses. This is anonymity in the lecturer view and question record,
not a claim of network-level anonymity.

Draft questions stay with their slide in the current browser. A submission for a stale slide or
presentation is rejected. There are no automatic submission retries; a lost HTTP acknowledgement
can leave uncertainty about delivery. Check with the lecturer before resending to avoid duplicates.

Generation uses the existing `OLLAMA_BASE_URL`, `OLLAMA_MODEL`, `AI_TIMEOUT_SECONDS`,
`AI_TEMPERATURE` and `AI_NUM_PREDICT` settings. No new dependency or model training is required.
Ollama calls run outside the classroom lock, so slides, feedback and activity answers remain
available during generation. Failures show an error and require an explicit retry. Replacing the
presentation clears its explanations/questions, and late AI results for the old presentation are
rejected. Backend restart loses all of these records along with the existing temporary session.

The real Phi-3 Mini smoke test initially produced unsupported additions; a shorter prompt improved
the inspected response. Source-quote and topic checks cannot prove semantic grounding. Lecturer
review remains essential. These few runs do not establish learning improvement, overall model
quality or a reliable latency target. See [real model records](docs/milestone-5-real-model.json).

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
- backend/app/adaptive.py: explanation review/sharing and anonymous-question records/routes
- backend/app/explanation_generation.py: explanation prompt, source checks and response parsing
- frontend/src/pages: home, lecturer and student views (LivePage renders role-specific controls)
- frontend/src/hooks/useSessionSocket.js: connection lifecycle, retry and heartbeat
- frontend/src/components/SlideViewer.jsx: presentation display
- frontend/src/components/MaterialUpload.jsx: lecturer upload form and processing status
- frontend/src/components/UnderstandingFeedback.jsx: student choice and lecturer aggregate view
- frontend/src/components/LecturerActivities.jsx: extracted-text review and question approval
- frontend/src/components/StudentActivities.jsx: released questions and confirmed submissions
- frontend/src/components/LecturerExplanations.jsx: private explanation generation, editing and review
- frontend/src/components/AnonymousQuestions.jsx: anonymous question form/list and shared explanations
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
- Session Analytics is available only while that one in-memory session exists. It is not a
  historical report. Connected students are current connections, not attendance; answer
  submissions are per activity, not unique students. MySQL, SQLAlchemy and JWT are not used.
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
- Questions, explanations, anonymous submissions, edits, review decisions and student answers are in memory and disappear on backend
  restart. Replacing the active presentation clears them. This prototype has no persistent
  evaluation dataset, MySQL, legacy `.ppt` conversion or secure accounts.
- Confusion detection is rule-based and classroom-wide. Explanations require an explicit lecturer
  request, review, approval and sharing. No diagnosis or learning improvement is inferred.
  Model training/fine-tuning is outside scope.
