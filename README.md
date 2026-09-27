# Adaptive Classroom — Milestones 1–2

A local classroom presentation prototype for the FYP **AI-Based Adaptive Interactive Learning Platform for Real-Time Classroom Engagement**.

## Scope

React + Tailwind CSS frontend, FastAPI backend, and WebSocket slide synchronisation.
One active lecture session, a six-character join code, five sample slides, lecturer navigation,
student follow mode, late joining, automatic reconnection, live connection counts and ending a session.
Students can submit Understand or Not Understand on the current slide. The lecturer sees live,
slide-specific totals, percentages and rule-based confusion flags.

This is a face-to-face classroom tool. It has no video, audio, screen sharing or recording.
No document uploads, AI generation, attendance or database integration are implemented.

## Run on Windows (PowerShell)

Prerequisites: Node.js 20.19+ or 22.12+ and Python 3.12 (or uv, which can install Python).

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

Frontend terminal:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:5173. The frontend proxies HTTP and WebSockets to the backend,
so student devices only need access to frontend port 5173.
The backend API documentation is at http://127.0.0.1:8000/docs.

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

This starts an isolated backend on port 8768 and exercises real HTTP and WebSocket clients.
Leave port 8768 free.

With the demo backend and frontend running and no active lecture session:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
npx.cmd playwright install chromium
npm.cmd run test:e2e
npm.cmd run build
```

The browser tests use three isolated browser contexts and end their lectures when successful.
If interrupted, restart the in-memory backend before rerunning.
See docs/milestone-1-tests.md and docs/milestone-2-tests.md for execution results.

## Structure and design

- backend/app/routes.py: session creation and joining
- backend/app/store.py: in-memory session state and ordered state broadcasts
- backend/app/realtime.py: token validation, slide commands, heartbeat and disconnect handling
- backend/app/feedback.py: configurable classroom-wide confusion rule
- backend/app/slides.py: sample lecture
- frontend/src/pages: home, lecturer and student views (LivePage renders role-specific controls)
- frontend/src/hooks/useSessionSocket.js: connection lifecycle, retry and heartbeat
- frontend/src/components/SlideViewer.jsx: presentation display
- frontend/src/components/UnderstandingFeedback.jsx: student choice and lecturer aggregate view
- frontend/src/services/api.js: HTTP requests and errors

The server is authoritative: clients receive current state on connection, slide change and feedback.
Student commands cannot move slides. A per-session random lecturer token restricts controls.
Tokens are sent in the initial WebSocket frame and retained in sessionStorage for refresh recovery.
Feedback is stored as one current choice per student token per slide. Changing a choice replaces
the previous value. The denominator for percentages is the number of responses submitted for that
slide; students who did not respond are not counted as Understand. The lecturer receives only
aggregate feedback, and students receive only their own current-slide choice.

## Limitations

- Temporary role selection is NOT secure account authentication. Anyone with local access can
  create a session when none is active. Treat session tokens as temporary capabilities.
- In-memory sessions and feedback are lost on backend restart and do not support multiple backend workers.
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
- No MySQL, document conversion, accounts or AI integration in this milestone.
- Reserved backend/.env.example documents OLLAMA_BASE_URL and OLLAMA_MODEL for future
  configurable integration. It is not loaded and no AI service is invoked.
- Confusion detection is rule-based and classroom-wide. Explanations remain a future,
  lecturer-requested feature. Model training/fine-tuning is outside scope.
