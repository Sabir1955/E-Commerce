import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Dashboard } from './dashboard';
import { AuthService } from '../../core/services/auth.service';

describe('Dashboard Component', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(async () => {
    localStorage.setItem(
      'astrology_current_user',
      JSON.stringify({ id: 'adm-1', name: 'Master Astrologer', email: 'master@jyotish.com', role: 'admin' })
    );

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([
          { path: 'login', children: [] },
          { path: 'admin/products', children: [] },
          { path: 'admin/categories', children: [] },
          { path: 'admin/customers', children: [] },
          { path: 'admin/orders', children: [] },
          { path: 'admin/inventory', children: [] }
        ]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create and render template with admin heading', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain('Admin Dashboard');
  });

  it('should display logged-in admin name and email in dashboard header', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const pill = fixture.nativeElement.querySelector('.admin-logged-in-pill');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain('Master Astrologer');
    expect(pill.textContent).toContain('master@jyotish.com');
  });

  it('component logout() method should call authService.logout and navigate to /login', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const logoutSpy = vi.spyOn(authService, 'logout');
    const navigateSpy = vi.spyOn(router, 'navigate');

    fixture.componentInstance.logout();
    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith(['/login']);
  });

  it('should not render logout button in the dashboard top-right header', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const logoutBtn = fixture.nativeElement.querySelector('.dashboard-logout-btn');
    expect(logoutBtn).toBeNull();
  });

  it('should render the Recent Order Status section heading', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();
    const heading = fixture.nativeElement.querySelector('.order-management-heading h2');
    expect(heading).toBeTruthy();
    expect(heading.textContent).toContain('Recent Order Status');
  });

  it('should have all 8 clickable cards linking to respective admin pages', () => {
    const fixture = TestBed.createComponent(Dashboard);
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.stat-card.clickable-stat') as NodeListOf<HTMLAnchorElement>;
    expect(cards.length).toBe(8);

    const cardLinks = Array.from(cards).map(card => card.getAttribute('href') || card.getAttribute('ng-reflect-router-link') || '');

    // Card 1: Products
    expect(cards[0].textContent).toContain('Total Products');
    // Card 2: Customers
    expect(cards[1].textContent).toContain('Customers');
    // Card 3: Orders
    expect(cards[2].textContent).toContain('Orders');
    // Card 4: Categories
    expect(cards[3].textContent).toContain('Categories');
    // Card 5: Total Sales
    expect(cards[4].textContent).toContain('Total Sales');
    // Card 6: Pending Orders
    expect(cards[5].textContent).toContain('Pending Orders');
    // Card 7: Completed Orders
    expect(cards[6].textContent).toContain('Completed Orders');
    // Card 8: Out of Stock
    expect(cards[7].textContent).toContain('Out of Stock');
  });
});
