/**
 * humanTyping.ts
 */

export function humanDelay(): number {
  return 40 + Math.random() * 50
}

export function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

export async function humanType(
  locator: import('playwright').Locator,
  text: string,
): Promise<void> {
  console.log(`[humanType] CALLED — typing "${text.slice(0, 30)}" (${text.length} chars)`)
  
  await locator.click()
  await sleep(150)
  await locator.fill('')
  await sleep(80)

  let current = ''
  for (const char of text) {
    current += char
    await locator.fill(current)
    await sleep(humanDelay())
    process.stdout.write('.')  // visible dot per character in terminal
  }
  console.log(`\n[humanType] DONE`)
}

export async function humanTypeIntoPage(
  page: import('playwright').Page,
  text: string,
): Promise<void> {
  console.log(`[humanTypeIntoPage] CALLED — typing "${text.slice(0, 30)}"`)
  for (const char of text) {
    await page.keyboard.type(char, { delay: humanDelay() })
  }
  console.log(`[humanTypeIntoPage] DONE`)
}

export async function humanWriteFile(
  page: import('playwright').Page,
  content: string,
): Promise<void> {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    for (const char of lines[i]) {
      await page.keyboard.type(char, { delay: humanDelay() })
    }
    if (i < lines.length - 1) {
      await page.keyboard.press('Enter')
      await sleep(80 + Math.random() * 70)
    }
  }
}

export function buildVisibleCmdScript(command: string): string {
  const escaped = command
    .replace(/'/g, "''")
    .replace(/([+^%~(){}[\]])/g, '{$1}')

  const charDelay = 65
  const reviewPause = 400 + Math.floor(Math.random() * 200)

  return [
    `$wsh = New-Object -ComObject WScript.Shell`,
    `Start-Process cmd -WindowStyle Normal`,
    `Start-Sleep -Milliseconds 800`,
    `$wsh.AppActivate('cmd')`,
    `Start-Sleep -Milliseconds 300`,
    `$cmd = '${escaped}'`,
    `foreach ($char in $cmd.ToCharArray()) {`,
    `  $wsh.SendKeys($char)`,
    `  Start-Sleep -Milliseconds ${charDelay}`,
    `}`,
    `Start-Sleep -Milliseconds ${reviewPause}`,
    `$wsh.SendKeys('{ENTER}')`,
  ].join('; ')
}