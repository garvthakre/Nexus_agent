const { app, BrowserWindow, ipcMain, shell, screen } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

let mainWindow
let overlayWindow
let backendProcess

function startBackend() {
  console.log('[Electron] Starting backend server...')
  const backendPath = path.join(__dirname, '../server')

  backendProcess = spawn('npm', ['run', 'dev'], {
    cwd: backendPath,
    env: { ...process.env },
    shell: true,
    stdio: 'pipe'
  })

  backendProcess.stdout?.on('data', (data) => {
    console.log('[Backend]', data.toString().trim())
  })

  backendProcess.stderr?.on('data', (data) => {
    console.error('[Backend Error]', data.toString().trim())
  })
}

function createOverlay() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  const COLLAPSED_W = 230
  const COLLAPSED_H = 46
  const TOP_MARGIN = 20
  const LEFT_MARGIN = 24

  overlayWindow = new BrowserWindow({
    width: COLLAPSED_W,
    height: COLLAPSED_H,
    x: LEFT_MARGIN,
    y: TOP_MARGIN,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'overlayPreload.js')
    }
  })

  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'))

  // IPC handler to expand/collapse the overlay window
  ipcMain.on('overlay-set-expanded', (_, expanded) => {
    if (!overlayWindow) return
    if (expanded) {
      overlayWindow.setSize(380, 480)
      overlayWindow.show()
      overlayWindow.focus()
    } else {
      overlayWindow.setSize(COLLAPSED_W, COLLAPSED_H)
    }
  })

  overlayWindow.on('closed', () => { overlayWindow = null })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#080a0e',
    titleBarStyle: 'hiddenInset',
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  mainWindow.loadURL('http://localhost:3000')
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createOverlay()
  createWindow()
})

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

// Window controls via IPC
ipcMain.on('window-minimize', () => mainWindow?.minimize())
ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.restore()
  else mainWindow?.maximize()
})
ipcMain.on('window-close', () => app.quit())
ipcMain.on('open-external', (_, url) => shell.openExternal(url))
