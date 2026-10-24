import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseInfo, validateInstallers, verifyUploadedAssets } from './release.mjs';

const names = ['mac-arm64.dmg', 'mac-arm64.zip', 'mac-x64.dmg', 'mac-x64.zip', 'win-x64-Setup.exe', 'linux-x86_64.AppImage', 'linux-amd64.deb'].map(suffix => `CoCo-Music-0.0.1-${suffix}`);

test('0.x releases are stable; rc and beta are pre-releases', () => {
  assert.equal(releaseInfo('0.0.1', 'v0.0.1').prerelease, false);
  assert.equal(releaseInfo('0.0.2-rc.1', 'v0.0.2-rc.1').prerelease, true);
  assert.equal(releaseInfo('1.0.0-beta.2').prerelease, true);
});

test('invalid versions and mismatched tags fail before building', () => {
  assert.throws(() => releaseInfo('0.0.1', 'v0.0.2'));
  for (const invalid of ['../0.0.1', '01.0.1', '0.0.1\n', '0.0.1\nmalicious', '0.0.1;echo hi']) assert.throws(() => releaseInfo(invalid));
});

test('publishing requires both Mac architectures, Windows and both Linux packages', () => {
  validateInstallers(names, '0.0.1');
  for (let index = 0; index < names.length; index++) assert.throws(() => validateInstallers(names.filter((_, i) => i !== index), '0.0.1'));
  assert.throws(() => validateInstallers([...names, 'unexpected.exe'], '0.0.1'));
  assert.throws(() => validateInstallers(names, '0.0.2'));
});

test('uploaded assets must match names, sizes and SHA256 before publishing', () => {
  const expected = [{ name: 'app.dmg', size: 123, hash: 'abc' }];
  const uploaded = [{ name: 'app.dmg', size: 123, digest: 'sha256:abc', state: 'uploaded' }];
  verifyUploadedAssets(uploaded, expected);
  for (const change of [{ name: 'wrong.dmg' }, { size: 124 }, { digest: 'sha256:wrong' }, { state: 'new' }]) {
    assert.throws(() => verifyUploadedAssets([{ ...uploaded[0], ...change }], expected));
  }
  assert.throws(() => verifyUploadedAssets([], expected));
});

// Run the real publishing entry point against a local GitHub CLI stand-in.
// This ensures a corrupt upload cannot accidentally make a draft public.
test('publishing is atomic and retries never overwrite an already-public release', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const entry = fileURLToPath(new URL('./release.mjs', import.meta.url));
  for (const corrupt of [false, true]) {
    const root = await mkdtemp(path.join(tmpdir(), 'coco-release-'));
    try {
      await mkdir(path.join(root, 'bin'));
      await mkdir(path.join(root, 'dist'));
      await mkdir(path.join(root, '.github/release-notes'), { recursive: true });
      await writeFile(path.join(root, 'package.json'), JSON.stringify({ version: '0.0.1' }));
      await writeFile(path.join(root, '.github/release-notes/0.0.1.md'), 'Release notes');
      for (const name of names) await writeFile(path.join(root, 'dist', name), `fixture-${name}`);
      const state = path.join(root, 'state.json');
      await writeFile(state, JSON.stringify({ id: 123, tag_name: 'v0.0.1', exists: false, draft: true, assets: [], uploads: 0, edits: 0 }));
      await writeFile(path.join(root, 'bin/gh'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const args = process.argv.slice(2);
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
if (args[0] === 'api') {
  if (args[1].includes('/releases/tags/') && state.draft) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
  if (args.includes('--slurp')) console.log(JSON.stringify([state.exists ? [state] : []]));
  else {
    if (!state.exists) { console.error('gh: Not Found (HTTP 404)'); process.exit(1); }
    console.log(JSON.stringify({...state, html_url:'https://example.com/release'}));
  }
} else if (args[1] === 'create') {
  state.exists = true;
} else if (args[1] === 'upload') {
  state.uploads++;
  state.assets = args.filter(name => name.startsWith('dist/')).map(name => {
    const bytes = fs.readFileSync(name);
    return {name:path.basename(name),size:bytes.length,state:'uploaded',digest:'sha256:' + (process.env.FAKE_CORRUPT === '1' ? 'invalid' : crypto.createHash('sha256').update(bytes).digest('hex'))};
  });
} else if (args[1] === 'edit') {
  state.edits++;
  if (args.includes('--draft=false')) state.draft = false;
}
fs.writeFileSync(file, JSON.stringify(state));
`, { mode: 0o755 });
      const run = () => spawnSync(process.execPath, [entry, 'publish'], {
        cwd: root, encoding: 'utf8',
        env: { ...process.env, GITHUB_STEP_SUMMARY: '', GITHUB_OUTPUT: '', PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`, RELEASE_TAG: 'v0.0.1', GITHUB_REPOSITORY: 'example/coco', FAKE_GH_STATE: state, FAKE_CORRUPT: corrupt ? '1' : '0' },
      });
      const first = run();
      let saved = JSON.parse(await readFile(state, 'utf8'));
      if (corrupt) {
        assert.notEqual(first.status, 0);
        assert.equal(saved.draft, true);
        assert.equal(saved.edits, 0);
      } else {
        assert.equal(first.status, 0, first.stderr);
        assert.equal(saved.draft, false);
        assert.equal(saved.assets.length, 8);
        assert.equal(run().status, 0);
        saved = JSON.parse(await readFile(state, 'utf8'));
        assert.equal(saved.uploads, 1);
        assert.equal(saved.edits, 1);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});
