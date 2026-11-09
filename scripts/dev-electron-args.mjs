import path from 'node:path';
import { parseArgs } from 'node:util';

export function devElectronArgs(args, platform = process.platform, env = process.env) {
  const { values, positionals } = parseArgs({
    args, options: { 'ozone-platform': { type: 'string' } }, allowPositionals: true, strict: false,
  });
  // Set the backend on the supervised child, including every hot restart.
  // Its exit otherwise tells the runner to stop Next and the compiler.
  const backend = platform === 'linux' && (values['ozone-platform'] ?? (env.DISPLAY && 'x11'));
  return {
    switches: backend ? [`--ozone-platform=${backend}`] : [],
    openFiles: positionals.map(file => path.resolve(file)),
  };
}
