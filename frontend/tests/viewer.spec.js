import { test, expect } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { sourcePdf } from './slide-fixture'

async function aspectRatio(page) {
  const image = page.locator('.slide-image')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(img => {
    const rect = img.getBoundingClientRect()
    return Math.abs(rect.width / rect.height - img.naturalWidth / img.naturalHeight)
  })).toBeLessThan(0.01)
}

test('local viewing modes, zoom, fullscreen, source following and mobile layout', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()])
  const [lecturer, student] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, student]) page.on('pageerror', error => errors.push(error.message))
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'slides.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('slides.pdf is ready (2 slides).')).toBeVisible()
    await student.goto('/')
    await student.getByLabel('Session code').fill(code)
    await student.getByRole('button', { name: 'Join lecture session' }).click()
    await lecturer.getByLabel('Source slide', { exact: true }).selectOption('1')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await expect(student.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    await student.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')

    for (const mode of ['standard', 'half', 'expanded']) {
      await lecturer.getByLabel('Slide view', { exact: true }).selectOption(mode)
      await aspectRatio(lecturer)
      await expect(student.getByLabel('Slide view', { exact: true })).toHaveValue('standard')
      if (mode === 'half') {
        const widths = await lecturer.locator('.workspace-grid').evaluate(grid => Array.from(grid.children).map(item => item.getBoundingClientRect().width))
        expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2)
      }
    }
    await lecturer.getByRole('button', { name: 'Class controls', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Generate', exact: true }).click()
    await expect(lecturer.getByRole('button', { name: 'Generate questions', exact: true })).toBeVisible()
    await lecturer.keyboard.press('Escape')
    await expect(lecturer.getByLabel('Slide view', { exact: true })).toHaveValue('standard')
    for (let i = 0; i < 4; i++) await lecturer.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(lecturer.getByLabel('Zoom level', { exact: true })).toHaveText('200%')
    await expect(lecturer.getByRole('button', { name: 'Zoom in', exact: true })).toBeDisabled()
    await aspectRatio(lecturer)
    expect(await lecturer.locator('.slide-viewport').evaluate(el => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)).toBeTruthy()
    await expect(student.getByLabel('Zoom level', { exact: true })).toHaveText('100%')
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(student.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await expect(lecturer.getByLabel('Source slide', { exact: true })).toHaveValue('1')
    await expect(lecturer.getByLabel('Zoom level', { exact: true })).toHaveText('200%')
    await lecturer.getByRole('button', { name: 'Reset zoom', exact: true }).click()
    await expect(lecturer.getByLabel('Zoom level', { exact: true })).toHaveText('100%')
    await lecturer.getByRole('button', { name: 'Zoom out', exact: true }).click()
    await expect(lecturer.getByLabel('Zoom level', { exact: true })).toHaveText('75%')
    await expect(lecturer.getByRole('button', { name: 'Zoom out', exact: true })).toBeDisabled()
    await lecturer.getByRole('button', { name: 'Fit', exact: true }).click()
    await expect(lecturer.getByLabel('Zoom level', { exact: true })).toHaveText('100%')
    await lecturer.getByRole('button', { name: 'Full screen', exact: true }).click()
    await expect.poll(() => lecturer.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await aspectRatio(lecturer)
    await lecturer.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await expect(student.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
    await lecturer.getByRole('button', { name: 'Exit Full Screen', exact: true }).click()
    await expect.poll(() => lecturer.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await student.getByRole('button', { name: 'Full screen', exact: true }).click()
    await expect.poll(() => student.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await expect(student.getByRole('button', { name: 'Next slide' })).toHaveCount(0)
    await expect(student.getByRole('button', { name: 'Previous slide' })).toHaveCount(0)
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(student.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await student.keyboard.press('Escape')
    await expect.poll(() => student.evaluate(() => Boolean(document.fullscreenElement))).toBe(false)
    await expect(student.getByRole('button', { name: 'Understand', exact: true })).toBeVisible()
    // Rejected/unsupported full screen falls back without losing classroom state.
    await lecturer.evaluate(() => { document.querySelector('.slide-viewer').requestFullscreen = () => Promise.reject(new Error('denied')) })
    await lecturer.getByRole('button', { name: 'Full screen', exact: true }).click()
    await expect(lecturer.getByText('Full screen is unavailable in this browser. Expanded view is open instead.')).toBeVisible()
    await lecturer.getByRole('button', { name: 'Return to standard view', exact: true }).click()
    await lecturer.screenshot({ path: test.info().outputPath('lecturer-live.png'), fullPage: true })
    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await lecturer.screenshot({ path: test.info().outputPath('lecturer-prepare.png'), fullPage: true })
    await student.setViewportSize({ width: 390, height: 844 })
    await expect(student.getByRole('tab', { name: 'Slide', exact: true })).toBeVisible()
    for (const mode of ['half', 'expanded', 'standard']) {
      await student.getByLabel('Slide view', { exact: true }).selectOption(mode)
      await aspectRatio(student)
    }
    expect(await student.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
    await student.screenshot({ path: test.info().outputPath('student-mobile.png'), fullPage: true })
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
  } finally { await Promise.all(contexts.map(context => context.close())) }
})

test('PPTX visual slide preserves aspect ratio in all viewing modes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create lecture session' }).click()
  try {
    await page.getByLabel('Lecture file').setInputFiles(fileURLToPath(new URL('./fixtures/ole-table.pptx', import.meta.url)))
    await page.getByRole('button', { name: 'Upload material' }).click()
    await expect(page.getByText('ole-table.pptx is ready (1 slide).')).toBeVisible({ timeout: 30000 })
    test.skip(await page.getByText('LibreOffice is not installed. PowerPoint slides are shown as text only.').count() > 0, 'Visual PPTX requires LibreOffice')
    await page.getByRole('tab', { name: 'Live class', exact: true }).click()
    for (const mode of ['standard', 'half', 'expanded']) {
      await page.getByLabel('Slide view', { exact: true }).selectOption(mode)
      await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
      await aspectRatio(page)
      await page.getByRole('button', { name: 'Fit', exact: true }).click()
      await aspectRatio(page)
    }
    await page.getByRole('button', { name: 'Full screen', exact: true }).click()
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true)
    await aspectRatio(page)
    await page.getByRole('button', { name: 'Exit Full Screen', exact: true }).click()
    await expect(page.getByLabel('Slide view', { exact: true })).toHaveValue('standard')
  } finally {
    await page.getByRole('button', { name: 'End lecture session' }).click()
    await page.getByRole('button', { name: 'Confirm end' }).click()
  }
})
