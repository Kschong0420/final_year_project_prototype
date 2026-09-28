# Frontend workspace and slide viewer

Implemented after approval of the Prepare / Live class / Results proposal and viewing-mode additions.
The later complete interface redesign gives the app a consistent lecture desk layout, a
distinct lecturer/student entry path, numbered lecturer stages and a next-action cue drawn
from existing material/question state. It shortens visible instructions and adds a Results
overview from existing aggregate data. Session-code copying is a local browser action.
This is a frontend restructuring of Milestones 1–4.1, not Milestone 5. Backend files, endpoints,
session lifecycle, authentication capabilities and dependencies are unchanged.

## Interface

- **Prepare:** local source preview, collapsible upload/replace form, Generate and Review panels.
  Review opens one question editor at a time. Original AI questions, context, difficulty, timing,
  review history and discarded records remain available.
- **Live class:** large current slide, Previous/Next navigation and visible understanding feedback.
  Activities provides direct release of approved questions; Generate and Review remain available
  during class. Questions with unsaved edits cannot be released through the compact panel.
- **Results:** select a released activity to see submission totals, MCQ option counts or fill-in
  answer frequencies. Current-slide feedback and flagged slides use the existing snapshot data.
  No historical analytics, grading, identities or export feature is implied.
- **Students:** desktop slide/sidebar layout and mobile Slide/Activities tabs. Understanding feedback
  identifies the current slide. All released questions remain available; no lecturer-only controls
  or unreleased question data is exposed.

The same SlideViewer handles PDF images, PPTX visual previews, sample slides and text-only fallback.
Standard uses a large slide and narrower sidebar; Half-screen uses equal columns on desktop;
Expanded hides secondary UI until Class controls is opened; Full screen uses the browser API.
Students never get Previous/Next buttons. Preparation preview selection remains local and does
not send navigation commands. Live classroom changes automatically update the source selector.

100% zoom fits the available image area. Zoom steps are 25%, bounded at 75–200%. Reset and Fit
restore 100% and reset scroll. Layout resizing recomputes fitted dimensions; image width/height
use the same scale, preserving aspect ratio. Oversized content scrolls inside the viewer.
Text-only fallback scales text rather than pretending to preserve original PowerPoint graphics.

Viewing modes/zoom never go over the WebSocket. Switching areas keeps one session connection
and persistent editor components. Notes are retained per source slide. Presentation replacement
clears old drafts along with the existing server-side questions. Browser reload still restores
temporary session credentials, but unsaved drafts and viewer settings are not persistent storage.

## Executed validation — 2026-09-28

| Check | Actual result |
| --- | --- |
| Backend regression suite | 36 passed, 11.537 seconds |
| Full browser suite | 9 passed, 30.3 seconds |
| Additional activity rerun, including saved submissions and mobile drafts across zoom/full screen | 1 passed, 4.1 seconds |
| Final activity rerun with unsaved-edit release guard | 1 passed, 4.3 seconds |
| Frontend production build | Passed; 40 modules transformed |
| `git diff --check` | Passed; Windows line-ending notices only |

Browser tests ran in Chromium against isolated services on ports 5174/8769. AI tests used the
explicit fake Ollama HTTP fixture on 11435; no real model quality or timing claim is made.
The installed LibreOffice converter was exercised by visual PPTX tests.

Coverage includes:

1. Standard, Half-screen, Expanded and actual browser Fullscreen API modes.
2. Zoom limits, reset and fit, scrollable enlarged images and preserved PDF/PPTX aspect ratios.
3. Lecturer navigation while zoomed and full screen; student synchronisation during full screen.
4. Independent lecturer/student viewing settings and absence of student navigation controls.
   The backend suite also checks student navigation commands are rejected.
5. Escape and exit controls, restoration to Standard, and rejected full-screen fallback.
6. Prepare source preview does not move the live classroom slide; live navigation updates source.
7. Draft editing across workspace tabs; mobile answer drafts across tabs/zoom; saved submissions
   retained through lecturer full-screen changes; results update without refreshing.
8. Generation continues while switching panels, navigating and receiving understanding feedback.
   The backend delayed-AI regression separately verifies nonblocking live interactions.
9. Explicit approval/release, two student answers, discard, material replacement, late join,
   feedback/confusion, reconnection, same-token rejoin and end-session regression scenarios.
10. 390×844 mobile layout without horizontal document overflow. Desktop and mobile screenshots
    were inspected; feedback was compacted to leave room for live activity controls.

The first new viewer run exposed Escape not exiting full screen with automated key delivery.
An explicit Escape handler was added; the subsequent viewer and full-suite runs passed.
The application also listens for native `fullscreenchange` events to handle browser-driven exit.

## Reproduce

Use the isolated fake-service commands in [Milestone 4.1 tests](milestone-4.1-tests.md), then:

```powershell
cd C:\Users\user\Documents\fyp\Code\frontend
$env:CLASSROOM_TEST_URL='http://127.0.0.1:5174'
$env:CLASSROOM_FAKE_OLLAMA='1'
npm.cmd run test:e2e -- --max-failures=1
npx.cmd vite build --configLoader runner
```

Use the ordinary README startup commands for a demonstration with real Ollama. Prepare a
presentation and approve questions, join with two student windows, then open Live class and
release an activity. Compare local zoom and layouts in each window, answer from both students,
and inspect Results. Generate more questions while navigating; newly generated questions must
remain private until approved and explicitly released.

## Limits

Browser automation covered Chromium, not every browser/device. Fullscreen API support and
permissions vary; rejection falls back to Expanded. Browser-level exit paths outside Chromium
still merit a manual check. On narrow screens Half-screen stacks panels. Tall or complex content
may still require scrolling; desktop side panels scroll independently instead of lengthening the
main slide workspace. Existing extraction, rendering, no-OCR, temporary-storage and manual M2-T14
limitations remain. There are no AI explanations or Milestone 5 features.

## Complete interface redesign follow-up — 2026-09-28

The full browser suite passed again (9/9, 32.1 seconds) after the home screen, stage navigation,
contextual cue, compact copy and Results overview changes. The focused activity flow also passed
after the final guidance update (1/1, 4.9 seconds). Initial viewer regression found that Expanded
mode with Class controls open could place the side panel over the return button. The stage
container now gives the slide and controls separate columns; the focused PDF/PPTX viewer suite
passed after the fix. The production bundle passed with Vite's runner config loader (40 modules).
In this managed workspace, Vite's default bundled config loader attempts to read a directory
outside the writable workspace and fails with Access denied; the runner loader avoids that scan.

The new layout uses existing React, Tailwind and browser APIs only. No backend behavior,
session semantics, AI generation rules or Milestone 5 features changed.

## Files

Modified frontend: `src/App.jsx`, `src/pages/LivePage.jsx`, `src/styles.css`,
`src/components/SlideViewer.jsx`, `LecturerActivities.jsx`, `MaterialUpload.jsx`,
`UnderstandingFeedback.jsx`. Added `src/components/WorkspaceTabs.jsx`.

Updated browser suites: `activities.spec.js`, `classroom.spec.js`, `feedback.spec.js`,
`materials.spec.js`, `rejoin.spec.js`. Added `viewer.spec.js` and `slide-fixture.js`.
Updated README and added this verification document.

## Approved audit refinement: Stage 0 and Stage 1 only — 2026-09-28

Scope: repair the existing lecturer Live class workspace at laptop sizes, preserving all five
milestones. The later Prepare/Results redesign, student navigation redesign, student Half-screen
fix, viewer toolbar redesign and other Stage 2–5 work have **not** been implemented.

### Baseline and isolation

`git status --short` was empty before work began; there were no existing uncommitted changes
to overwrite. The approved architecture/UI audit, application source and existing milestone
testing instructions were read before application edits.

Tests used the existing environments/dependencies and separate services:

- Fake Ollama: `127.0.0.1:11445`.
- FastAPI: `127.0.0.1:8779`, configured to use that fake service.
- Vite: `127.0.0.1:5184`, configured to proxy to that backend.

These ports were checked before startup. Existing demonstration services and real Ollama were
not stopped or reconfigured. Only services started for this task were stopped after verification.

| Check | Baseline | After Stage 1 |
| --- | --- | --- |
| Backend unittest suite | **46 passed**, 10.669 s, including installed LibreOffice fixture | Backend unchanged; baseline remains applicable, not rerun |
| Existing full Playwright suite | **10 passed**, 34.8 s, Chromium/fake Ollama | **12 passed**, 40.4 s, including two new laptop regression cases |
| New layout regression cases on original UI | **2 failed as expected**: insufficient task height at 1366; overflowing page at 1024 | **2 passed** in focused run and final full suite |
| Production build, runner config loader | **Passed**, 42 modules | **Passed**, 42 modules, 900 ms |
| `git diff --check` | Clean starting tree | **Passed**; only Git's LF/CRLF conversion notices |

No required check was blocked. Existing warnings included Starlette's test-client deprecation
notice and Node's colour-environment warning; no dependencies were changed to suppress them.
Real-model quality/latency, Firefox/Safari, physical mobile devices and screen readers were not
tested in this UI stage.

During development, the new test initially used an activity prompt above the existing 500-character
limit and counted Vite's development WebSocket as a session socket. Those test-fixture errors
were corrected without changing validation or connection code. A mobile resize assertion then
caught grid intrinsic-width overflow, which was fixed in the scoped Live class CSS. The final
full run has no failures or skipped tests.

### Before and after

Measurements use Standard view with generated activities and one approved activity selected.
The baseline capture had zero connected students; the new regression captures also exercise a
connected student and feedback acknowledgement. Dimensions below are rounded CSS pixels.

| Measurement | 1366 × 768 before → after | 1024 × 768 before → after |
| --- | --- | --- |
| Document height | 768 → **768** | 838 → **768** |
| Permanent feedback panel height | 267 → **166** | 267 → **166** |
| Visible classroom task height | 260 → **381** | 214 → **321** |
| Slide navigation bottom from viewport top, at page scroll 0 | 693 → **713** | 783 → **713** |
| Initial release action | Below the task viewport | Now inside the initial task viewport at both sizes |

The slide and feedback remain in place as the task body scrolls. The live task uses compact
source/tool selectors and an activity selector instead of a second permanent tab row and a
nested scrolling question list. Release/review controls precede the selected approved question's
long content. Explanation source text is collapsed initially but remains accessible.

The feedback summary retains both counts and percentages, respondent total and potential
confusion status. Rule explanation and flagged-slide history are available through Feedback
details; Escape closes the disclosure. Explain this slide still only opens the existing task:
generation, approval and sharing remain separate lecturer actions.

Desktop sizing now allocates the remaining viewport through the shell's flex/grid layout instead
of subtracting a guessed header height from each Live grid. At 640 px viewport height, navigation
and feedback remain visible in the new tests. At 390 and 320 px mobile widths, the lecturer flow
allows vertical scrolling and has no horizontal document overflow. The student interface retains
its existing layout and passes the existing mobile/draft tests.

Local comparison screenshots (ignored artifacts, not committed; available in this workspace):

- 1366: [before](../frontend/playwright-report/live-stage1/baseline/live-1366.png) /
  [after](../frontend/playwright-report/live-stage1/after/live-initial-1366.png).
- 1024: [before](../frontend/playwright-report/live-stage1/baseline/live-1024.png) /
  [after](../frontend/playwright-report/live-stage1/after/live-initial-1024.png).
- [Long explanation after sharing](../frontend/playwright-report/live-stage1/after/explanation-actions-1024.png).
- [Lecturer at 320 px](../frontend/playwright-report/live-stage1/after/lecturer-mobile-320-1024.png).

### Regression coverage added

`frontend/tests/live-layout.spec.js` runs the same interaction at both laptop widths and asserts:

- Navigation, essential feedback and the initial release action lie inside the viewport.
- Task height is at least 320 px at the two specified laptop sizes; document height stays 768 px.
- Feedback details remain available and retain the configured 50% / two-response rule.
- Long question/explanation edits survive switching classroom tasks and Prepare/Live workspaces.
- Save, approve, release and share actions can be scrolled into the main task viewport and are
  actually hit-testable, without scrolling the document.
- The same SlideViewer DOM instance and exactly one open **session** socket remain after switching.
- Local source changes do not move the student's slide; lecturer navigation still synchronises it.
- The shorter laptop height and narrow mobile layouts keep actions reachable without horizontal overflow.

Existing viewer and activity tests were updated only where live question-tool tabs became a
select control or a live question list became a selector. Existing feedback/adaptive tests passed
without changing their assertions. The full suite also exercises PDF/PPTX aspect ratios,
fullscreen/Escape, independent local viewing state, delayed live generation, privacy, answer
submissions, confusion flags, anonymous questions, reconnect/rejoin and material replacement.

### Changed files

- `frontend/src/pages/LivePage.jsx`: opt-in Live shell and compact feedback; hide redundant live
  next-step guidance while preserving its Prepare/Results behaviour.
- `frontend/src/styles.css`: Live-only viewport/scroll/feedback rules and narrow-screen sizing;
  preserve existing Prepare controls' layout around the small shared markup adjustment.
- `frontend/src/components/UnderstandingFeedback.jsx`: compact Live summary and optional details;
  no feedback-rule or student-submission changes.
- `frontend/src/components/WorkspaceTabs.jsx`: optional native select presentation for live
  question tools; existing stage/student tab behaviour retained.
- `frontend/src/components/LecturerActivities.jsx`: small live presentation changes for task and
  activity selection/action placement; existing editors, drafts and requests retained.
- `frontend/src/components/LecturerExplanations.jsx`: source disclosure initially collapsed.
- `frontend/tests/live-layout.spec.js`: new layout/draft/action regression coverage.
- `frontend/tests/activities.spec.js`, `frontend/tests/viewer.spec.js`: updated live-control locators.
- `docs/ui-workspace-tests.md`: this baseline, implementation and verification record.

### Remaining limits and scope boundary

Long content still needs task scrolling, and mobile deliberately permits page scrolling.
Textareas retain their normal editing scroll behaviour. Very short screens or large browser text
scaling may require vertical scrolling rather than shrinking controls. Browser-specific native
select menus and fullscreen behaviour still merit checks on actual demonstration devices.

The known stale generation completion notice remains for Stage 2. Results layout, student
navigation and student Half-screen sizing remain as audited. Storage, temporary identities,
PPTX fidelity and extraction quality are unchanged. No new routes, socket events, dependencies,
database/authentication system, AI model, automatic generation or automatic release/share were
introduced. No commit or push was made. Work stops at Stage 1.
