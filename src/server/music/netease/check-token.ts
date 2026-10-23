import { createHash, randomBytes } from 'node:crypto';

/**
 * x-anticheattoken required by some eapi write endpoints (e.g. playlist/create).
 * Port of multiPlatformMusicApi platforms/netease/util/checkToken.js.
 */
const SALT = 'dAWsBhCqtOaNLLJ25hBzWbqWXwiK99Wd';
const KEY = Buffer.from([31, 125, 244, 60, 32, 48]);
const K = 4294967296;

const u32be = (n: number) => Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]);

/** Interleave 8 random bytes with the 8-byte big-endian timestamp, nibble by nibble. */
function makeE(now: number) {
  const clock = Buffer.concat([u32be(Math.floor(now / K) >>> 0), u32be((now % K) >>> 0)]);
  const rand = randomBytes(8);
  const out = Buffer.alloc(16);
  for (let l = 0; l < 16; l++) {
    const g = l >> 1;
    const r = rand[g];
    const c = clock[g];
    out[l] = (l & 1) === 0
      ? ((r & 0x10) >>> 4) | ((r & 0x20) >>> 3) | ((r & 0x40) >>> 2) | ((r & 0x80) >>> 1) | ((c & 0x10) >>> 3) | ((c & 0x20) >>> 2) | ((c & 0x40) >>> 1) | (c & 0x80)
      : (r & 0x01) | ((r & 0x02) << 1) | ((r & 0x04) << 2) | ((r & 0x08) << 3) | ((c & 0x01) << 1) | ((c & 0x02) << 2) | ((c & 0x04) << 3) | ((c & 0x08) << 4);
  }
  return out;
}

function b(now = Date.now()) {
  const e = makeE(now);
  const md5 = createHash('md5').update(e.toString('hex') + SALT, 'utf8').digest('hex');
  return Buffer.concat([Buffer.from(md5.slice(0, 16), 'hex'), e]).toString('base64').replace(/=+$/, '');
}

/** XOR with KEY then 8-bit negate, as hex. Input %xx escapes are decoded to bytes. */
function la(input: string) {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '%' && i + 2 < input.length) { bytes.push(parseInt(input.slice(i + 1, i + 3), 16) & 0xff); i += 2; }
    else bytes.push(input.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes.map((value, index) => (256 - ((value ^ KEY[index % KEY.length]) & 0xff)) & 0xff)).toString('hex');
}

export function eapiCheckToken() {
  return la(JSON.stringify({ r: 1, d: 'jiEABHxUxtVBFBVEQFKSgnoWYHsMEqAV', b: b() }));
}
