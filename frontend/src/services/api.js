export async function request(path, body) {
  let response
  try {
    response = await fetch('/api' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    throw new Error('Cannot reach the backend. Check that it is running, then try again.')
  }
  const data = await response.json()
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Please check your input and try again.')
  }
  return data
}

export async function uploadMaterial(code, token, file) {
  const form = new FormData()
  form.append('file', file)
  let response
  try {
    response = await fetch(`/api/sessions/${encodeURIComponent(code)}/materials`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
  } catch {
    throw new Error('Cannot reach the backend. Check the connection and try again.')
  }
  const data = await response.json()
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The upload failed. Try another file.')
  return data
}

export async function activityRequest(code, token, path, method = 'POST', body) {
  let response
  try {
    response = await fetch(`/api/sessions/${encodeURIComponent(code)}/activities${path}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(path === '/generate' ? 190000 : 15000),
    })
  } catch {
    throw new Error('Cannot reach the backend. Check the connection and try again.')
  }
  let data
  try { data = await response.json() } catch { throw new Error('The backend returned an unreadable response.') }
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'The activity request failed.')
  return data
}
