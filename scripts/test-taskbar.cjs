/* eslint-disable @typescript-eslint/no-require-imports */
// Run with: npm run test:taskbar (Windows only; creates no visible window).
const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setAppPath(path.resolve(__dirname, '..'));
app.setPath('userData', path.resolve(__dirname, '../node_modules/.cache/taskbar-smoke'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  if (process.platform !== 'win32') { console.log('Windows taskbar smoke test skipped'); app.quit(); return; }
  const ffi = require('koffi');
  const { setupTaskbarArtwork } = require('../dist-electron/main/taskbar-windows');
  const user = ffi.load('user32.dll');
  const post = user.func('int __stdcall PostMessageW(void *window, uint32_t message, uintptr_t wparam, intptr_t lparam)');
  const resources = user.func('uint32_t __stdcall GetGuiResources(void *process, uint32_t flags)');
  const kernel = ffi.load('kernel32.dll');
  const processHandle = kernel.func('void * __stdcall GetCurrentProcess()')();
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args); warn(...args); };
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    const artwork = setupTaskbarArtwork(window, 'http://127.0.0.1:3457');
    assert.ok(artwork, 'Native artwork bridge must load');
    const hwnd = ffi.decode(window.getNativeWindowHandle(), 'void *');
    await new Promise(resolve => setTimeout(resolve, 500));
    const baseline = resources(processHandle, 0);
    console.log('Native bridge ready; sending thumbnail requests');
    const parameter = Buffer.alloc(8);
    parameter.writeUInt32LE((240 << 16) | 180);
    let rejected = 0;
    for (let i = 0; i < 50; i++) {
      try { artwork.paint(parameter); }
      catch (error) {
        // This hidden-window test can return E_INVALIDARG rather than accepting
        // a thumbnail. Still exercise bitmap creation, copy and finally/DeleteObject.
        if (error.message !== 'DwmSetIconicThumbnail failed: -2147024809') throw error;
        rejected++;
      }
    }
    assert.ok(resources(processHandle, 0) <= baseline + 2, 'GDI bitmaps must be released');
    post(hwnd, 0x0323, 0, (240 << 16) | 180);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.ok(warnings.every(args => args[1]?.message === 'DwmSetIconicThumbnail failed: -2147024809'), 'No unexpected native failures');
    artwork.dispose();
    console.log(`PASS: Native bridge, asynchronous window hook and 50 bitmap lifecycles without GDI leaks. DWM returned E_INVALIDARG for ${rejected} hidden-window submissions; actual hover rendering requires manual verification.`);
  } finally { window.destroy(); app.quit(); }
}).catch(error => { console.error(error); app.exit(1); });
