/**
 * SECURITY LAYER: AES-GCM Encryption
 * Uses the Web Crypto API to ensure all sensitive cookie values are encrypted at rest.
 */
export class CryptoUtils {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;

  public static async generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: this.ALGORITHM, length: this.KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
  }

  public static async exportKey(key: CryptoKey): Promise<Uint8Array> {
    return new Uint8Array(await crypto.subtle.exportKey('raw', key));
  }

  public static async importKey(keyData: Uint8Array): Promise<CryptoKey> {
    const rawKey = new Uint8Array(keyData);

    return crypto.subtle.importKey('raw', rawKey, { name: this.ALGORITHM }, true, [
      'encrypt',
      'decrypt'
    ]);
  }

  public static async encrypt(data: string, key: CryptoKey): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    const encodedData = new TextEncoder().encode(data);

    const ciphertext = await crypto.subtle.encrypt(
      { name: this.ALGORITHM, iv },
      key,
      encodedData
    );

    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return this.arrayBufferToBase64(combined);
  }

  public static async decrypt(encryptedData: string, key: CryptoKey): Promise<string> {
    const combined = this.base64ToArrayBuffer(encryptedData);
    if (combined.length <= this.IV_LENGTH) {
      throw new Error('Encrypted payload is too short.');
    }

    const iv = combined.slice(0, this.IV_LENGTH);
    const ciphertext = combined.slice(this.IV_LENGTH);

    const decrypted = await crypto.subtle.decrypt({ name: this.ALGORITHM, iv }, key, ciphertext);

    return new TextDecoder().decode(decrypted);
  }

  private static arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (const byte of buffer) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary);
  }

  private static base64ToArrayBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
