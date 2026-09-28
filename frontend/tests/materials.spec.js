import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const oleTableFixture = fileURLToPath(new URL('./fixtures/ole-table.pptx', import.meta.url))
const adaptivePdfFixture = fileURLToPath(new URL('../../backend/tests/fixtures/adaptive-learning-page.pdf', import.meta.url))

function smallPdf(text = 'Uploaded PDF page') {
  const stream = `BT /F1 20 Tf 50 100 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  return Buffer.from(pdf)
}

test('lecturer PDF upload appears for two students and resets previous feedback', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const browserErrors = []
  for (const page of [lecturer, studentA, studentB]) page.on('pageerror', error => browserErrors.push(error.message))
  const aiRequests = []
  lecturer.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && /ollama|explanation|generate|questions/i.test(request.url())) aiRequests.push(request.url())
  })
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    await expect(lecturer.getByTestId('connection-status')).toHaveText('Connection: connected')
    const code = await lecturer.getByTestId('session-code').textContent()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await expect(student.getByTestId('connection-status')).toHaveText('Connection: connected')
      await student.getByRole('button', { name: 'Understand', exact: true }).click()
    }
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'class.pdf', mimeType: 'application/pdf', buffer: smallPdf() })
    await expect(lecturer.getByText('Selected: class.pdf')).toBeVisible()
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('class.pdf is ready (1 slide).')).toBeVisible()
    await expect(lecturer.getByRole('alert')).toHaveCount(0)
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('0 responses submitted')
    for (const student of [studentA, studentB]) {
      await expect(student.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
      await expect(student.getByRole('img', { name: 'Page 1 from class.pdf' })).toBeVisible()
      await expect(student.getByTestId('my-feedback')).toHaveText('No response submitted for this slide.')
    }
    await lecturer.getByText('Replace material', { exact: true }).click()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'class-two.pdf', mimeType: 'application/pdf', buffer: smallPdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('class-two.pdf is ready (1 slide).')).toBeVisible()
    await expect(lecturer.getByRole('alert')).toHaveCount(0)
    for (const student of [studentA, studentB]) {
      await expect(student.getByRole('img', { name: 'Page 1 from class-two.pdf' })).toBeVisible()
    }
    await studentA.getByRole('button', { name: 'Not Understand' }).click()
    await studentB.getByRole('button', { name: 'Not Understand' }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')
    await lecturer.getByText('Replace material', { exact: true }).click()
    await lecturer.getByLabel('Lecture file').setInputFiles({
      name: 'unreadable.pdf', mimeType: 'application/pdf', buffer: Buffer.from('This is not a PDF.'),
    })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByRole('alert')).toContainText('Could not process this PDF')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    for (const student of [studentA, studentB]) {
      await expect(student.getByRole('img', { name: 'Page 1 from class-two.pdf' })).toBeVisible()
    }
    await lecturer.getByLabel('Lecture file').setInputFiles({
      name: 'oversized.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(25 * 1024 * 1024 + 1, 65),
    })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByRole('alert')).toContainText('File is too large')
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('2 responses submitted')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
    expect(browserErrors).toEqual([])
    expect(aiRequests).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('rendered PPTX table is the same slide for lecturer and two students', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, studentA, studentB]) page.on('pageerror', error => errors.push(error.message))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
    }
    await lecturer.getByLabel('Lecture file').setInputFiles(oleTableFixture)
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('ole-table.pptx is ready (1 slide).')).toBeVisible({ timeout: 30000 })
    if (await lecturer.getByText('LibreOffice is not installed. PowerPoint slides are shown as text only.').count()) {
      await lecturer.getByRole('button', { name: 'End lecture session' }).click()
      await lecturer.getByRole('button', { name: 'Confirm end' }).click()
      test.skip(true, 'LibreOffice is not installed on the backend')
    }
    const hashes = []
    for (const page of [lecturer, studentA, studentB]) {
      const slide = page.getByRole('img', { name: /from ole-table\.pptx/ })
      await expect(slide).toBeVisible()
      await expect(page.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
      hashes.push(await slide.evaluate(async img => {
        const bytes = await (await fetch(img.src)).arrayBuffer()
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const context = canvas.getContext('2d')
        context.drawImage(img, 0, 0)
        const grid = context.getImageData(Math.round(canvas.width * .4), Math.round(canvas.height * .27), 1, 1).data
        return { hash: Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join(''), grid: Array.from(grid) }
      }))
    }
    expect(new Set(hashes.map(item => item.hash)).size).toBe(1)
    for (const item of hashes) expect(Math.min(...item.grid.slice(0, 3))).toBeLessThan(40)
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})

test('complex PDF table preview and extracted text match across the classroom', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, studentA, studentB] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, studentA, studentB]) page.on('pageerror', error => errors.push(error.message))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    for (const student of [studentA, studentB]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
    }
    await lecturer.getByLabel('Lecture file').setInputFiles(adaptivePdfFixture)
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('adaptive-learning-page.pdf is ready (1 slide).')).toBeVisible()
    const hashes = []
    for (const page of [lecturer, studentA, studentB]) {
      const slide = page.getByRole('img', { name: /from adaptive-learning-page\.pdf/ })
      await expect(slide).toBeVisible()
      await expect(page.getByTestId('slide-number')).toHaveText('Slide 1 of 1')
      hashes.push(await slide.evaluate(async img => {
        const bytes = await (await fetch(img.src)).arrayBuffer()
        const digest = await crypto.subtle.digest('SHA-256', bytes)
        return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
      }))
    }
    expect(new Set(hashes).size).toBe(1)
    await lecturer.getByText('Extracted text', { exact: true }).click()
    const extracted = await lecturer.locator('.viewer-extracted p').textContent()
    expect(extracted).toContain('Study | Adaptation Approach')
    expect(extracted).toContain('further discussion or teaching action.')
    expect(extracted).not.toMatch(/\n(?:There i|For ex|furthe)(?:\n|\s*\|)/)
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally {
    await Promise.all(contexts.map(context => context.close()))
  }
})
