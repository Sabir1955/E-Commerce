import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Login } from './login';
import { AuthService } from '../../core/services/auth.service';

describe('Login Component Admin Redirect', () => {
  let router: Router;
  let authService: AuthService;
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([
          { path: 'admin', component: Login },
          { path: '', component: Login }
        ]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    router = TestBed.inject(Router);
    authService = TestBed.inject(AuthService);
    httpTesting = TestBed.inject(HttpTestingController);
    vi.spyOn(router, 'navigateByUrl');
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
  });

  it('should redirect directly to /admin when admin user logs in', async () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = 'astro@gmail.com';
    comp.password = 'Astro@12345';
    comp.login();

    const req = httpTesting.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({
      success: true,
      token: 'test-admin-jwt-token',
      user: {
        id: '123',
        name: 'Astro Admin',
        email: 'astro@gmail.com',
        role: 'admin'
      }
    });

    fixture.detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
    expect(authService.getCurrentUser()?.role).toBe('admin');
  });

  it('should redirect directly to /admin on ngOnInit if already logged in as admin', () => {
    authService.saveSession('test-token', {
      id: '123',
      name: 'Astro Admin',
      email: 'astro@gmail.com',
      mobile: '+919876543210',
      role: 'admin'
    });

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/admin');
  });

  it('should reject non-gmail email addresses with validation message', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = 'user@yahoo.com';
    comp.password = 'ValidPassword123!';
    comp.login();

    expect(comp.error).toBe('Only Gmail addresses ending with @gmail.com are accepted.');
    httpTesting.expectNone('/api/auth/login');
  });

  it('should show error for invalid text that is neither Gmail nor mobile', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = 'not-an-email-or-mobile';
    comp.password = 'ValidPassword123!';
    comp.login();

    expect(comp.error).toBe('Please enter a valid Gmail address (@gmail.com) or a valid 10-digit mobile number.');
    httpTesting.expectNone('/api/auth/login');
  });

  it('should accept valid 10-digit mobile number and send login request', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = '9876543210';
    comp.password = 'ValidPassword123!';
    comp.login();

    const req = httpTesting.expectOne('/api/auth/login');
    expect(req.request.body.identifier).toBe('9876543210');
    req.flush({ success: true, token: 'mock-token', user: { id: '456', name: 'User', role: 'customer' } });
  });

  it('should accept valid Gmail address ending with @gmail.com', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = 'validcustomer@gmail.com';
    comp.password = 'ValidPassword123!';
    comp.login();

    const req = httpTesting.expectOne('/api/auth/login');
    expect(req.request.body.identifier).toBe('validcustomer@gmail.com');
    req.flush({ success: true, token: 'mock-token', user: { id: '789', name: 'Valid User', role: 'customer' } });
  });

  it('should show error for password shorter than 8 or longer than 64 characters', () => {
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    comp.email = 'user@gmail.com';
    comp.password = 'Short1!';
    comp.login();

    expect(comp.error).toBe('Password must be between 8 and 64 characters.');
    httpTesting.expectNone('/api/auth/login');

    comp.password = 'A'.repeat(65);
    comp.login();
    expect(comp.error).toBe('Password must be between 8 and 64 characters.');
    httpTesting.expectNone('/api/auth/login');
  });
});
