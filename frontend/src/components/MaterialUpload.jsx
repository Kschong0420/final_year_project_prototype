import { useState } from 'react'
import { uploadMaterial } from '../services/api'

export default function MaterialUpload({ credentials, active, material }) {
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(!material)

  async function submit(event) {
    event.preventDefault()
    if (!file || busy || !active) return
    const form = event.currentTarget
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await uploadMaterial(credentials.code, credentials.token, file)
      setMessage(`${result.filename} is ready (${result.slide_count} ${result.slide_count === 1 ? 'slide' : 'slides'}).`)
      setFile(null)
      form.reset()
      setExpanded(false)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel" aria-labelledby="material-title">
    <h2 id="material-title" className="text-base font-semibold">Upload material</h2>
    <p className="mt-1 text-sm leading-6 text-slate-600">PDF or PPTX · up to 25 MB</p>
    <p className="mt-3 text-sm text-slate-700">Current: <strong>{material ? `${material.filename} · ${material.slide_count} slides` : 'Sample lecture slides'}</strong></p>
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="mt-3 cursor-pointer text-sm font-semibold">{material ? 'Replace material' : 'Choose material'}</summary>
    <form onSubmit={submit} className="mt-4 space-y-3">
      <label htmlFor="material-file" className="block text-sm font-medium text-slate-700">Lecture file</label>
      <input id="material-file" type="file" accept=".pdf,.pptx,.ppt" disabled={!active || busy}
        onChange={event => { setFile(event.target.files?.[0] || null); setError(''); setMessage('') }}
        className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-800" />
      {file && <p className="text-xs text-slate-600">Selected: {file.name}</p>}
      {material && <p className="text-xs leading-5 text-slate-500">Replacing material clears questions, answers and feedback for the previous slides.</p>}
      <button className="primary w-full" disabled={!file || !active || busy}>{busy ? 'Processing material…' : 'Upload material'}</button>
    </form>
    </details>
    {message && <p role="status" className="mt-3 text-sm text-teal-800">{message}</p>}
    {!error && material?.warning && <p role="status" className="mt-3 text-sm text-amber-800">{material.warning}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
  </section>
}
