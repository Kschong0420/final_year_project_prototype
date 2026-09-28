import { test, expect } from '@playwright/test'
import { sourcePdf } from './slide-fixture'

test('Prepare actions and released Results stay usable at laptop and mobile sizes', async ({ browser }, testInfo) => {
  test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires explicit fake Ollama fixture')
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const longQuestion = 'Which pigment absorbs light in plant chloroplasts during the process described on this slide? '.repeat(3).trim()
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'lecture.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('lecture.pdf is ready (2 slides).')).toBeVisible()
    for (const width of [1366, 1024]) {
      await lecturer.setViewportSize({ width, height: 768 })
      const button = lecturer.getByRole('button', { name: 'Generate questions', exact: true })
      await expect(button).toBeVisible()
      await lecturer.screenshot({ path: testInfo.outputPath(`prepare-${width}.png`) })
      const box = await button.boundingBox()
      expect(box.y + box.height, `Generate action at ${width}px`).toBeLessThanOrEqual(768)
      expect(await lecturer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    await lecturer.locator('summary').filter({ hasText: 'Additional teaching notes' }).click()
    await lecturer.getByLabel('Additional teaching notes (optional)').fill('Chlorophyll absorbs light.')
    await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
    const picker = lecturer.getByLabel('Question to review')
    await expect(picker.locator('option')).toHaveCount(3)
    const editor = lecturer.locator('[data-testid="review-question"]:visible')
    await editor.getByLabel('Question', { exact: true }).fill(longQuestion)
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Review', exact: true }).click()
    await expect(editor.getByLabel('Question', { exact: true })).toHaveValue(longQuestion)
    await expect(lecturer.getByLabel('Additional teaching notes (optional)')).toHaveValue('Chlorophyll absorbs light.')
    await editor.getByRole('button', { name: 'Save edits' }).click()
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(picker.locator('option').first()).toContainText('Approved')
    await picker.selectOption({ index: 1 })
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(picker.locator('option').nth(1)).toContainText('Approved')

    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('button', { name: 'Release activity', exact: true }).click()
    await lecturer.getByLabel('Approved and released activities').selectOption({ index: 0 })
    await lecturer.getByRole('button', { name: 'Release activity', exact: true }).click()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByTestId('student-activity')).toHaveCount(2)
    }
    for (const [student, label] of [[studentA, 'A. Chlorophyll'], [studentB, 'B. Oxygen']]) {
      await student.getByTestId('student-activity').first().getByLabel(label).check()
      await student.getByTestId('student-activity').first().getByRole('button', { name: 'Submit answer' }).click()
    }
    for (const [student, label] of [[studentA, 'A. Glucose'], [studentB, 'B. Chloroplast']]) {
      await student.getByTestId('student-activity').nth(1).getByLabel(label).check()
      await student.getByTestId('student-activity').nth(1).getByRole('button', { name: 'Submit answer' }).click()
    }
    await lecturer.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(lecturer.locator('.live-feedback')).toBeHidden()
    await expect(lecturer.getByTestId('session-analytics')).toBeVisible()
    await expect(lecturer.getByTestId('session-analytics').locator('dt', { hasText: 'Answer submissions' }).locator('xpath=following-sibling::dd')).toHaveText('4')
    await expect(lecturer.getByTestId('activity-results')).toContainText('2 submissions')
    await expect(lecturer.getByTestId('activity-results')).toContainText('A. Chlorophyll: 1')
    await lecturer.locator('.results-layout .question-summary').nth(1).click()
    await expect(lecturer.getByTestId('activity-results')).toContainText('A. Glucose: 1')
    await expect(lecturer.getByTestId('activity-results')).toContainText('B. Chloroplast: 1')

    for (const width of [1366, 1024, 390]) {
      await lecturer.setViewportSize({ width, height: width === 390 ? 844 : 768 })
      await expect(lecturer.getByTestId('activity-results')).toBeVisible()
      expect(await lecturer.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}px`).toBe(true)
      if (width !== 390) {
        const result = await lecturer.getByTestId('activity-results').boundingBox()
        const analytics = await lecturer.getByTestId('session-analytics').boundingBox()
        expect(result.y + result.height, `Selected result at ${width}px`).toBeLessThanOrEqual(768)
        expect(analytics.x, `Analytics beside results at ${width}px`).toBeGreaterThan(result.x + result.width)
      }
      await lecturer.screenshot({ path: testInfo.outputPath(`results-${width}.png`) })
    }
    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Review', exact: true }).click()
    await expect(lecturer.getByLabel('Question to review')).toBeVisible()
    await lecturer.getByLabel('Question to review').scrollIntoViewIfNeeded()
    expect(await lecturer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await lecturer.screenshot({ path: testInfo.outputPath('prepare-390.png') })
  } finally {
    try {
      if (await lecturer.getByRole('button', { name: 'End lecture session' }).isEnabled()) {
        await lecturer.getByRole('button', { name: 'End lecture session' }).click()
        await lecturer.getByRole('button', { name: 'Confirm end' }).click()
      }
    } finally { await Promise.all(contexts.map(context => context.close())) }
  }
})
