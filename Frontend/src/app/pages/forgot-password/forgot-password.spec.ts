import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForgotPassword } from './forgot-password';
import { AuthService } from '../../core/services/auth.service';

describe('ForgotPassword Component', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let authService: AuthService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and default to request step', () => {
    expect(component).toBeTruthy();
    expect(component.step).toBe('request');
  });

  it('should transition to verify step when valid email requests OTP', () => {
    component.identifier = 'user@example.com';
    vi.spyOn(authService, 'requestForgotPassword').mockReturnValue(
      of({
        message: 'OTP dispatched',
        channel: 'email',
        destination: 'u***r@example.com'
      })
    );

    component.requestOtp();

    expect(authService.requestForgotPassword).toHaveBeenCalledWith('user@example.com');
    expect(component.step).toBe('verify');
    expect(component.channel).toBe('email');
    expect(component.destination).toBe('u***r@example.com');
    expect(component.otp).toBe('');
  });

  it('should transition to reset step and clear in-memory OTP when OTP is verified', () => {
    component.step = 'verify';
    component.identifier = 'user@example.com';
    component.otp = '654321';

    vi.spyOn(authService, 'verifyForgotPasswordOtp').mockReturnValue(
      of({
        verified: true,
        message: 'OTP verified successfully',
        resetToken: 'jwt-mock-reset-token'
      })
    );

    component.verifyOtp();

    expect(authService.verifyForgotPasswordOtp).toHaveBeenCalledWith('user@example.com', '654321');
    expect(component.step).toBe('reset');
    expect(component.resetToken).toBe('jwt-mock-reset-token');
    expect(component.otp).toBe('');
  });

  it('should transition to success step when password reset succeeds', () => {
    component.step = 'reset';
    component.resetToken = 'jwt-mock-reset-token';
    component.newPassword = 'NewSecretPassword123!';
    component.confirmPassword = 'NewSecretPassword123!';

    vi.spyOn(authService, 'resetPasswordWithToken').mockReturnValue(
      of({
        message: 'Password reset successful!'
      })
    );

    component.resetPassword();

    expect(authService.resetPasswordWithToken).toHaveBeenCalledWith(
      'jwt-mock-reset-token',
      'NewSecretPassword123!',
      'NewSecretPassword123!'
    );
    expect(component.step).toBe('success');
    expect(component.resetToken).toBe('');
    expect(component.newPassword).toBe('');
  });
});
