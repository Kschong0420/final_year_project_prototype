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

test('lecturer reviews model questions before two students answer', async ({ browser }) => {
  test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires the explicit fake Ollama HTTP test fixture')
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, studentA, studentB]) page.on('pageerror', error => errors.push(error.message))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'biology.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('biology.pdf is ready (2 slides).')).toBeVisible()
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('1')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('0')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    await lecturer.getByRole('button', { name: 'Generate questions' }).click()
    await expect(lecturer.getByTestId('review-question')).toHaveCount(3)
    const first = lecturer.getByTestId('review-question').first()
    await first.getByRole('button', { name: 'Approve' }).click()
    await expect(first.getByText(/Approved .* Saved for later/)).toBeVisible()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByText('No activities released yet.')).toBeVisible()
    }
    await first.getByLabel('Question').fill('Which pigment absorbs light in plant chloroplasts?')
    await studentA.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await expect(first.getByLabel('Question')).toHaveValue('Which pigment absorbs light in plant chloroplasts?')
    await first.getByRole('button', { name: 'Save edits' }).click()
    await expect(first.getByText('Edited by lecturer.')).toBeVisible()
    await first.getByRole('button', { name: 'Approve' }).click()
    await expect(studentA.getByTestId('student-activity')).toHaveCount(0)
    await first.getByRole('button', { name: 'Release to students' }).click()
    for (const student of [studentA, studentB]) {
      await expect(student.getByTestId('student-activity')).toHaveCount(1)
      await expect(student.getByText('Which pigment absorbs light in plant chloroplasts?')).toBeVisible()
      await expect(student.getByText('Correct option')).toHaveCount(0)
    }
    await studentA.getByLabel('A. Chlorophyll').check()
    await studentA.getByRole('button', { name: 'Submit answer' }).click()
    await expect(studentA.getByText('Answer saved.')).toBeVisible()
    await studentB.getByLabel('B. Oxygen').check()
    await studentB.getByRole('button', { name: 'Submit answer' }).click()
    await expect(studentB.getByText('Answer saved.')).toBeVisible()
    await expect(first.getByText('2 submissions')).toBeVisible()
    await expect(first.getByText('A. Chlorophyll: 1')).toBeVisible()
    await expect(first.getByText('B. Oxygen: 1')).toBeVisible()
    await lecturer.getByTestId('review-question').nth(1).getByRole('button', { name: 'Discard' }).click()
    await expect(studentA.getByTestId('student-activity')).toHaveCount(1)
    await lecturer.getByTestId('review-question').nth(2).getByRole('button', { name: 'Approve' }).click()
    await lecturer.getByTestId('review-question').nth(2).getByRole('button', { name: 'Release to students' }).click()
    await expect(studentA.getByTestId('student-activity')).toHaveCount(2)
    await studentA.getByLabel('Your answer').fill('glucose')
    await studentA.getByTestId('student-activity').last().getByRole('button', { name: 'Submit answer' }).click()
    await expect(studentA.getByTestId('student-activity').last().getByText('Answer saved.')).toBeVisible()
    await lecturer.getByLabel('Question difficulty').selectOption('advanced')
    await lecturer.getByLabel('Additional teaching notes (optional)').fill('Chlorophyll absorbs light in the chloroplast.')
    await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
    await expect(lecturer.getByTestId('review-question')).toHaveCount(6)
    await expect(studentA.getByTestId('student-activity')).toHaveCount(2)
    await expect(lecturer.getByTestId('review-question').nth(3).getByText('Awaiting review', { exact: true })).toBeVisible()
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(studentA.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await expect(lecturer.getByLabel('Source slide', { exact: true })).toHaveValue('1')
    await expect(lecturer.getByTestId('review-question')).toHaveCount(0)
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('0')
    await expect(lecturer.getByTestId('review-question')).toHaveCount(6)
    for (const page of [lecturer, studentA, studentB]) {
      await expect(page.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    }
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('1')
    await lecturer.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await expect(lecturer.getByLabel('Source slide', { exact: true })).toHaveValue('0')
    for (const page of [lecturer, studentA, studentB]) {
      await expect(page.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    }
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'new.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('new.pdf is ready (2 slides).')).toBeVisible()
    await expect(lecturer.getByTestId('review-question')).toHaveCount(0)
    for (const student of [studentA, studentB]) await expect(student.getByText('No activities released yet.')).toBeVisible()
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
