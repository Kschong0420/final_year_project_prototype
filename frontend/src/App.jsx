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
    <header className={'site-header ' + (credentials ? 'sr-only' : '')}>
      <div className="site-header-inner">
        <div className="brand"><span className="brand-mark" aria-hidden="true">AC</span><span>Adaptive Classroom</span></div>
        <span className="site-header-note">Classroom learning workspace</span>
      </div>
    </header>
    <main className={credentials ? 'session-main' : 'site-main'}>
      {credentials ? <LivePage credentials={credentials} onLeave={leave} /> : <HomePage onEnter={enter} previousStudent={lastStudent()} />}
    </main>
  </div>
}
