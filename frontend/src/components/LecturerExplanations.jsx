import { useEffect, useState } from 'react'
import { adaptiveRequest } from '../services/api'

function ExplanationEditor({ item, credentials, active }) {
  const [draft, setDraft] = useState(item.current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => { setDraft(item.current) }, [item.current])
  const dirty = draft !== item.current
  const editable = ['pending', 'approved'].includes(item.status)
  async function act(action) {
    setBusy(true); setError(''); setNotice('')
    try {
      await adaptiveRequest(credentials, `/explanations/${item.id}${action === 'edit' ? '' : '/' + action}`,
        action === 'edit' ? 'PUT' : 'POST', { version: item.version, ...(action === 'edit' ? { text: draft } : {}) })
      setNotice({ edit: 'Edits saved. Approve this version before sharing.', approve: 'Approved. Still private until shared.', share: 'Shared with students.', discard: 'Explanation discarded.' }[action])
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <article className="adaptive-card" data-testid="explanation-review">
    <p className="text-sm font-semibold">Slide {item.slide_index + 1} · {{ pending: 'Awaiting review', approved: 'Approved · Private', shared: 'Shared with students', discarded: 'Discarded' }[item.status]}</p>
    <label className="field-label mt-3" htmlFor={`explanation-${item.id}`}>Explanation</label>
    <textarea id={`explanation-${item.id}`} rows={7} maxLength={3000} value={draft}
      disabled={!active || busy || !editable} onChange={event => setDraft(event.target.value)} />
    {editable && <div className="mt-3 flex flex-wrap gap-2">
      <button className="secondary" disabled={!active || busy || !dirty || !draft.trim()} onClick={() => act('edit')}>Save explanation edits</button>
      {item.status === 'pending' && <button className="secondary" disabled={!active || busy || dirty} onClick={() => act('approve')}>Approve explanation</button>}
      {item.status === 'approved' && <button className="primary" disabled={!active || busy || dirty} onClick={() => act('share')}>Share explanation</button>}
      <button className="secondary" disabled={!active || busy} onClick={() => act('discard')}>Discard explanation</button>
    </div>}
    {dirty && <p className="text-xs mt-2">Unsaved edits. Save and approve before sharing.</p>}
    <details className="mt-3 text-sm"><summary>Original AI output and source</summary>
      <p className="adaptive-text mt-2">{item.original}</p>
      <p className="mt-2 font-semibold">Source slide {item.slide_index + 1}</p>
      <p className="adaptive-text">{item.source_text}</p>
      <p className="mt-2">Supporting quote: {item.source_quote}</p>
      <p className="mt-2">Model: {item.model} · {item.generation_seconds}s</p>
      <pre className="adaptive-text mt-2">{JSON.stringify(item.review_history, null, 2)}</pre>
    </details>
    {notice && <p role="status" className="mt-2 text-sm text-teal-800">{notice}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </article>
}

export default function LecturerExplanations({ state, credentials, active, slideIndex, onSourceChange }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generated, setGenerated] = useState(null)
  const [selected, setSelected] = useState(null)
  const items = state.explanations || []
  const visible = items.filter(item => item.slide_index === slideIndex)
  const chosen = visible.some(item => item.id === selected) ? selected : visible.at(-1)?.id
  const source = state.slides[slideIndex]?.text || ''
  async function generate() {
    setBusy(true); setError(''); setGenerated(null)
    try {
      const result = await adaptiveRequest(credentials, '/explanations/generate', 'POST', {
        presentation_id: state.presentation_id, slide_index: slideIndex,
      })
      setGenerated(result); setSelected(result.id)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <section className="activity-workspace" aria-label="Lecturer explanations">
    <h2 className="text-lg font-semibold">Explain a slide</h2>
    <label className="field-label" htmlFor="explanation-slide">Explanation source slide</label>
    <select id="explanation-slide" value={slideIndex} onChange={event => onSourceChange(Number(event.target.value))}>
      {state.slides.map((slide, index) => <option key={index} value={index}>Slide {index + 1} — {slide.title}{state.flagged_slides?.includes(index) ? ' · Flagged' : ''}</option>)}
    </select>
    <details className="source-text" open><summary>Explanation source text</summary><pre className="adaptive-text max-h-40 overflow-auto">{source || 'No selectable text. A reliable explanation cannot be generated from this slide.'}</pre></details>
    <p className="text-xs text-slate-600">Review the source and AI output. Nothing is shared automatically.</p>
    <button className="primary" disabled={!active || busy || state.explanation_generation_in_progress} onClick={generate}>Generate explanation</button>
    {(busy || state.explanation_generation_in_progress) && <p role="status" className="text-sm">Generating explanation. Slides and feedback remain available.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {generated && <div role="status" className="text-sm text-teal-800">Slide {generated.slide_index + 1}: explanation ready for review.
      {slideIndex !== generated.slide_index && <button className="secondary" onClick={() => { onSourceChange(generated.slide_index); setSelected(generated.id) }}>Review generated explanation</button>}
    </div>}
    {visible.length > 0 ? <><label className="field-label" htmlFor="explanation-version">Saved explanations</label>
      <select id="explanation-version" value={chosen} onChange={event => setSelected(event.target.value)}>
        {visible.map((item, index) => <option key={item.id} value={item.id}>Explanation {index + 1} · {item.status}</option>)}
      </select></> : <p className="text-sm text-slate-600">No explanation for this slide yet.</p>}
    {items.map(item => <div key={item.id} hidden={item.id !== chosen}><ExplanationEditor item={item} credentials={credentials} active={active} /></div>)}
  </section>
}
