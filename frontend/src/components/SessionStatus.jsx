const labels = {
  connecting: 'Connecting to the lecture…',
  connected: 'Slides are up to date',
  reconnecting: 'Connection lost. Reconnecting automatically…',
  unavailable: 'Session unavailable',
  ended: 'Lecture ended',
}

export default function SessionStatus({ connection, state, lecturer }) {
  const tone = connection === 'connected' ? 'status-connected'
    : connection === 'reconnecting' || connection === 'unavailable' ? 'status-warning'
      : 'status-neutral'

  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-live="polite">
    <span className={'status-pill ' + tone}>
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-current" />
      <span data-testid="connection-status">Connection: {connection}</span>
    </span>
    <span className="text-slate-600">{labels[connection] || labels.connecting}</span>
    {lecturer && <span data-testid="student-count" className="text-slate-600">Students connected: {state?.connected_students ?? 0}</span>}
  </div>
}
