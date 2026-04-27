import { CryptoUtils } from '../utils/CryptoUtils.js';

export enum JarType {
  VAULT = 'VAULT',
  QUARANTINE = 'QUARANTINE'
}

interface JarEntry {
  id: string;
  domain: string;
  name: string;
  encryptedValue: string;
  createdAt: number;
  expiry: number;
  jarType: JarType;
}

type JarStore = Record<string, JarEntry>;

export class CookieJarWorker {
  private vaultKey: CryptoKey | null = null;
  private quarantineKey: CryptoKey | null = null;
  private sessionApprovedDomains: Set<string> = new Set();

  public static entryId(domain: string, name: string): string {
    return `${domain}|${name}`;
  }

  public approveForSession(domain: string): void {
    this.sessionApprovedDomains.add(domain);
  }

  public async approvePermanently(domain: string): Promise<void> {
    this.sessionApprovedDomains.add(domain);

    const data = (await chrome.storage.local.get('allowlist')) as { allowlist?: unknown };
    const existing = Array.isArray(data.allowlist)
      ? (data.allowlist.filter((entry) => typeof entry === 'string') as string[])
      : [];

    if (!existing.includes(domain)) {
      existing.push(domain);
      await chrome.storage.local.set({ allowlist: existing });
    }
  }

  public isSessionApproved(domain: string): boolean {
    return this.sessionApprovedDomains.has(domain);
  }

  public sessionApprovedCount(): number {
    return this.sessionApprovedDomains.size;
  }

  public async init(): Promise<void> {
    const storedKeyData = (await chrome.storage.local.get('vaultKey')) as {
      vaultKey?: number[];
    };

    if (Array.isArray(storedKeyData.vaultKey) && storedKeyData.vaultKey.length > 0) {
      this.vaultKey = await CryptoUtils.importKey(Uint8Array.from(storedKeyData.vaultKey));
    } else {
      this.vaultKey = await CryptoUtils.generateKey();
      const exported = await CryptoUtils.exportKey(this.vaultKey);
      await chrome.storage.local.set({ vaultKey: Array.from(exported) });
    }

    if (!this.quarantineKey) {
      this.quarantineKey = await CryptoUtils.generateKey();
    }
  }

  public async jarCookie(cookie: chrome.cookies.Cookie, type: JarType): Promise<string> {
    const key = type === JarType.VAULT ? this.vaultKey : this.quarantineKey;
    if (!key) {
      throw new Error(`Key for ${type} not initialized.`);
    }

    const encryptedValue = await CryptoUtils.encrypt(cookie.value, key);
    const entry: JarEntry = {
      id: CookieJarWorker.entryId(cookie.domain, cookie.name),
      domain: cookie.domain,
      name: cookie.name,
      encryptedValue,
      createdAt: Date.now(),
      expiry: Date.now() + (type === JarType.QUARANTINE ? 30_000 : 86_400_000),
      jarType: type
    };

    const storeKey = type === JarType.VAULT ? 'vaultStore' : 'quarantineStore';
    const data = (await chrome.storage.local.get(storeKey)) as Record<string, unknown>;
    const store = ((data[storeKey] as JarStore | undefined) ?? {}) as JarStore;

    store[entry.id] = entry;
    await chrome.storage.local.set({ [storeKey]: store });
    return entry.id;
  }

  public async retrieveFromVault(domain: string, name: string): Promise<string | null> {
    if (!this.vaultKey) {
      return null;
    }

    const id = CookieJarWorker.entryId(domain, name);
    const data = (await chrome.storage.local.get('vaultStore')) as { vaultStore?: JarStore };
    const entry = data.vaultStore?.[id];

    if (!entry || entry.jarType !== JarType.VAULT) {
      return null;
    }

    try {
      return await CryptoUtils.decrypt(entry.encryptedValue, this.vaultKey);
    } catch (error) {
      console.error('Decryption failed for Vault entry', error);
      return null;
    }
  }

  public async smash(id: string, type: JarType): Promise<void> {
    const storeKey = type === JarType.VAULT ? 'vaultStore' : 'quarantineStore';
    const data = (await chrome.storage.local.get(storeKey)) as Record<string, unknown>;
    const store = ((data[storeKey] as JarStore | undefined) ?? {}) as JarStore;

    if (store[id]) {
      delete store[id];
      await chrome.storage.local.set({ [storeKey]: store });
    }
  }
}
