import { test, expect } from '@playwright/test'

test('feedback updates the lecturer live and follows each slide', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  await contexts[1].addInitScript(() => {
    const NativeSocket = window.WebSocket
    window.demoSockets = []
    window.WebSocket = class extends NativeSocket {
      constructor(...args) { super(...args); window.demoSockets.push(this) }
    }
  })
  const [lecturer, student1, student2] = await Promise.all(contexts.map(context => context.newPage()))
  const explanationRequests = []
  lecturer.on('request', request => {
    if (request.url().includes('explanation')) explanationRequests.push(request.url())
  })
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('0 responses submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('0 · 0%')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('0 · 0%')
    const code = await lecturer.getByTestId('session-code').textContent()

    for (const student of [student1, student2]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByTestId('connection-status')).toHaveText('Connection: connected')
    }

    await student1.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('1 · 100%')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('No confusion flag')

    await student1.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(student1.getByTestId('my-feedback')).toHaveText('Your response: Understand')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('1 · 100%')

    await student2.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('understand-count')).toContainText('1 · 50%')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('1 · 50%')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')
    await expect(lecturer.getByTestId('flagged-slides')).toHaveText('1')

    await student2.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('understand-count')).toContainText('2 · 100%')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('No confusion flag')
    await student1.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')

    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('0 responses submitted')
    await expect(lecturer.getByTestId('flagged-slides')).toHaveText('1')
    await expect(student1.getByTestId('my-feedback')).toHaveText('No response submitted for this slide.')
    await student1.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('understand-count')).toContainText('1 · 100%')

    await lecturer.getByRole('button', { name: 'Previous slide' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')
    await expect(student1.getByTestId('my-feedback')).toHaveText('Your response: Not Understand')

    await student1.evaluate(() => window.demoSockets.forEach(socket => socket.close()))
    await expect(student1.getByTestId('connection-status')).toHaveText('Connection: reconnecting')
    await expect(student1.getByTestId('connection-status')).toHaveText('Connection: connected')
    await expect(student1.getByTestId('my-feedback')).toHaveText('Your response: Not Understand')
    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    await expect(student1.getByTestId('my-feedback')).toHaveText('Your response: Understand')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')

    await student1.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('1 · 100%')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('No confusion flag')
    await student2.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')
    await expect(lecturer.getByTestId('flagged-slides')).toHaveText('1, 2')
    expect(explanationRequests).toEqual([])

    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
    for (const page of [lecturer, student1, student2]) await expect(page.getByTestId('connection-status')).toHaveText('Connection: ended')
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
