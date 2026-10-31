const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('overlayAPI', {
  setExpanded: (expanded) => ipcRenderer.send('overlay-set-expanded', expanded),
  sendPrompt: (prompt) => ipcRenderer.send('overlay-execute-prompt', prompt),
  closeApp: () => ipcRenderer.send('window-close')
})
