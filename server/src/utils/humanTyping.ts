/**
 * humanTyping.ts
 */

export function humanDelay(): number {
  const base  = 40 + Math.random() * 80
  // ~10% chance of a micro-pause (simulates thinking between words)
  const pause = Math.random() < 0.1 ? 150 + Math.random() * 200 : 0
  return base + pause
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Type `text` into `locator` character-by-character using page-level keyboard.
 *
 * IMPORTANT: `page` is required for correct behaviour. Without it we fall back
 * to pressSequentially (still fires keyboard events, but fixed delay).
 *
 * @param locator  Playwright Locator pointing at the target input element
 * @param text     The text to type
 * @param page     The Playwright Page (REQUIRED for search bars / native inputs)
 */
export async function humanType(
  locator: import('playwright').Locator,
  text: string,
  page?: import('playwright').Page,
): Promise<void> {
  console.log(`[humanType] "${text.slice(0, 40)}"${text.length > 40 ? '...' : ''} (${text.length} chars)`)

  // 1. Click to focus — establishes OS-level focus on the element
  await locator.click()
  console.log(`[humanType DEBUG] page exists: ${!!page}, url: ${page?.url()}`)
  await sleep(150 + Math.random() * 100)

  if (page) {
    // 2. Clear via page.keyboard — routes through OS pipeline, not DOM dispatch
    await page.keyboard.press('Control+a')
    await sleep(60)
    await page.keyboard.press('Backspace')
    await sleep(80)

    // 3. Type each character through OS pipeline with per-char random delay
    for (const char of text) {
      await page.keyboard.type(char)
      await sleep(humanDelay())
    }
  } else {
    // Fallback when no page reference available — still better than fill()
    // pressSequentially fires real keyboard events, just uniform delay
    console.warn('[humanType] No page provided — falling back to pressSequentially (uniform delay)')
    await locator.pressSequentially(text, { delay: 65 })
  }

  console.log(`[humanType] Done`)
}

/**
 * Type into the currently-focused element on the page.
 * Used when there is no locator (e.g. contenteditable, typeText capability).
 */
export async function humanTypeIntoPage(
  page: import('playwright').Page,
  text: string,
): Promise<void> {
  console.log(`[humanTypeIntoPage] "${text.slice(0, 40)}" (${text.length} chars)`)

  for (const char of text) {
    await page.keyboard.type(char)
    await sleep(humanDelay())
  }

  console.log(`[humanTypeIntoPage] Done`)
}

/**
 * Write multi-line content into the currently-focused element (e.g. a text editor).
 * Splits on newlines and presses Enter between lines.
 */
export async function humanWriteFile(
  page: import('playwright').Page,
  content: string,
): Promise<void> {
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    for (const char of lines[i]) {
      await page.keyboard.type(char)
      await sleep(humanDelay())
    }
    if (i < lines.length - 1) {
      await page.keyboard.press('Enter')
      await sleep(80 + Math.random() * 70)
    }
  }
}

/**
 * Build a PowerShell one-liner that opens CMD visibly and types a command
 * character-by-character using WScript.Shell.SendKeys.
 */
export function buildVisibleCmdScript(command: string): string {
  const psEscaped       = command.replace(/'/g, "''")
  const sendKeysEscaped = psEscaped.replace(/([+^%~(){}[\]])/g, '{$1}')
  const charDelay       = 65
  const reviewPause     = 400 + Math.floor(Math.random() * 200)

  const lines = [
    `$wsh = New-Object -ComObject WScript.Shell`,
    `$proc = Start-Process cmd.exe -WindowStyle Normal -PassThru`,
    `Start-Sleep -Milliseconds 1000`,
    `$wsh.AppActivate($proc.Id)`,
    `Start-Sleep -Milliseconds 400`,
    `$cmd = '${sendKeysEscaped}'`,
    `foreach ($char in $cmd.ToCharArray()) { $wsh.SendKeys($char); Start-Sleep -Milliseconds ${charDelay} }`,
    `Start-Sleep -Milliseconds ${reviewPause}`,
    `$wsh.SendKeys('{ENTER}')`,
  ]

  return lines.join('; ')
}