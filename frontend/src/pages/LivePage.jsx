import { useEffect, useState } from 'react'
import { useSessionSocket } from '../hooks/useSessionSocket'
import SessionStatus from '../components/SessionStatus'
import SlideViewer from '../components/SlideViewer'
import { LecturerFeedback, StudentFeedback } from '../components/UnderstandingFeedback'
import MaterialUpload from '../components/MaterialUpload'
import LecturerActivities from '../components/LecturerActivities'
import StudentActivities from '../components/StudentActivities'
import WorkspaceTabs from '../components/WorkspaceTabs'

export default function LivePage({ credentials, onLeave }) {
  const { state, connection, error, send, submitFeedback, feedbackAck, submitActivity, activityAck } = useSessionSocket(credentials)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [area, setArea] = useState('prepare')
  const [studentTab, setStudentTab] = useState('slide')
  const [sourceIndex, setSourceIndex] = useState(0)
  const [mode, setMode] = useState('standard')
  const [controlsOpen, setControlsOpen] = useState(false)
  const [requestedPanel, setRequestedPanel] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const lecturer = credentials.role === 'lecturer'
  const active = connection === 'connected' && state?.status === 'active'
  const ended = state?.status === 'ended'
  const feedbackAvailable = state && (lecturer ? 'current_feedback' in state : 'my_feedback' in state)
  useEffect(() => { setSourceIndex(state?.current_slide || 0) }, [state?.current_slide, state?.presentation_id])
  const source = Math.min(sourceIndex, (state?.slides.length || 1) - 1)
  const expanded = mode === 'expanded' && area !== 'results'
  const activities = state?.activities || []
  const pendingCount = activities.filter(item => item.status === 'pending').length
  const approvedCount = activities.filter(item => item.status === 'approved').length
  const releasedCount = activities.filter(item => item.status === 'released').length
  const nextStep = !state?.active_material
    ? { label: 'Add lecture material', detail: 'Upload a PDF or PPTX to prepare questions.', action: () => { setArea('prepare'); document.getElementById('material-file')?.focus() } }
    : pendingCount ? { label: `Review ${pendingCount} question${pendingCount === 1 ? '' : 's'}`, detail: 'Approve or discard each question before students see it.', action: () => { setSourceIndex(activities.find(item => item.status === 'pending').slide_index); setArea(area === 'live' ? 'live' : 'prepare'); setRequestedPanel({ value: 'review' }) } }
      : !activities.length || (!approvedCount && !releasedCount) ? { label: 'Generate questions', detail: area === 'live' ? 'Add questions without leaving the class.' : 'Choose a slide and create questions.', action: () => { setArea(area === 'live' ? 'live' : 'prepare'); setRequestedPanel({ value: 'generate' }) } }
        : approvedCount ? area === 'live'
          ? { label: 'Open saved activities', detail: `${approvedCount} approved question${approvedCount === 1 ? '' : 's'} ready for release.`, action: () => { setSourceIndex(activities.find(item => item.status === 'approved').slide_index); setRequestedPanel({ value: 'activities' }) } }
          : { label: 'Go to live class', detail: `${approvedCount} approved question${approvedCount === 1 ? '' : 's'} saved for release during class.`, action: () => setArea('live') }
          : { label: 'Review classroom results', detail: `${releasedCount} released question${releasedCount === 1 ? '' : 's'} available.`, action: () => setArea('results') }
  async function copyCode() {
    try { await navigator.clipboard.writeText(credentials.code); setCopyStatus('Code copied') }
    catch { setCopyStatus('Select the code above to copy it') }
  }

  return <div className={`classroom-shell ${lecturer ? 'lecturer-shell' : 'student-shell'} ${expanded ? 'cinematic' : ''}`}>
    <header className="classroom-header">
      <div className="min-w-0"><p className="eyebrow">{lecturer ? 'Lecture desk' : 'In class'}</p>
        <h1 className="truncate text-xl font-semibold" title={state?.title}>{state?.title || 'Joining lecture…'}</h1></div>
      <div className="code-cluster"><span className="code-label">Session code</span><strong data-testid="session-code" className="font-mono text-lg tracking-wider">{credentials.code}</strong>
        {lecturer && <button className="code-copy" onClick={copyCode} aria-label="Copy session code">Copy</button>}
        {copyStatus && <span role="status" className="code-copy-status">{copyStatus}</span>}</div>
      {lecturer ? !ended && connection !== 'unavailable' && <button className="secondary text-red-700" disabled={!active} onClick={() => setConfirmEnd(true)}>End lecture session</button>
        : <button className="secondary" onClick={() => onLeave({ forgetIdentity: ended || connection === 'unavailable' })}>{ended || connection === 'unavailable' ? 'Return home' : 'Leave session'}</button>}
    </header>
    <div className="connection-strip"><SessionStatus connection={connection} state={state} lecturer={lecturer} />
      {expanded && lecturer && state?.current_feedback && <p className="mt-1 text-xs" aria-live="polite">Slide {state.current_slide + 1}: {state.current_feedback.total} responses · {Math.round(state.current_feedback.not_understand_percent)}% Not Understand{state.current_feedback.flagged ? ' · Potential confusion' : ''}</p>}
    </div>
    {error && <p role="alert" className="workspace-alert">{error}</p>}
    {!active && !ended && connection !== 'unavailable' && <p role="status" className="workspace-alert">Waiting for the live connection. The displayed slide may be out of date until it reconnects.</p>}
    {active && !lecturer && !state.lecturer_connected && <p role="status" className="workspace-alert">The lecturer is disconnected. The slide will update when they return.</p>}
    {ended && <p role="status" className="workspace-alert">This lecture session has ended.</p>}
    {active && !feedbackAvailable && <p role="alert" className="workspace-alert">Understanding feedback needs the updated backend. Restart the backend to use it.</p>}
    {lecturer && (ended || connection === 'unavailable') && <button className="secondary" onClick={onLeave}>Return home</button>}
    {confirmEnd && <div className="workspace-alert" role="alert">
      <p>End this session for everyone?</p><button className="danger" disabled={!active} onClick={() => { send({ type: 'end_session' }); setConfirmEnd(false) }}>Confirm end</button>
      <button className="secondary ml-2" onClick={() => setConfirmEnd(false)}>Cancel</button>
    </div>}
    <div className="session-stage">
    <div className="main-workspace-tabs" hidden={expanded}>
      {lecturer ? <><p className="stage-rail-title">YOUR LECTURE</p><WorkspaceTabs label="Lecturer workspace" stages value={area} onChange={setArea} items={[
        { value: 'prepare', label: 'Prepare', description: 'Material & questions' }, { value: 'live', label: 'Live class', description: 'Slides & responses' }, { value: 'results', label: 'Results', description: 'Activity answers' },
      ]} /><div className="stage-next" aria-live="polite"><span>UP NEXT</span><strong>{nextStep.label}</strong><p>{nextStep.detail}</p><button className="stage-next-action" aria-label={`Go to ${nextStep.label}`} onClick={nextStep.action}>{nextStep.label} <span aria-hidden="true">→</span></button></div></> : <div className="student-mobile-tabs"><WorkspaceTabs label="Student workspace" value={studentTab} onChange={setStudentTab} items={[
        { value: 'slide', label: 'Slide' }, { value: 'activities', label: `Activities (${state?.released_activities?.length || 0})` },
      ]} /></div>}
    </div>
    {state ? <div className={`workspace-grid mode-${mode} ${lecturer ? area : 'student'} ${controlsOpen ? 'controls-open' : ''} student-tab-${studentTab}`}>
      <div className="workspace-slide" hidden={lecturer && area === 'results'}>
        <SlideViewer state={state} token={credentials.token} slideIndex={lecturer && area === 'prepare' ? source : state.current_slide}
          preview={lecturer && area === 'prepare'} lecturer={lecturer} active={active} send={send}
          mode={mode} onModeChange={setMode} controlsOpen={controlsOpen} onToggleControls={() => setControlsOpen(value => !value)} />
      </div>
      <aside className="workspace-side">
        {lecturer ? <>
          <div hidden={area !== 'prepare'} className="material-area"><MaterialUpload credentials={credentials} active={active} material={state.active_material} /></div>
          <div hidden={area === 'prepare'} className="live-feedback">{feedbackAvailable && <LecturerFeedback state={state} />}</div>
          <div className="workspace-tools"><LecturerActivities key={state.presentation_id} state={state} credentials={credentials} active={active}
            area={area} slideIndex={source} onSourceChange={setSourceIndex} requestedPanel={requestedPanel} /></div>
        </> : <>
          <div className="student-feedback">{feedbackAvailable && !ended && <StudentFeedback state={state} active={active} submitFeedback={submitFeedback} feedbackAck={feedbackAck} />}</div>
          <div className="student-activities"><StudentActivities state={state} active={active} submitActivity={submitActivity} activityAck={activityAck} /></div>
          <p className="sr-only" aria-live="polite">{state.released_activities?.length || 0} released activities available.</p>
        </>}
      </aside>
    </div> : <p role="status" className="panel">Loading classroom…</p>}
    {lecturer && area === 'prepare' && !expanded && <p className="workspace-footnote">When ready, share the session code. Approved questions appear to students only after you release them.</p>}
    </div>
  </div>
}
