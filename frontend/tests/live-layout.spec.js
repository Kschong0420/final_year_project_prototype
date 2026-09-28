import { test, expect } from '@playwright/test'
import { sourcePdf } from './slide-fixture'

async function insideViewport(page, locator) {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  const size = page.viewportSize()
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(size.height)
  expect(box.x + box.width).toBeLessThanOrEqual(size.width)
}

async function reachableInTask(page, locator) {
  await locator.scrollIntoViewIfNeeded()
  await insideViewport(page, locator)
  const task = await page.locator('.workspace-tools').boundingBox()
  const button = await locator.boundingBox()
  expect(button.y).toBeGreaterThanOrEqual(task.y)
  expect(button.y + button.height).toBeLessThanOrEqual(task.y + task.height)
  // An overlay or a clipping ancestor must not obscure the actual action.
  expect(await locator.evaluate(el => {
    const r = el.getBoundingClientRect()
    return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
  })).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
}

for (const width of [1366, 1024]) {
  test(`live laptop workspace keeps navigation, feedback and tasks usable at ${width}x768`, async ({ browser }, testInfo) => {
    test.skip(process.env.CLASSROOM_FAKE_OLLAMA !== '1', 'Requires explicit fake Ollama fixture')
    const context = await browser.newContext({ viewport: { width, height: 768 } })
    const studentContext = await browser.newContext()
    const lecturer = await context.newPage()
    const student = await studentContext.newPage()
    const errors = []
    lecturer.on('pageerror', error => errors.push(error.message))
    await lecturer.addInitScript(() => {
      const NativeSocket = window.WebSocket
      window.classroomSockets = []
      window.WebSocket = class extends NativeSocket {
        constructor(...args) { super(...args); if (this.url.includes('/ws/sessions/')) window.classroomSockets.push(this) }
      }
    })
    try {
      await lecturer.goto('/')
      await lecturer.getByRole('button', { name: 'Create lecture session' }).click()
      const code = await lecturer.getByTestId('session-code').textContent()
      await lecturer.getByLabel('Lecture file').setInputFiles({ name: 'layout.pdf', mimeType: 'application/pdf', buffer: sourcePdf() })
      await lecturer.getByRole('button', { name: 'Upload material', exact: true }).click()
      await expect(lecturer.getByText('layout.pdf is ready (2 slides).')).toBeVisible()
      const workspaceTabs = lecturer.getByRole('tablist', { name: 'Lecturer workspace' })
      const sidebarTitle = lecturer.locator('.main-workspace-tabs .stage-rail-title')
      const descriptions = workspaceTabs.locator('.stage-copy small')
      const navHeights = () => workspaceTabs.getByRole('tab').evaluateAll(tabs =>
        tabs.map(tab => Math.round(tab.getBoundingClientRect().height)))
      const prepareNavHeights = await navHeights()
      for (const area of ['Live class', 'Results', 'Prepare']) {
        await workspaceTabs.getByRole('tab', { name: area, exact: true }).click()
        expect(await navHeights(), `${area} navigation at ${width}px`).toEqual(prepareNavHeights)
        if (width > 1120) {
          await expect(sidebarTitle).toBeVisible()
          await expect(descriptions).toHaveCount(3)
          for (const description of await descriptions.all()) await expect(description).toBeVisible()
        } else {
          await expect(sidebarTitle).toBeHidden()
          for (const description of await descriptions.all()) await expect(description).toBeHidden()
        }
      }
      await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).click()
      const question = lecturer.locator('[data-testid="review-question"]:visible')
      await question.getByRole('button', { name: 'Approve', exact: true }).click()
      await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
      await student.goto('/')
      await student.getByLabel('Session code').fill(code)
      await student.getByRole('button', { name: 'Join lecture session' }).click()
      await student.getByRole('button', { name: 'Not Understand', exact: true }).click()
      await expect(lecturer.getByTestId('feedback-total')).toHaveText('1 response submitted')

      await lecturer.screenshot({ path: testInfo.outputPath('live-initial.png'), fullPage: true })
      const initial = await lecturer.evaluate(() => {
        const rect = selector => {
          const el = document.querySelector(selector), r = el.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, height: r.height, content: el.scrollHeight }
        }
        return { width: innerWidth, documentHeight: document.documentElement.scrollHeight,
          tools: rect('.workspace-tools'), feedback: rect('.live-feedback'), navigation: rect('[aria-label="Slide controls"]') }
      })
      await testInfo.attach('layout-measurements', { body: JSON.stringify(initial, null, 2), contentType: 'application/json' })
      console.log('Live layout:', JSON.stringify(initial))
      await insideViewport(lecturer, lecturer.getByRole('button', { name: 'Next slide', exact: true }))
      for (const id of ['understand-count', 'not-understand-count', 'feedback-total', 'confusion-status']) {
        await insideViewport(lecturer, lecturer.getByTestId(id))
      }
      expect(initial.documentHeight).toBe(768)
      expect(initial.tools.height).toBeGreaterThanOrEqual(320)
      await lecturer.getByText('Feedback details', { exact: true }).click()
      await expect(lecturer.getByText(/Flagged when at least 2 students respond and Not Understand reaches 50%/)).toBeVisible()
      await lecturer.getByText('Feedback details', { exact: true }).press('Escape')
      await expect(lecturer.locator('.feedback-details')).not.toHaveAttribute('open')
      await insideViewport(lecturer, lecturer.getByRole('button', { name: 'Release activity', exact: true }))
      await reachableInTask(lecturer, lecturer.getByRole('button', { name: 'Release activity', exact: true }))

      // Local task/source changes and unsaved edits must not move the class or replace the viewer/socket.
      await lecturer.locator('.slide-viewer').evaluate(el => { window.originalViewer = el })
      await lecturer.getByRole('button', { name: 'Review / edit', exact: true }).click()
      const longPrompt = 'Explain how chlorophyll absorbs light during photosynthesis. '.repeat(8)
      await question.getByLabel('Question', { exact: true }).fill(longPrompt)
      await lecturer.getByRole('tab', { name: 'Explanations', exact: true }).click()
      await lecturer.getByRole('button', { name: 'Generate explanation', exact: true }).click()
      const explanation = lecturer.locator('[data-testid="explanation-review"]:visible')
      await expect(explanation).toBeVisible()
      const longExplanation = 'Plants use photosynthesis to convert light energy into chemical energy.\n'.repeat(30)
      await explanation.getByLabel('Explanation', { exact: true }).fill(longExplanation)
      await lecturer.getByRole('tab', { name: 'Questions (0)', exact: true }).click()
      await lecturer.getByRole('tab', { name: 'Prepare', exact: true }).click()
      await lecturer.getByRole('tab', { name: 'Live class', exact: true }).click()
      await lecturer.getByRole('tab', { name: 'Activities & review', exact: true }).click()
      await lecturer.getByLabel('Question tools', { exact: true }).selectOption('review')
      await expect(question.getByLabel('Question', { exact: true })).toHaveValue(longPrompt)
      await reachableInTask(lecturer, question.getByRole('button', { name: 'Save edits', exact: true }))
      await question.getByRole('button', { name: 'Save edits', exact: true }).click()
      await question.getByRole('button', { name: 'Approve', exact: true }).click()
      await lecturer.getByLabel('Question tools', { exact: true }).selectOption('activities')
      await reachableInTask(lecturer, lecturer.getByRole('button', { name: 'Release activity', exact: true }))
      // Expanded list and long text share the task scroller; there is no capped inner question list.
      await lecturer.getByRole('button', { name: 'Release activity', exact: true }).click()
      await expect(student.getByTestId('student-activity')).toHaveCount(1)
      await lecturer.getByRole('tab', { name: 'Explanations', exact: true }).click()
      await expect(explanation.getByLabel('Explanation', { exact: true })).toHaveValue(longExplanation)
      await reachableInTask(lecturer, explanation.getByRole('button', { name: 'Save explanation edits' }))
      await explanation.getByRole('button', { name: 'Save explanation edits' }).click()
      await reachableInTask(lecturer, explanation.getByRole('button', { name: 'Approve explanation' }))
      await explanation.getByRole('button', { name: 'Approve explanation' }).click()
      await reachableInTask(lecturer, explanation.getByRole('button', { name: 'Share explanation' }))
      await explanation.getByRole('button', { name: 'Share explanation' }).click()
      await student.getByRole('tab', { name: 'Explanations (1)', exact: true }).click()
      await expect(student.getByTestId('shared-explanation')).toContainText('Plants use photosynthesis')
      await lecturer.screenshot({ path: testInfo.outputPath('explanation-actions.png'), fullPage: true })
      expect(await lecturer.evaluate(() => document.querySelector('.slide-viewer') === window.originalViewer)).toBe(true)
      expect(await lecturer.evaluate(() => window.classroomSockets.filter(socket => socket.readyState === WebSocket.OPEN).length)).toBe(1)
      await expect(lecturer.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
      await lecturer.getByLabel('Explanation source slide').selectOption('1')
      await expect(student.getByTestId('slide-number')).toHaveText('Slide 1 of 2')
      await lecturer.getByRole('button', { name: 'Next slide', exact: true }).click()
      await expect(student.getByTestId('slide-number')).toHaveText('Slide 2 of 2')

      // A resized laptop and mobile layout must still expose every action without horizontal overflow.
      await lecturer.setViewportSize({ width, height: 640 })
      await insideViewport(lecturer, lecturer.getByRole('button', { name: 'Previous slide', exact: true }))
      await insideViewport(lecturer, lecturer.getByTestId('feedback-total'))
      for (const mobileWidth of [390, 320]) {
        await lecturer.setViewportSize({ width: mobileWidth, height: 844 })
        await expect(lecturer.getByRole('tab', { name: 'Questions (0)', exact: true })).toBeVisible()
        await lecturer.getByRole('tab', { name: 'Activities & review', exact: true }).click()
        await lecturer.getByLabel('Question tools', { exact: true }).selectOption('generate')
        await lecturer.getByRole('button', { name: 'Generate questions', exact: true }).scrollIntoViewIfNeeded()
        await lecturer.screenshot({ path: testInfo.outputPath(`lecturer-mobile-${mobileWidth}.png`), fullPage: true })
        const overflow = await lecturer.evaluate(() => [...document.querySelectorAll('body *')]
          .filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width > 0)
          .map(el => ({ tag: el.tagName, class: el.className, width: el.getBoundingClientRect().width })))
        if (overflow.length) console.log('Mobile overflow:', mobileWidth, overflow)
        expect(await lecturer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      }
      await lecturer.screenshot({ path: testInfo.outputPath('lecturer-mobile.png'), fullPage: true })
      expect(errors).toEqual([])
    } finally {
      try {
        if (await lecturer.getByRole('button', { name: 'End lecture session', exact: true }).isEnabled()) {
          await lecturer.getByRole('button', { name: 'End lecture session', exact: true }).click()
          await lecturer.getByRole('button', { name: 'Confirm end', exact: true }).click()
          await expect(lecturer.getByTestId('connection-status')).toHaveText('Connection: ended')
        }
      } finally { await Promise.all([context.close(), studentContext.close()]) }
    }
  })
}
