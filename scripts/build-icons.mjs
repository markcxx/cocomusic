// Rebuild committed app icons from the SVG mark. Native macOS assets need Xcode 26+.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = readFileSync(path.join(root, 'public/images/logo.svg'));
const png = await sharp(logo).resize(1024, 1024).png().toBuffer();
await Promise.all(['build/icon.png', 'public/images/logo.png'].map(file => sharp(png).toFile(path.join(root, file))));

// Windows/Linux use color tray icons. macOS keeps its system-tinted template.
await Promise.all([[16, 'tray-color.png'], [32, 'tray-color@2x.png']].map(([size, name]) =>
  sharp(logo).resize(size, size).png().toFile(path.join(root, 'build/tray', name))));

// Windows ICO: PNG-compressed representations, including the native small sizes.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map(size => sharp(logo).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] === 256 ? 0 : sizes[index];
  header[entry + 1] = header[entry];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(image.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
const { writeFileSync } = await import('node:fs');
writeFileSync(path.join(root, 'build/icon.ico'), Buffer.concat([header, ...images]));

if (process.platform === 'darwin') {
  const developer = process.env.DEVELOPER_DIR || '/Applications/Xcode.app/Contents/Developer';
  const xcode = path.dirname(developer);
  const composer = path.join(xcode, 'Applications/Icon Composer.app/Contents/Executables/ictool');
  const output = path.join(root, 'build/mac');
  const source = path.join(root, 'build/CoCoMusic.icon');
  const temp = mkdtempSync(path.join(os.tmpdir(), 'coco-icons-'));
  mkdirSync(output, { recursive: true });
  try {
    execFileSync(composer, [source, '--export-image', '--output-file', path.join(temp, 'mac-full.png'), '--platform', 'macOS', '--rendition', 'Default', '--width', '1024', '--height', '1024', '--scale', '1'], { stdio: 'inherit' });
    // ictool exports an edge-to-edge rendition. setIcon() does not apply the
    // bundle's icon layout: match the system's ~80% artwork footprint explicitly.
    // Keep this Dock-only padding out of Assets.car and the compiled ICNS.
    await sharp(path.join(temp, 'mac-full.png')).resize(824, 824)
      .extend({ top: 100, bottom: 100, left: 100, right: 100, background: '#00000000' })
      .png().toFile(path.join(root, 'build/icon-mac.png'));
    execFileSync(path.join(developer, 'usr/bin/actool'), [source, '--compile', output, '--platform', 'macosx', '--minimum-deployment-target', '12.0', '--app-icon', 'CoCoMusic', '--output-partial-info-plist', path.join(temp, 'icon.plist'), '--output-format', 'human-readable-text'], { stdio: 'inherit' });
    copyFileSync(path.join(output, 'CoCoMusic.icns'), path.join(root, 'build/icon.icns'));
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
console.log('Updated app icons.');
