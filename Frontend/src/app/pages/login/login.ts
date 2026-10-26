import { Component, ChangeDetectorRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, timeout, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class Login implements OnInit, OnDestroy {
  email = '';
  password = '';
  showPassword = false;
  error = '';
  loading = false;
  returnUrl = '';

  private loginSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';
    const user = this.authService.getCurrentUser();
    if (user && this.authService.isLoggedIn()) {
      const role = String(user.role || '').trim().toLowerCase();
      const returnUrl = this.returnUrl;
      if (role === 'admin') {
        const target = (returnUrl && (returnUrl.startsWith('/admin') || returnUrl === '/checkout')) ? returnUrl : '/admin';
        this.router.navigateByUrl(target);
      } else {
        this.router.navigateByUrl(returnUrl && !returnUrl.startsWith('/admin') ? returnUrl : '/');
      }
    }
  }

  ngOnDestroy(): void {
    this.loginSub?.unsubscribe();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    // Prevent duplicate concurrent submissions
    if (this.loading) {
      return;
    }

    this.error = '';
    const identifier = this.email.trim();
    const pwd = this.password;

    if (!identifier) {
      this.error = 'Please enter your Gmail address or mobile number.';
      return;
    }

    const isEmail = identifier.includes('@');
    if (isEmail) {
      const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(identifier);
      const isAdminIdentifier = identifier.toLowerCase().includes('admin');
      if (!isGmail && !isAdminIdentifier) {
        this.error = 'Only Gmail addresses ending with @gmail.com are accepted.';
        return;
      }
    } else {
      const cleanMobile = identifier.replace(/[\s\-()]/g, '');
      const isMobile = /^(?:\+91|91|0)?[6-9]\d{9}$/.test(cleanMobile);
      if (!isMobile) {
        this.error = 'Please enter a valid Gmail address (@gmail.com) or a valid 10-digit mobile number.';
        return;
      }
    }

    if (!pwd) {
      this.error = 'Please enter your password.';
      return;
    }

    if (pwd.length < 8 || pwd.length > 64) {
      this.error = 'Password must be between 8 and 64 characters.';
      return;
    }

    const allowedPasswordRegex = /^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~` ]+$/;
    if (!allowedPasswordRegex.test(pwd)) {
      this.error = 'Password contains invalid characters. Only letters, numbers, and standard special characters are allowed.';
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    console.log('[Login Attempt]', { identifier, targetUrl: `${this.authService.apiUrl}/auth/login` });

    // Cancel any existing in-flight request
    this.loginSub?.unsubscribe();

    this.loginSub = this.authService.login(identifier, pwd).pipe(
      timeout(8000),
      finalize(() => {
        // Guaranteed to run on every completion path (success, error, timeout, unsubscribe)
        this.zone.run(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      })
    ).subscribe({
      next: (res) => {
        this.zone.run(() => {
          console.log('[Login Success]', res);
          const user = res?.user || res?.data?.user || this.authService.getCurrentUser();
          const token = res?.token || res?.data?.token || this.authService.getToken();

          if (token && user) {
            this.authService.saveSession(token, user);
          }

          this.cdr.detectChanges();
          const role = String(user?.role || '').trim().toLowerCase();
          const returnUrl = this.route.snapshot.queryParams['returnUrl'];

          if (role === 'admin') {
            const target = (returnUrl && (returnUrl.startsWith('/admin') || returnUrl === '/checkout')) ? returnUrl : '/admin';
            this.router.navigateByUrl(target);
          } else {
            this.router.navigateByUrl(returnUrl && !returnUrl.startsWith('/admin') ? returnUrl : '/');
          }
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.error('[Login Error]', err);
          this.error = this.extractErrorMessage(err);
          this.cdr.detectChanges();
        });
      }
    });
  }

  private extractErrorMessage(err: any): string {
    if (!err) {
      return 'Invalid email/mobile or password. Please try again.';
    }

    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return 'The server took too long to respond. Please check your connection and try again.';
    }

    if (err.status === 0) {
      return `Cannot connect to server. Please verify your internet connection or backend server.`;
    }

    if (err.status === 401) {
      if (typeof err.error === 'string' && err.error.trim()) {
        return err.error.trim();
      }
      if (err.error?.message) {
        return err.error.message;
      }
      if (err.error?.error?.message) {
        return err.error.error.message;
      }
      return 'Invalid email/mobile or password. Please check your credentials.';
    }

    if (err.status === 429) {
      return err.error?.message || 'Too many login attempts. Please wait a moment and try again.';
    }

    if (typeof err.error === 'string' && err.error.trim()) {
      return err.error.trim();
    }

    if (err.error?.message) {
      return err.error.message;
    }

    if (Array.isArray(err.error?.errors) && err.error.errors.length > 0) {
      return err.error.errors.join('; ');
    }

    if (err.error?.error?.message) {
      return err.error.error.message;
    }

    return 'Login failed. Please check your credentials and try again.';
  }
}