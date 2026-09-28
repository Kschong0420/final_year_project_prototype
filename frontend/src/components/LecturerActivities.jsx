import { useCallback, useEffect, useState } from 'react'
import { activityRequest } from '../services/api'
import WorkspaceTabs from './WorkspaceTabs'
import SessionAnalytics from './SessionAnalytics'

function QuestionEditor({ activity, active, credentials, onDirtyChange }) {
  const [draft, setDraft] = useState(activity.current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const savedVersion = JSON.stringify(activity.current)
  useEffect(() => { setDraft(JSON.parse(savedVersion)) }, [activity.id, savedVersion])
  const dirty = JSON.stringify(draft) !== JSON.stringify(activity.current)
  useEffect(() => { onDirtyChange(activity.id, dirty) }, [activity.id, dirty, onDirtyChange])
  const editable = activity.status === 'pending' || activity.status === 'approved'

  async function act(path, method = 'POST', body) {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await activityRequest(credentials.code, credentials.token, `/${activity.id}${path}`, method, body)
      setNotice(path === '' ? 'Edits saved. Approve this version before release.' :
        path === '/approve' ? 'Approved question saved for later. Release it when ready.' : path === '/release' ? 'Released to students.' : 'Question discarded.')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <article className="rounded-md border border-slate-200 bg-white p-4" data-testid="review-question">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">{activity.current.type === 'mcq' ? 'Multiple choice' : 'Fill in the blank'} · Slide {activity.slide_index + 1}</p>
      <span className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{{ pending: 'Awaiting review', approved: 'Approved · Saved for later', released: 'Released to students', discarded: 'Discarded' }[activity.status]}</span>
    </div>
    <label className="field-label mt-4" htmlFor={`prompt-${activity.id}`}>Question</label>
    <textarea id={`prompt-${activity.id}`} rows={2} value={draft.prompt} disabled={!editable || busy || !active}
      onChange={event => setDraft({ ...draft, prompt: event.target.value })}
      className="w-full rounded-md border border-slate-300 p-3 text-sm" />
    {draft.type === 'mcq' ? <div className="mt-3 space-y-2">
      {draft.options.map((option, index) => <label className="flex items-center gap-2 text-sm" key={index}>
        <span className="w-6 shrink-0">{String.fromCharCode(65 + index)}.</span>
        <input value={option} disabled={!editable || busy || !active} aria-label={`Option ${String.fromCharCode(65 + index)}`}
          onChange={event => setDraft({ ...draft, options: draft.options.map((value, position) => position === index ? event.target.value : value) })} />
      </label>)}
      <label className="field-label" htmlFor={`answer-${activity.id}`}>Correct option</label>
      <select id={`answer-${activity.id}`} value={draft.correct_index} disabled={!editable || busy || !active}
        onChange={event => setDraft({ ...draft, correct_index: Number(event.target.value) })}
        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm">
        {draft.options.map((_, index) => <option value={index} key={index}>{String.fromCharCode(65 + index)}</option>)}
      </select>
    </div> : <div className="mt-3">
      <label className="field-label" htmlFor={`answer-${activity.id}`}>Expected answer</label>
      <input id={`answer-${activity.id}`} value={draft.expected_answer} disabled={!editable || busy || !active}
        onChange={event => setDraft({ ...draft, expected_answer: event.target.value })} />
    </div>}
    {activity.edited && <p className="mt-3 text-xs text-slate-600">Edited by lecturer. The original AI version is retained.</p>}
    <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer">Original AI question</summary>
      <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans">{JSON.stringify(activity.original, null, 2)}</pre>
    </details>
    <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer">Generation context and review record</summary>
      <p className="mt-2">Requested difficulty: {activity.difficulty}</p>
      <pre className="whitespace-pre-wrap font-sans">{activity.source_text}</pre>
      <p className="mt-2 font-semibold">Additional teaching notes</p>
      <pre className="whitespace-pre-wrap font-sans">{activity.teaching_notes || 'None'}</pre>
      <pre className="mt-2 whitespace-pre-wrap font-sans">{JSON.stringify(activity.review_history, null, 2)}</pre>
    </details>
    {editable && <div className="mt-4 flex flex-wrap gap-2">
      <button className="secondary" disabled={!active || busy || !dirty} onClick={() => act('', 'PUT', { question: draft })}>Save edits</button>
      {activity.status === 'pending' && <button className="secondary" disabled={!active || busy || dirty} onClick={() => act('/approve')}>Approve</button>}
      {activity.status === 'approved' && <button className="primary" disabled={!active || busy || dirty} onClick={() => act('/release')}>Release to students</button>}
      <button className="secondary text-red-700" disabled={!active || busy} onClick={() => act('/discard')}>Discard</button>
    </div>}
    {activity.status === 'released' && <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
      <p className="font-semibold">{activity.total_submissions} {activity.total_submissions === 1 ? 'submission' : 'submissions'}</p>
      {activity.current.type === 'mcq' ? <ul className="mt-2 space-y-1 text-slate-700">
        {activity.current.options.map((option, index) => <li key={index}>{String.fromCharCode(65 + index)}. {option}: {activity.distribution[index]}</li>)}
      </ul> : <ul className="mt-2 space-y-1 text-slate-700">
        {activity.answers.length ? activity.answers.map(({ answer, count }) => <li key={answer}>{answer}: {count}</li>) : <li>No answers yet.</li>}
      </ul>}
      <p className="mt-2 text-xs text-slate-500">Fill-in answers are shown as submitted; no semantic grading is applied.</p>
    </div>}
    <p className="mt-3 text-xs text-slate-500">Model: {activity.model} · Generated in {activity.generation_seconds}s</p>
    {notice && <p role="status" className="mt-3 text-sm text-teal-800">{notice}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </article>
}

function ActivityResults({ activity }) {
  return <article className="rounded-md border border-slate-200 bg-white p-4" data-testid="activity-results">
    <p className="text-xs text-slate-500">Slide {activity.slide_index + 1} · {activity.current.type === 'mcq' ? 'Multiple choice' : 'Fill in the blank'}</p>
    <h3 className="mt-2 font-semibold">{activity.current.prompt}</h3>
    <p className="mt-3 font-semibold">{activity.total_submissions} {activity.total_submissions === 1 ? 'submission' : 'submissions'}</p>
    <ul className="mt-3 space-y-2 text-sm">
      {activity.current.type === 'mcq' ? activity.current.options.map((option, index) => <li key={index}>
        {String.fromCharCode(65 + index)}. {option}: {activity.distribution[index]}
      </li>) : activity.answers.length ? activity.answers.map(({ answer, count }) => <li key={answer}>{answer}: {count}</li>) : <li>No answers yet.</li>}
    </ul>
    <p className="mt-3 text-xs text-slate-500">{activity.current.type === 'mcq' ? `Correct option: ${String.fromCharCode(65 + activity.current.correct_index)}` : `Expected answer: ${activity.current.expected_answer}. Fill-in answers are shown as submitted; no semantic grading is applied.`}</p>
  </article>
}

function ActivityRelease({ activity, credentials, active, onReview, dirty }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function release() {
    setBusy(true); setError('')
    try { await activityRequest(credentials.code, credentials.token, `/${activity.id}/release`) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <article className="rounded-md border border-slate-200 p-3" data-testid="activity-release">
    {activity.status === 'approved' ? <div className="mb-3 flex flex-wrap gap-2">
      <button className="primary" disabled={!active || busy || dirty} onClick={release}>{busy ? 'Releasing…' : 'Release activity'}</button>
      <button className="secondary" onClick={onReview}>Review / edit</button>
    </div> : <p className="mt-3 text-sm text-teal-800">Released · {activity.total_submissions} submissions. Open Results for responses.</p>}
    <h3 className="text-sm font-semibold">{activity.current.prompt}</h3>
    {activity.current.type === 'mcq' ? <ul className="mt-2 space-y-1 text-sm">{activity.current.options.map((option, index) => <li key={index}>{String.fromCharCode(65 + index)}. {option}</li>)}</ul>
      : <p className="mt-2 text-sm">Expected answer: {activity.current.expected_answer}</p>}
    {dirty && <p className="mt-2 text-sm text-amber-800">This question has unsaved edits. Review and save them, then approve before release.</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </article>
}

export default function LecturerActivities({ state, credentials, active, area, slideIndex, onSourceChange, requestedPanel }) {
  const [panel, setPanel] = useState('generate')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [difficulty, setDifficulty] = useState('basic')
  const [notes, setNotes] = useState({})
  const [dirtyQuestions, setDirtyQuestions] = useState({})
  const onDirtyChange = useCallback((id, dirty) => setDirtyQuestions(previous => previous[id] === dirty ? previous : { ...previous, [id]: dirty }), [])
  const teachingNotes = notes[slideIndex] || ''
  useEffect(() => { setNotes({}); setNotice(''); setError(''); setSelected(null) }, [state.presentation_id])
  useEffect(() => { setPanel(area === 'live' ? 'activities' : 'generate') }, [area])
  useEffect(() => { if (requestedPanel) setPanel(requestedPanel.value) }, [requestedPanel])
  const source = state.slides[slideIndex]?.text?.trim() || ''
  const context = `${source}\n${teachingNotes}`.trim().replace(/\s+/g, ' ')
  const unusable = context.length < 30 || context.split(/\s+/).length < 4 || `${source}\n${teachingNotes}`.length > 10000
  const all = state.activities || []
  const activities = all.filter(item => item.slide_index === slideIndex)
  const results = area === 'results'
  const visible = (results ? all.filter(item => item.status === 'released') : panel === 'activities'
    ? activities.filter(item => item.status === 'approved' || item.status === 'released') : activities)
  const chosen = visible.some(item => item.id === selected) ? selected : visible[0]?.id
  async function generate() {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await activityRequest(credentials.code, credentials.token, '/generate', 'POST',
        { presentation_id: state.presentation_id, slide_index: slideIndex, difficulty, teaching_notes: teachingNotes })
      setNotice(`Slide ${slideIndex + 1}: ${result.created_ids.length} questions ready for review. Nothing was released. ${result.warnings.join(' ')}`)
      setSelected(result.created_ids[0]); setPanel('review')
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  return <section className="activity-workspace" aria-label={results ? 'Activity results' : 'Classroom activities'}>
    <div className="tool-heading"><span className="eyebrow">{results ? 'REVIEW RESPONSES' : area === 'live' ? 'CLASS CONTROLS' : 'QUESTION WORKBENCH'}</span>
      <h2 className="text-lg font-semibold">{results ? 'Activity results' : area === 'live' ? `Slide ${slideIndex + 1} activities` : 'Prepare questions'}</h2></div>
    {results && <SessionAnalytics state={state} />}
    {busy || state.activity_generation_in_progress ? <p role="status" className="text-sm text-teal-800">Generating questions. Classroom controls remain available.</p> : null}
    {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!results && <div className={area === 'live' ? 'live-activity-controls' : 'activity-controls'}>
      <div>
      <label className="field-label" htmlFor="activity-slide">Source slide</label>
      <select id="activity-slide" value={slideIndex} disabled={!active} onChange={event => onSourceChange(Number(event.target.value))}>
        {state.slides.map((item, index) => <option key={index} value={index}>Slide {index + 1} - {item.title} ({all.filter(question => question.slide_index === index && question.status === 'approved').length} saved)</option>)}
      </select>
      </div>
      <p className={area === 'live' ? 'sr-only' : 'text-xs text-slate-500'}>Source follows classroom slide changes. Selecting a source does not move the classroom slide.</p>
      <WorkspaceTabs label="Question tools" value={panel} onChange={setPanel} asSelect={area === 'live'} items={[
        ...(area === 'live' ? [{ value: 'activities', label: 'Activities' }] : []),
        { value: 'generate', label: 'Generate' }, { value: 'review', label: 'Review' },
      ]} />
    </div>}
    <div hidden={results || panel !== 'generate'}>
      {!state.active_material && <p className="text-sm text-slate-600">Upload a PDF or PPTX in Prepare to generate questions.</p>}
      <details className="source-text" open><summary>Extracted text used for generation</summary>
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-sans text-sm">{source || 'No selectable text on this slide.'}</pre>
      </details>
      <label className="field-label mt-3" htmlFor="teaching-notes">Additional teaching notes (optional)</label>
      <textarea id="teaching-notes" rows={3} maxLength={4000} value={teachingNotes} disabled={!active || busy}
        onChange={event => setNotes({ ...notes, [slideIndex]: event.target.value })} />
      <p className="text-xs text-slate-500">Add factual context or relevant adjacent-slide text with its slide number. Notes stay separate from the extracted text.</p>
      <label className="field-label mt-3" htmlFor="question-difficulty">Question difficulty</label>
      <select id="question-difficulty" value={difficulty} disabled={!active || busy} onChange={event => setDifficulty(event.target.value)}>
        <option value="basic">Basic - recall and understanding</option><option value="intermediate">Intermediate - comprehension and application</option>
        <option value="advanced">Advanced - reasoning and application</option>
      </select>
      <p className="mt-2 text-xs text-slate-500">Limited facts may support only basic questions. Review actual difficulty before approval.</p>
      {unusable && <p role="status" className="mt-2 text-sm text-amber-800">Insufficient extractable content, or context exceeds 10,000 characters. Adjust teaching notes or choose another slide. Images are not read.</p>}
      {source.split('|').length > 13 && <p className="text-sm text-amber-800">Check this table-heavy extracted text before generation.</p>}
      <button className="primary mt-3" disabled={!active || busy || unusable || !state.active_material || state.activity_generation_in_progress}
        onClick={generate}>{busy || state.activity_generation_in_progress ? 'Generating questions...' : 'Generate questions'}</button>
    </div>
    <div hidden={!results && panel === 'generate'} className={results ? 'results-layout' : ''}>
      {area === 'live' && visible.length > 0 && <div className="live-question-picker">
        <label className="field-label" htmlFor="live-question">{panel === 'activities' ? 'Approved and released activities' : 'Question to review'}</label>
        <select id="live-question" value={chosen || ''} onChange={event => setSelected(event.target.value)}>
          {visible.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.current.prompt} · {item.status}</option>)}
        </select>
      </div>}
      <div className="question-list" hidden={area === 'live' && visible.length > 0}>
        {!results && <p className="text-xs text-slate-600">{activities.filter(item => item.status === 'pending').length} awaiting review / {activities.filter(item => item.status === 'approved').length} saved / {activities.filter(item => item.status === 'released').length} released</p>}
        {visible.length ? visible.map((item, index) => <button key={item.id} className="question-summary" aria-pressed={chosen === item.id} onClick={() => setSelected(item.id)}>
          <span className="block text-xs text-slate-500">Slide {item.slide_index + 1} / {item.status === 'pending' ? 'Awaiting review' : item.status === 'approved' ? 'Saved for later' : item.status}</span>
          <span>{index + 1}. {item.current.prompt}</span>
          {item.status === 'released' && <span className="block text-xs">{item.total_submissions} submissions</span>}
        </button>) : <p className="text-sm text-slate-600">{results ? 'No activities released yet.' : panel === 'activities' ? 'No approved activities for this slide. Generate or review questions to prepare one.' : 'No questions for this slide yet.'}</p>}
      </div>
      <div>
        {all.map(activity => <div key={activity.id} hidden={results || panel !== 'review' || chosen !== activity.id}>
          <QuestionEditor activity={activity} active={active} credentials={credentials} onDirtyChange={onDirtyChange} />
        </div>)}
        {visible.filter(activity => activity.id === chosen).map(activity => results ? <ActivityResults key={activity.id} activity={activity} />
          : panel === 'activities' ? <ActivityRelease key={activity.id} activity={activity} credentials={credentials} active={active} dirty={dirtyQuestions[activity.id]} onReview={() => setPanel('review')} /> : null)}
      </div>
    </div>
  </section>
}
