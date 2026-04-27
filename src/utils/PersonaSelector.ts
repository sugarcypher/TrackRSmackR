import { PERSONA_PROFILES, getPersonaByIndex, type PersonaProfile } from './PersonaProfiles.js';

const INSTALL_ID_KEY = 'trackrsmackrInstallId';

let cachedInstallId: string | null = null;
let cachedPersonaIndex: number | null = null;

export async function getOrCreateInstallId(): Promise<string> {
  if (cachedInstallId !== null) {
    return cachedInstallId;
  }

  const stored = (await chrome.storage.local.get(INSTALL_ID_KEY)) as {
    [INSTALL_ID_KEY]?: string;
  };

  if (typeof stored[INSTALL_ID_KEY] === 'string' && stored[INSTALL_ID_KEY].length > 0) {
    cachedInstallId = stored[INSTALL_ID_KEY];
    return cachedInstallId;
  }

  const fresh = generateInstallId();
  await chrome.storage.local.set({ [INSTALL_ID_KEY]: fresh });
  cachedInstallId = fresh;
  return fresh;
}

export async function getAssignedPersonaIndex(): Promise<number> {
  if (cachedPersonaIndex !== null) {
    return cachedPersonaIndex;
  }

  const installId = await getOrCreateInstallId();
  cachedPersonaIndex = hashToIndex(installId, PERSONA_PROFILES.length);
  return cachedPersonaIndex;
}

export async function getAssignedPersona(): Promise<PersonaProfile> {
  const index = await getAssignedPersonaIndex();
  return getPersonaByIndex(index);
}

function generateInstallId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function hashToIndex(input: string, modulo: number): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % modulo;
}
