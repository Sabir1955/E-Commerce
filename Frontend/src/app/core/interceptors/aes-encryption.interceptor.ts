import { HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { from, switchMap, map } from 'rxjs';
import { AesEncryptionService, EncryptedPayload } from '../aes_encryption/aes-encryption.service';

/**
 * AES-256-GCM Payload Encryption Interceptor (Angular)
 *
 * Selectively encrypts outbound request bodies marked with header:
 * 'X-Encrypt-Payload': 'true'
 *
 * Preserves compatibility:
 * - Unmarked requests (standard catalog, auth, Razorpay/Easebuzz payment verifications) pass through untouched.
 * - Outbound encrypted payloads are transformed to canonical { _encrypted: true, iv, tag, data }.
 * - Responses marked with 'X-Payload-Encryption': 'aes-256-gcm' are automatically decrypted.
 */
export const aesEncryptionInterceptor: HttpInterceptorFn = (req, next) => {
  const aesService = inject(AesEncryptionService);

  const shouldEncrypt = req.headers.has('X-Encrypt-Payload') && req.body && typeof req.body === 'object';

  if (!shouldEncrypt) {
    return next(req).pipe(
      switchMap((event) => {
        if (event instanceof HttpResponse && event.body && aesService.isEncryptedPayload(event.body)) {
          return from(aesService.decrypt(event.body as EncryptedPayload)).pipe(
            map((decrypted) => event.clone({ body: decrypted }))
          );
        }
        return [event];
      })
    );
  }

  // Remove the trigger header and encrypt payload
  const cleanHeaders = req.headers.delete('X-Encrypt-Payload').set('X-Payload-Encrypted', 'aes-256-gcm');

  return from(aesService.encrypt(req.body)).pipe(
    switchMap((encryptedBody) => {
      const encryptedReq = req.clone({
        headers: cleanHeaders,
        body: encryptedBody
      });

      return next(encryptedReq).pipe(
        switchMap((event) => {
          if (event instanceof HttpResponse && event.body && aesService.isEncryptedPayload(event.body)) {
            return from(aesService.decrypt(event.body as EncryptedPayload)).pipe(
              map((decrypted) => event.clone({ body: decrypted }))
            );
          }
          return [event];
        })
      );
    })
  );
};
