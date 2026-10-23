import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Constants follow NeteaseCloudMusicApi util/crypto.js (MIT).
const IV = Buffer.from('0102030405060708');
const PRESET_KEY = '0CoJUm6Qyw8W8jud';
const EAPI_KEY = Buffer.from('e82ckenh8dichen8');
const BASE62 = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
// Modulus of the public key used by music.163.com's web client (exponent 65537).
const RSA_MODULUS = BigInt(
  '0xe0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7',
);

function aesCbcBase64(text: string, key: string) {
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(key), IV);
  return Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]).toString('base64');
}

function modPow(base: bigint, exponent: bigint, modulus: bigint) {
  let result = 1n;
  let b = base % modulus;
  let e = exponent;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modulus;
    b = (b * b) % modulus;
    e >>= 1n;
  }
  return result;
}

/** Textbook (unpadded) RSA as the web client does, on the reversed secret. */
function rsaNoPadding(secret: string) {
  const reversed = Buffer.from([...secret].reverse().join(''));
  return modPow(BigInt(`0x${reversed.toString('hex')}`), 65537n, RSA_MODULUS).toString(16).padStart(256, '0');
}

/** Web client encryption (music.163.com/weapi/*). */
export function weapi(payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  let secret = '';
  for (const byte of randomBytes(16)) secret += BASE62[byte % 62];
  return {
    params: aesCbcBase64(aesCbcBase64(text, PRESET_KEY), secret),
    encSecKey: rsaNoPadding(secret),
  };
}

/** Desktop/mobile client encryption (interface.music.163.com/eapi/*). */
export function eapi(uri: string, payload: Record<string, unknown>) {
  const text = JSON.stringify(payload);
  const digest = createHash('md5').update(`nobody${uri}use${text}md5forencrypt`).digest('hex');
  const cipher = createCipheriv('aes-128-ecb', EAPI_KEY, null);
  const data = `${uri}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  return { params: Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('hex').toUpperCase() };
}

export function eapiDecrypt(buffer: Buffer) {
  const decipher = createDecipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([decipher.update(buffer), decipher.final()]).toString('utf8');
}
