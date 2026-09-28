# Demo readiness verification (2026-09-29)

This focused change covers Windows setup/startup, point-form explanation grounding, and
lecturer Session Analytics. Stage 2 UI redesign remains paused. No dependencies, routes,
WebSocket contracts, model, persistence layer, or confusion rule were changed.

## Windows setup and startup

Run from the repository root in PowerShell:

```powershell
.\setup.ps1
.\check.ps1
.\run.ps1
```

`setup.ps1` was run twice after implementation. The existing Python 3.12 virtual
environment and npm packages were reused; uv checked seven Python packages without
reinstalling them. Missing tools are reported, and the model is never pulled unless
`-InstallModel` is supplied. LibreOffice is optional because PPTX text fallback exists.
`check.ps1` passed the core Python, backend import, Node/npm, frontend package,
Ollama/model, and LibreOffice checks. It correctly warned about occupied default ports
while a test launch was running. It is read-only.

`run.ps1` was verified from free ports. It started Ollama with `ollama serve` when the
installed local service was stopped, started FastAPI at `127.0.0.1:8000`, and started
the existing Vite development server on `0.0.0.0:5173`. Backend `/api/health` and the
frontend returned successfully. It printed localhost and detected LAN URLs without
hard-coding an IP. Ctrl+C stopped only the processes from that launch; the ports were
then free. A pre-existing Ollama process is not owned or stopped by the script.

## Point-form explanation grounding

The old check required the model's `source_quote` to be an exact, whitespace-collapsed
substring of extracted slide text. A model quote that omitted a bullet marker, changed
punctuation or case, or combined text split over lines could fail even when it copied
the source's actual words. Its explanation check needed only one overlapping topic
term, which was weak against unrelated additions. The prompt also asked for an exact
supporting *sentence*, despite slides often containing only short bullets.

The prompt now explicitly accepts factual headings, bullets, and fragments and asks
for a copied supporting phrase. The validator compares ordered quote word tokens after
ignoring case, whitespace, bullet symbols, and punctuation. A phrase from one bullet
can support an explanation combining several source bullets. It also requires at least
two substantive terms in the quote, sufficient explanation/source concept overlap,
all explanation numbers in the source, and no new proper names. This is a deterministic
screen, **not** a semantic proof; the lecturer still reviews and shares explicitly.
Only a structurally valid response failing this support check gets one stricter
corrective generation attempt. Malformed responses and timeouts do not retry, and a
stale session/presentation disallows the retry. Genuinely short/empty source remains
unusable.

## Session Analytics

The lecturer Results workspace shows session title/code/status; connected students;
slide and released-activity counts; answer submissions summed across released
activities; anonymous-question, generated-explanation and shared-explanation counts;
currently flagged slide numbers; and current-slide feedback respondents, Understand,
Not Understand, and percentage. Existing per-activity results below the summary retain
submission counts, MCQ distribution, and fill-in answer frequencies. The report uses
the existing lecturer snapshot and no new API. Answer submissions may include multiple
answers from one student. Connected students are not attendance. The report and source
data disappear on backend restart.

## Executed checks

| Check | Result |
| --- | --- |
| Full backend `unittest discover -s tests -v` | **58 passed** in 13.957 s, including 12 new grounding tests and existing adaptive, materials, live and feedback tests |
| Full Playwright suite with isolated fake Ollama/backend/Vite on 11445/8779/5184 | **13 passed** in 44.1 s, including new Session Analytics and Stage 1 laptop layout tests |
| Frontend production build (`npm run build -- --configLoader runner`) | **Passed**, 43 modules |
| `git diff --check` | **Passed** (Git only noted LF/CRLF conversion warnings) |
| `check.ps1`, repeated `setup.ps1`, `run.ps1`, `/api/health` | **Passed** as described above |

The local, already installed `phi3:mini` also generated and passed the new grounding
check for a normal paragraph source (**42.81 s**, one model generation) and a
bullet-heavy source (**4.45 s** total). The Ollama log recorded two generation POSTs
for the bullet source, indicating that the single corrective retry was used. This was
a small smoke test, not a quality benchmark.

Remaining limits: grounding cannot prove every paraphrase true; lecturer review is
still essential. Model latency varies, PPTX visual rendering depends on LibreOffice,
and all report data is in memory for the current single session. Physical LAN clients,
other Windows machines, and other browsers were not tested here.
