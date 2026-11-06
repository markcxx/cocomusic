import { constants, createCipheriv, createDecipheriv, createHash, publicEncrypt, randomBytes } from 'node:crypto';
import os from 'node:os';
import { jsonStore } from '../../local/store';
import { session } from '../session';
import { LITE_PUBLIC_KEY } from './config';

export interface ConceptDevice {
  guid: string;
  mid: string;
  dfid?: string;
  registeredAt?: number;
}
const md5 = (value: string) => createHash('md5').update(value).digest('hex');
/** Decimal MID encoding of the md5 GUID, without precision loss. */
export const conceptMid = (guid: string) => BigInt(`0x${md5(guid)}`).toString(10);

/** Device registration belongs to the installation, and survives account logout. */
export function deviceCoordinator(deps: {
  read: () => ConceptDevice | null;
  save: (value: ConceptDevice) => void;
  installationId: () => string;
  register: (value: ConceptDevice) => Promise<string>;
}) {
  let running: Promise<void> | undefined;
  const current = (): ConceptDevice => {
    const previous = deps.read();
    if (previous?.guid && previous.mid) return previous;
    const guid = md5(`${deps.installationId()}:kugou-lite`);
    const value = { guid, mid: conceptMid(guid) };
    deps.save(value);
    return value;
  };
  const ensure = (): Promise<void> => {
    const value = current();
    if (value.dfid && value.dfid !== '-') return Promise.resolve();
    if (running) return running;
    running = (async () => {
      const dfid = await deps.register(value);
      if (!dfid || dfid === '-') throw new Error('酷狗设备注册未返回有效的设备信息');
      deps.save({ ...value, dfid, registeredAt: Date.now() });
    })().finally(() => { running = undefined; });
    return running;
  };
  return { current, ensure };
}

type RegistrationRequest = {
  base: string; path: string; method: 'POST'; params: Record<string, string | number>; data: string; binary: true; anonymous: true;
};
type SendRegistration = (request: RegistrationRequest) => Promise<Buffer>;

async function registerDevice(identity: ConceptDevice, send: SendRegistration): Promise<string> {
  const aes = randomBytes(6).toString('hex').slice(0, 6);
  const digest = md5(aes);
  const cipher = createCipheriv('aes-128-cbc', digest.slice(0, 16), digest.slice(16));
  const payload = {
    availableRamSize: os.freemem(), availableRomSize: 0, availableSDSize: 0,
    basebandVer: '', batteryLevel: 0, batteryStatus: 0, brand: 'unknown', buildSerial: 'unknown',
    device: os.machine(), imei: identity.guid, imsi: '', manufacturer: 'unknown', uuid: identity.guid,
    accelerometer: false, accelerometerValue: '', gravity: false, gravityValue: '', gyroscope: false, gyroscopeValue: '',
    light: false, lightValue: '', magnetic: false, magneticValue: '', orientation: false, orientationValue: '', temperature: false, temperatureValue: '',
  };
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]).toString('base64');
  const p = publicEncrypt({ key: LITE_PUBLIC_KEY, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(JSON.stringify({ aes, uid: 0, token: '' }))).toString('hex');
  const bytes = await send({ base: 'https://userservice.kugou.com', path: '/risk/v3/r_register_dev', method: 'POST', params: { part: 1, platid: 1, p }, data, binary: true, anonymous: true });
  const decipher = createDecipheriv('aes-128-cbc', digest.slice(0, 16), digest.slice(16));
  let result: { status?: number; error_code?: number; error_msg?: string; data?: { dfid?: string } };
  try { result = JSON.parse(Buffer.concat([decipher.update(bytes), decipher.final()]).toString('utf8')); }
  catch { throw new Error('酷狗设备注册响应无法解析'); }
  if (Number(result.status) !== 1 || !result.data?.dfid) throw new Error(result.error_msg || '酷狗设备注册失败');
  return result.data.dfid;
}

const store = jsonStore<ConceptDevice | null>('kugou-device.json', () => null);
let sendRegistration: SendRegistration;
const coordinator = deviceCoordinator({ read: store.read, save: store.write, installationId: session.deviceId, register: identity => registerDevice(identity, sendRegistration) });
export const conceptDevice = coordinator.current;
export function ensureConceptDevice(send: SendRegistration) {
  sendRegistration = send;
  return coordinator.ensure();
}
