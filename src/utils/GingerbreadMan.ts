export const GingerbreadManCookie: Record<string, string> = {
  '_ga': 'GA1.1.0000000000.0000000000',
  '_gid': 'GA1.1.0000000000.0000000000',
  '_gat': '1',
  '_gcl_au': '1.1.0000000000.0000000000',
  '_fbp': 'fb.1.0000000000000.0000000000',
  '_fbc': 'fb.1.0000000000000.IwAR0000000000000000000000',
  '_dd_s': 'rum=0&id=00000000-0000-0000-0000-000000000000&created=0000000000000&expire=0000000000000',
  '__secure': 'gingerbread-secure-cookie-decoy',
  '__host': 'gingerbread-host-cookie-decoy',
  '__utma': '000000000.0000000000.0000000000.0000000000.0000000000.1',
  '__utmz': '000000000.0000000000.1.1.utmcsr=gingerbread|utmccn=decoy|utmcmd=none',
  '_pin_unauth': 'dWlkPUdJTkdFUkJSRUFELU1BTi1ERUNPWQ',
  '_tt_enable_cookie': '1',
  'uid': '00000000-0000-0000-0000-000000000000',
  'id': '00000000-0000-0000-0000-000000000000',
  'tracker': 'gingerbread-tracker-cookie-decoy',
  'ads': 'gingerbread-ads-cookie-decoy',
  'generic': 'gingerbread-man-cookie-decoy-v1'
};

export let GINGERBREAD_MAN_ENABLED = true;

export async function isGingerbreadManEnabled(): Promise<boolean> {
  const data = (await chrome.storage.local.get('gingerbreadManEnabled')) as {
    gingerbreadManEnabled?: boolean;
  };

  GINGERBREAD_MAN_ENABLED = data.gingerbreadManEnabled !== false;
  return GINGERBREAD_MAN_ENABLED;
}

export function getGingerbreadValue(cookieName: string): string {
  const lowerName = cookieName.toLowerCase();

  for (const [pattern, value] of Object.entries(GingerbreadManCookie)) {
    if (pattern !== 'generic' && lowerName.includes(pattern)) {
      return value;
    }
  }

  return GingerbreadManCookie.generic;
}
