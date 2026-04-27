import { getAssignedPersona } from './PersonaSelector.js';
import { PERSONA_PROFILES } from './PersonaProfiles.js';

export let GINGERBREAD_MAN_ENABLED = true;

export async function isGingerbreadManEnabled(): Promise<boolean> {
  const data = (await chrome.storage.local.get('gingerbreadManEnabled')) as {
    gingerbreadManEnabled?: boolean;
  };

  GINGERBREAD_MAN_ENABLED = data.gingerbreadManEnabled !== false;
  return GINGERBREAD_MAN_ENABLED;
}

export async function getGingerbreadValue(cookieName: string): Promise<string> {
  const persona = await getAssignedPersona();
  const lowerName = cookieName.toLowerCase();
  const table = persona.cookieValues as unknown as Record<string, string>;

  for (const [pattern, value] of Object.entries(table)) {
    if (pattern !== 'generic' && lowerName.includes(pattern)) {
      return value;
    }
  }

  return table.generic;
}

const GINGERBREAD_DECOY_VALUES = new Set<string>(
  PERSONA_PROFILES.flatMap((p) => Object.values(p.cookieValues))
);

export function isGingerbreadDecoyValue(value: string): boolean {
  return GINGERBREAD_DECOY_VALUES.has(value);
}
