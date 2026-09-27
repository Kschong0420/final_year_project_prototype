# Milestone 3 verification

Run on 27 September 2026, Windows, with Python 3.12 and the project's local Node dependencies.
This follow-up began with uncommitted Milestone 3 files and a modified proposal document;
the proposal was left untouched.
The latest user manual report recorded **13 passed, 1 failed (R02), and 2 not tested (R04, R08)**.
The follow-up checks below do not overwrite that manual result.

## Automated results

`backend/.venv/Scripts/python.exe -m unittest discover -s tests -v`: **23 passed,
0 failed** in the latest run. This includes 7 existing M1/M2 tests and 16 material/processing tests.
The existing real HTTP/WebSocket tests passed. New tests generated PDFs and PPTX files at runtime,
then verified parsing, secure preview access, replacement, feedback isolation and failures.

`npm.cmd run test:e2e`: **6 passed, 0 failed** with a local backend and frontend.
This includes the 3 existing browser tests and three material tests with independent
student browser contexts. `npm.cmd run build`: **passed**.

| Scenario | Automated evidence | Manual follow-up |
| --- | --- | --- |
| M3-T01 PDF upload | Passed (HTTP and browser) | Not rerun |
| M3-T02 PDF page count/text | Passed (two generated pages) | Not rerun |
| M3-T03 PPTX upload | Passed (HTTP) | Not rerun |
| M3-T04 PPTX order/text | Passed (two generated slides) | Not rerun |
| M3-T05 legacy PPT message | Passed (HTTP 415) | Not rerun |
| M3-T06 invalid, corrupt, oversized | Passed (HTTP 415/422/413) | Not rerun |
| M3-T07 sample replacement | Passed (HTTP and browser) | Not rerun |
| M3-T08 two-student sync | Passed (WebSocket; browser upload state) | Not rerun |
| M3-T09 late join | Passed (WebSocket) | Not rerun |
| M3-T10 same-token reconnect | Passed (WebSocket) | Not rerun |
| M3-T11 feedback on uploaded slide | Passed (WebSocket and browser) | Not rerun |
| M3-T12 replacement clears old feedback | Passed (WebSocket and browser) | Not rerun |
| M3-T13 student control/upload denied | Passed (WebSocket/HTTP) | Not rerun |
| M3-T14 failed processing retains slides | Passed (HTTP/WebSocket) | Not rerun |
| M3-T15 no AI request on upload | Passed (browser request monitor) | Not rerun |
| M3-T16 restart state loss | Passed (new app instance) | Not rerun |

The follow-up tests also checked a TXT file renamed `.pdf`, a malformed PPTX archive, a PDF
with a missing EOF marker that PyMuPDF recovered, and an upload exceeding the configured 25 MB
limit. The oversize test confirmed that document parsing was never called. A genuinely unreadable
PDF was rejected while the previous presentation ID, feedback, lecturer navigation and two-student
synchronisation remained intact. Structured PPTX extraction was tested with a title, bullets,
nested bullet, numbered item, table and image.

The LibreOffice command path, isolated profile, timeout and PPTX-to-PDF slide mapping were tested
with a controlled fake conversion subprocess. A mocked visual PPTX upload reached two student
WebSocket clients with protected page images and the original PPTX text. **Real LibreOffice
26.8.0.3 output was also tested** on a generated PPTX containing an embedded table preview.
The browser test confirmed that the lecturer and two students received identical preview bytes.
The text-only fallback and its warning remain tested.

The M3-T16 test verifies a new app instance has no session. It does not restart the user's
running local server. Uploaded files remain on disk under ignored `backend/storage/`, but their
in-memory session metadata does not survive a backend restart.

## Manual demonstration

1. Start the backend and frontend using the PowerShell commands in the README. Use one backend
   worker and leave both terminals running.
2. In the lecturer browser, create a session. In two independent student windows, join with
   the displayed code. Do not clone a tab with shared session storage.
3. Upload a two-page PDF. Check the ready message and page images in all three windows. Use
   **Next slide**; both students should follow. Open **Extracted text** below a PDF page.
4. Have student A select Understand and student B select Not Understand on page 2. Check the
   lecturer's 2-response, 50% confusion flag. Return to page 1 to see its own totals.
5. Join a third student after navigating; check that the current page appears. Disconnect and
   reconnect a student in the same window; check the current page and existing response.
6. Upload a PPTX. It should start at slide 1 in all windows, show extracted text in slide order,
   and show zero prior feedback. Try a `.ppt` file and a corrupt `.pdf`; the previous PPTX should
   remain active after each error.

## Known limits and outstanding issue

PPTX visuals render through local LibreOffice when available. Embedded Excel/OLE objects that
LibreOffice places as tiny upper-left images are replaced using their PPTX preview at the
object's source bounds. Some PPTX preview images are themselves cropped; this cannot be repaired
without a different source or rendering engine. PDF text extraction does not perform OCR;
image-only pages remain viewable as images. Legacy `.ppt` conversion is deferred.
No AI endpoint is called.

M2-T14 remains outstanding in the user's manual report. Reconnecting with the **same** student
token preserves one response in automated tests. Manually joining from a window that no longer
has that token can create a new temporary student identifier and a second response; this
milestone does not claim to solve identity recovery without accounts.

## Retest the four Milestone 3 concerns

1. **Visual PPTX:** Install LibreOffice on the backend PC, set `LIBREOFFICE_PATH` if its
   `soffice.exe` is outside the default Windows location, restart the backend, and upload a PPTX
   with a background, image, bullets and table. Confirm that all three windows show page images,
   then compare them with PowerPoint. Without LibreOffice, confirm that the lecturer sees a
   text-only warning and that the slide is still readable. Visual fidelity on real slides is
   still awaiting this manual check.
2. **Structured extraction:** Upload a deck containing a title, nested bullets, a numbered
   list, a table and an image. Expand **Extracted text** under a visual slide, or inspect the
   text-only view. Confirm the title and reading order, list indentation and table rows. Image
   content itself is not extracted as text.
3. **Validation:** Upload a TXT file renamed `.pdf`, a corrupt `.pptx`, and a file larger than
   25 MB. Each must show a clear error. Also try a mildly damaged but recoverable PDF; acceptance
   is expected only if PyMuPDF can render its pages safely.
4. **Failure recovery:** With a working two-page document active, collect two feedback responses.
   Then upload a file containing plain text but named `unreadable.pdf`. Confirm the error, the
   unchanged presentation and feedback, and that Next/Previous still update two student windows.

## Latest follow-up: table, reading order and upload form

The locally uploaded 27-slide PPTX has embedded Excel/OLE objects rather than native PowerPoint
table shapes. For slide 6, the source object is approximately 8.25 × 3.44 inches at x=1.12,
y=2.57 inches. LibreOffice's PDF placed its image at PDF coordinates (100, 100) to (200, 200),
while the page was 1440 × 810 points. PyMuPDF's preview reproduced that PDF position and the
React viewer used `object-contain` without distortion. The first incorrect position therefore
occurred in LibreOffice conversion. A temporary render copy now omits supported OLE objects;
the source PPTX preview is placed on the converted PDF at the original object bounds. The
repaired slide 7 table was visually inspected at slide scale. On slide 6, the PPTX's own preview
is already cropped at its right edge, so the complete table still cannot be guaranteed there.
The diagnostic files remain under ignored `backend/storage/diagnostics/` and are not committed.

The same 27-slide deck's agenda previously interleaved labels (`01`, `07`, then their titles).
The new layout ordering reads its left column as `01 Project Background` through `06 Benefits
and Significance`, then its right column as `07 Limitations and Constraints` through `12
Conclusion`. A converted PDF of that slide produced the same order. Synthetic tests cover
single-column PDF text, two-column numbered PDF/PPTX agendas, nested bullets, a native table,
an image with surrounding text, and slide-aligned extraction. Native PDF tables are extracted
as rows and cells where PyMuPDF can detect them; image-only tables still have no OCR.

The upload form's error came from reading `event.currentTarget` after awaiting the upload.
React had cleared that event property, so `reset()` threw after the backend had already accepted
the file. The form element is now captured before awaiting. Browser tests upload two valid PDFs
consecutively with no error, then an unreadable PDF and a 25 MB-plus file. Both invalid uploads
show the expected error and leave the working slide and feedback available.

The two outstanding user manual checks were exercised by automation, not by a new human manual
run: R04 used a generated PPTX with an embedded table preview and compared the rendered PNG
bytes in one lecturer and two student browser contexts; R08 used an upload over the configured
25 MB limit and confirmed a size-specific error with unchanged feedback. The user's manual
R02 result remains **Fail** until they retest their original table slide.

To retest R02/R04, restart the backend, upload the original PPTX, then compare the affected
table slide in lecturer and two independent student windows. Check that it is no longer a small
upper-left image; compare content completeness with PowerPoint, especially any source preview
that was already cropped. To retest extraction, open **Extracted text** on the agenda slide of
the PPTX or its PDF export and verify that each number stays with its title, reading left column
then right. To retest the form, upload two valid files consecutively, then an unreadable file;
the success message must never appear with a JavaScript error, and the failed upload must leave
the second valid presentation active. To retest R08, upload a file over 25 MB and confirm the
size-specific error while the previous presentation and feedback remain available.

## Complex-layout extraction follow-up

The original uploaded 27-page PDF and the supplied screenshots were inspected. On page 11,
PyMuPDF's default `find_tables()` found the real four-row study table **and** a second table
covering the blue paragraph panel from x=0 to y=810 (the page bottom). Its invented second
row contained `There i`, `For ex`, and `furthe` in both cells. The page's raw text blocks already
contained the complete sentences, so the fragments came from false table recognition, not
from a damaged text layer. Strict line-based table detection finds only the real study table.
The change leaves the original PDF page image untouched.

Selected page 11 text **before**:

```text
Study | Adaptation Approach
Reddig et al. (2025) | Individualised feedback based on student errors
... complete paragraph sentences ...
There i
For ex
furthe | There i
For ex
furthe
```

Selected page 11 text **after**:

```text
Study | Adaptation Approach
Reddig et al. (2025) | Individualised feedback based on student errors
Villegas-Ch et al. (2025) | Personalised adaptive learning
Lee et al. (2026) | Just-in-time adaptive feedback
... complete paragraph sentences ...
further discussion or teaching action.
```

The complete title, four table rows, approach statements and the full sentences are checked
against the page image in `backend/tests/fixtures/adaptive-learning-page.pdf`. A second one-page
fixture, `problem-statement-page.pdf`, captures page 4 of the same PDF. Default table detection
mistook decorative rectangles for tables there too, adding long runs of `|` and incomplete
text. The strict detector finds no native table on that page, so its actual paragraphs remain.
Its `01`/`02`/`03` labels now stay with their same-row headings.

The original 27-slide PPTX's Problem Statement slide has separate number and heading shapes
whose top coordinates differ by 0.01 inch. Sorting them by top coordinate alone put each title
before its number. Geometry-based pairing now joins them before sorting, while preserving the
body text and the original shape-level structured blocks. Selected text **before**:

```text
Lecturers Lack Time to Prepare Interactive Learning Materials
01
University lecturers face heavy workloads ...
```

Selected text **after**:

```text
01 Lecturers Lack Time to Prepare Interactive Learning Materials
University lecturers face heavy workloads ...
```

The original two-column agenda was rechecked and still reads left column `01`–`06`, then right
column `07`–`12`. A generated multi-region PPTX test covers number/heading pairing, plus the
existing tests cover native table rows, nested bullets and images. Extracted structured blocks
carry `slide_number`; PPTX text still comes directly from the source PPTX and visuals still come
from LibreOffice/PyMuPDF. For the horizontal Milestones timeline, the source PPTX itself has
two separate `M6` text shapes and an overlapping label region. The extractor does not delete
either source shape or guess a single intended reading order for this ambiguous layout.

The visual R02 diagnosis remains unchanged: LibreOffice shrank some embedded OLE previews to
the upper-left. The existing repair places valid previews at source-object bounds. The slide 6
preview in the source PPTX is cropped, so full table content cannot be restored from it. The
generated OLE-table visual test and the actual PDF page-11 visual test each compared identical
preview bytes across one lecturer and two independent student browser contexts. These are
automated R04 checks, not a new human manual pass. The 25 MB-plus automated upload test still
verifies size rejection before parsing and preservation of the active presentation; the user
has not yet rerun R08 manually.

The upload reset error was already fixed by retaining the form element before the asynchronous
request. Browser tests again covered two consecutive valid uploads followed by invalid and
oversized uploads, with no uncaught page errors. The unreadable-file test again preserved the
previous presentation, feedback and two-student WebSocket navigation. The latest frontend
production build passed. **Latest automated totals: 23 backend tests passed, 6 browser tests
passed, 0 failed; build passed.** The manual report remains 13 passed, R02 failed, R04/R08
not tested until the user repeats those checks. M2-T14 remains outstanding for manual rejoining
without the original student token.
