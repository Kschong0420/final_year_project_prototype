import { useState } from 'react'
import HomePage from './pages/HomePage'
import LivePage from './pages/LivePage'

const storageKey = 'classroom-milestone1'
const lastStudentKey = 'classroom-last-student'
function lastStudent() {
  try {
    const value = JSON.parse(sessionStorage.getItem(lastStudentKey))
    return value && value.role === 'student' && typeof value.code === 'string' &&
      typeof value.token === 'string' ? value : null
  } catch { return null }
}
function restore() {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey))
    return value && typeof value.code === 'string' && typeof value.token === 'string' &&
      ['lecturer', 'student'].includes(value.role) ? value : null
  } catch { return null }
}
export default function App() {
  const [credentials, setCredentials] = useState(restore)
  function enter(value) {
    try { sessionStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Current tab still works without storage. */ }
    if (value.role === 'student') {
      try { sessionStorage.setItem(lastStudentKey, JSON.stringify(value)) } catch { /* Storage may be disabled. */ }
    }
    setCredentials(value)
  }
  function leave({ forgetIdentity = false } = {}) {
    try {
      sessionStorage.removeItem(storageKey)
      if (forgetIdentity) sessionStorage.removeItem(lastStudentKey)
    } catch { /* Storage may be disabled. */ }
    setCredentials(null)
  }
  return <div className="min-h-screen">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 lg:px-8">
        <span className="text-base font-semibold tracking-tight text-slate-900">Adaptive Classroom</span>
        <span className="text-sm text-slate-500">{credentials ? credentials.role === 'lecturer' ? 'Lecturer view' : 'Student view' : 'Classroom sessions'}</span>
      </div>
    </header>
    <main className="mx-auto max-w-7xl px-5 py-8 lg:px-8 lg:py-10">
      {credentials ? <LivePage credentials={credentials} onLeave={leave} /> : <HomePage onEnter={enter} previousStudent={lastStudent()} />}
    </main>
  </div>
}
