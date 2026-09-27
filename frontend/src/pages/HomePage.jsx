import { useState } from 'react'
import { request } from '../services/api'

export default function HomePage({ onEnter, previousStudent }) {
  const [title, setTitle] = useState('Database fundamentals')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function submit(event, role) {
    event.preventDefault()
    setBusy(role)
    setError('')
    try {
      const requestedCode = code.trim().toUpperCase()
      const credentials = role === 'lecturer'
        ? await request('/sessions', { title })
        : await request('/sessions/' + encodeURIComponent(requestedCode) + '/join',
          previousStudent?.code === requestedCode ? { previous_token: previousStudent.token } : {})
      onEnter(credentials)
    } catch (err) { setError(err.message) }
    finally { setBusy('') }
  }

  return <div className="entry-page">
    <div className="entry-heading">
      <p className="eyebrow">University classroom workspace</p>
      <h1>Prepare or join a lecture.</h1>
      <p>Lecturers control the slides and questions. Students follow and respond on their own device.</p>
    </div>
    {error && <p role="alert" className="entry-error">{error}</p>}
    <div className="entry-grid">
      <form className="entry-card lecturer-entry" onSubmit={event => submit(event, 'lecturer')}>
        <div className="entry-card-top"><span className="entry-symbol" aria-hidden="true">01</span><span>For lecturers</span></div>
        <h2>Prepare a lecture</h2>
        <p className="entry-summary">Add your material and save questions. Share the code when you are ready to teach.</p>
        <label className="field-label" htmlFor="title">Lecture title</label>
        <input id="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required />
        <button className="primary entry-action" disabled={!!busy || !title.trim()}>{busy === 'lecturer' ? 'Creating session…' : 'Create lecture session'} <span aria-hidden="true">→</span></button>
        <div className="entry-steps" aria-label="Lecturer steps"><span>1. Upload slides</span><span>2. Prepare questions</span><span>3. Teach</span></div>
      </form>
      <form className="entry-card student-entry" onSubmit={event => submit(event, 'student')}>
        <div className="entry-card-top"><span className="entry-symbol" aria-hidden="true">02</span><span>For students</span></div>
        <h2>Join your class</h2>
        <p className="entry-summary">Enter the code from your lecturer to see the current slide and take part.</p>
        <label className="field-label" htmlFor="code">Session code</label>
        <input id="code" className="session-code-input" value={code} onChange={event => setCode(event.target.value.toUpperCase())}
          maxLength={6} minLength={6} autoCapitalize="characters" autoComplete="off" spellCheck="false" required placeholder="ABC234" />
        <button className="secondary entry-action" disabled={!!busy || code.trim().length !== 6}>{busy === 'student' ? 'Joining session…' : 'Join lecture session'} <span aria-hidden="true">→</span></button>
        <div className="entry-steps" aria-label="Student steps"><span>Follow slides</span><span>Give feedback</span><span>Answer activities</span></div>
      </form>
    </div>
    <p className="entry-footnote">This prototype uses temporary session access. Closing the backend clears the class and prepared questions.</p>
  </div>
}
