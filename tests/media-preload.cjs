const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('harness', {
  send: message => ipcRenderer.invoke('harness:send', message),
  authorize: action => ipcRenderer.invoke('harness:authorize', action),
  release: () => ipcRenderer.invoke('harness:release'),
  event: callback => ipcRenderer.on('harness:event', (_event, message) => callback(message)),
  result: result => ipcRenderer.send('harness:result', result),
});
