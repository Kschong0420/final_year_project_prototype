import { useEffect, useState } from 'react'

export function StudentFeedback({ state, active, submitFeedback, feedbackAck }) {
  const selected = state.my_feedback
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setPending(null)
    setNotice('')
  }, [state.current_slide, state.presentation_id])

  useEffect(() => {
    if (!active) {
      setPending(null)
      setNotice('')
    }
  }, [active])

  useEffect(() => {
    if (pending && feedbackAck?.request_id === pending.id &&
      feedbackAck.slide_index === pending.slideIndex && feedbackAck.choice === pending.choice) {
      setPending(null)
      setNotice('Response saved.')
    }
  }, [feedbackAck, pending])

  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => {
      setPending(null)
      setNotice('Could not confirm this response. Check the connection and try again.')
    }, 8000)
    return () => clearTimeout(timer)
  }, [pending])

  function submit(choice) {
    setNotice('')
    const id = submitFeedback(state.current_slide, choice, state.presentation_id)
    if (id === null) {
      setNotice('Response not sent. Wait for the connection and try again.')
      return
    }
    setPending({ id, slideIndex: state.current_slide, choice })
  }

  return <section className="panel mt-5" aria-labelledby="student-feedback-title">
    <h2 id="student-feedback-title" className="text-base font-semibold">Do you understand this slide? <span className="text-sm font-normal text-slate-500">Slide {state.current_slide + 1}</span></h2>
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <button className={'feedback-choice ' + (selected === 'understand' ? 'feedback-selected' : '')}
        disabled={!active} aria-pressed={selected === 'understand'} onClick={() => submit('understand')}>Understand</button>
      <button className={'feedback-choice ' + (selected === 'not_understand' ? 'feedback-selected' : '')}
        disabled={!active} aria-pressed={selected === 'not_understand'} onClick={() => submit('not_understand')}>Not Understand</button>
    </div>
    <p data-testid="my-feedback" className="mt-4 text-sm text-slate-600" aria-live="polite">
      {selected === 'understand' ? 'Your response: Understand' : selected === 'not_understand' ? 'Your response: Not Understand' : 'No response submitted for this slide.'}
    </p>
    <p data-testid="submission-status" className="mt-2 text-sm text-slate-600" aria-live="polite">
      {!active ? 'Offline. Feedback cannot be submitted until reconnected.' : pending ? 'Sending response…' : notice}
    </p>
  </section>
}

export function LecturerFeedback({ state, onExplain }) {
  const feedback = state.current_feedback
  const flagged = state.flagged_slides || []
  const rules = state.confusion_rules
  return <section className="panel" aria-labelledby="insights-title">
    <div className="flex flex-wrap items-baseline justify-between gap-1">
      <h2 id="insights-title" className="text-sm font-semibold">Understanding · Slide {state.current_slide + 1}</h2>
      <p data-testid="feedback-total" className="text-xs text-slate-600">{feedback.total} {feedback.total === 1 ? 'response' : 'responses'} submitted</p>
    </div>
    <div className="feedback-breakdown">
      <div className="feedback-breakdown-labels">
        <div data-testid="understand-count"><span className="feedback-key understand-key" aria-hidden="true" />Understand <strong>{feedback.understand} · {Math.round(feedback.understand_percent)}%</strong></div>
        <div data-testid="not-understand-count"><span className="feedback-key not-understand-key" aria-hidden="true" />Not Understand <strong>{feedback.not_understand} · {Math.round(feedback.not_understand_percent)}%</strong></div>
      </div>
      <div className="feedback-split-bar" role="img" data-testid="feedback-split-bar"
        aria-label={`${feedback.understand} understand (${Math.round(feedback.understand_percent)}%); ${feedback.not_understand} do not understand (${Math.round(feedback.not_understand_percent)}%)`}>
        <span className="feedback-understand-segment" data-testid="feedback-understand-segment" style={{ width: `${feedback.understand_percent}%` }} />
        <span className="feedback-not-understand-segment" data-testid="feedback-not-understand-segment" style={{ width: `${feedback.not_understand_percent}%` }} />
      </div>
    </div>
    <p className="text-xs text-slate-500">Self-reported understanding, not a diagnosis.</p>
    <div className={'mt-2 rounded border px-2 py-1 text-xs ' + (feedback.flagged ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 text-slate-700')} data-testid="confusion-status" role="status">
      {feedback.flagged ? 'Potential confusion on this slide' : 'No confusion flag for this slide'}
    </div>
    <p className="mt-2 text-xs text-slate-600">Flagged slides: <span data-testid="flagged-slides">{flagged.length ? flagged.map(index => index + 1).join(', ') : 'None'}</span></p>
    <details className="mt-2 text-xs text-slate-500"><summary>Feedback details</summary>
      <p className="mt-1">Self-reported understanding, not a confirmed diagnosis. Flags never generate AI content automatically.</p>
      <p className="mt-1">Flagged when at least {rules.min_responses} students respond and Not Understand reaches {rules.threshold_percent}% of submitted responses. Unsubmitted responses are not counted as Understand.</p>
    </details>
    {onExplain && <button className="secondary mt-2" onClick={onExplain}>Explain this slide</button>}
  </section>
}
