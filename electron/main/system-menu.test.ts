import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actionFromArgv, buildPlayerMenu, EMPTY_STATE, parsePlayerState, stripHit, trayTitle, trayTooltip, type MenuNode, type PlayerState } from './system-menu.ts';

const playing: PlayerState = { ...EMPTY_STATE, hasTrack: true, title: '晴天', artist: '周杰伦', playing: true, liked: false, lyric: '刮风这天 我试过握着你手' };
const labels = (nodes: MenuNode[]) => nodes.map(node => (node.type === 'separator' ? '—' : node.label));

test('dock, tray and app menus share the same player controls', () => {
  const context = { desktopLyrics: false, mini: false, platform: 'darwin' };
  const dock = labels(buildPlayerMenu(playing, { ...context, surface: 'dock' }));
  const tray = labels(buildPlayerMenu(playing, { ...context, surface: 'tray' }));
  const app = labels(buildPlayerMenu(playing, { ...context, surface: 'app' }));
  const controls = ['暂停', '上一首', '下一首', '—', '喜欢', '播放模式：列表循环', '—', '桌面歌词', '迷你模式'];
  assert.deepEqual(dock, ['晴天 - 周杰伦', '—', ...controls]);
  assert.deepEqual(tray, ['打开 CoCo Music', '—', '晴天 - 周杰伦', '—', ...controls, '—', '设置…', '退出 CoCo Music']);
  assert.deepEqual(app, controls);
});

test('controls are disabled without a song; like only when likeable', () => {
  const menu = buildPlayerMenu(EMPTY_STATE, { surface: 'dock', desktopLyrics: false, mini: false, platform: 'darwin' });
  const item = (label: string) => menu.find(node => node.type === 'item' && node.label === label) as Extract<MenuNode, { type: 'item' }>;
  assert.equal(item('播放').enabled, false);
  assert.equal(item('喜欢').enabled, false);
});

test('menu icons only in Windows/Linux tray menus', () => {
  const win = buildPlayerMenu(playing, { surface: 'tray', desktopLyrics: true, mini: false, platform: 'win32' });
  const mac = buildPlayerMenu(playing, { surface: 'tray', desktopLyrics: true, mini: false, platform: 'darwin' });
  const icon = (nodes: MenuNode[]) => nodes.some(node => node.type === 'item' && node.icon);
  assert.equal(icon(win), true);
  assert.equal(icon(mac), false);
});

test('menu-bar lyric shows only while playing and enabled', () => {
  assert.equal(trayTitle(playing), '刮风这天 我试过握着你手');
  assert.equal(trayTitle({ ...playing, playing: false }), '');
  assert.equal(trayTitle({ ...playing, trayLyrics: false }), '');
  assert.equal(trayTitle({ ...playing, lyric: '' }), '晴天');
  assert.ok(trayTooltip(playing).length <= 127);
});

test('jump list actions are parsed strictly; renderer state is sanitised', () => {
  assert.equal(actionFromArgv(['app.exe', '--coco-action=next']), 'next');
  assert.equal(actionFromArgv(['app.exe', '--coco-action=rm -rf']), null);
  assert.equal(parsePlayerState('nope'), null);
  const parsed = parsePlayerState({ hasTrack: true, title: 1, mode: 'bogus', liked: 'yes' })!;
  assert.equal(parsed.title, '');
  assert.equal(parsed.mode, 'loop');
  assert.equal(parsed.liked, null);
});

test('menu-bar strip buttons hit-test to the slot under the cursor', () => {
  // Slots: previous 0–30, toggle 30–60, next 60–90, like 90–120, glyph 120–142.
  assert.equal(stripHit(-1), 'none');
  assert.equal(stripHit(10), 'previous');
  assert.equal(stripHit(45), 'toggle');
  assert.equal(stripHit(75), 'next');
  assert.equal(stripHit(105), 'like');
  assert.equal(stripHit(130), 'icon');
});
