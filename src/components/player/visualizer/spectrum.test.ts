import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Spectrum } from './spectrum';

/** Minimal analyser stand-in: every bin at `level`. */
function analyser(level: number) {
  return {
    context: { sampleRate: 48_000 },
    getByteFrequencyData: (bins: Uint8Array) => bins.fill(level),
  } as unknown as AnalyserNode;
}

test('bands rise towards loud input and stay within 0…1', () => {
  const spectrum = new Spectrum(24);
  const bins = new Uint8Array(1024);
  for (let i = 0; i < 20; i += 1) spectrum.sample(analyser(255), bins, true);
  assert.ok(spectrum.values.every(value => value > 0.6 && value <= 1));
  assert.ok(spectrum.bass() > 0.6);
});

test('bands fall back to rest when playback stops, slower than they rose', () => {
  const spectrum = new Spectrum(16);
  const bins = new Uint8Array(1024);
  spectrum.sample(analyser(255), bins, true);
  const risen = spectrum.values[0];
  spectrum.sample(null, null, false);
  const fallen = risen - spectrum.values[0];
  assert.ok(fallen > 0 && fallen < risen, 'falls, but less than one rise step');
  for (let i = 0; i < 200; i += 1) spectrum.sample(null, null, false);
  assert.equal(spectrum.moving(), false);
});

test('after a pause the bands ease down over a couple of seconds, not at once', () => {
  const spectrum = new Spectrum(16);
  const bins = new Uint8Array(1024);
  for (let i = 0; i < 30; i += 1) spectrum.sample(analyser(255), bins, true);
  const peak = spectrum.values[0];
  // ~0.5 s at 60 fps: still clearly visible.
  for (let i = 0; i < 30; i += 1) spectrum.sample(analyser(255), bins, false);
  assert.ok(spectrum.values[0] > peak * 0.25, `still ${spectrum.values[0]} after 0.5 s`);
  // ~3 s: settled.
  for (let i = 0; i < 150; i += 1) spectrum.sample(analyser(255), bins, false);
  assert.equal(spectrum.moving(), false);
});

test('synthetic motion stays in range', () => {
  const spectrum = new Spectrum(32);
  for (let t = 0; t < 5; t += 0.016) spectrum.synthetic(t, true);
  assert.ok(spectrum.values.every(value => value >= 0 && value <= 1));
  assert.ok(spectrum.moving());
});
