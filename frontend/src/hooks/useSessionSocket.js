import { useCallback, useEffect, useRef, useState } from 'react'

export function useSessionSocket(credentials) {
  const [state, setState] = useState(null)
  const [connection, setConnection] = useState('connecting')
  const [error, setError] = useState('')
  const [feedbackAck, setFeedbackAck] = useState(null)
  const socketRef = useRef(null)
  const nextFeedbackRequest = useRef(0)

  useEffect(() => {
    let stopped = false
    let terminal = false
    let retryTimer
    let heartbeat
    let attempts = 0
    let lastMessage = Date.now()
    let currentSocket
    setState(null)
    setError('')
    setFeedbackAck(null)
    setConnection('connecting')

    const connect = () => {
      if (stopped || terminal) return
      setConnection(attempts ? 'reconnecting' : 'connecting')
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(protocol + '//' + location.host + '/ws/sessions/' + credentials.code)
      currentSocket = socket
      socketRef.current = socket
      lastMessage = Date.now()
      socket.onopen = () => {
        if (stopped) { socket.close(); return }
        socket.send(JSON.stringify({ token: credentials.token }))
      }
      socket.onmessage = (event) => {
        if (stopped) return
        lastMessage = Date.now()
        let message
        try { message = JSON.parse(event.data) } catch { return }
        if (message.type === 'state') {
          setState(message)
          attempts = 0
          setError('')
          if (message.status === 'ended') {
            terminal = true
            setConnection('ended')
          } else {
            setConnection('connected')
          }
        } else if (message.type === 'feedback_ack') {
          setFeedbackAck(message)
          setError('')
        } else if (message.type === 'error') setError(message.message)
      }
      socket.onerror = () => {
        if (!stopped) setError('Connection interrupted. Trying to reconnect...')
      }
      socket.onclose = (event) => {
        clearInterval(heartbeat)
        if (stopped || terminal) return
        setFeedbackAck(null)
        if (event.code === 4403 || event.code === 4404) {
          terminal = true
          setConnection('unavailable')
          setError(event.reason || 'Session unavailable. Return home and join again.')
          return
        }
        setConnection('reconnecting')
        attempts += 1
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** (attempts - 1), 5000))
      }
      heartbeat = setInterval(() => {
        if (Date.now() - lastMessage > 15000) {
          socket.close()
        } else if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 5000)
    }
    connect()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      clearInterval(heartbeat)
      if (currentSocket) currentSocket.close()
      socketRef.current = null
    }
  }, [credentials.code, credentials.token])

  const send = useCallback((message) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN || connection !== 'connected') {
      setError('Not connected. Nothing was sent. Wait for reconnection.')
      return false
    }
    socketRef.current.send(JSON.stringify(message))
    return true
  }, [connection])

  const submitFeedback = useCallback((slideIndex, choice, presentationId) => {
    const requestId = ++nextFeedbackRequest.current
    const sent = send({ type: 'submit_feedback', slide_index: slideIndex, choice, request_id: requestId, presentation_id: presentationId })
    return sent ? requestId : null
  }, [send])

  return { state, connection, error, send, submitFeedback, feedbackAck }
}
