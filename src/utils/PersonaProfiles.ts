export interface PersonaCookieTable {
  _ga: string;
  _gid: string;
  _gat: string;
  _gcl_au: string;
  _fbp: string;
  _fbc: string;
  _dd_s: string;
  __secure: string;
  __host: string;
  __utma: string;
  __utmz: string;
  _pin_unauth: string;
  _tt_enable_cookie: string;
  uid: string;
  id: string;
  tracker: string;
  ads: string;
  generic: string;
}

export interface PersonaProfile {
  id: string;
  displayName: string;
  cookieValues: PersonaCookieTable;
  hardwareConcurrency: number;
  deviceMemory: number;
  language: string;
  languages: readonly string[];
  platform: string;
  userAgent: string;
  vendor: string;
  doNotTrack: string;
  maxTouchPoints: number;
  webdriver: boolean;
  uaPlatform: string;
  uaArchitecture: string;
  uaBitness: string;
  uaPlatformVersion: string;
  uaFullVersion: string;
  uaBrands: ReadonlyArray<{ brand: string; version: string }>;
  uaFullVersionList: ReadonlyArray<{ brand: string; version: string }>;
  screenColorDepth: number;
  screenPixelDepth: number;
  devicePixelRatio: number;
  timezone: string;
  timezoneOffset: number;
  webglVendor: string;
  webglRenderer: string;
  glVendor: string;
  glVersion: string;
}

export const PERSONA_PROFILES: readonly PersonaProfile[] = [
  {
    id: 'gingerbread-man',
    displayName: 'Gingerbread Man',
    cookieValues: {
      _ga: 'GA1.2.1100100100.1700000001',
      _gid: 'GA1.2.1100100100.1700000001',
      _gat: '1',
      _gcl_au: '1.1.1100100100.1700000001',
      _fbp: 'fb.1.1700000001000.1100100100',
      _fbc: 'fb.1.1700000001000.IwAR0GINGERBREADMAN0000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000001001&created=1700000001000&expire=1700000061000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '110010010.1100100100.1700000001.1700000001.1700000001.1',
      __utmz: '110010010.1700000001.1.1.utmcsr=gingerbread|utmccn=man|utmcmd=none',
      _pin_unauth: 'dWlkPUdJTkdFUkJSRUFELU1BTi1ERUNPWQ',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000001001',
      id: '00000000-0000-0000-0000-000000001001',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'Win32',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    vendor: 'Google Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'Windows',
    uaArchitecture: 'x86',
    uaBitness: '64',
    uaPlatformVersion: '10.0.0',
    uaFullVersion: '120.0.0.0',
    uaBrands: [
      { brand: 'Chromium', version: '120' },
      { brand: 'Not:A-Brand', version: '99' },
      { brand: 'Google Chrome', version: '120' }
    ],
    uaFullVersionList: [
      { brand: 'Chromium', version: '120.0.0.0' },
      { brand: 'Not:A-Brand', version: '99.0.0.0' },
      { brand: 'Google Chrome', version: '120.0.0.0' }
    ],
    screenColorDepth: 24,
    screenPixelDepth: 24,
    devicePixelRatio: 1,
    timezone: 'America/New_York',
    timezoneOffset: 300,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer:
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  },
  {
    id: 'gingerbread-woman',
    displayName: 'Gingerbread Woman',
    cookieValues: {
      _ga: 'GA1.2.2200200200.1700000002',
      _gid: 'GA1.2.2200200200.1700000002',
      _gat: '1',
      _gcl_au: '1.1.2200200200.1700000002',
      _fbp: 'fb.1.1700000002000.2200200200',
      _fbc: 'fb.1.1700000002000.IwAR0GINGERBREADWMN0000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000002002&created=1700000002000&expire=1700000062000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '220020020.2200200200.1700000002.1700000002.1700000002.1',
      __utmz: '220020020.1700000002.1.1.utmcsr=gingerbread|utmccn=woman|utmcmd=none',
      _pin_unauth: 'dWlkPUdJTkdFUkJSRUFELVdNTi1ERUNPWQ',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000002002',
      id: '00000000-0000-0000-0000-000000002002',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 12,
    deviceMemory: 16,
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'Win32',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    vendor: 'Google Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'Windows',
    uaArchitecture: 'x86',
    uaBitness: '64',
    uaPlatformVersion: '15.0.0',
    uaFullVersion: '121.0.0.0',
    uaBrands: [
      { brand: 'Chromium', version: '121' },
      { brand: 'Not:A-Brand', version: '24' },
      { brand: 'Google Chrome', version: '121' }
    ],
    uaFullVersionList: [
      { brand: 'Chromium', version: '121.0.0.0' },
      { brand: 'Not:A-Brand', version: '24.0.0.0' },
      { brand: 'Google Chrome', version: '121.0.0.0' }
    ],
    screenColorDepth: 24,
    screenPixelDepth: 24,
    devicePixelRatio: 1,
    timezone: 'America/Los_Angeles',
    timezoneOffset: 480,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer:
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  },
  {
    id: 'snickerdoodle',
    displayName: 'Snickerdoodle',
    cookieValues: {
      _ga: 'GA1.2.3300300300.1700000003',
      _gid: 'GA1.2.3300300300.1700000003',
      _gat: '1',
      _gcl_au: '1.1.3300300300.1700000003',
      _fbp: 'fb.1.1700000003000.3300300300',
      _fbc: 'fb.1.1700000003000.IwAR0SNICKERDOODLE000000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000003003&created=1700000003000&expire=1700000063000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '330030030.3300300300.1700000003.1700000003.1700000003.1',
      __utmz: '330030030.1700000003.1.1.utmcsr=gingerbread|utmccn=snicker|utmcmd=none',
      _pin_unauth: 'dWlkPVNOSUNLRVJET09ETEUtREVDT1k',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000003003',
      id: '00000000-0000-0000-0000-000000003003',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 8,
    deviceMemory: 16,
    language: 'en-US',
    languages: ['en-US', 'en'],
    platform: 'Win32',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
    vendor: 'Google Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'Windows',
    uaArchitecture: 'x86',
    uaBitness: '64',
    uaPlatformVersion: '15.0.0',
    uaFullVersion: '121.0.0.0',
    uaBrands: [
      { brand: 'Chromium', version: '121' },
      { brand: 'Not:A-Brand', version: '24' },
      { brand: 'Microsoft Edge', version: '121' }
    ],
    uaFullVersionList: [
      { brand: 'Chromium', version: '121.0.0.0' },
      { brand: 'Not:A-Brand', version: '24.0.0.0' },
      { brand: 'Microsoft Edge', version: '121.0.0.0' }
    ],
    screenColorDepth: 24,
    screenPixelDepth: 24,
    devicePixelRatio: 1,
    timezone: 'America/Chicago',
    timezoneOffset: 360,
    webglVendor: 'Google Inc. (Intel)',
    webglRenderer:
      'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  },
  {
    id: 'macaron',
    displayName: 'Macaron',
    cookieValues: {
      _ga: 'GA1.2.4400400400.1700000004',
      _gid: 'GA1.2.4400400400.1700000004',
      _gat: '1',
      _gcl_au: '1.1.4400400400.1700000004',
      _fbp: 'fb.1.1700000004000.4400400400',
      _fbc: 'fb.1.1700000004000.IwAR0MACARON000000000000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000004004&created=1700000004000&expire=1700000064000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '440040040.4400400400.1700000004.1700000004.1700000004.1',
      __utmz: '440040040.1700000004.1.1.utmcsr=gingerbread|utmccn=macaron|utmcmd=none',
      _pin_unauth: 'dWlkPU1BQ0FST04tREVDT1ktVjAwMQ',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000004004',
      id: '00000000-0000-0000-0000-000000004004',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    language: 'fr-FR',
    languages: ['fr-FR', 'fr', 'en-US', 'en'],
    platform: 'MacIntel',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
    vendor: 'Apple Computer, Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'macOS',
    uaArchitecture: 'arm',
    uaBitness: '64',
    uaPlatformVersion: '14.2.1',
    uaFullVersion: '17.2.1',
    uaBrands: [
      { brand: 'Safari', version: '17' }
    ],
    uaFullVersionList: [
      { brand: 'Safari', version: '17.2.1' }
    ],
    screenColorDepth: 30,
    screenPixelDepth: 30,
    devicePixelRatio: 2,
    timezone: 'Europe/Paris',
    timezoneOffset: -60,
    webglVendor: 'Apple Inc.',
    webglRenderer: 'Apple GPU',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  },
  {
    id: 'madeleine',
    displayName: 'Madeleine',
    cookieValues: {
      _ga: 'GA1.2.5500500500.1700000005',
      _gid: 'GA1.2.5500500500.1700000005',
      _gat: '1',
      _gcl_au: '1.1.5500500500.1700000005',
      _fbp: 'fb.1.1700000005000.5500500500',
      _fbc: 'fb.1.1700000005000.IwAR0MADELEINE0000000000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000005005&created=1700000005000&expire=1700000065000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '550050050.5500500500.1700000005.1700000005.1700000005.1',
      __utmz: '550050050.1700000005.1.1.utmcsr=gingerbread|utmccn=madeleine|utmcmd=none',
      _pin_unauth: 'dWlkPU1BREVMRUlORS1ERUNPWS1WMDE',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000005005',
      id: '00000000-0000-0000-0000-000000005005',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 8,
    deviceMemory: 8,
    language: 'en-GB',
    languages: ['en-GB', 'en'],
    platform: 'Linux x86_64',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    vendor: '',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'Linux',
    uaArchitecture: 'x86',
    uaBitness: '64',
    uaPlatformVersion: '6.1.0',
    uaFullVersion: '121.0',
    uaBrands: [
      { brand: 'Firefox', version: '121' }
    ],
    uaFullVersionList: [
      { brand: 'Firefox', version: '121.0' }
    ],
    screenColorDepth: 24,
    screenPixelDepth: 24,
    devicePixelRatio: 1,
    timezone: 'Europe/London',
    timezoneOffset: 0,
    webglVendor: 'Mesa',
    webglRenderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)',
    glVendor: 'Mozilla',
    glVersion: 'Mozilla'
  },
  {
    id: 'biscotti',
    displayName: 'Biscotti',
    cookieValues: {
      _ga: 'GA1.2.6600600600.1700000006',
      _gid: 'GA1.2.6600600600.1700000006',
      _gat: '1',
      _gcl_au: '1.1.6600600600.1700000006',
      _fbp: 'fb.1.1700000006000.6600600600',
      _fbc: 'fb.1.1700000006000.IwAR0BISCOTTI00000000000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000006006&created=1700000006000&expire=1700000066000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '660060060.6600600600.1700000006.1700000006.1700000006.1',
      __utmz: '660060060.1700000006.1.1.utmcsr=gingerbread|utmccn=biscotti|utmcmd=none',
      _pin_unauth: 'dWlkPUJJU0NPVFRJLURFQ09ZLVYwMQ',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000006006',
      id: '00000000-0000-0000-0000-000000006006',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 10,
    deviceMemory: 16,
    language: 'de-DE',
    languages: ['de-DE', 'de', 'en-US', 'en'],
    platform: 'MacIntel',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    vendor: 'Google Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'macOS',
    uaArchitecture: 'arm',
    uaBitness: '64',
    uaPlatformVersion: '14.2.0',
    uaFullVersion: '120.0.0.0',
    uaBrands: [
      { brand: 'Chromium', version: '120' },
      { brand: 'Not:A-Brand', version: '99' },
      { brand: 'Google Chrome', version: '120' }
    ],
    uaFullVersionList: [
      { brand: 'Chromium', version: '120.0.0.0' },
      { brand: 'Not:A-Brand', version: '99.0.0.0' },
      { brand: 'Google Chrome', version: '120.0.0.0' }
    ],
    screenColorDepth: 30,
    screenPixelDepth: 30,
    devicePixelRatio: 2,
    timezone: 'Europe/Berlin',
    timezoneOffset: -60,
    webglVendor: 'Apple Inc.',
    webglRenderer: 'Apple M2',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  },
  {
    id: 'mochi',
    displayName: 'Mochi',
    cookieValues: {
      _ga: 'GA1.2.7700700700.1700000007',
      _gid: 'GA1.2.7700700700.1700000007',
      _gat: '1',
      _gcl_au: '1.1.7700700700.1700000007',
      _fbp: 'fb.1.1700000007000.7700700700',
      _fbc: 'fb.1.1700000007000.IwAR0MOCHI00000000000000000000',
      _dd_s: 'rum=0&id=00000000-0000-0000-0000-000000007007&created=1700000007000&expire=1700000067000',
      __secure: 'gingerbread-secure-cookie-decoy',
      __host: 'gingerbread-host-cookie-decoy',
      __utma: '770070070.7700700700.1700000007.1700000007.1700000007.1',
      __utmz: '770070070.1700000007.1.1.utmcsr=gingerbread|utmccn=mochi|utmcmd=none',
      _pin_unauth: 'dWlkPU1PQ0hJLURFQ09ZLVYwMDEwMDA',
      _tt_enable_cookie: '1',
      uid: '00000000-0000-0000-0000-000000007007',
      id: '00000000-0000-0000-0000-000000007007',
      tracker: 'gingerbread-tracker-cookie-decoy',
      ads: 'gingerbread-ads-cookie-decoy',
      generic: 'gingerbread-man-cookie-decoy-v1'
    },
    hardwareConcurrency: 16,
    deviceMemory: 16,
    language: 'ja-JP',
    languages: ['ja-JP', 'ja', 'en-US', 'en'],
    platform: 'Win32',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    vendor: 'Google Inc.',
    doNotTrack: '1',
    maxTouchPoints: 0,
    webdriver: false,
    uaPlatform: 'Windows',
    uaArchitecture: 'x86',
    uaBitness: '64',
    uaPlatformVersion: '15.0.0',
    uaFullVersion: '120.0.0.0',
    uaBrands: [
      { brand: 'Chromium', version: '120' },
      { brand: 'Not:A-Brand', version: '99' },
      { brand: 'Google Chrome', version: '120' }
    ],
    uaFullVersionList: [
      { brand: 'Chromium', version: '120.0.0.0' },
      { brand: 'Not:A-Brand', version: '99.0.0.0' },
      { brand: 'Google Chrome', version: '120.0.0.0' }
    ],
    screenColorDepth: 24,
    screenPixelDepth: 24,
    devicePixelRatio: 1,
    timezone: 'Asia/Tokyo',
    timezoneOffset: -540,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer:
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    glVendor: 'WebKit',
    glVersion: 'WebKit WebGL'
  }
];

export function getPersonaByIndex(index: number): PersonaProfile {
  const safeIndex = ((index % PERSONA_PROFILES.length) + PERSONA_PROFILES.length) % PERSONA_PROFILES.length;
  return PERSONA_PROFILES[safeIndex];
}
