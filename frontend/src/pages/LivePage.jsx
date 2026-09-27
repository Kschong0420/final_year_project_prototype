import { useState } from 'react'
import { useSessionSocket } from '../hooks/useSessionSocket'
import SessionStatus from '../components/SessionStatus'
import SlideViewer from '../components/SlideViewer'
import { LecturerFeedback, StudentFeedback } from '../components/UnderstandingFeedback'

export default function LivePage({ credentials, onLeave }) {
  const { state, connection, error, send, submitFeedback, feedbackAck } = useSessionSocket(credentials)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const lecturer = credentials.role === 'lecturer'
  const active = connection === 'connected' && state?.status === 'active'
  const ended = state?.status === 'ended'
  const feedbackAvailable = state && (lecturer ? 'current_feedback' in state : 'my_feedback' in state)

  return <div className={lecturer ? '' : 'mx-auto max-w-4xl'}>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-5">
      <div className="min-w-0">
        <p className="eyebrow">{lecturer ? 'Lecturer · Live session' : 'Student · Live session'}</p>
        <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{state?.title || 'Joining lecture…'}</h1>
      </div>
      <div className="session-code">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Session code</span>
        <strong data-testid="session-code" className="block font-mono text-2xl font-semibold tracking-[0.15em] text-slate-900">{credentials.code}</strong>
      </div>
    </div>

    <div className="mb-6 border-y border-slate-200 py-3">
      <SessionStatus connection={connection} state={state} lecturer={lecturer} />
    </div>

    {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
    {!active && !ended && connection !== 'unavailable' && <p role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Waiting for the live connection. The displayed slide may be out of date until it reconnects.</p>}
    {active && !lecturer && !state.lecturer_connected && <p role="status" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">The lecturer is disconnected. The slide will update when they return.</p>}
    {ended && <p role="status" className="mb-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm">This lecture session has ended.</p>}
    {active && !feedbackAvailable && <p role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">Understanding feedback needs the updated backend. Restart the backend to use it.</p>}

    <div className={lecturer ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]' : ''}>
      <div className="min-w-0">
        {state ? <SlideViewer state={state} /> : <div className="slide-surface flex min-h-72 items-center text-slate-500">Loading the current slide…</div>}

        {lecturer && state && !ended && <section className="mt-4 flex flex-wrap items-center gap-3" aria-label="Slide controls">
          <button className="secondary min-w-36" disabled={!active || state.current_slide === 0} onClick={() => send({ type: 'set_slide', index: state.current_slide - 1 })}>Previous slide</button>
          <button className="primary min-w-36" disabled={!active || state.current_slide === state.slides.length - 1} onClick={() => send({ type: 'set_slide', index: state.current_slide + 1 })}>Next slide</button>
          <p className="w-full text-sm text-slate-500">Slide changes appear on connected student devices.</p>
        </section>}

        {!lecturer && feedbackAvailable && !ended && <StudentFeedback state={state} active={active} submitFeedback={submitFeedback} feedbackAck={feedbackAck} />}
        {!lecturer && !ended && <p className="mt-4 text-sm text-slate-600">The lecturer controls the slides. This view updates automatically.</p>}
      </div>

      {lecturer && <aside className="space-y-4">
        {feedbackAvailable && <LecturerFeedback state={state} />}
        <section className="panel" aria-labelledby="session-actions-title">
          <h2 id="session-actions-title" className="text-base font-semibold">Session</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">Share the code above with students in the room.</p>
          {!ended && connection !== 'unavailable' && <div className="mt-5">
            {!confirmEnd ? <button className="secondary w-full text-red-700" disabled={!active} onClick={() => setConfirmEnd(true)}>End lecture session</button> : <div className="space-y-3">
              <p className="text-sm text-slate-700">End this session for everyone?</p>
              <button className="danger w-full" disabled={!active} onClick={() => { send({ type: 'end_session' }); setConfirmEnd(false) }}>Confirm end</button>
              <button className="secondary w-full" onClick={() => setConfirmEnd(false)}>Cancel</button>
            </div>}
          </div>}
          {!ended && connection !== 'unavailable' && <p className="mt-4 text-xs leading-5 text-slate-500">Keep this tab open during the lecture. Refreshing restores the session.</p>}
          {(ended || connection === 'unavailable') && <button className="secondary mt-5 w-full" onClick={onLeave}>Return home</button>}
        </section>
      </aside>}
    </div>

    {!lecturer && <div className="mt-7 border-t border-slate-200 pt-5">
      <button className="secondary w-full sm:w-auto" onClick={() => onLeave({ forgetIdentity: ended || connection === 'unavailable' })}>{ended || connection === 'unavailable' ? 'Return home' : 'Leave session'}</button>
    </div>}
  </div>
}
