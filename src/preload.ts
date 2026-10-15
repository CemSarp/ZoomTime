import { contextBridge, ipcRenderer } from 'electron';
import type { WindowState, ZoomTimeBridge } from './bridge.ts';
import type { CallingEvent } from './calling-service.ts';

const bridge: ZoomTimeBridge = {
  getState: () => ipcRenderer.invoke('window:getState'),
  setMode: mode => ipcRenderer.invoke('window:setMode', mode),
  setPreferences: preferences => ipcRenderer.invoke('preferences:set', preferences),
  setupHost: () => ipcRenderer.invoke('pairing:auto-host'),
  setFullScreen: enabled => ipcRenderer.invoke('window:fullScreen', enabled),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  restore: () => ipcRenderer.invoke('window:restore'),
  close: () => ipcRenderer.invoke('window:close'),
  getCallingState: () => ipcRenderer.invoke('call:state'),
  createHost: endpoint => ipcRenderer.invoke('pairing:host', endpoint),
  copyInvitation: () => ipcRenderer.invoke('pairing:copy'),
  importInvitation: () => ipcRenderer.invoke('pairing:import'),
  resetPairing: () => ipcRenderer.invoke('pairing:reset'),
  retryConnection: () => ipcRenderer.invoke('call:retry'),
  authorizeCapture: action => ipcRenderer.invoke('call:authorize', action),
  releaseCapture: () => ipcRenderer.invoke('call:release'),
  sendSignal: message => ipcRenderer.invoke('call:send', message),
  onCallEvent: callback => {
    const handler = (_event: Electron.IpcRendererEvent, event: CallingEvent) => callback(event);
    ipcRenderer.on('call:event', handler);
    return () => ipcRenderer.removeListener('call:event', handler);
  },
  onSettings: callback => {
    const handler = () => callback();
    ipcRenderer.on('settings:open', handler);
    return () => ipcRenderer.removeListener('settings:open', handler);
  },
  onState: callback => {
    const handler = (_event: Electron.IpcRendererEvent, state: WindowState) => callback(state);
    ipcRenderer.on('window:state', handler);
    return () => ipcRenderer.removeListener('window:state', handler);
  },
};
contextBridge.exposeInMainWorld('zoomtime', bridge);
