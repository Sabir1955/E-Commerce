import { Component, ChangeDetectorRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, timeout, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './register.html',
  styleUrl: './register.css'
})
export class Register implements OnInit, OnDestroy {
  name = '';
  email = '';
  mobile = '';
  password = '';
  showPassword = false;

  error = '';
  success = '';
  loading = false;
  returnUrl = '';

  private regSub?: Subscription;

  constructor(
    private authService: AuthService,
    private notifications: NotificationService,
    private router: Router,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnInit(): void {
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '';
  }

  ngOnDestroy(): void {
    this.regSub?.unsubscribe();
  }

  togglePassword(): void {
    this.showPassword = !this.showPassword;
  }

  register(): void {
    if (this.loading) {
      return;
    }

    this.error = '';
    this.success = '';

    if (!this.name.trim() || !this.email.trim() || !this.mobile.trim() || !this.password) {
      this.error = 'Please fill all required fields.';
      return;
    }

    if (this.password.length < 8) {
      this.error = 'Password must be at least 8 characters.';
      return;
    }

    // Normalize mobile: remove spaces, dashes, parentheses
    let formattedMobile = this.mobile.trim().replace(/[\s\-()]/g, '');
    if (formattedMobile.startsWith('0') && formattedMobile.length === 11) {
      formattedMobile = formattedMobile.slice(1);
    }
    if (/^[6-9]\d{9}$/.test(formattedMobile)) {
      formattedMobile = `+91${formattedMobile}`;
    }

    if (!/^(?:\+91[- ]?)?[6-9]\d{9}$/.test(formattedMobile)) {
      this.error = 'Please enter a valid 10-digit Indian mobile number (e.g. 9876543210).';
      return;
    }

    const isGmail = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(this.email.trim());
    if (!isGmail) {
      this.error = 'Only Gmail addresses ending with @gmail.com are accepted.';
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    console.log('[Register Attempt]', {
      name: this.name.trim(),
      email: this.email.trim(),
      mobile: formattedMobile,
      targetUrl: `${this.authService.apiUrl}/auth/register`
    });

    this.regSub?.unsubscribe();

    this.regSub = this.authService.register({
      name: this.name.trim(),
      email: this.email.trim(),
      mobile: formattedMobile,
      password: this.password,
      confirmPassword: this.password
    }).pipe(
      timeout(8000),
      finalize(() => {
        this.zone.run(() => {
          this.loading = false;
          this.cdr.detectChanges();
        });
      })
    ).subscribe({
      next: (res) => {
        this.zone.run(() => {
          console.log('[Register Success]', res);
          this.success = 'Registration successful! Redirecting to store...';
          this.cdr.detectChanges();
          this.notifications.queue('registration_confirmation', this.email, this.name);
          setTimeout(() => {
            const target = this.returnUrl && !this.returnUrl.startsWith('/admin') ? this.returnUrl : '/';
            this.router.navigateByUrl(target);
          }, 1200);
        });
      },
      error: (err) => {
        this.zone.run(() => {
          console.error('[Register Error]', err);
          if (err.name === 'TimeoutError' || err.name === 'AbortError') {
            this.error = 'The server took too long to respond. Please try again.';
          } else if (err.status === 0) {
            this.error = 'Cannot connect to backend server. Please verify your connection.';
          } else if (err.status === 409) {
            this.error = err.error?.message || 'Email or mobile number is already registered.';
          } else {
            this.error = err.error?.message || 'Registration failed. Please check your details and try again.';
          }
          this.cdr.detectChanges();
        });
      }
    });
  }
}