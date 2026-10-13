import { contextBridge, ipcRenderer } from 'electron';
import type { WindowState, ZoomTimeBridge } from './bridge.ts';

const bridge: ZoomTimeBridge = {
  getState: () => ipcRenderer.invoke('window:getState'),
  setMode: mode => ipcRenderer.invoke('window:setMode', mode),
  restore: () => ipcRenderer.invoke('window:restore'),
  close: () => ipcRenderer.invoke('window:close'),
  onState: callback => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
};
contextBridge.exposeInMainWorld('zoomtime', bridge);
