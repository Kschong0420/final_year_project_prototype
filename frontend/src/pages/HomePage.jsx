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

  return <div className="mx-auto max-w-5xl">
    <div className="mb-8 border-b border-slate-200 pb-7">
      <p className="eyebrow">Lecture sessions</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">Start or join a lecture</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Students see the lecturer's current slide on their own device.</p>
    </div>

    {error && <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

    <div className="grid gap-5 md:grid-cols-2">
      <form className="panel order-2 flex flex-col md:order-1" onSubmit={event => submit(event, 'lecturer')}>
        <div className="mb-7">
          <p className="eyebrow">For lecturers</p>
          <h2 className="mt-2 text-xl font-semibold">Create a session</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Choose a title. Share the session code with students when the lecture is ready.</p>
        </div>
        <label className="field-label" htmlFor="title">Lecture title</label>
        <input id="title" value={title} onChange={event => setTitle(event.target.value)} maxLength={120} required />
        <button className="primary mt-6 w-full sm:w-auto sm:self-start" disabled={!!busy || !title.trim()}>{busy === 'lecturer' ? 'Creating session…' : 'Create lecture session'}</button>
      </form>

      <form className="panel order-1 flex flex-col md:order-2" onSubmit={event => submit(event, 'student')}>
        <div className="mb-7">
          <p className="eyebrow">For students</p>
          <h2 className="mt-2 text-xl font-semibold">Join a session</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Enter the six-character code provided by your lecturer.</p>
        </div>
        <label className="field-label" htmlFor="code">Session code</label>
        <input id="code" className="max-w-52 uppercase tracking-[0.18em]" value={code} onChange={event => setCode(event.target.value.toUpperCase())} maxLength={6} minLength={6} autoCapitalize="characters" autoComplete="off" spellCheck="false" required placeholder="ABC234" />
        <button className="primary mt-6 w-full sm:w-auto sm:self-start" disabled={!!busy || code.trim().length !== 6}>{busy === 'student' ? 'Joining session…' : 'Join lecture session'}</button>
      </form>
    </div>

    <p className="mt-6 text-xs leading-5 text-slate-500">Prototype access: role selection does not verify identity. Session data is temporary.</p>
  </div>
}
