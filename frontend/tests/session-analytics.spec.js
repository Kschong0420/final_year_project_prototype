import { test, expect } from '@playwright/test'
import { sourcePdf } from './slide-fixture'

test('lecturer Results reports only current-session aggregates', async ({ browser }) => {
  test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires explicit fake Ollama fixture')
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, a, b] = await Promise.all(contexts.map(context => context.newPage()))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'summary.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material', exact: true }).click()
    await expect(lecturer.getByText('summary.pdf is ready (2 slides).')).toBeVisible()
    await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
    const question = lecturer.locator('[data-testid="review-question"]:visible')
    await question.getByRole('button', { name: 'Approve', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('button', { name: 'Release activity', exact: true }).click()

    for (const student of [a, b]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await student.getByRole('button', { name: 'Not Understand', exact: true }).click()
    }
    await a.getByLabel('A. Chlorophyll').check()
    await a.getByRole('button', { name: 'Submit answer' }).click()
    await b.getByLabel('B. Oxygen').check()
    await b.getByRole('button', { name: 'Submit answer' }).click()
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')

    await a.getByRole('tab', { name: 'Ask a question', exact: true }).click()
    await a.getByLabel('Your anonymous question').fill('Why does the slide mention chlorophyll?')
    await a.getByRole('button', { name: 'Send question', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Explanations', exact: true }).click()
    await lecturer.getByRole('button', { name: 'Generate explanation', exact: true }).click()
    const explanation = lecturer.locator('[data-testid="explanation-review"]:visible')
    await explanation.getByRole('button', { name: 'Approve explanation' }).click()
    await explanation.getByRole('button', { name: 'Share explanation' }).click()

    await lecturer.getByRole('tab', { name: 'Results', exact: true }).click()
    const report = lecturer.getByTestId('session-analytics')
    await expect(report).toBeVisible()
    for (const [label, expected] of Object.entries({
      'Connected students': '2', 'Slides': '2', 'Released activities': '1',
      'Answer submissions': '2', 'Anonymous questions': '1',
      'AI explanations generated': '1', 'Shared explanations': '1',
    })) {
      await expect(report.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd')).toHaveText(expected)
    }
    await expect(report).toContainText('Potential confusion slides: 1')
    await expect(report).toContainText('2 feedback respondents; 0 Understand, 2 Not Understand (100% Not Understand)')
    await expect(report).toContainText('may include several answers from one student')
    await expect(report).not.toContainText(/attendance|grades|engagement score/i)
    await expect(lecturer.getByTestId('activity-results')).toContainText('2 submissions')
    for (const student of [a, b]) await expect(student.getByTestId('session-analytics')).toHaveCount(0)
  } finally {
    try {
      if (await lecturer.getByRole('button', { name: 'End lecture session' }).isEnabled()) {
        await lecturer.getByRole('button', { name: 'End lecture session' }).click()
        await lecturer.getByRole('button', { name: 'Confirm end' }).click()
      }
    } finally { await Promise.all(contexts.map(context => context.close())) }
  }
})
