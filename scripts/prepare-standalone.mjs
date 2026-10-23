// `next build` (output: 'standalone') omits static assets from .next/standalone;
// copy them next to server.js so the packaged server is self-contained.
import { cpSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const standalone = path.join(root, '.next', 'standalone');
if (!existsSync(path.join(standalone, 'server.js'))) throw new Error(`Standalone server not found in ${standalone}`);

cpSync(path.join(root, '.next', 'static'), path.join(standalone, '.next', 'static'), { recursive: true });
cpSync(path.join(root, 'public'), path.join(standalone, 'public'), { recursive: true });
console.log('Prepared standalone server in', path.relative(root, standalone));
