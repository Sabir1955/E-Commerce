import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AesEncryptionService, EncryptedPayload } from './aes-encryption.service';

describe('AesEncryptionService (Web Crypto AES-256-GCM)', () => {
  let service: AesEncryptionService;
  let httpMock: HttpTestingController;

  // Known 32-byte (256-bit) test key for unit testing
  const validHexKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AesEncryptionService,
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    service = TestBed.inject(AesEncryptionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should initialize and import valid 64-character hex key', async () => {
    const key = await service.setKey(validHexKey);
    expect(key).toBeDefined();
    expect(service.hasKey()).toBe(true);
  });

  it('should reject invalid key lengths', async () => {
    await expect(service.setKey('shortkey')).rejects.toThrow();
  });

  it('should encrypt and decrypt a structured object correctly', async () => {
    await service.setKey(validHexKey);
    const originalData = {
      customerId: 'cust_777',
      birthTime: '06:45',
      birthPlace: 'Varanasi, UP',
      notes: 'Consultation about career progression'
    };

    const encrypted: EncryptedPayload = await service.encrypt(originalData);

    expect(encrypted._encrypted).toBe(true);
    expect(encrypted.algorithm).toBe('aes-256-gcm');
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.tag).toBeDefined();
    expect(encrypted.data).toBeDefined();

    const decrypted = await service.decrypt(encrypted);
    expect(decrypted).toEqual(originalData);
  });

  it('should generate a unique IV for every encryption operation', async () => {
    await service.setKey(validHexKey);
    const message = 'Same secret message';

    const enc1 = await service.encrypt(message);
    const enc2 = await service.encrypt(message);

    expect(enc1.iv).not.toEqual(enc2.iv);
    expect(enc1.data).not.toEqual(enc2.data);
  });

  it('should reject tampered ciphertext safely (authentication tag verification)', async () => {
    await service.setKey(validHexKey);
    const original = { secret: 'top_secret' };
    const enc = await service.encrypt(original);

    // Tamper ciphertext
    const rawData = atob(enc.data);
    const tamperedRaw = String.fromCharCode(rawData.charCodeAt(0) ^ 1) + rawData.slice(1);
    const tamperedPayload: EncryptedPayload = {
      ...enc,
      data: btoa(tamperedRaw)
    };

    await expect(service.decrypt(tamperedPayload)).rejects.toThrow(
      'Decryption failed: Authentication tag verification failed or ciphertext tampered'
    );
  });

  it('should reject tampered authentication tag', async () => {
    await service.setKey(validHexKey);
    const original = { secret: 'top_secret' };
    const enc = await service.encrypt(original);

    // Tamper auth tag
    const rawTag = atob(enc.tag);
    const tamperedTag = String.fromCharCode(rawTag.charCodeAt(0) ^ 1) + rawTag.slice(1);
    const tamperedPayload: EncryptedPayload = {
      ...enc,
      tag: btoa(tamperedTag)
    };

    await expect(service.decrypt(tamperedPayload)).rejects.toThrow(
      'Decryption failed: Authentication tag verification failed or ciphertext tampered'
    );
  });

  it('should support compact field-level encryption and decryption', async () => {
    await service.setKey(validHexKey);
    const privateNote = 'Confidential astrologer observation';

    const compactEncrypted = await service.encryptField(privateNote);
    expect(compactEncrypted.startsWith('enc:v1:')).toBe(true);

    const decrypted = await service.decryptField(compactEncrypted);
    expect(decrypted).toBe(privateNote);
  });

  it('should correctly identify encrypted payloads', () => {
    expect(service.isEncryptedPayload({ _encrypted: true, iv: 'a', tag: 'b', data: 'c' })).toBe(true);
    expect(service.isEncryptedPayload({ iv: 'a', tag: 'b', data: 'c' })).toBe(true);
    expect(service.isEncryptedPayload('enc:v1:a:b:c')).toBe(true);
    expect(service.isEncryptedPayload({ regular: 'field' })).toBe(false);
    expect(service.isEncryptedPayload(null)).toBe(false);
  });
});
