import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentPalette, contrast, deepenTint, hsvToRgb, parseHex, playerAccentRgb, rgbToHsv, surfacePalette, toHex } from './color.ts';

test('parses short and long hex, rejects junk', () => {
  assert.deepEqual(parseHex('#abc'), { r: 170, g: 187, b: 204 });
  assert.deepEqual(parseHex('6F5AA8'), { r: 111, g: 90, b: 168 });
  assert.equal(parseHex('#12345'), null);
  assert.equal(parseHex('red'), null);
});

test('hsv round-trips through rgb', () => {
  for (const hex of ['#9b87bf', '#ff0000', '#00ff7f', '#123456', '#ffffff', '#000000']) {
    assert.equal(toHex(hsvToRgb(rgbToHsv(parseHex(hex)!))), hex);
  }
});

test('accent palette keeps text readable in both themes, for any pick', () => {
  const light = parseHex('#ececf8')!;
  const dark = parseHex('#221f32')!;
  for (const pick of ['#9b87bf', '#ffff00', '#00ffff', '#ffffff', '#000000', '#e0605a', '#7f7f7f']) {
    const l = accentPalette(pick, 'light');
    const d = accentPalette(pick, 'dark');
    assert.ok(contrast(parseHex(l.strong)!, light) >= 4.5, `light strong for ${pick}: ${l.strong}`);
    assert.ok(contrast(parseHex(d.strong)!, dark) >= 4.5, `dark strong for ${pick}: ${d.strong}`);
    assert.match(l.accentRgb, /^\d+, \d+, \d+$/);
  }
});

test('the picked hue survives', () => {
  const hue = (hex: string) => rgbToHsv(parseHex(hex)!).h;
  const palette = accentPalette('#3d8a72', 'light');
  assert.ok(Math.abs(hue(palette.strong) - hue('#3d8a72')) < 6);
});

test('surfaces follow the chosen hue in both schemes and neutral picks stay neutral', () => {
  for (const scheme of ['light', 'dark'] as const) {
    const green = parseHex(surfacePalette('#00ff00', scheme)['--shell'])!;
    assert.ok(green.g > green.r && green.g > green.b);
    const red = parseHex(surfacePalette('#ff0000', scheme)['--shell'])!;
    assert.ok(red.r > red.g && red.r > red.b);
    for (const pick of ['#ffffff', '#000000', '#808080']) {
      const palette = surfacePalette(pick, scheme);
      const shell = parseHex(palette['--shell'])!;
      assert.equal(shell.r, shell.g);
      assert.equal(shell.g, shell.b);
      const glow = palette['--backdrop-primary-rgb'].split(', ').map(Number);
      assert.equal(glow[0], glow[1]);
      assert.equal(glow[1], glow[2]);
    }
  }
});

test('theme text remains readable against the derived shell and solid panels', () => {
  for (const scheme of ['light', 'dark'] as const) {
    for (const pick of ['#9b87bf', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ffffff', '#000000']) {
      const palette = surfacePalette(pick, scheme);
      const surface = palette['--surface-rgb'].split(', ').map(Number);
      for (const background of [parseHex(palette['--shell'])!, { r: surface[0], g: surface[1], b: surface[2] }]) {
        for (const token of ['--text-strong', '--text', '--text-secondary', '--text-muted']) {
          assert.ok(contrast(parseHex(palette[token])!, background) >= 4.5, `${scheme} ${pick} ${token}`);
        }
        assert.ok(contrast(parseHex(accentPalette(pick, scheme).strong)!, background) >= 4.5);
      }
    }
  }
});

test('a deepened cover tint carries white text, whatever the cover colour', () => {
  for (const tint of ['255, 255, 255', '0, 0, 0', '240, 220, 120', '120, 200, 255', '200, 60, 60', '128, 128, 128']) {
    const [r, g, b] = deepenTint(tint).split(',').map(Number);
    assert.ok(contrast({ r: 255, g: 255, b: 255 }, { r, g, b }) >= 4.5, `${tint} → ${deepenTint(tint)}`);
  }
});

test('Fluent player accents stay readable on a contrasting or matching cover', () => {
  for (const cover of ['255, 230, 10', '0, 0, 255', '255, 0, 0', '0, 0, 0']) {
    const background = deepenTint(cover);
    const [r, g, b] = background.split(',').map(Number);
    for (const accent of ['#ff0000', '#0000ff', '#00ff00', '#000000', '#ffffff']) {
      const [red, green, blue] = playerAccentRgb(accent, background).split(',').map(Number);
      assert.ok(contrast({ r, g, b }, { r: red, g: green, b: blue }) >= 4.5);
    }
  }
});
