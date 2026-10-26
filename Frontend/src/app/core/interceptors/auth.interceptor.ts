import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { BrowserStorageService } from '../services/browser-storage.service';
import { Router } from '@angular/router';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const platformId = inject(PLATFORM_ID);
  const storage = inject(BrowserStorageService);
  const router = inject(Router);
  const token = storage.getItem('astrology_token') ||
    storage.getItem('token') ||
    storage.getItem('admin_token') ||
    (isPlatformBrowser(platformId) ? (localStorage.getItem('astrology_token') || localStorage.getItem('token') || localStorage.getItem('admin_token')) : null);

  let authReq = req;
  const isAuthEndpoint = req.url.includes('/auth/login') ||
    req.url.includes('/auth/register') ||
    req.url.includes('/auth/forgot-password') ||
    req.url.includes('/auth/verify-otp') ||
    req.url.includes('/auth/reset-password');

  if (token && !isAuthEndpoint && (req.url.includes('/api') || req.url.includes(':5000') || req.url.startsWith('http'))) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !req.url.includes('/auth/') && isPlatformBrowser(platformId)) {
        storage.removeItem('astrology_token');
        storage.removeItem('astrology_current_user');
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
