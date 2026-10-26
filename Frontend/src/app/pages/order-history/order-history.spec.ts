import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { OrderHistory } from './order-history';
import { AuthService } from '../../core/services/auth.service';

describe('OrderHistory Component - Cancellation and Status Logic', () => {
  let component: OrderHistory;
  let fixture: ComponentFixture<OrderHistory>;
  let httpTesting: HttpTestingController;
  let authService: AuthService;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [OrderHistory],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    vi.spyOn(authService, 'getCurrentUser').mockReturnValue(null);

    fixture = TestBed.createComponent(OrderHistory);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('should allow cancellation for newly placed orders', () => {
    expect(component.canCancelOrder({ id: '1', email: 'c@t.com', orderStatus: 'Order Placed' })).toBe(true);
    expect(component.canCancelOrder({ id: '2', email: 'c@t.com', orderStatus: 'placed' })).toBe(true);
    expect(component.canCancelOrder({ id: '3', email: 'c@t.com', orderStatus: 'awaiting_payment' })).toBe(true);
  });

  it('should not allow cancellation for shipped, delivered, or confirmed orders', () => {
    expect(component.canCancelOrder({ id: '4', email: 'c@t.com', orderStatus: 'Shipped' })).toBe(false);
    expect(component.canCancelOrder({ id: '5', email: 'c@t.com', orderStatus: 'Confirmed' })).toBe(false);
    expect(component.canCancelOrder({ id: '6', email: 'c@t.com', orderStatus: 'Delivered' })).toBe(false);
    expect(component.canCancelOrder({ id: '7', email: 'c@t.com', orderStatus: 'Cancelled' })).toBe(false);
  });

  it('should only show cancellation disabled note when order is confirmed / in preparation, NOT when shipped', () => {
    // Confirmed / preparing orders should have disabled note
    expect(component.isCancellationDisabled({ id: '10', email: 'c@t.com', orderStatus: 'Confirmed' })).toBe(true);
    expect(component.isCancellationDisabled({ id: '11', email: 'c@t.com', orderStatus: 'processing' })).toBe(true);
    expect(component.isCancellationDisabled({ id: '12', email: 'c@t.com', orderStatus: 'packed' })).toBe(true);
    expect(component.isCancellationDisabled({ id: '13', email: 'c@t.com', orderStatus: 'in preparation' })).toBe(true);

    // Shipped, delivered, cancelled or placed orders should NOT show this note
    expect(component.isCancellationDisabled({ id: '14', email: 'c@t.com', orderStatus: 'Shipped' })).toBe(false);
    expect(component.isCancellationDisabled({ id: '15', email: 'c@t.com', orderStatus: 'Delivered' })).toBe(false);
    expect(component.isCancellationDisabled({ id: '16', email: 'c@t.com', orderStatus: 'Cancelled' })).toBe(false);
    expect(component.isCancellationDisabled({ id: '17', email: 'c@t.com', orderStatus: 'Order Placed' })).toBe(false);
  });

  it('should not render cancellation-note in DOM when order is Shipped', () => {
    component.email = 'customer@test.com';
    component.loadHistory();

    const revReq = httpTesting.expectOne((r) => r.url.includes('/reviews/mine'));
    revReq.flush({ reviews: [] });
    const retReq = httpTesting.expectOne((r) => r.url.includes('/returns/mine'));
    retReq.flush({ returns: [] });
    const ordReq = httpTesting.expectOne((r) => r.url.includes('/orders/mine'));
    ordReq.flush({
      success: true,
      orders: [
        {
          _id: 'ord-shipped-1',
          orderNumber: 'ORD-SHIP-101',
          status: 'shipped',
          courierName: 'BlueDart Express',
          trackingId: 'BD12345678',
          total: 1200,
          items: []
        }
      ]
    });

    fixture.detectChanges();

    const compiled: HTMLElement = fixture.nativeElement;
    const cancellationNote = compiled.querySelector('.cancellation-note');
    expect(cancellationNote).toBeNull();

    const trackingBox = compiled.querySelector('.shipment-tracking-box');
    expect(trackingBox).not.toBeNull();
    expect(trackingBox?.textContent).toContain('BlueDart Express');
    expect(trackingBox?.textContent).toContain('BD12345678');
  });

  it('should render cancellation-note in DOM when order is Confirmed', () => {
    component.email = 'customer@test.com';
    component.loadHistory();

    const revReq = httpTesting.expectOne((r) => r.url.includes('/reviews/mine'));
    revReq.flush({ reviews: [] });
    const retReq = httpTesting.expectOne((r) => r.url.includes('/returns/mine'));
    retReq.flush({ returns: [] });
    const ordReq = httpTesting.expectOne((r) => r.url.includes('/orders/mine'));
    ordReq.flush({
      success: true,
      orders: [
        {
          _id: 'ord-conf-1',
          orderNumber: 'ORD-CONF-202',
          status: 'confirmed',
          total: 800,
          items: []
        }
      ]
    });

    fixture.detectChanges();

    const compiled: HTMLElement = fixture.nativeElement;
    const cancellationNote = compiled.querySelector('.cancellation-note');
    expect(cancellationNote).not.toBeNull();
    expect(cancellationNote?.textContent).toContain('Cancellation is disabled because this order is confirmed / in preparation.');
  });
});
