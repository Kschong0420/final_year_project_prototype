# Milestone 1 verification

Executed on Windows on 2026-09-27.

## Installed environment
- Python 3.12.13, installed through uv in backend/.venv
- Node.js 24.13.0, npm 11.11.0
- Backend exact versions: backend/requirements-lock.txt
- Frontend exact versions: frontend/package-lock.json
- Chromium installed through Playwright for headless browser testing

## Passed

### Real HTTP/WebSocket integration suite
Command: backend/.venv/Scripts/python.exe -m unittest discover -s tests -v
Result: 1 integration scenario passed, covering these 11 checkpoints:

1. Invalid session code and blank title rejected.
2. Session creation, six-character code, and rejection of a second active session.
3. Two independent student clients joined; connected count matched.
4. Student navigation commands rejected by the server.
5. Lecturer slide changes reached both students.
6. A third, late student received the current slide.
7. Student disconnection and reconnection restored the latest slide without duplicate counting.
8. Lecturer reconnection restored current state and control.
9. Invalid slide indexes, malformed JSON and heartbeat handling.
10. Invalid WebSocket session token rejected.
11. Session end reached all clients; ended-session joins rejected; new session received a different code.

The test launches a real isolated Uvicorn process on port 8765 and closes it afterward.

### Browser integration suite
Command: npm.cmd run test:e2e
Result: 1 Chromium scenario passed using three independent browser contexts:

- Lecturer creates session.
- Invalid join code produces a visible error.
- First student joins; student navigation controls are absent.
- Slide navigation updates student presentation.
- Second student joins late and sees the current slide.
- Both students receive subsequent slide changes.
- Forced WebSocket closure shows reconnecting, automatically reconnects and restores latest state.
- Lecturer and student page reloads restore their sessions.
- Connected-student count stays at two after refresh.
- Last-slide navigation is disabled; previous-slide navigation works.
- Student page has no horizontal overflow at 390 x 844.
- Ending the lecture updates all three interfaces.
- No browser page errors were reported.

### Frontend production build
Command: npm.cmd run build
Result: passed (Vite 7.3.6).

## Failed
No final functional tests failed.

## Not executed / not established
- Separate physical student devices over Wi-Fi, firewall traversal or access-point client isolation.
- Sustained packet loss or real network outages. Reconnection was tested with real socket closure,
  not physical network hardware failure.
- Classroom-scale testing with 20-30 students.
- Formal end-to-end synchronisation latency measurement against the FYP <1-second target.
- Firefox, Safari and physical mobile-device testing.
- Account authentication, database persistence, document processing and AI features are outside
  Milestone 1 and were not implemented or tested.

## Current runtime
Backend: http://127.0.0.1:8000
Frontend: http://localhost:5173
The browser test ended its lecture; the UI is ready to create a new session.
Servers were left running at handoff, but may stop when the tool environment exits.
