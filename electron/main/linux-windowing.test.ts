import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { devElectronArgs } from '../../scripts/dev-electron-args.mjs';
import { configureLinuxWindowing } from './linux-windowing';

function application(backend = 'wayland') {
  type Launch = { args: string[]; execPath?: string };
  const launches: Launch[] = [];
  const exits: number[] = [];
  return {
    commandLine: { getSwitchValue: () => backend },
    relaunch: (options: Launch) => { launches.push(options); },
    exit: (code: number) => { exits.push(code); },
    launches, exits,
  };
}

test('Wayland startup relaunches on X11 without changing the running backend', () => {
  const app = application();
  configureLinuxWindowing(app, 'linux', { DISPLAY: ':0' }, ['electron', '.', '--user-data-dir=/tmp/test', '--', '/music/a b.mp3']);
  assert.deepEqual(app.launches, [{ args: ['.', '--user-data-dir=/tmp/test', '--ozone-platform=x11', '--', '/music/a b.mp3'] }]);
  assert.deepEqual(app.exits, [0]);
  assert.equal(app.commandLine.getSwitchValue(), 'wayland');
  const second = application('x11');
  configureLinuxWindowing(second, 'linux', { DISPLAY: ':0' }, ['electron', ...app.launches[0].args]);
  assert.deepEqual(second.launches, []);
  assert.deepEqual(second.exits, []);
});

test('AppImage relaunches the outer image and ignores mount variables from another app', () => {
  const mount = path.resolve('mount');
  const env = { DISPLAY: ':0', APPDIR: mount, APPIMAGE: '/downloads/CoCo Music.AppImage' };
  const mounted = path.join(mount, 'cocomusic');
  const args = ['--ozone-platform=x11', '--', '/music/a b.mp3'];
  const app = application();
  configureLinuxWindowing(app, 'linux', env, [mounted, '--', '/music/a b.mp3'], mounted);
  assert.deepEqual(app.launches, [{ execPath: env.APPIMAGE, args }]);
  const unrelated = application();
  configureLinuxWindowing(unrelated, 'linux', env, ['/opt/cocomusic', '--', '/music/a b.mp3'], '/opt/cocomusic');
  assert.deepEqual(unrelated.launches, [{ args }]);
});

test('dev launches its supervised child with the backend already selected and preserves file arguments', () => {
  const env = { DISPLAY: ':0', WAYLAND_DISPLAY: 'wayland-0' };
  for (const [flags, expected] of [
    [[], 'x11'],
    [['--ozone-platform=wayland'], 'wayland'],
    [['--ozone-platform', 'wayland'], 'wayland'],
  ] as const) {
    const { switches, openFiles } = devElectronArgs([...flags, '--', 'a b.mp3'], 'linux', env);
    assert.deepEqual(switches, [`--ozone-platform=${expected}`]);
    assert.deepEqual(openFiles, [path.resolve('a b.mp3')]);
    const app = application();
    configureLinuxWindowing(app, 'linux', env, ['electron', ...switches, '.', ...openFiles]);
    assert.deepEqual(app.launches, []);
    assert.deepEqual(app.exits, []);
  }
  assert.deepEqual(devElectronArgs([], 'linux', { WAYLAND_DISPLAY: 'wayland-0' }).switches, []);
  for (const platform of ['darwin', 'win32']) assert.deepEqual(devElectronArgs([], platform, env).switches, []);
});

test('preserves explicit backends, existing X11, and non-X11 environments', () => {
  for (const args of [['electron', '--ozone-platform=wayland'], ['electron', '--ozone-platform', 'wayland']]) {
    const app = application();
    configureLinuxWindowing(app, 'linux', { DISPLAY: ':0' }, args);
    assert.deepEqual(app.launches, []);
    assert.deepEqual(app.exits, []);
  }
  for (const [platform, env, backend] of [
    ['linux', { DISPLAY: ':0' }, 'x11'],
    ['linux', { WAYLAND_DISPLAY: 'wayland-0' }, 'wayland'],
    ['linux', {}, ''],
    ['darwin', { DISPLAY: ':0' }, ''],
    ['win32', { DISPLAY: ':0' }, ''],
  ] as const) {
    const app = application(backend);
    configureLinuxWindowing(app, platform, env, ['electron']);
    assert.deepEqual(app.launches, []);
    assert.deepEqual(app.exits, []);
  }
});
