import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accentPalette, contrast, hsvToRgb, parseHex, rgbToHsv, toHex } from './color.ts';

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
