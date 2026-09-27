import { test, expect } from '@playwright/test'

const source = 'Photosynthesis converts light energy into chemical energy in plants. Chlorophyll absorbs light in the chloroplast. Plants use carbon dioxide and water to produce glucose and oxygen during photosynthesis.'

function sourcePdf() {
  const stream = `BT /F1 11 Tf 40 150 Td (${source}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 1000 250] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

test('prepare, live generation, review, release, results and draft retention', async ({ browser }) => {
  test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires explicit fake Ollama fixture')
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, studentA, studentB]) page.on('pageerror', error => errors.push(error.message))
  const editor = lecturer.locator('[data-testid="review-question"]:visible')
  const question = index => lecturer.locator('.question-summary').nth(index)
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    await expect(lecturer.locator('.stage-next strong')).toHaveText('Add lecture material')
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'biology.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('biology.pdf is ready (2 slides).')).toBeVisible()
    await expect(lecturer.locator('.stage-next strong')).toHaveText('Generate questions')
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('1')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('0')
    await lecturer.getByLabel('Additional teaching notes (optional)').fill('Chlorophyll absorbs light.')
    await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
    await expect(lecturer.locator('.question-summary')).toHaveCount(3)
    await expect(lecturer.locator('.stage-next strong')).toHaveText('Review 3 questions')
    await editor.getByLabel('Question', { exact: true }).fill('Which pigment absorbs light in plant chloroplasts?')
    await lecturer.getByRole('tab', { name: 'Results', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await expect(lecturer.getByLabel('Additional teaching notes (optional)')).toHaveValue('Chlorophyll absorbs light.')
    await lecturer.getByRole('tab', { name: 'Review', exact: true }).click()
    await expect(editor.getByLabel('Question', { exact: true })).toHaveValue('Which pigment absorbs light in plant chloroplasts?')
    await editor.getByRole('button', { name: 'Save edits' }).click()
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await expect(editor.getByText(/Approved .* Saved for later/)).toBeVisible()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByText('No activities released yet.')).toBeVisible()
    }
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('button', { name: 'Review / edit', exact: true }).click()
    await editor.getByLabel('Question', { exact: true }).fill('Which pigment absorbs light during photosynthesis?')
    await lecturer.getByRole('tab', { name: 'Activities', exact: true }).click()
    await expect(lecturer.getByRole('button', { name: 'Release activity', exact: true })).toBeDisabled()
    await lecturer.getByRole('button', { name: 'Review / edit', exact: true }).click()
    await editor.getByRole('button', { name: 'Save edits', exact: true }).click()
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Activities', exact: true }).click()
    await studentA.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await expect(studentA.getByTestId('student-activity')).toHaveCount(0)
    await lecturer.getByRole('button', { name: 'Release activity', exact: true }).click()
    for (const student of [studentA, studentB]) {
      await expect(student.getByTestId('student-activity')).toHaveCount(1)
      await expect(student.getByText('Correct option')).toHaveCount(0)
    }
    await studentA.getByLabel('A. Chlorophyll').check()
    await studentA.getByRole('button', { name: 'Submit answer' }).click()
    await studentB.getByLabel('B. Oxygen').check()
    await studentB.getByRole('button', { name: 'Submit answer' }).click()
    await lecturer.getByLabel('Slide view', { exact: true }).selectOption('half')
    await lecturer.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await lecturer.getByRole('button', { name: 'Full screen', exact: true }).click()
    await expect.poll(() => lecturer.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await lecturer.getByRole('button', { name: 'Exit Full Screen', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect(lecturer.getByTestId('activity-results').getByText('2 submissions', { exact: true })).toBeVisible()
    await expect(lecturer.getByTestId('activity-results').getByText('A. Chlorophyll: 1')).toBeVisible()
    await expect(lecturer.getByTestId('activity-results').getByText('B. Oxygen: 1')).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Review', exact: true }).click()
    await question(1).click()
    await editor.getByRole('button', { name: 'Discard', exact: true }).click()
    await question(2).click()
    await editor.getByRole('button', { name: 'Approve', exact: true }).click()
    await editor.getByRole('button', { name: 'Release to students' }).click()
    await expect(studentA.getByTestId('student-activity')).toHaveCount(2)
    await studentA.setViewportSize({ width: 390, height: 844 })
    await studentA.getByRole('tab', { name: 'Activities (2)', exact: true }).click()
    await studentA.getByLabel('Your answer').fill('glucose')
    await studentA.getByRole('tab', { name: 'Slide', exact: true }).click()
    await studentA.getByLabel('Slide view', { exact: true }).selectOption('half')
    await studentA.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await studentA.getByRole('tab', { name: 'Activities (2)', exact: true }).click()
    await expect(studentA.getByLabel('Your answer')).toHaveValue('glucose')
    await studentA.getByTestId('student-activity').last().getByRole('button', { name: 'Submit answer' }).click()
    await expect(studentA.getByTestId('student-activity').last().getByText('Answer saved.')).toBeVisible()
    expect(await studentA.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await lecturer.getByRole('tab', { name: 'Generate', exact: true }).click()
    await lecturer.getByLabel('Question difficulty').selectOption('advanced')
    let finishGeneration
    await lecturer.route('**/activities/generate', async route => {
      await new Promise(resolve => { finishGeneration = resolve })
      await route.continue()
    })
    await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
    await expect(lecturer.getByText('Generating questions. Classroom controls remain available.')).toBeVisible()
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(studentB.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await expect(lecturer.getByLabel('Source slide', { exact: true })).toHaveValue('1')
    await studentB.getByRole('button', { name: 'Not Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await lecturer.getByRole('tab', { name: 'Results', exact: true }).click()
    await expect.poll(() => typeof finishGeneration).toBe('function')
    finishGeneration()
    await expect(lecturer.getByText(/3 questions ready for review/)).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Review', exact: true }).click()
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('0')
    await expect(lecturer.locator('.question-summary')).toHaveCount(6)
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await expect(studentB.getByTestId('student-activity')).toHaveCount(2)
    await lecturer.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await expect(lecturer.getByLabel('Source slide', { exact: true })).toHaveValue('0')
    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await lecturer.getByText('Replace material', { exact: true }).click()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'new.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('new.pdf is ready (2 slides).')).toBeVisible()
    await expect(lecturer.getByTestId('review-question')).toHaveCount(0)
    await expect(studentB.getByText('No activities released yet.')).toBeVisible()
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
