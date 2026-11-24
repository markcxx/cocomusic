import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';

if (process.platform === 'darwin') {
  mkdirSync('dist-electron/native', { recursive: true });
  execFileSync('xcrun', [
    'clang++', '-std=c++17', '-O2', '-fobjc-arc', '-bundle', '-undefined', 'dynamic_lookup',
    '-arch', 'arm64', '-arch', 'x86_64', '-mmacosx-version-min=11.0', '-framework', 'AppKit',
    '-I', 'node_modules/koffi/vendor/node-api-headers/include', 'electron/native/scenic-glass.mm',
    '-o', 'dist-electron/native/scenic-glass.node',
  ], { stdio: 'inherit' });
}
