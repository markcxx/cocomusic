import assert from 'node:assert/strict';
import { test } from 'node:test';
import { configureLinuxWindowing } from './linux-windowing';

function application(backend = 'wayland') {
  const launches: string[][] = [];
  const exits: number[] = [];
  return {
    commandLine: { getSwitchValue: () => backend },
    relaunch: ({ args }: { args: string[] }) => { launches.push(args); },
    exit: (code: number) => { exits.push(code); },
    launches, exits,
  };
}

test('Wayland startup relaunches on X11 without changing the running backend', () => {
  const app = application();
  configureLinuxWindowing(app, 'linux', { DISPLAY: ':0' }, ['electron', '.', '--user-data-dir=/tmp/test', '--', '/music/a b.mp3']);
  assert.deepEqual(app.launches, [['.', '--user-data-dir=/tmp/test', '--ozone-platform=x11', '--', '/music/a b.mp3']]);
  assert.deepEqual(app.exits, [0]);
  assert.equal(app.commandLine.getSwitchValue(), 'wayland');
  const second = application('x11');
  configureLinuxWindowing(second, 'linux', { DISPLAY: ':0' }, ['electron', ...app.launches[0]]);
  assert.deepEqual(second.launches, []);
  assert.deepEqual(second.exits, []);
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
