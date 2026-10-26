import { Component, ChangeDetectorRef, NgZone, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, timeout, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css'
})
export class ForgotPassword implements OnDestroy {
  step: 'request' | 'verify' | 'reset' | 'success' = 'request';

  identifier = '';
  otp = '';
  resetToken = '';
  newPassword = '';
  confirmPassword = '';

  showNewPassword = false;
  showConfirmPassword = false;

  loading = false;
  error = '';
  successMessage = '';

  channel = '';
  destination = '';

  private authSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone
  ) {}

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  toggleNewPassword(): void {
    this.showNewPassword = !this.showNewPassword;
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword = !this.showConfirmPassword;
  }

  requestOtp(): void {
    if (this.loading) {
      return;
    }

    this.error = '';
    const cleanId = this.identifier.trim();
    if (!cleanId) {
      this.error = 'Please enter your registered email address.';
      return;
    }

    if (cleanId.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanId)) {
        this.error = 'Please enter a valid email address.';
        return;
      }
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.authSub?.unsubscribe();
    this.authSub = this.authService.requestForgotPassword(cleanId)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.channel = res.channel || (cleanId.includes('@') ? 'email' : 'mobile');
            this.destination = res.destination || this.maskContact(cleanId);
            this.otp = '';
            this.step = 'verify';
            this.successMessage = '';
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.zone.run(() => {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
              this.error = 'Server took too long to respond. Please try again.';
            } else if (err.status === 404) {
              this.error = err.error?.message || 'No active account found with this email or mobile number.';
            } else {
              this.error = err.error?.message || 'Failed to request OTP. Please check your input and try again.';
            }
            this.cdr.detectChanges();
          });
        }
      });
  }

  resendOtp(): void {
    if (this.loading) {
      return;
    }

    this.error = '';
    this.successMessage = '';
    this.otp = '';
    this.loading = true;
    this.cdr.detectChanges();

    this.authSub?.unsubscribe();
    this.authSub = this.authService.requestForgotPassword(this.identifier.trim())
      .pipe(
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.destination = res.destination || this.destination;
            this.otp = '';
            this.successMessage = 'A fresh verification code has been dispatched.';
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.zone.run(() => {
            this.error = err.error?.message || 'Failed to resend OTP. Please try again.';
            this.cdr.detectChanges();
          });
        }
      });
  }

  verifyOtp(): void {
    if (this.loading) {
      return;
    }

    this.error = '';
    const cleanOtp = this.otp.trim();

    if (!cleanOtp || cleanOtp.length !== 6) {
      this.error = 'Please enter the 6-digit verification code received.';
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.authSub?.unsubscribe();
    this.authSub = this.authService.verifyForgotPasswordOtp(this.identifier.trim(), cleanOtp)
      .pipe(
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.resetToken = res.resetToken;
            this.otp = ''; // Invalidate OTP in memory; backend has already removed it from MongoDB
            this.step = 'reset';
            this.successMessage = res.message || 'OTP verified successfully! Please set your new password.';
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.zone.run(() => {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
              this.error = 'Server took too long to respond. Please try again.';
            } else {
              this.error = err.error?.message || 'Invalid or expired OTP. Please request a new code.';
            }
            this.cdr.detectChanges();
          });
        }
      });
  }

  resetPassword(): void {
    if (this.loading) {
      return;
    }

    this.error = '';

    if (!this.newPassword) {
      this.error = 'Please enter a new password.';
      return;
    }

    if (this.newPassword.length < 8) {
      this.error = 'Password must be at least 8 characters long.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirm password do not match.';
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    this.authSub?.unsubscribe();

    // Use resetToken if available, or fallback to direct payload
    const resetCall = this.resetToken
      ? this.authService.resetPasswordWithToken(this.resetToken, this.newPassword, this.confirmPassword)
      : this.authService.resetPassword({
          identifier: this.identifier.trim(),
          otp: this.otp.trim(),
          password: this.newPassword,
          confirmPassword: this.confirmPassword
        });

    this.authSub = resetCall
      .pipe(
        timeout(10000),
        finalize(() => {
          this.zone.run(() => {
            this.loading = false;
            this.cdr.detectChanges();
          });
        })
      )
      .subscribe({
        next: (res) => {
          this.zone.run(() => {
            this.resetToken = '';
            this.newPassword = '';
            this.confirmPassword = '';
            this.step = 'success';
            this.successMessage = res.message || 'Password reset successful! You can now log in.';
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.zone.run(() => {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
              this.error = 'Server took too long to respond. Please try again.';
            } else {
              this.error = err.error?.message || 'Failed to reset password. Please try again.';
            }
            this.cdr.detectChanges();
          });
        }
      });
  }

  backToRequest(): void {
    this.step = 'request';
    this.error = '';
    this.successMessage = '';
    this.otp = '';
    this.resetToken = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  private maskContact(contact: string): string {
    if (!contact) return '';
    if (contact.includes('@')) {
      const [local, domain] = contact.split('@');
      if (local.length <= 2) return `${local[0]}***@${domain}`;
      return `${local[0]}***${local[local.length - 1]}@${domain}`;
    }
    const clean = contact.trim();
    if (clean.length <= 4) return clean;
    return `******${clean.slice(-3)}`;
  }
}
