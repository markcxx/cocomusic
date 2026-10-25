import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checksumFromSums, compareVersions, installAsset, parseReleases, pickUpdate, releasesBetween } from './update-core.ts';

const REPO = 'markcxx/cocomusic';
const asset = (tag: string, name: string) => ({ name, size: 10, state: 'uploaded', digest: `sha256:${'a'.repeat(64)}`, browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/${name}` });
const release = (version: string, extra: Record<string, unknown> = {}) => ({
  tag_name: `v${version}`,
  name: `CoCo Music ${version}`,
  body: `Notes for ${version}`,
  draft: false,
  prerelease: version.includes('-'),
  published_at: '2026-10-24T11:57:36Z',
  html_url: `https://github.com/${REPO}/releases/tag/v${version}`,
  assets: [
    `CoCo-Music-${version}-mac-arm64.zip`, `CoCo-Music-${version}-mac-arm64.dmg`, `CoCo-Music-${version}-mac-x64.zip`, `CoCo-Music-${version}-mac-x64.dmg`,
    `CoCo-Music-${version}-win-x64-Setup.exe`, `CoCo-Music-${version}-linux-x86_64.AppImage`, `CoCo-Music-${version}-linux-amd64.deb`, 'SHA256SUMS.txt',
  ].map(name => asset(`v${version}`, name)),
  ...extra,
});

test('orders versions by semver precedence', () => {
  assert.equal(compareVersions('0.0.2', '0.0.1'), 1);
  assert.equal(compareVersions('0.1.0', '0.0.9'), 1);
  assert.equal(compareVersions('v1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.0-rc.1', '1.0.0'), -1);
  assert.equal(compareVersions('1.0.0-rc.2', '1.0.0-rc.10'), -1);
  assert.equal(compareVersions('1.0.0-beta', '1.0.0-beta.1'), -1);
  assert.equal(compareVersions('1.0.0-1', '1.0.0-alpha'), -1);
  assert.equal(compareVersions('1.0.0+build.5', '1.0.0'), 0);
  assert.throws(() => compareVersions('latest', '1.0.0'));
});

test('parses published releases newest first and drops untrusted assets', () => {
  const raw = [
    release('0.0.1'),
    release('0.0.3', { draft: true }),
    release('0.0.2-rc.1'),
    { ...release('0.0.2'), assets: [...release('0.0.2').assets, { ...asset('v0.0.2', 'evil.exe'), browser_download_url: 'https://example.com/evil.exe' }] },
    { tag_name: 'nightly', assets: [] },
  ];
  const releases = parseReleases(raw, REPO);
  assert.deepEqual(releases.map(item => item.version), ['0.0.2', '0.0.2-rc.1', '0.0.1']);
  assert.equal(releases[0].assets.some(item => item.name === 'evil.exe'), false);
  assert.equal(releases[0].notes, 'Notes for 0.0.2');
  assert.deepEqual(parseReleases({ message: 'rate limited' }, REPO), []);
});

test('picks the newest update in the channel that fits this machine', () => {
  const releases = parseReleases([release('0.0.1'), release('0.0.2'), release('0.0.3-beta.1')], REPO);
  assert.equal(pickUpdate(releases, '0.0.1', 'stable', 'mac-zip', 'arm64')?.version, '0.0.2');
  assert.equal(pickUpdate(releases, '0.0.1', 'beta', 'win', 'x64')?.version, '0.0.3-beta.1');
  assert.equal(pickUpdate(releases, '0.0.2', 'stable', 'deb', 'x64'), undefined);
  // A release without an installer for this platform is passed over.
  const partial = parseReleases([release('0.0.1'), { ...release('0.0.2'), assets: [] }], REPO);
  assert.equal(pickUpdate(partial, '0.0.1', 'stable', 'win', 'x64'), undefined);
  assert.deepEqual(releasesBetween(releases, '0.0.1', releases[0], 'beta').map(item => item.version), ['0.0.3-beta.1', '0.0.2']);
});

test('matches electron-builder installer names per platform', () => {
  const [latest] = parseReleases([release('1.2.3')], REPO);
  assert.equal(installAsset(latest, 'mac-zip', 'arm64')?.name, 'CoCo-Music-1.2.3-mac-arm64.zip');
  assert.equal(installAsset(latest, 'mac-dmg', 'x64')?.name, 'CoCo-Music-1.2.3-mac-x64.dmg');
  assert.equal(installAsset(latest, 'win', 'arm64')?.name, 'CoCo-Music-1.2.3-win-x64-Setup.exe');
  assert.equal(installAsset(latest, 'appimage', 'x64')?.name, 'CoCo-Music-1.2.3-linux-x86_64.AppImage');
  assert.equal(installAsset(latest, 'deb', 'x64')?.name, 'CoCo-Music-1.2.3-linux-amd64.deb');
  assert.equal(installAsset(latest, 'deb', 'arm64'), undefined);
});

test('reads expected hashes from SHA256SUMS.txt', () => {
  const sums = `${'b'.repeat(64)}  CoCo-Music-1.2.3-mac-arm64.zip\n${'c'.repeat(64)}  CoCo-Music-1.2.3-win-x64-Setup.exe\n`;
  assert.equal(checksumFromSums(sums, 'CoCo-Music-1.2.3-win-x64-Setup.exe'), 'c'.repeat(64));
  assert.equal(checksumFromSums(sums, 'missing.zip'), null);
});
