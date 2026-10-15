import { app, BrowserWindow, Menu, dialog, ipcMain, protocol, screen, session, safeStorage, clipboard, powerMonitor, shell, type IpcMainInvokeEvent } from 'electron';
import { readFileSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { setupTailscaleHost } from './tailscale.ts';
import { decodePreferences } from './preferences.ts';
import { join } from 'node:path';
import { release } from 'node:os';
import { clampBounds, defaultBounds, leaveFullScreen, changeFullScreen, type WindowMode } from './window-state.ts';
import { assetPath, CONTENT_SECURITY_POLICY, CALL_PERMISSIONS_POLICY, allowCallMedia, isTrustedIpc, isWindowMode } from './security.ts';
import { readSettings, writeSettings } from './settings.ts';
import type { WindowState } from './bridge.ts';
import { CallingService } from './calling-service.ts';

protocol.registerSchemesAsPrivileged([{ scheme: 'zoomtime', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

let restoreWindow: (() => void) | null = null;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => restoreWindow?.());
  app.whenReady().then(createWindow).catch(() => {
    dialog.showErrorBox('ZoomTime could not open', 'Please restart the app. No camera or microphone was started.');
    app.quit();
  });
}
app.on('window-all-closed', () => app.quit());
app.on('activate', () => restoreWindow?.());

async function createWindow(): Promise<void> {
  if (process.platform !== 'darwin' || Number(release().split('.')[0]) < 23) {
    dialog.showErrorBox('macOS 14 or newer required', 'This private prototype supports MacBooks running macOS Sonoma 14 or newer.');
    app.quit();
    return;
  }
  if (app.isPackaged) {
    protocol.handle('zoomtime', request => {
      const relative = assetPath(request.url);
      if (!relative) return new Response('Not found', { status: 404 });
      try {
        const mime = relative.endsWith('.html') ? 'text/html' : relative.endsWith('.css') ? 'text/css' : 'text/javascript';
        return new Response(new Uint8Array(readFileSync(join(app.getAppPath(), '.webpack', 'renderer', relative))),
          { headers: { 'Content-Type': `${mime}; charset=utf-8`, 'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'Permissions-Policy': CALL_PERMISSIONS_POLICY } });
      } catch { return new Response('Not found', { status: 404 }); }
    });
  }
  const entry = app.isPackaged ? 'zoomtime://app/main_window/index.html' : MAIN_WINDOW_WEBPACK_ENTRY;
  const settingsFile = join(app.getPath('userData'), 'window-bounds.json');
  const loaded = readSettings(settingsFile);
  const remembered = loaded.bounds;
  let preferences = loaded.preferences;
  let preferencesError = loaded.error;
  let mode: WindowMode = 'normal';
  let switching = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  const areas = () => [screen.getPrimaryDisplay(), ...screen.getAllDisplays().filter(d => d.id !== screen.getPrimaryDisplay().id)].map(d => d.workArea);
  const bounds = clampBounds(remembered.normal ?? defaultBounds('normal', screen.getPrimaryDisplay().workArea), areas(), 'normal');
  const window = new BrowserWindow({ ...bounds, minWidth: 640, minHeight: 420, show: false,
    title: 'ZoomTime', titleBarStyle: 'hiddenInset', backgroundColor: '#17191e',
    fullscreenable: true, autoHideMenuBar: true,
    webPreferences: { preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, nodeIntegration: false,
      contextIsolation: true, sandbox: true, webSecurity: true, webviewTag: false,
      backgroundThrottling: false, devTools: !app.isPackaged },
  });
  remembered.normal ??= bounds;
  const state = (): WindowState => ({ mode, bounds: window.getBounds(), preferencesError, preferences, fullScreen: window.isFullScreen(), minimized: window.isMinimized() });
  const publish = () => { if (!window.isDestroyed()) window.webContents.send('window:state', state()); };
  const save = () => {
    clearTimeout(saveTimer);
    const failed = !writeSettings(settingsFile, remembered, preferences);
    if (preferencesError !== failed) { preferencesError = failed; publish(); }
  };
  const captureBounds = () => {
    if (switching || window.isDestroyed() || window.isFullScreen() || window.isMaximized() || window.isMinimized()) return;
    remembered[mode] = window.getBounds();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 250);
    publish();
  };
  const setMode = async (next: WindowMode): Promise<WindowState> => {
    if (next === mode) return state();
    if (next === 'mini') calling.endDeviceCheck('Device check stopped for mini mode.');
    if (!window.isFullScreen() && !window.isMaximized()) remembered[mode] = window.getBounds();
    switching = true;
    try {
      await leaveFullScreen(window);
      if (window.isMaximized()) window.unmaximize();
      const currentDisplay = screen.getDisplayMatching(window.getBounds());
      mode = next;
      window.setMinimumSize(mode === 'mini' ? 160 : 640, mode === 'mini' ? 90 : 420);
      window.setWindowButtonVisibility(mode === 'normal');
      window.setFullScreenable(mode === 'normal');
      window.setBounds(clampBounds(remembered[mode] ?? defaultBounds(mode, currentDisplay.workArea), areas(), mode));
      window.setAlwaysOnTop(mode === 'mini', 'floating');
      window.setVisibleOnAllWorkspaces(mode === 'mini', { visibleOnFullScreen: mode === 'mini' });
      remembered[mode] = window.getBounds();
      save();
      publish();
      return state();
    } finally { switching = false; }
  };
  let windowQueue: Promise<unknown> = Promise.resolve();
  const queueWindow = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = windowQueue.then(operation); windowQueue = result.catch(() => {}); return result;
  };
  const windowError = () => dialog.showErrorBox("Window could not change", "Use Control–Command–F to leave full screen, then retry.");
  const restore = async () => {
    await leaveFullScreen(window);
    await setMode('normal');
    if (window.isMinimized()) window.restore();
    window.show(); window.focus();
    return state();
  };
  const minimize = async () => { await leaveFullScreen(window); window.minimize(); };
  restoreWindow = () => { if (!window.isDestroyed()) void queueWindow(restore).catch(windowError); };
  const authorize = (event: IpcMainInvokeEvent) => {
    if (event.sender !== window.webContents || !isTrustedIpc(event.senderFrame?.url ?? '', entry,
      event.senderFrame === window.webContents.mainFrame)) throw new Error('Unauthorized window request');
  };
  const calling = new CallingService(join(app.getPath('userData'), 'pairing.bin'), safeStorage, event => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send('call:event', event);
  });
  const exec = promisify(execFile);
  let setupPending = false;
  const tailscaleCommand = async (args: string[]): Promise<string> => {
    const cli = ['/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'].find(existsSync);
    if (!cli) throw new Error('Install Tailscale in Applications, then retry. Both Macs need Tailscale.');
    try { return (await exec(cli, args, { timeout: 20_000, maxBuffer: 1_048_576, encoding: 'utf8' })).stdout; }
    catch { throw new Error('Tailscale could not complete setup. Open Tailscale, connect and sign in, then retry. Check HTTPS certificates are enabled if hosting.'); }
  };
  const connectTailscale = async (): Promise<void> => {
    const path = '/Applications/Tailscale.app';
    if (!existsSync(path)) throw new Error('Install Tailscale in Applications first. Sign in with your own account on each Mac.');
    const opened = await shell.openPath(path);
    if (opened) throw new Error('Tailscale could not open. Open it from Applications and retry.');
    let status: { BackendState?: string; Self?: { Online?: boolean } } = {};
    for (let attempt = 0; attempt < 8; attempt++) {
      status = JSON.parse(await tailscaleCommand(['status', '--json']));
      if (status.BackendState === 'Running' && status.Self?.Online) return;
      if (status.BackendState === 'Stopped') { await tailscaleCommand(['up', '--timeout=15s']); continue; }
      await delay(500);
    }
    throw new Error('Finish signing in or approving the VPN in Tailscale, then retry here.');
  };
  ipcMain.handle('pairing:auto-host', async event => {
    authorize(event);
    if (setupPending || calling.state.role || calling.state.error) throw new Error('Reset existing pairing before setting up a host.');
    setupPending = true;
    try {
      await connectTailscale();
      const endpoint = await setupTailscaleHost(tailscaleCommand);
      if (window.isDestroyed()) return;
      await calling.createHost(endpoint);
    } finally { setupPending = false; }
  });
  ipcMain.handle('preferences:set', (event, value: unknown) => {
    authorize(event);
    const decoded = decodePreferences(value);
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 4 || Object.entries(decoded).some(([key, item]) => (value as Record<string, unknown>)[key] !== item)) throw new Error('Invalid camera preferences.');
    preferences = decoded; save(); publish(); return state();
  });
  ipcMain.handle('call:state', event => { authorize(event); return calling.state; });
  ipcMain.handle('pairing:host', async (event, endpoint: unknown) => { authorize(event); if (setupPending) throw new Error('Wait for host setup to finish.'); await calling.createHost(endpoint); });
  ipcMain.handle('pairing:copy', async event => { authorize(event); await clipboard.writeText(calling.invitation()); });
  ipcMain.handle('pairing:import', async event => { authorize(event); if (setupPending) throw new Error('Wait for host setup to finish.'); await connectTailscale(); await calling.importInvitation(await clipboard.readText()); });
  ipcMain.handle('pairing:reset', async event => { authorize(event); if (setupPending) throw new Error('Wait for host setup to finish.'); await calling.reset(); });
  ipcMain.handle('call:retry', async event => { authorize(event); if (setupPending) throw new Error('Wait for host setup to finish.'); await calling.retry(); });
  ipcMain.handle('check:authorize', event => { authorize(event); calling.authorizeDeviceCheck(); });
  ipcMain.handle('check:release', event => { authorize(event); calling.releaseDeviceCheck(); });
  ipcMain.handle('call:authorize', (event, action: unknown) => { authorize(event); calling.authorizeCapture(action); });
  ipcMain.handle('call:release', event => { authorize(event); calling.releaseCapture(); });
  ipcMain.handle('call:send', (event, value: unknown) => { authorize(event); calling.send(value); });
  ipcMain.handle('window:getState', event => { authorize(event); return state(); });
  ipcMain.handle('window:setMode', (event, next: unknown) => {
    authorize(event);
    if (!isWindowMode(next)) throw new Error('Unsupported window mode');
    return queueWindow(() => setMode(next));
  });
  ipcMain.handle('window:restore', event => { authorize(event); return queueWindow(restore); });
  ipcMain.handle('window:minimize', event => { authorize(event); return queueWindow(minimize); });
  ipcMain.handle('window:fullScreen', (event, enabled: unknown) => {
    authorize(event);
    if (typeof enabled !== 'boolean') throw new Error('Invalid full-screen request.');
    return queueWindow(async () => {
      if (!enabled) await leaveFullScreen(window);
      else if (mode === 'normal') await changeFullScreen(window, true);
      return state();
    });
  });
  ipcMain.handle('window:close', event => { authorize(event); window.close(); });

  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const types = 'mediaTypes' in details ? details.mediaTypes ?? [] : [];
    callback(contents === window.webContents && allowCallMedia(permission, details.requestingUrl, entry, details.isMainFrame, (calling.captureAllowed || calling.deviceCheckAllowed), types));
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    contents === window.webContents && allowCallMedia(permission, details.requestingUrl ?? '', entry, details.isMainFrame, (calling.captureAllowed || calling.deviceCheckAllowed), details.mediaType ? [details.mediaType] : []));
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
  session.defaultSession.setDevicePermissionHandler(() => false);
  session.defaultSession.on('will-download', event => event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const permitted = app.isPackaged ? assetPath(details.url) !== null : new URL(details.url).origin === new URL(entry).origin;
    callback({ cancel: !permitted });
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('did-start-loading', () => { if (calling.state.call || calling.captureAllowed || calling.deviceCheckAllowed) calling.interrupt('App view reloaded. Start a new call explicitly.'); });
  window.webContents.on('render-process-gone', () => { void calling.shutdown(); app.quit(); });
  window.webContents.on('did-fail-load', (_event, _code, _description, _url, isMainFrame) => {
    if (isMainFrame) { dialog.showErrorBox('Window test could not load', 'Restart ZoomTime or rebuild the package.'); app.quit(); }
  });
  window.on('minimize', publish);
  window.on('restore', publish);
  window.on('enter-full-screen', publish);
  window.on('leave-full-screen', publish);
  window.on('move', captureBounds);
  window.on('resize', captureBounds);
  window.on('close', () => { calling.interrupt('App closed'); void calling.shutdown(); if (!window.isFullScreen() && !window.isMaximized()) remembered[mode] = window.getBounds(); save(); });
  app.on('before-quit', () => { void calling.shutdown(); });
  powerMonitor.on('suspend', () => calling.interrupt('Mac went to sleep. Start a new call after waking.'));
  powerMonitor.on('resume', () => calling.interrupt('Mac woke up. Start a new call when ready.'));
  window.on('closed', () => { clearTimeout(saveTimer); restoreWindow = null; });
  const recoverDisplay = () => {
    if (window.isDestroyed()) return;
    window.setBounds(clampBounds(window.getBounds(), areas(), mode));
  };
  screen.on('display-removed', recoverDisplay);
  screen.on('display-metrics-changed', recoverDisplay);
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ZoomTime', submenu: [{ label: 'Settings…', accelerator: 'CommandOrControl+,', click: () => { void queueWindow(restore).then(() => window.webContents.send('settings:open')).catch(windowError); } }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'Window', submenu: [
      { label: 'Toggle mini mode', accelerator: 'CommandOrControl+Shift+M', click: () => { void queueWindow(() => setMode(mode === 'normal' ? 'mini' : 'normal')).catch(windowError); } },
      { label: 'Restore normal window', accelerator: 'CommandOrControl+Shift+R', click: () => restoreWindow?.() },
      { label: 'Minimize', accelerator: 'CommandOrControl+M', click: () => { void queueWindow(minimize).catch(windowError); } },
      { label: 'Enter / Exit Full Screen', accelerator: 'Control+Command+F', click: () => { if (mode === 'normal') void queueWindow(() => changeFullScreen(window, !window.isFullScreen())).catch(windowError); } },
      { role: 'close' },
    ] },
  ]));
  window.once('ready-to-show', () => window.show());
  await window.loadURL(entry);
  await calling.initialize();
}
