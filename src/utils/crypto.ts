import { CryptoUtils } from './CryptoUtils.js';

export async function generateKey(): Promise<CryptoKey> {
  return CryptoUtils.generateKey();
}

export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  return CryptoUtils.exportKey(key);
}

export async function importKey(keyData: Uint8Array): Promise<CryptoKey> {
  return CryptoUtils.importKey(keyData);
}

export async function encryptData(data: string, key: CryptoKey): Promise<string> {
  return CryptoUtils.encrypt(data, key);
}

export async function decryptData(encryptedData: string, key: CryptoKey): Promise<string> {
  return CryptoUtils.decrypt(encryptedData, key);
}
