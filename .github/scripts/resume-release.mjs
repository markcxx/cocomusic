import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { releaseInfo } from './release.mjs';

const { RELEASE_TAG: tag, SOURCE_RUN_ID: run, GITHUB_REPOSITORY: repo } = process.env;
assert(tag?.startsWith('v'), 'A version tag is required');
releaseInfo(tag.slice(1), tag);
assert.match(run || '', /^\d+$/, 'Source run must be a numeric Actions run ID');
assert(repo, 'Repository is required');
function execute(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
const sha = execute('git', ['rev-parse', '--verify', '--end-of-options', `${tag}^{commit}`]).trim();
const source = JSON.parse(execute('gh', ['api', `repos/${repo}/actions/runs/${run}`]));
assert.equal(source.head_sha, sha, 'Artifacts must come from the exact tagged commit');
assert.equal(source.head_repository.full_name, repo, 'Artifacts must come from this repository');
assert.equal(source.event, 'push', 'Only tag-triggered release builds can be resumed');
assert.equal(source.path, '.github/workflows/release.yml', 'Artifacts must come from the Release workflow');
assert.equal(source.status, 'completed', 'Wait for the original workflow to finish');
const pages = JSON.parse(execute('gh', ['api', `repos/${repo}/actions/runs/${run}/jobs?per_page=100`, '--paginate', '--slurp']));
const jobs = pages.flatMap(page => page.jobs);
for (const name of ['Validate release', 'macOS (Apple Silicon)', 'macOS (Intel)', 'Windows (x64)', 'Linux (x64)']) {
  assert(jobs.some(job => job.name === name && job.conclusion === 'success'), `Original build did not succeed: ${name}`);
}
const pkg = execute('git', ['show', `${tag}:package.json`]);
const info = releaseInfo(JSON.parse(pkg).version, tag);
const notes = execute('git', ['show', `${tag}:${info.notes}`]);
assert(notes.trim().length > 80, 'Tagged release notes are missing');
await mkdir(path.join('release-context', path.dirname(info.notes)), { recursive: true });
await writeFile('release-context/package.json', pkg);
await writeFile(path.join('release-context', info.notes), notes);
console.log(`Verified ${tag}: reusing installers from run ${run}, commit ${sha}`);
