# Milestone 2 verification

Executed on Windows on 2026-09-27 with Python 3.12 and Chromium.

## Final results

| Check | Result |
| --- | --- |
| Backend unit and real HTTP/WebSocket integration tests | 7 passed |
| Chromium browser tests | 3 passed |
| Frontend production build | Passed |

Backend command: `backend/.venv/Scripts/python.exe -m unittest discover -s tests -v`

Browser command: `npm.cmd run test:e2e` from `frontend/`, with the test frontend pointing to
the updated backend. The existing Milestone 1 browser scenario and the new feedback scenario
both passed.

Build command: `npm.cmd run build` from `frontend/`.

## Scenarios checked

1. One student submits Understand: one response, 100% Understand, no flag.
2. One student submits Not Understand: one response, 100% Not Understand, no flag because
   the two-response minimum has not been reached.
3. Two students submit different responses: one of each, 50% Not Understand.
4. At exactly 50% with two responses, the slide is flagged.
5. Changing a response replaces the earlier choice; total stays at two and the flag can clear.
6. No responses produce zero counts and zero percentages, without treating missing responses
   as Understand.
7. Feedback remains separate across slides and is restored when the lecturer returns.
8. Student WebSocket reconnection restores that student's choice for the current slide.
9. The lecturer's totals and flags update through WebSockets without a page refresh.
10. A stale-slide submission, invalid choice and lecturer feedback submission are rejected.
11. Lecturer state contains aggregates without student tokens or individual choices. Student
    state contains only that student's current-slide choice.
12. Flagging sends no explanation request. The prototype contains no AI explanation path.
13. Milestone 1 session creation, slide sync, late joining, reconnection and session ending
    still pass.

The initial browser rerun conflicted with the backend test suite because both were pointed at
port 8765. The tests now use separate ports (8768 for backend integration and a separate
browser-test backend). The clean sequential rerun passed. No final functional checks failed.

## M2-T14 regression follow-up

The manual test found a duplicate response after a student manually rejoined. The original join
endpoint always created a new temporary student token. Feedback was correctly unique by token,
but the newly issued token looked like a third participant. Automatic WebSocket reconnection
already reused the existing token.

The join form now offers the earlier token when the student leaves and rejoins the same session
in the same browser tab. The backend validates it against that session before reusing it. A new
tab without the token receives a new student identity. The student interface disables feedback
while disconnected and shows a new submission as saved only after a backend acknowledgement.

Regression checks: A and B submit Understand (total 2); A reconnects and submits Understand
again (total 2); A changes to Not Understand (total 2, one of each); independent C joins and
submits (total 3). The browser test also verifies disabled feedback controls and an offline
message during a forced WebSocket disconnection. The clean browser suite passed all three tests
against an isolated backend on port 8770 and frontend on port 5176.

## Not executed

- Two or more physical devices over a classroom Wi-Fi network.
- Classroom-scale concurrency or formal latency measurements.
- Database persistence or complete anonymity verification; both are outside this milestone.

The main server on port 8000 was already running an older process when verification finished.
Restart it to load the new backend code. The updated implementation was run and browser-tested
on an isolated backend at port 8765 with a frontend at port 5174.
