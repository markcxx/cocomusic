import path from 'node:path';
import { app, Menu, nativeImage, type MenuItemConstructorOptions, type NativeImage } from 'electron';

/**
 * App identity at runtime. Packaged builds get the icon and name from the
 * bundle (electron-builder.yml); in development the process is the stock
 * Electron binary, so without this the Dock, app menu and taskbar would show
 * Electron's icon and name instead of CoCo Music's.
 */
let icon: NativeImage | undefined;
let openSettings: (() => void) | undefined;
/** 设置… in the app menu (⌘,). */
export const onOpenSettings = (handler: () => void) => { openSettings = handler; };

/** build/icon.png in dev; resources/icon.png when packaged (copied by extraResources). */
export function appIcon(): NativeImage | undefined {
  if (icon) return icon;
  const file = app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(app.getAppPath(), 'build', 'icon.png');
  const image = nativeImage.createFromPath(file);
  icon = image.isEmpty() ? undefined : image;
  return icon;
}

export function applyBranding() {
  if (process.platform === 'darwin') {
    // The packaged .app already carries icon.icns; only override for the dev binary.
    const image = appIcon();
    if (!app.isPackaged && image) app.dock?.setIcon(image);
    setControlMenu([]);
  } else {
    // Frameless window with its own controls: no native menu bar.
    Menu.setApplicationMenu(null);
  }
  app.setAboutPanelOptions({
    applicationName: 'CoCo Music',
    applicationVersion: app.getVersion(),
    copyright: 'Copyright © 2026 markcxx',
    website: 'https://github.com/markcxx/cocomusic',
    iconPath: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(app.getAppPath(), 'build', 'icon.png'),
  });
}

/** macOS menu bar; 控制 mirrors the Dock / tray menu (system-menu.ts, surface 'app'). */
export function setControlMenu(control: MenuItemConstructorOptions[]) {
  if (process.platform !== 'darwin') return;
  Menu.setApplicationMenu(Menu.buildFromTemplate(macMenu(control)));
}

/** Default macOS menu, with the app's own name (Electron's default says "Electron" in dev). */
function macMenu(control: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  const name = 'CoCo Music';
  return [
    {
      label: name,
      submenu: [
        { role: 'about', label: `关于 ${name}` },
        { type: 'separator' },
        { label: '设置…', accelerator: 'Command+,', click: () => openSettings?.() },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: `隐藏 ${name}` },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: `退出 ${name}` },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    ...(control.length ? [{ label: '控制', submenu: control }] : []),
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ];
}
