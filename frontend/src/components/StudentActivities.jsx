import { useEffect, useState } from 'react'

function StudentQuestion({ activity, active, submitActivity, activityAck }) {
  const [answer, setAnswer] = useState(activity.my_answer ?? '')
  const [pending, setPending] = useState(null)
  const [notice, setNotice] = useState('')
  useEffect(() => { setAnswer(activity.my_answer ?? '') }, [activity.id, activity.my_answer])
  useEffect(() => {
    if (!active) { setPending(null); setNotice('') }
  }, [active])
  useEffect(() => {
    if (pending && activityAck?.activity_id === activity.id && activityAck.request_id === pending) {
      setPending(null)
      setNotice('Answer saved.')
    }
  }, [activityAck, activity.id, pending])
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => { setPending(null); setNotice('Could not confirm this answer. Try again.') }, 8000)
    return () => clearTimeout(timer)
  }, [pending])

  function submit(event) {
    event.preventDefault()
    setNotice('')
    const id = submitActivity(activity.id, answer, activity.presentation_id)
    if (id === null) { setNotice('Answer not sent. Wait for the connection and try again.'); return }
    setPending(id)
  }

  return <form onSubmit={submit} className="rounded-md border border-slate-200 p-4" data-testid="student-activity">
    <p className="text-xs font-semibold uppercase tracking-wide text-teal-800">Slide {activity.slide_index + 1} · {activity.type === 'mcq' ? 'Multiple choice' : 'Fill in the blank'}</p>
    <h3 className="mt-2 text-base font-semibold">{activity.prompt}</h3>
    {activity.type === 'mcq' ? <div className="mt-4 space-y-2">
      {activity.options.map((option, index) => <label key={index} className="flex items-start gap-3 rounded-md border border-slate-200 p-3 text-sm">
        <input type="radio" name={`answer-${activity.id}`} value={index} checked={answer === index}
          disabled={!active || pending !== null} onChange={() => setAnswer(index)} className="mt-0.5 min-h-0 w-auto" />
        <span>{String.fromCharCode(65 + index)}. {option}</span>
      </label>)}
    </div> : <div className="mt-4">
      <label className="field-label" htmlFor={`answer-${activity.id}`}>Your answer</label>
      <input id={`answer-${activity.id}`} value={answer} maxLength={200} disabled={!active || pending !== null}
        onChange={event => setAnswer(event.target.value)} />
    </div>}
    <button className="primary mt-4" disabled={!active || pending !== null || answer === '' || answer === null}>Submit answer</button>
    <p className="mt-2 text-sm text-slate-600" aria-live="polite" data-testid="activity-submission-status">
      {!active ? 'Offline. Answers cannot be submitted until reconnected.' : pending !== null ? 'Sending answer…' : notice || (activity.my_answer !== null ? 'Your current answer is saved. You may change it.' : '')}
    </p>
  </form>
}

export default function StudentActivities({ state, active, submitActivity, activityAck }) {
  const activities = state.released_activities || []
  return <section className="panel mt-5" aria-labelledby="student-activities-title">
    <h2 id="student-activities-title" className="text-base font-semibold">Activities</h2>
    <div className="mt-4 space-y-4">
      {activities.length ? activities.map(activity => <StudentQuestion key={activity.id} activity={activity} active={active}
        submitActivity={submitActivity} activityAck={activityAck} />) : <p className="text-sm text-slate-600">No activities released yet.</p>}
    </div>
  </section>
}
