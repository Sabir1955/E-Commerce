import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TrackOrder } from './track-order';

describe('TrackOrder Component - MongoDB Order ID Tracking', () => {
  let component: TrackOrder;
  let fixture: ComponentFixture<TrackOrder>;
  let httpTesting: HttpTestingController;

  describe('When navigating without query parameters', () => {
    beforeEach(async () => {
      localStorage.clear();

      await TestBed.configureTestingModule({
        imports: [TrackOrder],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: {
                  get: () => null
                }
              }
            }
          }
        ]
      }).compileComponents();

      httpTesting = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(TrackOrder);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });

    afterEach(() => {
      httpTesting.verify();
      localStorage.clear();
    });

    it('should NOT automatically pre-fill any Order ID on blank visit', () => {
      expect(component.orderId).toBe('');
      const compiled = fixture.nativeElement as HTMLElement;
      const orderIdInput = compiled.querySelector('#tracking-order-id') as HTMLInputElement;
      expect(orderIdInput.value).toBe('');
      expect(orderIdInput.getAttribute('placeholder')).toBe('Enter your Order ID');
    });

    it('should NOT render recent orders section or chips', () => {
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.orders-selector')).toBeNull();
      expect(compiled.querySelector('.selector-label')).toBeNull();
      expect(compiled.textContent).not.toContain('Or select from your recent orders');
    });

    it('should allow user to manually enter Order ID and track order', () => {
      component.orderId = '660fa123456789abcdef0123';
      component.trackOrder();

      const req = httpTesting.expectOne((r) => r.url.includes('/orders/track/order/660fa123456789abcdef0123'));
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        order: {
          _id: '660fa123456789abcdef0123',
          orderNumber: 'ORD-101',
          status: 'shipped',
          paymentStatus: 'paid',
          total: 1200,
          items: [{ name: 'Rudraksha Mala', price: 1200, quantity: 1 }]
        }
      });

      fixture.detectChanges();
      expect(component.order).toBeTruthy();
      expect(component.order?.id).toBe('660fa123456789abcdef0123');
      expect(component.order?.orderStatus).toBe('Shipped');
      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.querySelector('.result-heading h2')?.textContent?.trim()).toBe('ORD-101');
    });

    it('should display the human-readable order number (e.g. ORD 2026/10/014) instead of MongoDB hex ID in heading', () => {
      component.orderId = 'ORD 2026/10/014';
      component.trackOrder();

      const req = httpTesting.expectOne((r) => r.url.includes(encodeURIComponent('ORD 2026/10/014')));
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        order: {
          _id: '6ac6113738d3d7f2d8f99ac9',
          orderNumber: 'ORD 2026/10/014',
          status: 'placed',
          paymentStatus: 'paid',
          total: 64999,
          items: [{ name: 'new product', price: 5000, quantity: 1 }]
        }
      });

      fixture.detectChanges();
      expect(component.order).toBeTruthy();
      expect(component.order?.orderNumber).toBe('ORD 2026/10/014');
      const compiled = fixture.nativeElement as HTMLElement;
      const heading = compiled.querySelector('.result-heading h2');
      expect(heading?.textContent?.trim()).toBe('ORD 2026/10/014');
      expect(heading?.textContent).not.toContain('6ac6113738d3d7f2d8f99ac9');
    });
  });

  describe('When navigating with query parameter', () => {
    beforeEach(async () => {
      localStorage.clear();

      await TestBed.configureTestingModule({
        imports: [TrackOrder],
        providers: [
          provideRouter([]),
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                queryParamMap: {
                  get: (key: string) => (key === 'orderId' ? '65f123456789abcdef012345' : null)
                }
              }
            }
          }
        ]
      }).compileComponents();

      httpTesting = TestBed.inject(HttpTestingController);
      fixture = TestBed.createComponent(TrackOrder);
      component = fixture.componentInstance;
    });

    afterEach(() => {
      httpTesting.verify();
      localStorage.clear();
    });

    it('should initialize with Order ID from route and fetch tracking info', () => {
      const req = httpTesting.expectOne((r) => r.url.includes('/orders/track/order/65f123456789abcdef012345'));
      expect(req.request.method).toBe('GET');
      req.flush({
        success: true,
        order: {
          _id: '65f123456789abcdef012345',
          orderNumber: 'ORD-999',
          status: 'shipped',
          paymentStatus: 'paid',
          total: 2400,
          items: []
        }
      });

      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;

      const orderIdInput = compiled.querySelector('#tracking-order-id') as HTMLInputElement;
      expect(orderIdInput).toBeTruthy();
      expect(orderIdInput.getAttribute('placeholder')).toBe('Enter your Order ID');
      expect(component.orderId).toBe('65f123456789abcdef012345');

      const emailInput = compiled.querySelector('#tracking-email');
      expect(emailInput).toBeNull();
    });

    it('should show error message when no order found for Order ID', () => {
      const req = httpTesting.expectOne((r) => r.url.includes('/orders/track/order/65f123456789abcdef012345'));
      req.flush({ success: false, message: 'No order found with the provided Order ID' }, { status: 404, statusText: 'Not Found' });

      const fallbackReq = httpTesting.expectOne((r) => r.url.endsWith('/orders/track/65f123456789abcdef012345'));
      fallbackReq.flush({ success: false, message: 'No order found with the provided Order ID' }, { status: 404, statusText: 'Not Found' });

      fixture.detectChanges();
      expect(component.errorMessage).toBe('No order found with the provided Order ID');
      expect(component.order).toBeNull();
    });
  });
});
