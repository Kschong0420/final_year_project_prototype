import { test, expect } from '@playwright/test'

test('same student rejoins without a third count; new student remains independent', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext(), browser.newContext()])
  await contexts[1].addInitScript(() => {
    const NativeSocket = window.WebSocket
    window.demoSockets = []
    window.WebSocket = class extends NativeSocket {
      constructor(...args) { super(...args); window.demoSockets.push(this) }
    }
  })
  const [lecturer, studentA, studentB, studentC] = await Promise.all(contexts.map(context => context.newPage()))

  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await expect(lecturer.getByTestId('connection-status')).toHaveText('Connection: connected')
    const code = await lecturer.getByTestId('session-code').textContent()

    async function join(student) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByTestId('connection-status')).toHaveText('Connection: connected')
    }

    await join(studentA)
    await join(studentB)
    await studentA.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(studentA.getByTestId('submission-status')).toHaveText('Response saved.')
    await studentB.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(studentB.getByTestId('submission-status')).toHaveText('Response saved.')
    await expect(lecturer.getByTestId('understand-count')).toContainText('2 · 100%')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')

    await studentA.evaluate(() => window.demoSockets.forEach(socket => socket.close()))
    await expect(studentA.getByTestId('connection-status')).toHaveText('Connection: reconnecting')
    await expect(studentA.getByRole('button', { name: 'Understand', exact: true })).toBeDisabled()
    await expect(studentA.getByTestId('submission-status')).toContainText('Offline. Feedback cannot be submitted')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(studentA.getByTestId('connection-status')).toHaveText('Connection: connected')

    await studentA.getByRole('button', { name: 'Leave session' }).click()
    await studentA.getByLabel('Session code').fill(code)
    await studentA.getByRole('button', { name: 'Join lecture session' }).click()
    await expect(studentA.getByTestId('my-feedback')).toHaveText('Your response: Understand')
    await studentA.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(studentA.getByTestId('submission-status')).toHaveText('Response saved.')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('2 · 100%')

    await studentA.getByRole('button', { name: 'Not Understand' }).click()
    await expect(studentA.getByTestId('submission-status')).toHaveText('Response saved.')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('1 · 50%')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('1 · 50%')
    await expect(studentB.getByTestId('my-feedback')).toHaveText('Your response: Understand')

    await join(studentC)
    await studentC.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('3 responses submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('2 · 67%')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('1 · 33%')

    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
    for (const page of [lecturer, studentA, studentB, studentC]) {
      await expect(page.getByTestId('connection-status')).toHaveText('Connection: ended')
    }
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
