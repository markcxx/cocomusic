// Renders the Dock / menu-bar / tray / taskbar menus to a static HTML page so
// platforms you cannot run (Windows, Linux) can be reviewed. The menu content
// comes from the real model in electron/main/system-menu.ts.
//
//   node --experimental-strip-types scripts/preview-system-menus.mjs
//   → release/system-menus-preview.html
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlayerMenu, EMPTY_STATE, JUMP_LIST_TASKS, trayTooltip } from '../electron/main/system-menu.ts';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const asset = name => `data:image/png;base64,${readFileSync(path.join(root, 'build', name)).toString('base64')}`;
const esc = value => String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const state = { ...EMPTY_STATE, hasTrack: true, title: '晴天', artist: '周杰伦', playing: true, liked: true, mode: 'loop', lyric: '刮风这天 我试过握着你手' };
const ctx = platform => ({ desktopLyrics: true, mini: false, platform });

function menu(nodes, os) {
  return `<ul class="menu ${os}">${nodes.map(node => {
    if (node.type === 'separator') return '<li class="sep"></li>';
    if (node.type === 'label') return `<li class="label">${esc(node.label)}</li>`;
    if (node.type === 'submenu') {
      return `<li class="item sub"><span class="check"></span><span class="text">${esc(node.label)}</span><span class="arrow">›</span>${menu(node.items, `${os} nested`)}</li>`;
    }
    const mark = node.checked ? (node.kind === 'radio' ? '●' : '✓') : '';
    const icon = node.icon ? `<img class="icon" src="${asset(`tray/menu-${node.icon}@2x.png`)}" alt="">` : '';
    return `<li class="item${node.enabled === false ? ' disabled' : ''}"><span class="check">${mark}</span>${icon}<span class="text">${esc(node.label)}</span>${node.accelerator ? `<span class="acc">${esc(node.accelerator.replace('CommandOrControl+', '⌘').replace('Left', '←').replace('Right', '→'))}</span>` : ''}</li>`;
  }).join('')}</ul>`;
}

const dockExtras = '<li class="sep"></li><li class="item"><span class="check"></span><span class="text">选项</span><span class="arrow">›</span></li><li class="item"><span class="check"></span><span class="text">显示所有窗口</span></li><li class="item"><span class="check"></span><span class="text">隐藏</span></li><li class="item"><span class="check"></span><span class="text">退出</span></li>';
const dockMenu = menu(buildPlayerMenu(state, { ...ctx('darwin'), surface: 'dock' }), 'mac').replace(/<\/ul>$/, `${dockExtras}</ul>`);
const thumb = name => `<img src="${asset(`tray/thumb-${name}@2x.png`)}" alt="">`;

const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>CoCo Music 系统菜单预览</title>
<style>
:root { color-scheme: light; font-family: -apple-system, "PingFang SC", "Segoe UI", "Microsoft YaHei UI", sans-serif; }
body { margin: 0; padding: 28px; background: #eef0f6; color: #222; }
h1 { margin: 0 0 4px; font-size: 22px; } p.lead { margin: 0 0 24px; color: #555; font-size: 13px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(420px, 1fr)); gap: 22px; }
.card { background: #fff; border-radius: 14px; padding: 18px 18px 22px; box-shadow: 0 2px 10px rgba(30,30,60,.06); }
.card h2 { margin: 0 0 4px; font-size: 15px; } .card .note { margin: 0 0 14px; font-size: 12px; color: #666; line-height: 1.6; }
.stage { position: relative; border-radius: 10px; padding: 16px; min-height: 380px; overflow: visible; }
.mac-stage { background: linear-gradient(135deg, #8aa3d6, #c3a6dc 55%, #f0b7a6); }
.win-stage { background: linear-gradient(135deg, #2f5d9b, #3f8bd0 60%, #78b8e6); }
.linux-stage { background: linear-gradient(135deg, #5b3b6e, #8a4f7d 60%, #c9746b); }
/* macOS menus */
.menu { list-style: none; margin: 0; padding: 5px; min-width: 240px; font-size: 13px; }
.menu.mac { background: rgba(246,246,248,.86); backdrop-filter: blur(20px); border-radius: 10px; box-shadow: 0 0 0 .5px rgba(0,0,0,.18), 0 10px 30px rgba(0,0,0,.25); }
.menu.mac .item { display: flex; align-items: center; height: 22px; padding: 0 8px 0 2px; border-radius: 5px; }
.menu.mac .item:hover { background: #2f6fdf; color: #fff; }
.menu .check { width: 18px; text-align: center; font-size: 11px; }
.menu .text { flex: 1; white-space: nowrap; } .menu .acc { color: #888; margin-left: 24px; font-size: 12px; } .menu .arrow { margin-left: 18px; color: #777; }
.menu .label { padding: 3px 10px 3px 20px; color: #8a8a8e; font-size: 12px; white-space: nowrap; }
.menu.mac .sep { height: 1px; margin: 5px 10px; background: rgba(0,0,0,.12); }
.menu .disabled { color: #b0b0b4; }
.menu .sub { position: relative; } .menu .sub > .menu { display: none; position: absolute; left: 100%; top: -5px; z-index: 5; }
.menu .sub:hover > .menu { display: block; }
.menubar { display: flex; align-items: center; justify-content: flex-end; gap: 14px; height: 26px; margin: -16px -16px 10px; padding: 0 14px; background: rgba(255,255,255,.55); backdrop-filter: blur(16px); font-size: 13px; border-radius: 10px 10px 0 0; }
.menubar .tray { display: inline-flex; align-items: center; gap: 6px; padding: 1px 6px; border-radius: 4px; background: rgba(0,0,0,.1); }
.menubar .tray img { width: 16px; height: 16px; } .menubar .clock { color: #222; }
.dock { position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; padding: 7px 12px; border-radius: 18px; background: rgba(255,255,255,.35); backdrop-filter: blur(16px); }
.dock img { width: 46px; height: 46px; } .dock .dot { width: 4px; height: 4px; margin: 2px auto 0; border-radius: 50%; background: #222; }
.dock-menu { position: absolute; bottom: 88px; left: 50%; }
/* Windows 11 menus */
.menu.win { background: #f9f9f9; border-radius: 8px; border: 1px solid rgba(0,0,0,.08); box-shadow: 0 8px 24px rgba(0,0,0,.28); padding: 4px; font-family: "Segoe UI", "Microsoft YaHei UI", sans-serif; }
.menu.win .item { display: flex; align-items: center; height: 30px; padding: 0 10px 0 4px; border-radius: 4px; }
.menu.win .item:hover { background: rgba(0,0,0,.06); }
.menu.win .icon, .menu.linux .icon { width: 16px; height: 16px; margin-right: 10px; }
.menu.win .sep { height: 1px; margin: 4px 0; background: rgba(0,0,0,.09); }
.menu.win .label { padding: 6px 12px 6px 22px; }
.taskbar { position: absolute; left: 0; right: 0; bottom: 0; height: 46px; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(240,243,249,.86); backdrop-filter: blur(20px); border-radius: 0 0 10px 10px; }
.taskbar .app { width: 38px; height: 38px; border-radius: 6px; display: grid; place-items: center; background: rgba(255,255,255,.7); position: relative; }
.taskbar .app img { width: 26px; height: 26px; } .taskbar .app::after { content: ''; position: absolute; bottom: 2px; width: 14px; height: 3px; border-radius: 2px; background: #2563c9; }
.taskbar .systray { position: absolute; right: 10px; display: flex; align-items: center; gap: 10px; font-size: 12px; color: #222; }
.taskbar .systray img { width: 16px; height: 16px; }
.thumbnail { position: absolute; bottom: 54px; left: 50%; transform: translateX(-50%); width: 230px; background: rgba(243,243,243,.95); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.3); padding: 8px; font-size: 12px; font-family: "Segoe UI", sans-serif; }
.thumbnail .title { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; } .thumbnail .title img { width: 14px; }
.thumbnail .shot { height: 96px; border-radius: 4px; background: linear-gradient(135deg, #ded7f2, #f2e7ef); }
.thumbnail .buttons { display: flex; justify-content: center; gap: 4px; margin-top: 6px; }
.thumbnail .buttons span { width: 36px; height: 28px; display: grid; place-items: center; border-radius: 4px; background: #3b3b3b; } .thumbnail .buttons img { width: 16px; height: 16px; }
.tooltip { position: absolute; background: #fff; border: 1px solid #ccc; padding: 6px 9px; font-size: 12px; white-space: pre; border-radius: 4px; box-shadow: 0 3px 10px rgba(0,0,0,.2); font-family: "Segoe UI", sans-serif; }
/* Linux (GNOME AppIndicator) */
.menu.linux { background: #fff; border-radius: 12px; box-shadow: 0 6px 22px rgba(0,0,0,.3); padding: 6px; font-family: Cantarell, Ubuntu, sans-serif; }
.menu.linux .item { display: flex; align-items: center; height: 32px; padding: 0 12px 0 4px; border-radius: 6px; } .menu.linux .item:hover { background: #ececec; }
.menu.linux .sep { height: 1px; margin: 5px 0; background: #e2e2e2; }
.topbar { display: flex; align-items: center; justify-content: flex-end; gap: 14px; height: 28px; margin: -16px -16px 10px; padding: 0 14px; background: #1d1d1d; color: #fff; font-size: 13px; border-radius: 10px 10px 0 0; }
.topbar img { width: 16px; height: 16px; }
.abs { position: absolute; }
</style></head><body>
<h1>CoCo Music 系统菜单预览</h1>
<p class="lead">系统原生菜单部分，由 electron/main/system-menu.ts 生成（托盘小图标的右键面板和 Mac 菜单栏歌词是应用自己绘制的页面，见 /tray 与 /tray/menubar），与应用里的菜单内容完全一致（示例：正在播放《晴天》，已喜欢，桌面歌词开启）。子菜单“播放模式”可鼠标悬停展开。实际外观由各系统绘制，这里是近似样式。</p>
<div class="grid">

<section class="card"><h2>macOS · 程序坞右键菜单</h2>
<p class="note">右键（或长按）程序坞里的 CoCo Music 图标。下半部分“选项 / 显示所有窗口 / 隐藏 / 退出”是 macOS 自动追加的。关闭窗口后应用留在后台继续播放，点程序坞图标即可回来。</p>
<div class="stage mac-stage" style="min-height:520px">
<div class="dock-menu" style="transform:translateX(-50%)">${dockMenu}</div>
<div class="dock"><div><img src="${asset('icon.png')}" alt=""><div class="dot"></div></div></div>
</div></section>



<section class="card"><h2>macOS · 菜单栏“控制”菜单</h2>
<p class="note">窗口在前台时，屏幕顶部菜单栏的“控制”菜单，同样的操作，并显示快捷键提示。</p>
<div class="stage mac-stage" style="min-height:300px">
<div class="menubar" style="justify-content:flex-start"><b>CoCo Music</b><span>编辑</span><span class="tray">控制</span><span>窗口</span></div>
<div style="position:absolute;left:120px;top:36px">${menu(buildPlayerMenu(state, { ...ctx('darwin'), surface: 'app' }), 'mac')}</div>
</div></section>



<section class="card"><h2>Windows · 任务栏按钮</h2>
<p class="note">鼠标悬停任务栏按钮：缩略图标题显示歌名，下方三个按钮（上一首 / 播放暂停 / 下一首）可直接控制。悬停托盘图标显示右侧提示（歌名 + 当前歌词）。</p>
<div class="stage win-stage" style="min-height:330px">
<div class="thumbnail" style="left:24px;transform:none"><div class="title"><img src="${asset('tray/tray-color@2x.png')}" alt="">${esc(`${state.title} - ${state.artist}`)}</div><div class="shot"></div><div class="buttons"><span>${thumb('prev')}</span><span>${thumb('pause')}</span><span>${thumb('next')}</span></div></div>
<div class="tooltip" style="right:14px;bottom:54px;max-width:150px;white-space:pre-wrap">${esc(trayTooltip(state))}</div>
<div class="taskbar"><div class="app"><img src="${asset('icon.png')}" alt=""></div><div class="systray"><img src="${asset('tray/tray-color@2x.png')}" alt=""><span>21:30<br>2026/10/24</span></div></div>
</div></section>

<section class="card"><h2>Windows · 任务栏图标右键（跳转列表）</h2>
<p class="note">右键任务栏上的 CoCo Music 按钮。“任务”分组是我们加的快捷操作，下面三项由 Windows 自带。点击后交给正在运行的应用执行，不会再开一个窗口。</p>
<div class="stage win-stage" style="min-height:330px">
<div style="position:absolute;left:50%;bottom:54px;transform:translateX(-50%)"><ul class="menu win" style="min-width:250px"><li class="label" style="padding-left:12px;font-weight:600;color:#333">任务</li>${JUMP_LIST_TASKS.map(task => `<li class="item"><span class="check"></span><img class="icon" src="${asset(`tray/menu-${task.icon}@2x.png`)}" alt=""><span class="text">${esc(task.title)}</span></li>`).join('')}<li class="sep"></li><li class="item"><span class="check"></span><img class="icon" src="${asset('tray/tray-color@2x.png')}" alt=""><span class="text">CoCo Music</span></li><li class="item"><span class="check"></span><span class="text">从任务栏取消固定</span></li><li class="item"><span class="check"></span><span class="text">关闭窗口</span></li></ul></div>
<div class="taskbar"><div class="app"><img src="${asset('icon.png')}" alt=""></div><div class="systray"><img src="${asset('tray/tray-color@2x.png')}" alt=""><span>21:30<br>2026/10/24</span></div></div>
</div></section>

<section class="card"><h2>Linux · 顶栏托盘菜单</h2>
<p class="note">GNOME（需 AppIndicator 扩展，Ubuntu 默认带）、KDE 等桌面的顶栏 / 面板托盘。点击图标弹出同样的菜单。</p>
<div class="stage linux-stage" style="min-height:520px">
<div class="topbar"><img src="${asset('tray/tray-color@2x.png')}" alt=""><span>10月24日 21:30</span></div>
<div style="position:absolute;right:60px;top:36px">${menu(buildPlayerMenu(state, { ...ctx('linux'), surface: 'tray' }), 'linux')}</div>
</div></section>

</div></body></html>`;

mkdirSync(path.join(root, 'release'), { recursive: true });
const out = path.join(root, 'release', 'system-menus-preview.html');
writeFileSync(out, html);
console.log('Wrote', path.relative(root, out));
