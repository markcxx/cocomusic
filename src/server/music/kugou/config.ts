/** Explicit per-provider identity; never change process.env to switch accounts. */
export type KugouSource = 'kugou' | 'kugou-lite';
export const KUGOU_CONFIG = {
  kugou: { appid: 1005, clientver: 12569, salt: 'OIlwieks28dk2k092lksi2UIkp', streamSalt: '57ae12eb6890223e355ccfcb74edf70d', pid: 2, pageId: 151369488, parentPage: '463467626,350369493,788954147' },
  'kugou-lite': { appid: 3116, clientver: 11440, salt: 'LnT6xpN3khm36zse0QzvmgTZ3waWdRSA', streamSalt: '185672dd44712f60bb1736df5a377e82', pid: 411, pageId: 967177915, parentPage: '356753938,823673182,967485191' },
} as const;
export const LITE_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDECi0Np2UR87scwrvTr72L6oO01rBbbBPriSDFPxr3Z5syug0O24QyQO8bg27+0+4kBzTBTBOZ/WWU0WryL1JSXRTXLgFVxtzIY41Pe7lPOgsfTCn5kZcvKhYKJesKnnJDNr5/abvTGf+rHG3YRwsCHcQ08/q6ifSioBszvb3QiwIDAQAB\n-----END PUBLIC KEY-----';
