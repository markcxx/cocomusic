import assert from 'node:assert/strict';
import test from 'node:test';
import { cardProgress, FLOW, flowPose, shortAngle } from './geometry';

test('the centre card faces the viewer, neighbours turn towards it', () => {
  assert.deepEqual(flowPose(0), { x: 0, z: 0, rotateY: FLOW.centreAngle, zIndex: 1000 });
  const left = flowPose(-1);
  const right = flowPose(1);
  assert.equal(left.x, -FLOW.neighbor);
  assert.equal(right.x, FLOW.neighbor);
  assert.equal(left.rotateY, FLOW.angle);
  assert.equal(right.rotateY, -FLOW.angle);
  assert.equal(flowPose(3).x, FLOW.neighbor + 2 * FLOW.spacing);
});

test('nearer cards stack above farther ones', () => {
  assert.ok(flowPose(0.4).zIndex > flowPose(1).zIndex);
  assert.ok(flowPose(-1).zIndex > flowPose(-2).zIndex);
});

test('poses are continuous while gliding', () => {
  for (let d = -4; d <= 4; d += 0.01) {
    const a = flowPose(d);
    const b = flowPose(d + 0.001);
    assert.ok(Math.abs(a.x - b.x) < 0.01 && Math.abs(a.rotateY - b.rotateY) < 0.5, `jump at ${d}`);
  }
});

test('the centre opens first, far cards last; all are in place at the end', () => {
  assert.ok(cardProgress(0.3, 0) > cardProgress(0.3, 1));
  assert.ok(cardProgress(0.5, 1) > cardProgress(0.5, 4));
  assert.equal(cardProgress(0, 0), 0);
  for (const d of [0, 0.5, 1, 2, 5, 9]) assert.equal(cardProgress(1, d), 1);
});

test('spinning covers unwind the short way', () => {
  assert.equal(shortAngle(350), -10);
  assert.equal(shortAngle(-200), 160);
  assert.equal(shortAngle(90), 90);
});
