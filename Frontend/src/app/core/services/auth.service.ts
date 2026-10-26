import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { BrowserStorageService } from './browser-storage.service';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  mobile: string;
  role: 'customer' | 'admin';
  referralCode?: string;
  notificationPreferences?: Record<string, boolean>;
}

export interface AuthResponse {
  token?: string;
  user?: AuthUser;
  data?: {
    token?: string;
    user?: AuthUser;
  };
  success?: boolean;
  message?: string;
}

export interface RegisterPayload {
  name: string;
  email: string;
  mobile: string;
  password: string;
  confirmPassword?: string;
  referralCode?: string;
  whatsappOptIn?: boolean;
}

export interface ForgotPasswordResponse {
  success?: boolean;
  message: string;
  channel?: 'email' | 'mobile' | string;
  destination?: string;
}

export interface VerifyOtpResponse {
  verified: boolean;
  resetToken: string;
  email?: string;
  message: string;
}

export interface ResetPasswordPayload {
  identifier: string;
  otp: string;
  password: string;
  confirmPassword?: string;
}

export interface ResetPasswordResponse {
  success?: boolean;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  get apiUrl(): string {
    if (typeof window !== 'undefined') {
      return '/api';
    }
    return environment.apiUrl;
  }
  private readonly tokenKey = 'astrology_token';
  private readonly userKey = 'astrology_current_user';
  private readonly currentUserSubject: BehaviorSubject<AuthUser | null>;
  readonly currentUser$: Observable<AuthUser | null>;

  constructor(
    private http: HttpClient,
    private storage: BrowserStorageService
  ) {
    this.currentUserSubject = new BehaviorSubject<AuthUser | null>(this.getCurrentUser());
    this.currentUser$ = this.currentUserSubject.asObservable();
  }

  saveSession(token: string, user: AuthUser): void {
    if (token) {
      this.storage.setItem(this.tokenKey, token);
    }
    if (user) {
      this.storage.setItem(this.userKey, JSON.stringify(user));
      this.currentUserSubject.next(user);
    }
  }

  login(identifier: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/login`, {
      identifier: identifier.trim(),
      password
    }).pipe(
      tap(res => {
        const token = res?.token || res?.data?.token;
        const user = res?.user || res?.data?.user;
        if (token && user) {
          this.saveSession(token, user);
        }
      })
    );
  }

  register(payload: RegisterPayload): Observable<AuthResponse> {
    const body = {
      name: payload.name.trim(),
      email: payload.email.trim(),
      mobile: payload.mobile.trim(),
      password: payload.password,
      confirmPassword: payload.confirmPassword || payload.password,
      referralCode: payload.referralCode?.trim() || undefined
    };

    return this.http.post<AuthResponse>(`${this.apiUrl}/auth/register`, body).pipe(
      tap(res => {
        const token = res?.token || res?.data?.token;
        const user = res?.user || res?.data?.user;
        if (token && user) {
          this.saveSession(token, user);
        }
      })
    );
  }

  logout(): void {
    const token = this.getToken();
    if (token) {
      this.http.post(`${this.apiUrl}/auth/logout`, {}).subscribe({
        error: () => {} // ignore network/auth errors on logout
      });
    }
    this.storage.removeItem(this.tokenKey);
    this.storage.removeItem(this.userKey);
    this.currentUserSubject.next(null);
  }

  getToken(): string | null {
    return this.storage.getItem(this.tokenKey) || this.storage.getItem('token') || this.storage.getItem('admin_token');
  }

  getCurrentUser(): AuthUser | null {
    const user = this.storage.getItem(this.userKey) || this.storage.getItem('user');
    if (!user) return null;
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  }

  notifySessionChanged(): void {
    this.currentUserSubject.next(this.getCurrentUser());
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !!this.getCurrentUser();
  }

  getProfile(): Observable<{ user: AuthUser }> {
    return this.http.get<{ user: AuthUser }>(`${this.apiUrl}/auth/me`).pipe(
      tap(res => {
        if (res?.user) {
          this.storage.setItem(this.userKey, JSON.stringify(res.user));
          this.currentUserSubject.next(res.user);
        }
      })
    );
  }

  requestForgotPassword(identifier: string): Observable<ForgotPasswordResponse> {
    return this.http.post<ForgotPasswordResponse>(`${this.apiUrl}/auth/forgot-password`, {
      identifier: identifier.trim()
    });
  }

  verifyForgotPasswordOtp(identifier: string, otp: string): Observable<VerifyOtpResponse> {
    return this.http.post<any>(`${this.apiUrl}/auth/forgot-password/verify-otp`, {
      identifier: identifier.trim(),
      otp: otp.trim()
    }).pipe(
      map(res => (res?.data || res) as VerifyOtpResponse)
    );
  }

  resetPasswordWithToken(resetToken: string, password: string, confirmPassword?: string): Observable<ResetPasswordResponse> {
    return this.http.post<any>(`${this.apiUrl}/auth/reset-password`, {
      resetToken,
      password,
      confirmPassword: confirmPassword || password
    }).pipe(
      map(res => (res?.data || res) as ResetPasswordResponse)
    );
  }

  resetPassword(payload: ResetPasswordPayload): Observable<ResetPasswordResponse> {
    return this.http.post<ResetPasswordResponse>(`${this.apiUrl}/auth/reset-password`, {
      identifier: payload.identifier.trim(),
      otp: payload.otp.trim(),
      password: payload.password,
      confirmPassword: payload.confirmPassword || payload.password
    });
  }
}