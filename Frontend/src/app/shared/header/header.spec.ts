import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Header } from './header';
import { AuthService } from '../../core/services/auth.service';

describe('Header Profile Dropdown', () => {
  let fixture: ComponentFixture<Header>;
  let component: Header;
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [
        provideRouter([
          { path: 'login', component: Header },
          { path: 'products', component: Header },
          { path: 'order-history', component: Header }
        ]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate');

    // Simulate logged-in user
    authService.saveSession('sample-token', {
      id: 'user1',
      name: 'Test Customer',
      email: 'customer@example.com',
      mobile: '+919876543210',
      role: 'customer'
    });

    fixture = TestBed.createComponent(Header);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should start with profileOpen = false', () => {
    expect(component.profileOpen).toBe(false);
  });

  it('should toggle profileOpen to true when toggleProfile() is called', () => {
    component.toggleProfile();
    expect(component.profileOpen).toBe(true);
  });

  it('should toggle profileOpen back to false when toggleProfile() is called again', () => {
    component.toggleProfile();
    expect(component.profileOpen).toBe(true);

    component.toggleProfile();
    expect(component.profileOpen).toBe(false);
  });

  it('should close dropdown when onDocumentClick is triggered from outside profile-control', () => {
    component.profileOpen = true;
    fixture.detectChanges();

    // Create an outside element
    const outsideElement = document.createElement('div');
    document.body.appendChild(outsideElement);

    const outsideClickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(outsideClickEvent, 'target', { value: outsideElement, writable: false });

    component.onDocumentClick(outsideClickEvent);

    expect(component.profileOpen).toBe(false);
    document.body.removeChild(outsideElement);
  });

  it('should NOT close dropdown when onDocumentClick is triggered from inside profile-control', () => {
    component.profileOpen = true;
    fixture.detectChanges();

    const profileButton = fixture.nativeElement.querySelector('.profile-button') as HTMLElement;
    expect(profileButton).toBeTruthy();

    const insideClickEvent = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(insideClickEvent, 'target', { value: profileButton, writable: false });

    component.onDocumentClick(insideClickEvent);

    expect(component.profileOpen).toBe(true);
  });

  it('should close dropdown when Escape key is pressed', () => {
    component.profileOpen = true;
    fixture.detectChanges();

    component.onEscape();
    expect(component.profileOpen).toBe(false);
  });

  it('should close dropdown when closeProfile() is invoked', () => {
    component.profileOpen = true;
    component.closeProfile();
    expect(component.profileOpen).toBe(false);
  });

  it('should close dropdown and navigate to login when logout() is invoked', () => {
    component.profileOpen = true;
    component.logout();
    expect(component.profileOpen).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('should toggle notificationsOpen when toggleNotifications() is called', () => {
    expect(component.notificationsOpen).toBe(false);
    component.toggleNotifications();
    expect(component.notificationsOpen).toBe(true);
    component.toggleNotifications();
    expect(component.notificationsOpen).toBe(false);
  });

  it('should close notifications when closeNotifications() is called', () => {
    component.notificationsOpen = true;
    component.closeNotifications();
    expect(component.notificationsOpen).toBe(false);
  });

  it('should close notifications when Escape key is pressed', () => {
    component.notificationsOpen = true;
    component.onEscape();
    expect(component.notificationsOpen).toBe(false);
  });

  it('should close notifications when profile is opened and vice versa', () => {
    component.notificationsOpen = true;
    component.toggleProfile();
    expect(component.profileOpen).toBe(true);
    expect(component.notificationsOpen).toBe(false);

    component.toggleNotifications();
    expect(component.notificationsOpen).toBe(true);
    expect(component.profileOpen).toBe(false);
  });
});
