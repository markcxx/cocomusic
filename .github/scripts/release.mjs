import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { appendFile, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function releaseInfo(version, tag = '') {
  assert.equal(version, version.trim(), 'Release version cannot contain surrounding whitespace');
  assert.match(version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/, 'Invalid release version');
  if (tag) assert.equal(tag, `v${version}`, 'Tag must match package.json version');
  return { version, tag: `v${version}`, prerelease: version.includes('-'), notes: `.github/release-notes/${version}.md` };
}

export function validateInstallers(names, version) {
  const prefix = `CoCo-Music-${version}-`;
  const suffixes = ['mac-arm64.dmg', 'mac-arm64.zip', 'mac-x64.dmg', 'mac-x64.zip', 'win-x64-Setup.exe'];
  for (const suffix of suffixes) assert(names.includes(prefix + suffix), `Missing installer: ${prefix + suffix}`);
  for (const extension of ['AppImage', 'deb']) {
    assert.equal(names.filter(name => name.startsWith(prefix + 'linux-') && name.endsWith('.' + extension)).length, 1, `Expected one Linux ${extension}`);
  }
  assert.equal(names.length, 7, 'Expected exactly seven installers');
  for (const name of names) assert.equal(path.basename(name), name, 'Installer names cannot contain directories');
}

function gh(args, allowFailure = false) {
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr || result.stdout || 'GitHub CLI failed');
  return result;
}

async function sha256(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export function verifyUploadedAssets(uploaded, expected) {
  assert.equal(uploaded.length, expected.length, 'Release contains unexpected or missing assets');
  for (const file of expected) {
    const remote = uploaded.find(asset => asset.name === file.name);
    assert(remote && remote.state === 'uploaded', `Asset not uploaded: ${file.name}`);
    assert.equal(remote.size, file.size, `Size mismatch: ${file.name}`);
    assert.equal(remote.digest, `sha256:${file.hash}`, `Checksum mismatch: ${file.name}`);
  }
}

async function main() {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  const info = releaseInfo(version, process.env.RELEASE_TAG || '');
  const command = process.argv[2];
  if (command === 'validate') {
    if (process.env.RELEASE_TAG) {
      const notes = await readFile(info.notes, 'utf8');
      assert(notes.trim().length > 80, 'Write version-specific release notes before tagging');
    }
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(process.env.GITHUB_OUTPUT, Object.entries(info).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
    }
    console.log(`Validated ${info.tag} (${info.prerelease ? 'pre-release' : 'stable'})`);
    return;
  }
  assert.equal(command, 'publish', 'Use validate or publish');
  assert(process.env.RELEASE_TAG, 'Publishing requires a version tag');
  const repo = process.env.GITHUB_REPOSITORY;
  assert(repo, 'GITHUB_REPOSITORY is required');
  const names = (await readdir('dist')).filter(name => name !== 'SHA256SUMS.txt').sort();
  validateInstallers(names, version);
  const manifest = [];
  for (const name of names) {
    const file = path.join('dist', name);
    const size = (await stat(file)).size;
    assert(size > 0, `Empty installer: ${name}`);
    manifest.push({ name, size, hash: await sha256(file) });
  }
  const checksums = path.join('dist', 'SHA256SUMS.txt');
  await writeFile(checksums, manifest.map(file => `${file.hash}  ${file.name}`).join('\n') + '\n');
  manifest.push({ name: 'SHA256SUMS.txt', size: (await stat(checksums)).size, hash: await sha256(checksums) });
  const endpoint = `repos/${repo}/releases/tags/${info.tag}`;
  const lookup = gh(['api', endpoint], true);
  let release;
  if (lookup.status === 0) {
    release = JSON.parse(lookup.stdout);
  } else {
    assert(lookup.stderr.includes('(HTTP 404)'), lookup.stderr);
    gh(['release', 'create', info.tag, '--repo', repo, '--verify-tag', '--draft', '--title', `CoCo Music ${version}`, '--notes-file', info.notes, `--prerelease=${info.prerelease}`]);
    release = JSON.parse(gh(['api', endpoint]).stdout);
  }
  if (!release.draft) {
    // A retried job must never overwrite files in an already-public release.
    verifyUploadedAssets(release.assets, manifest);
    console.log(`Already published and verified: ${release.html_url}`);
    return;
  }
  gh(['release', 'upload', info.tag, ...manifest.map(file => path.join('dist', file.name)), '--repo', repo, '--clobber']);
  release = JSON.parse(gh(['api', endpoint]).stdout);
  verifyUploadedAssets(release.assets, manifest);
  gh(['release', 'edit', info.tag, '--repo', repo, '--title', `CoCo Music ${version}`, '--notes-file', info.notes, `--prerelease=${info.prerelease}`, '--draft=false', `--latest=${!info.prerelease}`]);
  console.log(`Published https://github.com/${repo}/releases/tag/${info.tag}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `Published [CoCo Music ${version}](https://github.com/${repo}/releases/tag/${info.tag}) with ${names.length} installers and SHA256SUMS.txt.\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
