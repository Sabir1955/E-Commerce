import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from '../app.routes';
import { App } from '../app.component';

describe('Admin Routing', () => {
  it('navigating to /admin should render AdminLayout with Dashboard inside router-outlet', async () => {
    localStorage.setItem('astrology_current_user', JSON.stringify({ role: 'admin', email: 'admin@jyotish.com' }));

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const success = await router.navigateByUrl('/admin');
    expect(success).toBe(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-admin-layout')).toBeTruthy();
    expect(compiled.querySelector('app-dashboard')).toBeTruthy();
  });

  it('navigating from /admin/categories to /admin should show app-dashboard', async () => {
    localStorage.setItem('astrology_current_user', JSON.stringify({ role: 'admin', email: 'admin@jyotish.com' }));

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigateByUrl('/admin/categories');
    fixture.detectChanges();

    const compiledBefore = fixture.nativeElement as HTMLElement;
    expect(compiledBefore.querySelector('app-admin-categories')).toBeTruthy();

    const success = await router.navigateByUrl('/admin');
    expect(success).toBe(true);
    fixture.detectChanges();

    const compiledAfter = fixture.nativeElement as HTMLElement;
    expect(compiledAfter.querySelector('app-dashboard')).toBeTruthy();
  });

  it('AdminLayout sidebar should display logged-in admin details and visible logout button', async () => {
    localStorage.setItem(
      'astrology_current_user',
      JSON.stringify({ id: 'admin-99', name: 'Divya Guru', email: 'guru@jyotish.com', role: 'admin' })
    );

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    await router.navigateByUrl('/admin');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const sidebar = compiled.querySelector('.admin-sidebar');
    expect(sidebar).toBeTruthy();

    // Verify Administrator option is removed from sidebar
    expect(sidebar?.querySelector('.sidebar-admin-card')).toBeNull();
    expect(sidebar?.textContent).not.toContain('ADMINISTRATOR');

    // Verify admin profile displayed on dashboard
    expect(compiled.textContent).toContain('Divya Guru');
    expect(compiled.textContent).toContain('guru@jyotish.com');

    // Verify visible logout button
    const logoutBtn = sidebar?.querySelector('.sidebar-logout-btn') as HTMLButtonElement;
    expect(logoutBtn).toBeTruthy();
    expect(logoutBtn.textContent).toContain('Logout');
  });
});

