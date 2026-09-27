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
