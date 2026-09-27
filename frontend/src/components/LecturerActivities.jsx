import { useEffect, useState } from 'react'
import { activityRequest } from '../services/api'

function QuestionEditor({ activity, active, credentials }) {
  const [draft, setDraft] = useState(activity.current)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const savedVersion = JSON.stringify(activity.current)
  useEffect(() => { setDraft(JSON.parse(savedVersion)) }, [activity.id, savedVersion])
  const dirty = JSON.stringify(draft) !== JSON.stringify(activity.current)
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

export default function LecturerActivities({ state, credentials, active }) {
  const [slideIndex, setSlideIndex] = useState(state.current_slide)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [difficulty, setDifficulty] = useState('basic')
  const [teachingNotes, setTeachingNotes] = useState('')
  useEffect(() => { setSlideIndex(state.current_slide); setTeachingNotes(''); setNotice(''); setError('') }, [state.current_slide, state.presentation_id])
  const slide = state.slides[slideIndex]
  const source = slide?.text?.trim() || ''
  const context = `${source}\n${teachingNotes}`.trim().replace(/\s+/g, ' ')
  const unusable = context.length < 30 || context.split(/\s+/).length < 4 || `${source}\n${teachingNotes}`.length > 10000
  const suspicious = source.split('|').length > 13
  const activities = (state.activities || []).filter(item => item.slide_index === slideIndex)

  async function generate() {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await activityRequest(credentials.code, credentials.token, '/generate', 'POST',
        { presentation_id: state.presentation_id, slide_index: slideIndex, difficulty, teaching_notes: teachingNotes })
      setNotice(`Slide ${slideIndex + 1}: ${result.created_ids.length} question${result.created_ids.length === 1 ? '' : 's'} ready for review. Nothing was released. ${result.warnings.join(' ')}`)
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }

  return <section className="panel mt-6" aria-labelledby="activities-title">
    <p className="eyebrow">Lecturer review</p>
    <h2 id="activities-title" className="mt-1 text-lg font-semibold">Classroom activities</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">Prepare and approve questions before class, then release them when ready. You can generate additional questions during class; every question still needs review and approval. Generation leaves slide controls and understanding feedback available.</p>
    {!state.active_material ? <p className="mt-4 text-sm text-slate-600">Upload a PDF or PPTX to generate questions.</p> : <>
      <label className="field-label mt-5" htmlFor="activity-slide">Source slide</label>
      <select id="activity-slide" value={slideIndex} disabled={!active}
        onChange={event => { setSlideIndex(Number(event.target.value)); setTeachingNotes(''); setError(''); setNotice('') }}
        className="min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm">
        {state.slides.map((item, index) => <option key={index} value={index}>Slide {index + 1} — {item.title} ({(state.activities || []).filter(question => question.slide_index === index && question.status === 'approved').length} saved)</option>)}
      </select>
      <p className="mt-2 text-xs text-slate-500">Classroom slide changes update the source automatically. Selecting a different source does not move the classroom slide. Currently presenting slide {state.current_slide + 1}.</p>
      <details className="mt-4 rounded-md border border-slate-200 p-3" open>
        <summary className="cursor-pointer text-sm font-semibold">Extracted text used for generation</summary>
        <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap font-sans text-sm leading-6 text-slate-700">{source || 'No selectable text on this slide.'}</pre>
      </details>
      <label className="field-label mt-4" htmlFor="teaching-notes">Additional teaching notes (optional)</label>
      <textarea id="teaching-notes" rows={3} maxLength={4000} value={teachingNotes} disabled={!active || busy}
        onChange={event => setTeachingNotes(event.target.value)} className="w-full rounded-md border border-slate-300 p-3 text-sm" />
      <p className="mt-1 text-xs text-slate-500">Add factual context or paste relevant adjacent-slide text with its slide number. These notes are separate from the original extracted text.</p>
      <label className="field-label mt-4" htmlFor="question-difficulty">Question difficulty</label>
      <select id="question-difficulty" value={difficulty} disabled={!active || busy} onChange={event => setDifficulty(event.target.value)}
        className="min-h-11 rounded-md border border-slate-300 bg-white px-3 text-sm">
        <option value="basic">Basic — recall and understanding</option>
        <option value="intermediate">Intermediate — comprehension and application</option>
        <option value="advanced">Advanced — reasoning and application</option>
      </select>
      <p className="mt-2 text-xs text-slate-500">Higher difficulty needs supporting facts. Basic questions may be returned when the context is limited; review the actual difficulty.</p>
      {(unusable || suspicious) && <p role="status" className="mt-3 text-sm text-amber-800">{unusable ? 'Insufficient extractable content, or context exceeds 10,000 characters. Choose another slide or adjust teaching notes. Images are not read.' : 'This slide looks table-heavy. Check the extracted text carefully before generating.'}</p>}
      <button className="primary mt-4" disabled={!active || busy || unusable || state.activity_generation_in_progress}
        onClick={generate}>{busy || state.activity_generation_in_progress ? 'Generating questions…' : 'Generate questions'}</button>
      {notice && <p role="status" className="mt-3 text-sm text-teal-800">{notice}</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 space-y-4">
        <h3 className="text-sm font-semibold">Review questions for slide {slideIndex + 1}</h3>
        <p className="text-xs text-slate-600">{activities.filter(item => item.status === 'pending').length} awaiting review · {activities.filter(item => item.status === 'approved').length} saved for later · {activities.filter(item => item.status === 'released').length} released</p>
        {activities.length ? activities.map(activity => <QuestionEditor key={activity.id} activity={activity} active={active} credentials={credentials} />)
          : <p className="text-sm text-slate-600">No questions for this slide yet.</p>}
      </div>
    </>}
  </section>
}
