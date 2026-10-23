// Reinstall when package-lock.json changed since the last install, so pulling
// new dependencies never ends in "Module not found" at runtime.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(root, 'package-lock.json');
const installed = path.join(root, 'node_modules', '.package-lock.json');

const stale = !existsSync(installed) || statSync(lock).mtimeMs > statSync(installed).mtimeMs;
if (stale) {
  console.log('[cocomusic] 依赖已变更，正在执行 npm ci …');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['ci', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
