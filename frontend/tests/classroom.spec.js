import { test, expect } from '@playwright/test'

test('lecturer and two students: sync, late join, reconnect, refresh and end', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  for (const context of contexts) {
    await context.addInitScript(() => {
      const NativeSocket = window.WebSocket
      window.demoSockets = []
      window.WebSocket = class extends NativeSocket {
        constructor(...args) { super(...args); window.demoSockets.push(this) }
      }
    })
  }
  const [lecturer, student1, student2] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, student1, student2]) page.on('pageerror', error => errors.push(error.message))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    await expect(lecturer.getByTestId('connection-status')).toHaveText('Connection: connected')
    const code = await lecturer.getByTestId('session-code').textContent()

    await student1.goto('/')
    await student1.getByLabel('Session code').fill('ZZZZZZ')
    await student1.getByRole('button', { name: 'Join lecture session' }).click()
    await expect(student1.getByRole('alert')).toContainText('not found')
    await student1.getByLabel('Session code').fill(code)
    await student1.getByRole('button', { name: 'Join lecture session' }).click()
    await expect(student1.getByTestId('slide-number')).toHaveText('Slide 1 of 5')
    await expect(student1.getByRole('button', { name: 'Next slide' })).toHaveCount(0)

    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    await expect(student1.getByTestId('slide-number')).toHaveText('Slide 2 of 5')
    await student2.goto('/')
    await student2.getByLabel('Session code').fill(code)
    await student2.getByRole('button', { name: 'Join lecture session' }).click()
    await expect(student2.getByTestId('slide-number')).toHaveText('Slide 2 of 5')
    await expect(lecturer.getByTestId('student-count')).toHaveText('Students connected: 2')

    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    for (const page of [student1, student2]) await expect(page.getByTestId('slide-number')).toHaveText('Slide 3 of 5')

    await student1.evaluate(() => window.demoSockets.forEach(socket => socket.close()))
    await expect(student1.getByTestId('connection-status')).toHaveText('Connection: reconnecting')
    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    await expect(student1.getByTestId('connection-status')).toHaveText('Connection: connected')
    await expect(student1.getByTestId('slide-number')).toHaveText('Slide 4 of 5')
    await expect(student2.getByTestId('slide-number')).toHaveText('Slide 4 of 5')

    await lecturer.reload()
    await expect(lecturer.getByTestId('connection-status')).toHaveText('Connection: connected')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 4 of 5')
    await student1.reload()
    await expect(student1.getByTestId('slide-number')).toHaveText('Slide 4 of 5')
    await expect(lecturer.getByTestId('student-count')).toHaveText('Students connected: 2')

    await lecturer.getByRole('button', { name: 'Next slide' }).click()
    await expect(lecturer.getByRole('button', { name: 'Next slide' })).toBeDisabled()
    await expect(student2.getByTestId('slide-number')).toHaveText('Slide 5 of 5')
    await lecturer.getByRole('button', { name: 'Previous slide' }).click()
    await expect(student2.getByTestId('slide-number')).toHaveText('Slide 4 of 5')
    await student2.setViewportSize({ width: 390, height: 844 })
    expect(await student2.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()

    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
    for (const page of [lecturer, student1, student2]) await expect(page.getByTestId('connection-status')).toHaveText('Connection: ended')
    expect(errors).toEqual([])
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
