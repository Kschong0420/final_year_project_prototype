import { useState } from 'react'
import { adaptiveRequest } from '../services/api'

export function LecturerQuestions({ state }) {
  const questions = state.anonymous_questions || []
  return <section className="activity-workspace" aria-label="Anonymous student questions">
    <h2 className="text-lg font-semibold">Student questions</h2>
    <p className="text-xs text-slate-600">Anonymous · {questions.length} received</p>
    {!questions.length && <p className="text-sm">No questions yet.</p>}
    {state.slides.map((slide, index) => {
      const group = questions.filter(item => item.slide_index === index)
      return group.length > 0 && <section className="adaptive-card" key={index}>
        <h3 className="font-semibold text-sm">Slide {index + 1}{index === state.current_slide ? ' · Current slide' : ''}</h3>
        <ul className="mt-2 space-y-3">{group.map(item => <li className="adaptive-text" key={item.id} data-testid="anonymous-question">{item.text}</li>)}</ul>
      </section>
    })}
  </section>
}

export function StudentQuestion({ state, credentials, active }) {
  const [drafts, setDrafts] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const slide = state.current_slide
  const text = drafts[slide] || ''
  async function submit(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await adaptiveRequest(credentials, '/anonymous-questions', 'POST', {
        presentation_id: state.presentation_id, slide_index: slide, text,
      })
      setNotice(`Question sent anonymously for slide ${slide + 1}.`)
      setDrafts(previous => previous[slide] === text ? { ...previous, [slide]: '' } : previous)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <form className="activity-workspace" onSubmit={submit}>
    <h2 className="font-semibold">Ask a question · Slide {slide + 1}</h2>
    <p className="text-xs text-slate-600">Your question is sent to the lecturer without your identity. Avoid including your name or personal details.</p>
    <label className="field-label" htmlFor="anonymous-question">Your anonymous question</label>
    <textarea id="anonymous-question" rows={4} maxLength={1000} value={text} disabled={!active || busy}
      onChange={event => { setDrafts({ ...drafts, [slide]: event.target.value }); setError(''); setNotice('') }} />
    <p className="text-xs text-slate-500">{text.length}/1000 · Drafts stay with their slide.</p>
    <button className="primary" disabled={!active || busy || !text.trim()}>{busy ? 'Sending question…' : 'Send question anonymously'}</button>
    {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </form>
}

export function SharedExplanations({ state }) {
  const items = state.shared_explanations || []
  return <section className="activity-workspace" aria-label="Shared explanations">
    <h2 className="font-semibold">Shared explanations</h2>
    {!items.length && <p className="text-sm">No explanations shared yet.</p>}
    {state.slides.flatMap((slide, index) => items.filter(item => item.slide_index === index).map(item =>
      <article className="adaptive-card" key={item.id} data-testid="shared-explanation">
        <h3 className="text-sm font-semibold">Slide {index + 1}{state.current_slide === index ? ' · Current slide' : ''}</h3>
        <p className="adaptive-text mt-2">{item.text}</p>
      </article>))}
  </section>
}
