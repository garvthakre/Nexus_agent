/**
 * humanTyping.ts
 */

export function humanDelay(): number {
  const base  = 40 + Math.random() * 80
  const pause = Math.random() < 0.1 ? 150 + Math.random() * 200 : 0
  return base + pause
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/**
 * Type `text` into `locator` character-by-character using page-level keyboard.
 */
export async function humanType(
  locator: import('playwright').Locator,
  text: string,
  page?: import('playwright').Page,
): Promise<void> {
  console.log(`[humanType] "${text.slice(0, 40)}"${text.length > 40 ? '...' : ''} (${text.length} chars)`)

  await locator.click()
  console.log(`[humanType DEBUG] page exists: ${!!page}, url: ${page?.url()}`)
  await sleep(150 + Math.random() * 100)

  if (page) {
    await page.keyboard.press('Control+a')
    await sleep(60)
    await page.keyboard.press('Backspace')
    await sleep(80)

    for (const char of text) {
      await page.keyboard.type(char)
      await sleep(humanDelay())
    }
  } else {
    console.warn('[humanType] No page provided — falling back to pressSequentially (uniform delay)')
    await locator.pressSequentially(text, { delay: 65 })
  }

  console.log(`[humanType] Done`)
}

/**
 * Type into the currently-focused element on the page.
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
 * Write multi-line content into the currently-focused element.
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
 * Build a PowerShell script that opens CMD visibly and runs a command.
 *
 * ROOT CAUSE OF PREVIOUS BUGS:
 *
 *   Bug 1 — "on is not recognized":
 *     The char-by-char loop sent characters before CMD was ready.
 *     CMD missed the first few chars "pyt" and only received "hon",
 *     making it run "thon" or "on" as a command.
 *
 *   Bug 2 — "thon is not recognized":
 *     Same timing issue — CMD window focus wasn't established before
 *     SendKeys started firing. The 1000ms wait wasn't enough.
 *
 *   Bug 3 — path spaces breaking the command:
 *     "python C:\Users\garv thakre\Desktop\file.py" — CMD splits on
 *     the space in "garv thakre" so python only receives "C:\Users\garv"
 *     as the file argument. Fix: wrap the path in double-quotes.
 *
 * THE FIX:
 *   1. Quote any path argument that contains spaces.
 *   2. Send the WHOLE command string in ONE SendKeys call instead of
 *      char-by-char. This is atomic — no timing/focus race condition.
 *   3. Wait 2000ms (not 1000ms) for CMD to fully open before sending.
 *   4. Use clipboard paste (Set-Clipboard + SendKeys "^v") as the
 *      most reliable way to get the full command into CMD intact.
 */
export function buildVisibleCmdScript(command: string): string {
  // Step 1: Quote any unquoted path argument that contains spaces.
  // Matches: interpreter + unquoted argument with spaces
  // e.g. python C:\Users\garv thakre\Desktop\file.py
  //   => python "C:\Users\garv thakre\Desktop\make_excel.py"
  let fixedCommand = command.replace(
    /^(\s*(?:python3?|node|code|notepad|notepad2|subl|atom|gedit|kate)\s+)([^"\n]+)$/i,
    (_, interp, filePart) => {
      const trimmed = filePart.trim()
      // Already quoted — leave alone
      if (trimmed.startsWith('"')) return `${interp}${filePart}`
      // Has spaces — must quote
      if (trimmed.includes(' ')) return `${interp}"${trimmed}"`
      return `${interp}${filePart}`
    }
  )

  // Step 2: Escape single-quotes for the outer PowerShell here-string.
  // We use Set-Clipboard with a here-string (@'...'@) which is immune
  // to ALL special characters — backslashes, quotes, spaces, everything.
  // The command is pasted into CMD via Ctrl+V, not typed char by char.
  // This completely eliminates the timing/focus race condition.

  const reviewPause = 400 + Math.floor(Math.random() * 200)

  // Use @'...'@ (PowerShell here-string) — nothing inside needs escaping.
  // Then paste into CMD with Ctrl+V via SendKeys "^v".
  const lines = [
    // Write command to clipboard using here-string (safe for all special chars)
    `Set-Clipboard -Value @'\n${fixedCommand}\n'@`,
    // Open CMD visibly
    `$wsh = New-Object -ComObject WScript.Shell`,
    `$proc = Start-Process cmd.exe -WindowStyle Normal -PassThru`,
    // Wait longer — 2000ms ensures CMD is fully ready before we send keys
    `Start-Sleep -Milliseconds 2000`,
    `$wsh.AppActivate($proc.Id)`,
    `Start-Sleep -Milliseconds 600`,
    // Paste the command from clipboard — atomic, no char-by-char timing issues
    `$wsh.SendKeys('^v')`,
    `Start-Sleep -Milliseconds ${reviewPause}`,
    `$wsh.SendKeys('{ENTER}')`,
  ]

  return lines.join('; ')
}