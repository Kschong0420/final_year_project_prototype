import { test, expect } from '@playwright/test'
import { sourcePdf } from './slide-fixture'

test('M5: manual explanations, private review, live sharing and anonymous questions', async ({ browser }) => {
  test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires explicit fake Ollama fixture')
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()])
  const [lecturer, a, b] = await Promise.all(contexts.map(context => context.newPage()))
  const errors = []
  for (const page of [lecturer, a, b]) page.on('pageerror', error => errors.push(error.message))
  const editor = lecturer.locator('[data-testid="explanation-review"]:visible')
  const generatedRequests = []
  lecturer.on('request', request => { if (request.url().endsWith('/explanations/generate')) generatedRequests.push(request.url()) })
  let finishGeneration
  let completed = false
  try {
    await lecturer.goto('/')
    await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
    const code = await lecturer.getByTestId('session-code').textContent()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'lesson.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('lesson.pdf is ready (2 slides).')).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    for (const student of [a, b]) {
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await student.getByRole('button', { name: 'Not Understand', exact: true }).click()
    }
    await expect(lecturer.getByTestId('confusion-status')).toContainText('Potential confusion')
    await expect(lecturer.getByTestId('not-understand-count')).toContainText('2 · 100%')
    expect(generatedRequests).toHaveLength(0)
    await lecturer.getByRole('button', { name: 'Explain this slide', exact: true }).click()
    await expect(lecturer.getByLabel('Explanation source slide')).toHaveValue('0')
    expect(generatedRequests).toHaveLength(0)
    await lecturer.route('**/explanations/generate', async route => {
      await new Promise(resolve => { finishGeneration = resolve })
      await route.continue()
    })
    await lecturer.getByRole('button', { name: 'Generate explanation', exact: true }).click()
    await expect(lecturer.getByText('Generating explanation. Slides and feedback remain available.')).toBeVisible()
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(a.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    await a.getByRole('button', { name: 'Understand', exact: true }).click()
    await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')
    await expect.poll(() => typeof finishGeneration).toBe('function')
    finishGeneration()
    await expect(lecturer.getByRole('button', { name: 'Review generated explanation' })).toBeVisible()
    await lecturer.unroute('**/explanations/generate')
    await lecturer.getByRole('button', { name: 'Review generated explanation' }).click()
    await expect(editor.getByLabel('Explanation', { exact: true })).toContainText('Plants use photosynthesis')
    await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    const edited = 'Photosynthesis changes light energy into chemical energy. Chlorophyll absorbs the light.'
    await editor.getByLabel('Explanation', { exact: true }).fill(edited)
    await lecturer.getByRole('tab', { name: 'Questions (0)', exact: true }).click()
    await lecturer.getByRole('tab', { name: 'Explanations', exact: true }).click()
    await expect(editor.getByLabel('Explanation', { exact: true })).toHaveValue(edited)
    await lecturer.route('**/explanations/*', async route => {
      if (route.request().method() === 'PUT') await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Could not save explanation. Try again.' }) })
      else await route.continue()
    })
    await editor.getByRole('button', { name: 'Save explanation edits' }).click()
    await expect(editor.getByRole('alert')).toContainText('Could not save explanation')
    await expect(editor.getByLabel('Explanation', { exact: true })).toHaveValue(edited)
    await lecturer.unroute('**/explanations/*')
    await editor.getByRole('button', { name: 'Save explanation edits' }).click()
    await editor.getByRole('button', { name: 'Approve explanation' }).click()
    for (const student of [a, b]) {
      await student.getByRole('tab', { name: 'Explanations (0)', exact: true }).click()
      await expect(student.getByText('No explanations shared yet.')).toBeVisible()
      await expect(student.getByText(edited)).toHaveCount(0)
    }
    await lecturer.route('**/explanations/*/share', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Could not share explanation. Try again.' }) }))
    await editor.getByRole('button', { name: 'Share explanation' }).click()
    await expect(editor.getByRole('alert')).toContainText('Could not share explanation')
    await expect(a.getByText('No explanations shared yet.')).toBeVisible()
    await lecturer.unroute('**/explanations/*/share')
    await editor.getByRole('button', { name: 'Share explanation' }).click()
    for (const student of [a, b]) {
      await expect(student.getByTestId('shared-explanation')).toContainText(edited)
      await expect(student.getByTestId('shared-explanation')).toContainText('Slide 1')
      await expect(student.getByTestId('slide-number')).toHaveText('Slide 2 of 2')
    }
    await a.reload()
    await a.getByRole('tab', { name: 'Explanations (1)', exact: true }).click()
    await expect(a.getByTestId('shared-explanation')).toContainText(edited)

    await a.getByRole('tab', { name: 'Ask a question', exact: true }).click()
    await expect(a.getByRole('button', { name: 'Send question', exact: true })).toBeDisabled()
    await a.getByLabel('Your anonymous question').fill('Which step uses carbon dioxide?')
    await a.getByRole('button', { name: 'Send question', exact: true }).click()
    await expect(a.getByText('Question sent anonymously for slide 2.')).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Questions (1)', exact: true }).click()
    await expect(lecturer.getByTestId('anonymous-question')).toHaveText('Which step uses carbon dioxide?')
    await expect(lecturer.getByRole('region', { name: 'Anonymous student questions' })).toContainText('Slide 2 · Current slide')
    await expect(b.getByText('Which step uses carbon dioxide?')).toHaveCount(0)
    await lecturer.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await expect(lecturer.getByRole('region', { name: 'Anonymous student questions' })).not.toContainText('Current slide')

    // An explicit manual request for an unflagged slide can fail and be retried.
    await lecturer.getByRole('tab', { name: 'Explanations', exact: true }).click()
    await lecturer.getByLabel('Explanation source slide').selectOption('1')
    await lecturer.route('**/explanations/generate', route => route.fulfill({ status: 504, contentType: 'application/json', body: JSON.stringify({ detail: 'Ollama timed out. Retry explicitly.' }) }))
    await lecturer.getByRole('button', { name: 'Generate explanation', exact: true }).click()
    await expect(lecturer.getByRole('alert')).toContainText('Ollama timed out')
    await lecturer.unroute('**/explanations/generate')
    await lecturer.getByRole('button', { name: 'Generate explanation', exact: true }).click()
    await expect(editor).toContainText('Slide 2 · Awaiting review')
    await editor.getByRole('button', { name: 'Discard explanation' }).click()
    await expect(editor).toContainText('Discarded')

    await a.setViewportSize({ width: 390, height: 844 })
    await a.getByRole('tab', { name: 'Class tools (1)', exact: true }).click()
    await a.getByRole('tab', { name: 'Ask a question', exact: true }).click()
    await a.getByLabel('Your anonymous question').fill('A draft for slide one')
    await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
    await expect(a.getByLabel('Your anonymous question')).toHaveValue('')
    await lecturer.getByRole('button', { name: 'Previous slide', exact: true }).click()
    await expect(a.getByLabel('Your anonymous question')).toHaveValue('A draft for slide one')
    await expect(lecturer.locator('.slide-image')).toBeVisible()
    await lecturer.screenshot({ path: 'test-results/m5-lecturer.png', fullPage: true })
    await a.screenshot({ path: 'test-results/m5-student-mobile.png', fullPage: true })
    const overflow = await a.evaluate(() => [...document.querySelectorAll('body *')]
      .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
      .map(element => ({ tag: element.tagName, id: element.id, width: getComputedStyle(element).width,
        box: getComputedStyle(element).boxSizing, parent: element.parentElement.className, parentWidth: getComputedStyle(element.parentElement).width })))
    expect(overflow).toEqual([])

    await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
    await lecturer.getByText('Replace material', { exact: true }).click()
    await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
    await lecturer.getByRole('button', { name: 'Upload material' }).click()
    await expect(lecturer.getByText('replacement.pdf is ready (2 slides).')).toBeVisible()
    await expect(a.getByLabel('Your anonymous question')).toHaveValue('')
    await expect(b.getByText('No explanations shared yet.')).toBeVisible()
    await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
    await expect(lecturer.getByRole('tab', { name: 'Questions (0)', exact: true })).toBeVisible()
    await expect(lecturer.getByText('No explanation for this slide yet.')).toBeVisible()
    expect(errors).toEqual([])
    await lecturer.getByRole('button', { name: 'End lecture session' }).click()
    await lecturer.getByRole('button', { name: 'Confirm end' }).click()
    completed = true
  } finally {
    finishGeneration?.()
    try {
      if (!completed && await lecturer.getByRole('button', { name: 'End lecture session' }).isVisible()) {
        await lecturer.getByRole('button', { name: 'End lecture session' }).click({ timeout: 2000 })
        await lecturer.getByRole('button', { name: 'Confirm end' }).click({ timeout: 2000 })
      }
    } finally {
      await Promise.all(contexts.map(context => context.close()))
    }
  }
})
