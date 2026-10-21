const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('uiHarness', {
  resize: (width, height) => ipcRenderer.invoke('ui:resize', width, height),
  snapshot: name => ipcRenderer.invoke('ui:snapshot', name),
  theme: value => ipcRenderer.invoke('ui:theme', value),
  result: value => ipcRenderer.send('ui:result', value),
});
