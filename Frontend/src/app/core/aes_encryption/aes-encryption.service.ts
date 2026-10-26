import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, from, of, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Standard canonical format for AES-256-GCM encrypted payloads
 * Shared interoperably between Angular and Express
 */
export interface EncryptedPayload {
  _encrypted: true;
  algorithm: 'aes-256-gcm';
  iv: string;   // 12-byte random IV encoded in Base64
  tag: string;  // 16-byte authentication tag encoded in Base64
  data: string; // Ciphertext encoded in Base64
}

/**
 * Crypto Session Configuration Response from Backend
 */
export interface CryptoSessionConfig {
  algorithm: string;
  keyLength: number;
  format: 'hex' | 'base64';
  key: string;
}

@Injectable({
  providedIn: 'root'
})
export class AesEncryptionService {
  private http = inject(HttpClient);
  private platformId = inject(PLATFORM_ID);

  private cryptoKey: CryptoKey | null = null;
  private keyInitPromise: Promise<CryptoKey> | null = null;

  private readonly ALGORITHM_NAME = 'AES-GCM';
  private readonly IV_LENGTH = 12; // 96 bits
  private readonly TAG_LENGTH = 128; // 128 bits
  private readonly KEY_LENGTH = 32; // 256 bits

  /**
   * Safe access to Crypto object across browser and SSR
   */
  private getCrypto(): Crypto {
    if (typeof window !== 'undefined' && window.crypto) {
      return window.crypto;
    }
    const globalCrypto = (globalThis as any).crypto;
    if (globalCrypto) {
      return globalCrypto;
    }
    throw new Error('Web Crypto API is not supported in this runtime environment');
  }

  /**
   * Safe access to Web Crypto SubtleCrypto
   */
  private get subtle(): SubtleCrypto {
    const cryptoObj = this.getCrypto();
    if (!cryptoObj.subtle) {
      throw new Error('Web Crypto API (subtle) is not supported in this runtime environment');
    }
    return cryptoObj.subtle;
  }

  /**
   * Helper: Convert Uint8Array to Base64 string
   */
  private toBase64(bytes: Uint8Array): string {
    const buf = (globalThis as any).Buffer;
    if (buf && typeof buf.from === 'function') {
      return buf.from(bytes).toString('base64');
    }
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Helper: Convert Base64 string to Uint8Array
   */
  private fromBase64(base64: string): Uint8Array {
    const buf = (globalThis as any).Buffer;
    if (buf && typeof buf.from === 'function') {
      return new Uint8Array(buf.from(base64, 'base64'));
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Helper: Convert Hex string to Uint8Array
   */
  private hexToBytes(hex: string): Uint8Array {
    const clean = hex.trim();
    if (clean.length % 2 !== 0) {
      throw new Error('Invalid hex string length');
    }
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
    }
    return bytes;
  }

  /**
   * Check if a CryptoKey is currently loaded in memory
   */
  public hasKey(): boolean {
    return this.cryptoKey !== null;
  }

  /**
   * Explicitly set the active AES-256 key from a hex or base64 string at runtime.
   * Never hardcode keys in static bundles.
   */
  public async setKey(rawKey: string): Promise<CryptoKey> {
    if (!rawKey || typeof rawKey !== 'string') {
      throw new Error('Invalid key provided to setKey: must be non-empty string');
    }

    let keyBytes: Uint8Array;
    const trimmed = rawKey.trim();

    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      keyBytes = this.hexToBytes(trimmed);
    } else {
      keyBytes = this.fromBase64(trimmed);
    }

    if (keyBytes.length !== this.KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${this.KEY_LENGTH} bytes, got ${keyBytes.length}`);
    }

    const imported = await this.subtle.importKey(
      'raw',
      keyBytes as any,
      { name: this.ALGORITHM_NAME },
      false,
      ['encrypt', 'decrypt']
    );

    this.cryptoKey = imported;
    return imported;
  }

  /**
   * Fetch active session encryption key dynamically from backend over HTTPS.
   * Guarantees confidential keys remain exclusively in Backend/.env.
   */
  public fetchSessionKey(): Observable<boolean> {
    return throwError(
      () => new Error('Crypto key distribution over public API is disabled for security. Standard TLS encryption protects transit data.')
    );
  }

  /**
   * Ensure a key is loaded before performing encryption or decryption
   */
  public async ensureKey(): Promise<CryptoKey> {
    if (this.cryptoKey) {
      return this.cryptoKey;
    }

    if (!this.keyInitPromise) {
      this.keyInitPromise = new Promise<CryptoKey>((resolve, reject) => {
        this.fetchSessionKey().subscribe({
          next: () => {
            if (this.cryptoKey) {
              resolve(this.cryptoKey);
            } else {
              reject(new Error('CryptoKey was not initialized after fetchSessionKey'));
            }
          },
          error: (err) => reject(err)
        });
      });
    }

    return this.keyInitPromise;
  }

  /**
   * Encrypt arbitrary plaintext or JSON object using AES-256-GCM.
   * Generates a fresh unique 12-byte random IV for every call.
   */
  public async encrypt(data: any): Promise<EncryptedPayload> {
    if (data === undefined || data === null) {
      throw new Error('Encryption failed: Data cannot be null or undefined');
    }

    const key = await this.ensureKey();
    const cryptoObj = this.getCrypto();

    // Generate unique 12-byte IV for every encryption operation
    const iv = new Uint8Array(this.IV_LENGTH);
    cryptoObj.getRandomValues(iv);

    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    const plaintextBytes = new TextEncoder().encode(plaintext);

    // Web Crypto SubtleCrypto AES-GCM
    const encryptedBuffer = await this.subtle.encrypt(
      {
        name: this.ALGORITHM_NAME,
        iv: iv as any,
        tagLength: this.TAG_LENGTH
      },
      key,
      plaintextBytes as any
    );

    // Web Crypto appends the 16-byte authentication tag at the end of the ciphertext
    const totalBytes = new Uint8Array(encryptedBuffer);
    const ciphertextBytes = totalBytes.slice(0, totalBytes.length - 16);
    const tagBytes = totalBytes.slice(totalBytes.length - 16);

    return {
      _encrypted: true,
      algorithm: 'aes-256-gcm',
      iv: this.toBase64(iv),
      tag: this.toBase64(tagBytes),
      data: this.toBase64(ciphertextBytes)
    };
  }

  /**
   * Decrypt canonical AES-256-GCM payload.
   * Verifies the 16-byte authentication tag. Rejects tampered payloads.
   */
  public async decrypt(payload: EncryptedPayload | string): Promise<any> {
    if (!payload) {
      throw new Error('Decryption failed: Payload cannot be empty');
    }

    let parsed: any = payload;
    if (typeof payload === 'string') {
      if (payload.startsWith('enc:v1:')) {
        return this.decryptField(payload);
      }
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new Error('Decryption failed: Malformed JSON payload');
      }
    }

    if (!parsed || typeof parsed !== 'object' || !parsed.iv || !parsed.tag || !parsed.data) {
      throw new Error('Decryption failed: Malformed encrypted payload structure');
    }

    const key = await this.ensureKey();

    const iv = this.fromBase64(parsed.iv);
    const tagBytes = this.fromBase64(parsed.tag);
    const dataBytes = this.fromBase64(parsed.data);

    if (iv.length !== this.IV_LENGTH) {
      throw new Error('Decryption failed: Invalid IV length');
    }
    if (tagBytes.length !== 16) {
      throw new Error('Decryption failed: Invalid authentication tag length');
    }

    // Reconstruct concatenated [ciphertext ... tag] for Web Crypto SubtleCrypto
    const combined = new Uint8Array(dataBytes.length + tagBytes.length);
    combined.set(dataBytes, 0);
    combined.set(tagBytes, dataBytes.length);

    try {
      const decryptedBuffer = await this.subtle.decrypt(
        {
          name: this.ALGORITHM_NAME,
          iv: iv as any,
          tagLength: this.TAG_LENGTH
        },
        key,
        combined as any
      );

      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      try {
        return JSON.parse(decryptedText);
      } catch {
        return decryptedText;
      }
    } catch {
      // Never expose cryptographic internals
      throw new Error('Decryption failed: Authentication tag verification failed or ciphertext tampered');
    }
  }

  /**
   * Field-level encryption helper
   */
  public async encryptField(value: string): Promise<string> {
    if (value === undefined || value === null) return value;
    const payload = await this.encrypt(value);
    return `enc:v1:${payload.iv}:${payload.tag}:${payload.data}`;
  }

  /**
   * Field-level decryption helper
   */
  public async decryptField(compactString: string): Promise<string> {
    if (typeof compactString !== 'string' || !compactString.startsWith('enc:v1:')) {
      return compactString;
    }
    const parts = compactString.split(':');
    if (parts.length !== 5) {
      throw new Error('Decryption failed: Invalid compact field encryption format');
    }
    const [, , iv, tag, data] = parts;
    return this.decrypt({ _encrypted: true, algorithm: 'aes-256-gcm', iv, tag, data });
  }

  /**
   * Checks whether an object or string is an encrypted payload
   */
  public isEncryptedPayload(data: any): boolean {
    if (!data) return false;
    if (typeof data === 'string') {
      return data.startsWith('enc:v1:') || (data.startsWith('{') && data.includes('"_encrypted":true'));
    }
    return Boolean(
      typeof data === 'object' &&
        data !== null &&
        (data._encrypted === true || (data.iv && data.tag && data.data))
    );
  }
}
