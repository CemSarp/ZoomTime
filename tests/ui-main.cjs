const { app, BrowserWindow, protocol, session, ipcMain, nativeTheme } = require('electron');
const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { join, basename } = require('node:path');
const assert = require('node:assert/strict');
assert.ok(app.commandLine.hasSwitch('use-fake-device-for-media-stream'), 'UI tests must use generated devices');
const root = process.cwd(), output = join(root, 'out/ui-tests'), entry = 'zoomtime://app/index.html';
protocol.registerSchemesAsPrivileged([{ scheme: 'zoomtime', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window;
app.whenReady().then(async () => {
  const { allowCallMedia, CONTENT_SECURITY_POLICY, CALL_PERMISSIONS_POLICY } = await import(join(root, 'src/security.ts'));
  protocol.handle('zoomtime', request => {
    const url = new URL(request.url), asset = basename(url.pathname);
    if (url.protocol !== 'zoomtime:' || url.hostname !== 'app' || !/^(index\.html|index\.css|[\w.-]+\.js)$/.test(asset) || !existsSync(join(output, asset))) return new Response('', { status: 404 });
    return new Response(readFileSync(join(output, asset)), { headers: { 'Content-Type': asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css' : 'text/javascript', 'Content-Security-Policy': CONTENT_SECURITY_POLICY, 'Permissions-Policy': CALL_PERMISSIONS_POLICY } });
  });
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => allowCallMedia(permission, details.requestingUrl ?? '', entry, details.isMainFrame, contents === window?.webContents, details.mediaType ? [details.mediaType] : []));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => callback(allowCallMedia(permission, details.requestingUrl, entry, details.isMainFrame, contents === window?.webContents, details.mediaTypes ?? [])));
  const trusted = event => { assert.equal(event.sender, window.webContents); assert.equal(event.senderFrame, window.webContents.mainFrame); assert.equal(event.senderFrame.url, entry); };
  ipcMain.handle('ui:resize', (event, width, height) => { trusted(event); assert.ok([160, 320, 640, 900].includes(width) && [90, 180, 420, 700].includes(height)); window.setContentSize(width, height); });
  ipcMain.handle('ui:theme', (event, value) => { trusted(event); assert.ok(['light', 'dark'].includes(value)); nativeTheme.themeSource = value; });
  ipcMain.handle('ui:snapshot', async (event, name) => { trusted(event); assert.match(name, /^[a-z0-9-]+$/); writeFileSync(join(output, `${name}.png`), (await window.capturePage()).toPNG()); });
  ipcMain.on('ui:result', (event, result) => { trusted(event); writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result, null, 2)); app.exit(result.ok ? 0 : 1); });
  window = new BrowserWindow({ width: 900, height: 700, useContentSize: true, show: true, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, preload: join(root, 'tests/ui-preload.cjs') } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  await window.loadURL(entry);
}).catch(error => { console.error(error); app.exit(1); });
