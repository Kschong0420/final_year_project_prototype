import { useEffect, useState } from 'react'

export function StudentFeedback({ state, active, submitFeedback, feedbackAck }) {
  const selected = state.my_feedback
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setPending(null)
    setNotice('')
  }, [state.current_slide])

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
    const id = submitFeedback(state.current_slide, choice)
    if (id === null) {
      setNotice('Response not sent. Wait for the connection and try again.')
      return
    }
    setPending({ id, slideIndex: state.current_slide, choice })
  }

  return <section className="panel mt-5" aria-labelledby="student-feedback-title">
    <h2 id="student-feedback-title" className="text-base font-semibold">Do you understand this slide?</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">Choose an answer. You can change it while this slide is shown.</p>
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

function CountRow({ label, count, percent, testId }) {
  return <div className="py-4" data-testid={testId}>
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="font-medium text-slate-800">{label}</span>
      <span className="tabular-nums text-slate-700">{count} · {Math.round(percent)}%</span>
    </div>
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div className="h-full rounded-full bg-teal-700" style={{ width: `${percent}%` }} />
    </div>
  </div>
}

export function LecturerFeedback({ state }) {
  const feedback = state.current_feedback
  const flagged = state.flagged_slides || []
  const rules = state.confusion_rules
  return <section className="panel" aria-labelledby="insights-title">
    <div className="border-b border-slate-200 pb-4">
      <p className="eyebrow">Current slide</p>
      <h2 id="insights-title" className="mt-1 text-base font-semibold">Understanding feedback</h2>
      <p data-testid="feedback-total" className="mt-2 text-sm tabular-nums text-slate-600">{feedback.total} {feedback.total === 1 ? 'response' : 'responses'} submitted</p>
    </div>

    {feedback.total === 0 && <p className="pt-5 text-sm leading-6 text-slate-600">No feedback for this slide yet. Unsubmitted responses are not counted as Understand.</p>}
    <div className="divide-y divide-slate-200">
      <CountRow label="Understand" count={feedback.understand} percent={feedback.understand_percent} testId="understand-count" />
      <CountRow label="Not Understand" count={feedback.not_understand} percent={feedback.not_understand_percent} testId="not-understand-count" />
    </div>

    <div className={'mt-2 rounded-md border px-3 py-3 text-sm ' + (feedback.flagged ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-700')} data-testid="confusion-status" role="status">
      <p className="font-semibold">{feedback.flagged ? 'Potential confusion on this slide' : 'No confusion flag for this slide'}</p>
      <p className="mt-1 leading-5">{feedback.total < rules.min_responses
        ? `At least ${rules.min_responses} responses are needed before this slide can be flagged.`
        : `Flagged when Not Understand reaches ${rules.threshold_percent}% of submitted responses.`}</p>
    </div>

    <div className={'mt-6 rounded-md border p-4 ' + (flagged.length ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white')}>
      <h3 className="text-sm font-semibold">Flagged slides</h3>
      <p data-testid="flagged-slides" className="mt-1 text-sm leading-6 text-slate-600">
        {flagged.length ? flagged.map(index => index + 1).join(', ') : 'None'}
      </p>
    </div>
  </section>
}
