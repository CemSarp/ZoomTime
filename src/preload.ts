import { contextBridge, ipcRenderer } from 'electron';
import type { WindowState, ZoomTimeBridge } from './bridge.ts';
import type { UpdateState } from './updates.ts';
import type { CallingEvent } from './calling-service.ts';
import type { ScreenCaptureState } from './screen-capture.ts';

const bridge: ZoomTimeBridge = {
  getScreenCaptureState: () => ipcRenderer.invoke('screen:state'),
  openScreenCaptureSettings: () => ipcRenderer.invoke('screen:settings'),
  discoverScreenSources: request => ipcRenderer.invoke('screen:discover', request),
  startScreenCapture: selection => ipcRenderer.invoke('screen:start', selection),
  stopScreenCapture: () => ipcRenderer.invoke('screen:stop'),
  revealScreenCapture: () => ipcRenderer.invoke('screen:reveal'),
  onScreenCaptureState: callback => {
    const handler = (_event: Electron.IpcRendererEvent, state: ScreenCaptureState) => callback(state);
    ipcRenderer.on('screen:state', handler);
    return () => ipcRenderer.removeListener('screen:state', handler);
  },
  getUpdateState: () => ipcRenderer.invoke('updates:state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  downloadUpdate: () => ipcRenderer.invoke('updates:download'),
  revealUpdate: () => ipcRenderer.invoke('updates:reveal'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateState: callback => {
    const handler = (_event: Electron.IpcRendererEvent, state: UpdateState) => callback(state);
    ipcRenderer.on('updates:state', handler);
    return () => ipcRenderer.removeListener('updates:state', handler);
  },
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
  authorizeDeviceCheck: () => ipcRenderer.invoke('check:authorize'),
  releaseDeviceCheck: () => ipcRenderer.invoke('check:release'),
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
