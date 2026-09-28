import { useState } from 'react'
import { uploadMaterial } from '../services/api'

export default function MaterialUpload({ credentials, active, material }) {
  const [file, setFile] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(!material)
  const supported = !file || /\.(pdf|pptx)$/i.test(file.name)

  async function submit(event) {
    event.preventDefault()
    if (!file || !supported || (material && !confirmed) || busy || !active) return
    const form = event.currentTarget
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await uploadMaterial(credentials.code, credentials.token, file)
      setMessage(`${result.filename} is ready (${result.slide_count} ${result.slide_count === 1 ? 'slide' : 'slides'}).`)
      setFile(null)
      setConfirmed(false)
      form.reset()
      setExpanded(false)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="panel material-panel" aria-labelledby="material-title">
    <div className="material-summary">
      <div>
        <h2 id="material-title" className="text-base font-semibold">Lecture material</h2>
        <p className="text-sm text-slate-700">{material ? <><strong>{material.filename}</strong> · {material.slide_count} {material.slide_count === 1 ? 'slide' : 'slides'} <span className="material-ready">Ready</span></> : 'Sample slides'}</p>
      </div>
      <span className="text-xs text-slate-600">PDF or PPTX · up to 25 MB</span>
    </div>
    {material?.warning && <p role="status" className="material-warning text-sm text-amber-800">{material.warning}</p>}
    <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary className="material-toggle text-sm font-semibold">{material ? 'Replace material' : 'Choose material'}</summary>
      <form onSubmit={submit} className="material-form space-y-3">
        <label htmlFor="material-file" className="block text-sm font-medium text-slate-700">Lecture file</label>
        <input id="material-file" type="file" accept=".pdf,.pptx" disabled={!active || busy}
          onChange={event => { setFile(event.target.files?.[0] || null); setConfirmed(false); setError(''); setMessage('') }}
          className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:font-medium file:text-slate-800" />
        <p className="text-xs text-slate-600">Convert older .ppt files to .pptx before uploading.</p>
        {file && <p className="text-xs text-slate-600">Selected: {file.name}</p>}
        {!supported && <p role="alert" className="text-sm text-red-700">Choose a PDF or PPTX file. Convert older .ppt files to .pptx first.</p>}
        {material && file && supported && <div className="material-confirm">
          <p>Replacing this presentation clears its activities and answers, understanding feedback, AI explanations and anonymous questions. Unsaved teaching notes are also cleared.</p>
          <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /> I understand; replace this material</label>
        </div>}
        <button className="primary w-full" disabled={!file || !supported || (material && !confirmed) || !active || busy}>
          {busy ? 'Processing material…' : material ? 'Replace material' : 'Upload material'}
        </button>
      </form>
    </details>
    {message && <p role="status" className="sr-only">{message}</p>}
    {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
  </section>
}
