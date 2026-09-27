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
