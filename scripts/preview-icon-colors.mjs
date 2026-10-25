// Compare color proposals without touching the active brand assets.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'docs/design/icon-colors-round2');
const source = path.join(root, 'build/CoCoMusic.icon');
const composer = '/Applications/Xcode.app/Contents/Applications/Icon Composer.app/Contents/Executables/ictool';
const mark = readFileSync(path.join(source, 'Assets/Mark.svg'), 'utf8');
const config = JSON.parse(readFileSync(path.join(source, 'icon.json'), 'utf8'));
const variants = [
  ['01', '雾紫银', ['#A095BC', '#6E6592'], '#FFFFFF', '灰调紫色 · 克制柔和'],
  ['02', '鸢蓝', ['#778BEC', '#4F5EB7'], '#FFFFFF', '蓝紫过渡 · 清晰醒目'],
  ['03', '极光青', ['#70B7B7', '#388D99'], '#FFFFFF', '青蓝过渡 · 与紫色呼应'],
  ['04', '雨后蓝', ['#70A0C2', '#4E719C'], '#FFFFFF', '低饱和蓝 · 干净平衡'],
  ['05', '紫藤', ['#A485CF', '#7152A5'], '#FFFFFF', '柔紫到深紫 · 延续界面色系'],
  ['06', '灰橄榄', ['#A4AC8A', '#707C68'], '#FFFFFF', '灰绿底色 · 自然安静'],
  ['07', '香槟棕', ['#B39C7B', '#847664'], '#FFFFFF', '暖灰金棕 · 配合冷紫色'],
  ['08', '夜幕', ['#514765', '#2F2A42'], '#FFFFFF', '深灰紫色 · 白色标志突出'],
];
const color = hex => `srgb:${[1,3,5].map(i => (Number.parseInt(hex.slice(i,i+2),16)/255).toFixed(5)).join(',')},1.00000`;
mkdirSync(output, { recursive: true });
const temporary = mkdtempSync(path.join(os.tmpdir(), 'coco-color-proposals-'));
try {
  for (const [id, , background, foreground] of variants) {
    const bundle = path.join(temporary, `${id}.icon`);
    mkdirSync(path.join(bundle, 'Assets'), { recursive: true });
    if (foreground !== '#FFFFFF') throw new Error('The symbol must remain pure white');
    writeFileSync(path.join(bundle, 'Assets/Mark.svg'), mark.replace('fill="#ffffff"', 'fill="#FFFFFF"'));
    writeFileSync(path.join(bundle, 'icon.json'), JSON.stringify({ ...config, fill: { 'linear-gradient': background.map(color), orientation: { start: { x: 0, y: 0 }, stop: { x: 0.8, y: 1 } } } }));
    const image = path.join(temporary, `${id}.png`);
    execFileSync(composer, [bundle, '--export-image', '--output-file', image, '--platform', 'macOS', '--rendition', 'Default', '--width', '1024', '--height', '1024', '--scale', '1'], { stdio: 'pipe' });
    await sharp(image).resize(824,824).extend({ top: 100, bottom: 100, left: 100, right: 100, background: '#00000000' }).png().toFile(path.join(output, `${id}.png`));
  }
  const width = 1704, height = 1096;
  const cards = [];
  const images = [];
  for (const [index, [id, name, background, , note]] of variants.entries()) {
    const x = 36 + index % 4 * 416;
    const y = 164 + Math.floor(index / 4) * 444;
    cards.push(`<rect x="${x}" y="${y}" width="384" height="416" rx="22" fill="#fff" stroke="#E2DCEA"/>
      <text x="${x+24}" y="${y+40}" font-size="22" font-weight="650" fill="#30263F">${id} · ${name}</text>
      <rect x="${x+16}" y="${y+62}" width="352" height="194" rx="16" fill="url(#purple)"/>
      <text x="${x+24}" y="${y+289}" font-size="17" fill="#6E637F">${note}</text>
      <circle cx="${x+30}" cy="${y+320}" r="7" fill="${background[1]}" stroke="#D8D0E1"/>
      <text x="${x+46}" y="${y+326}" font-size="15" fill="#564B66">${background[0]} → ${background[1]}</text>
      <text x="${x+24}" y="${y+377}" font-size="15" fill="#80738C">小尺寸预览</text>
      <rect x="${x+187}" y="${y+344}" width="172" height="54" rx="13" fill="#EBE6F4"/>
      <text x="${x+121}" y="${y+376}" font-size="13" fill="#80738C">32 / 48 px</text>`);
    images.push({ input: await sharp(path.join(output, `${id}.png`)).resize(194,194).toBuffer(), left: x+95, top: y+62 });
    images.push({ input: await sharp(path.join(output, `${id}.png`)).resize(32,32).toBuffer(), left:x+214, top:y+355 });
    images.push({ input: await sharp(path.join(output, `${id}.png`)).resize(48,48).toBuffer(), left:x+280, top:y+347 });
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="purple" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D6C9EF"/><stop offset="1" stop-color="#E4E8F8"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="#F4F1F8"/>
    <g font-family="PingFang SC, Helvetica Neue, sans-serif">
      <text x="40" y="64" font-size="34" font-weight="650" fill="#30263F">CoCo Music · 第二轮配色</text>
      <text x="40" y="106" font-size="19" fill="#766883">标志统一为纯白 #FFFFFF，只调整背景。统一尺寸与紫色衬底，候选配色尚未应用。</text>
      ${cards.join('')}
      <text x="40" y="1070" font-size="15" fill="#80738C">背景采用轻微渐变与原生材质。下方附 32 / 48 px 实际小尺寸，便于比较 Dock 中的辨识度。</text>
    </g></svg>`;
  await sharp(Buffer.from(svg)).composite(images).png().toFile(path.join(output, 'color-options.png'));
  writeFileSync(path.join(output, 'README.md'), `# 图标配色候选\n\n第二轮配色仅用于预览，尚未应用。标志固定为纯白色 #FFFFFF，保持修正后的 Dock 尺寸，只调整背景颜色。\n\n![八款配色对比](color-options.png)\n\n| 编号 | 名称 | 背景色 | 标志色 | 方向 |\n| --- | --- | --- | --- | --- |\n${variants.map(([id,name,bg,fg,note])=>`| ${id} | ${name} | ${bg.join(' → ')} | ${fg} | ${note} |`).join('\n')}\n\n使用 \`node scripts/preview-icon-colors.mjs\` 重新生成，需要 Xcode 的 Icon Composer 工具。\n`);
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log('Color proposals saved to docs/design/icon-colors-round2/color-options.png');
