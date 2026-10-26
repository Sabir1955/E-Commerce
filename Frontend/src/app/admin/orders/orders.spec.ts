import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminOrders } from './orders';
import { environment } from '../../../environments/environment';

describe('AdminOrders Component', () => {
  let component: AdminOrders;
  let fixture: ComponentFixture<AdminOrders>;
  let httpTesting: HttpTestingController;

  const mockStoreAddressResponse = {
    success: true,
    storeName: 'Jyotish Astro Store',
    address: {
      _id: 'store-addr-1',
      fullName: 'Astro Admin',
      mobile: '+919876543210',
      address: '108 Vedic Temple Marg, Near Ganga Ghat',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221001',
      country: 'India',
      isDefault: true
    },
    formattedAddress: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi, Uttar Pradesh 221001, India'
  };

  const mockOrders = [
    {
      _id: '6ac364edb20df7be8e274001',
      orderNumber: '#ORD-1001',
      user: { name: 'Aarav Sharma', email: 'aarav@example.com', mobile: '+919876543210' },
      shippingAddress: {
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        mobile: '+919876543210',
        address: '123 Temple Road',
        city: 'Varanasi',
        state: 'Uttar Pradesh',
        postalCode: '221001',
        country: 'India'
      },
      total: 2500,
      status: 'shipped',
      paymentStatus: 'paid',
      paymentMethod: 'Online',
      createdAt: '2026-10-01T10:00:00.000Z',
      items: [
        {
          _id: 'item-101',
          product: { _id: 'prod-rudra-1', name: 'Rudraksha Mala', price: 2500 },
          name: 'Rudraksha Mala',
          price: 2500,
          quantity: 1
        }
      ]
    },
    {
      _id: '6ac364edb20df7be8e274002',
      orderNumber: '#ORD-1002',
      user: { name: 'Priya Patel', email: 'priya@example.com', mobile: '+919811223344' },
      shippingAddress: {
        fullName: 'Priya Patel',
        email: 'priya@example.com',
        mobile: '+919811223344',
        address: '45 Lotus Enclave',
        city: 'Ahmedabad',
        state: 'Gujarat',
        postalCode: '380015',
        country: 'India'
      },
      total: 1800,
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'Online',
      createdAt: '2026-10-02T11:00:00.000Z',
      items: [
        {
          _id: 'item-102',
          product: 'prod-yantra-1',
          name: 'Shri Yantra',
          price: 1800,
          quantity: 1
        }
      ]
    },
    {
      _id: '6ac364edb20df7be8e274003',
      orderNumber: '#ORD-1003',
      user: { name: 'Rohan Verma', email: 'rohan@example.com', mobile: '+919777888999' },
      shippingAddress: {
        fullName: 'Rohan Verma',
        email: 'rohan@example.com',
        mobile: '+919777888999',
        address: '77 Ganga Ghat',
        city: 'Haridwar',
        state: 'Uttarakhand',
        postalCode: '249401',
        country: 'India'
      },
      total: 3200,
      status: 'cancelled',
      paymentStatus: 'failed',
      paymentMethod: 'COD',
      createdAt: '2026-10-03T12:00:00.000Z',
      items: [
        {
          _id: 'item-103',
          product: { _id: 'prod-ring-1', name: 'Navgrah Gemstone Ring', price: 3200 },
          name: 'Navgrah Gemstone Ring',
          price: 3200,
          quantity: 1
        }
      ]
    },
    {
      _id: '6ac364edb20df7be8e274004',
      orderNumber: '#ORD-1004',
      user: { name: 'Kavita Singh', email: 'kavita@example.com', mobile: '+919666555444' },
      shippingAddress: {
        fullName: 'Kavita Singh',
        email: 'kavita@example.com',
        mobile: '+919666555444',
        address: '88 Heritage Colony',
        city: 'Jaipur',
        state: 'Rajasthan',
        postalCode: '302001',
        country: 'India'
      },
      total: 1200,
      status: 'placed',
      paymentStatus: 'pending',
      paymentMethod: 'Online',
      createdAt: '2026-10-04T13:00:00.000Z',
      items: [
        {
          _id: 'item-104',
          product: 'prod-incense-1',
          name: 'Sandalwood Incense',
          price: 1200,
          quantity: 1
        }
      ]
    },
    {
      _id: '6ac364edb20df7be8e274005',
      orderNumber: '#ORD-1005',
      user: { name: 'Deepak Joshi', email: 'deepak@example.com', mobile: '+919555444333' },
      shippingAddress: {
        fullName: 'Deepak Joshi',
        email: 'deepak@example.com',
        mobile: '+919555444333',
        address: '10 Mountain View',
        city: 'Dehradun',
        state: 'Uttarakhand',
        postalCode: '248001',
        country: 'India'
      },
      total: 4500,
      status: 'delivered',
      paymentStatus: 'paid',
      paymentMethod: 'Online',
      createdAt: '2026-10-05T14:00:00.000Z',
      deliveredAt: '2026-10-05T16:00:00.000Z',
      items: [
        {
          _id: 'item-105',
          product: { _id: 'prod-sphatik-1', name: 'Crystal Sphatik Shivling', price: 4500 },
          name: 'Crystal Sphatik Shivling',
          price: 4500,
          quantity: 1
        }
      ]
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminOrders],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminOrders);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  function flushInitRequests(orders = mockOrders) {
    component.statusFilter = 'ALL';
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/orders/statuses`).flush({ statuses: ['Order Placed', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'] });
    httpTesting.expectOne(`${environment.apiUrl}/orders/store-address`).flush(mockStoreAddressResponse);
    httpTesting.expectOne(`${environment.apiUrl}/orders`).flush({ orders });
    fixture.detectChanges();
  }

  it('should initialize and load order counts dynamically from API for Shipped, Delivered, and Cancelled', () => {
    flushInitRequests();

    expect(component.countTotal).toBe(5);
    expect(component.countPending).toBe(1);
    expect(component.countShipped).toBe(1);
    expect(component.countDelivered).toBe(2);
    expect(component.countCancelled).toBe(1);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.shipped-card strong')?.textContent?.trim()).toBe('1');
    expect(compiled.querySelector('.completed-card strong')?.textContent?.trim()).toBe('2');
    expect(compiled.querySelector('.cancelled-card strong')?.textContent?.trim()).toBe('1');
  });

  it('clicking Shipped card should filter orders by Shipped status', () => {
    flushInitRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    const shippedCard = compiled.querySelector('.shipped-card') as HTMLElement;
    expect(shippedCard).toBeTruthy();

    shippedCard.click();
    fixture.detectChanges();

    expect(component.statusFilter).toBe('Shipped');
    expect(component.filteredOrders.length).toBe(1);
    expect(component.filteredOrders[0].orderStatus).toBe('Shipped');
    expect(component.filteredOrders[0].id).toBe('ORD-1001');
  });

  it('clicking Cancelled card should filter orders by Cancelled status', () => {
    flushInitRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    const cancelledCard = compiled.querySelector('.cancelled-card') as HTMLElement;
    expect(cancelledCard).toBeTruthy();

    cancelledCard.click();
    fixture.detectChanges();

    expect(component.statusFilter).toBe('Cancelled');
    expect(component.filteredOrders.length).toBe(1);
    expect(component.filteredOrders[0].orderStatus).toBe('Cancelled');
    expect(component.filteredOrders[0].id).toBe('ORD-1003');
  });

  it('updating an order status via API should automatically update status counts', () => {
    flushInitRequests();

    expect(component.countShipped).toBe(1);
    expect(component.countPending).toBe(1);

    // Update order ORD-1004 (which was placed/pending) to 'Shipped'
    component.updateOrderStatus('ORD-1004', 'Shipped');

    const patchReq = httpTesting.expectOne(`${environment.apiUrl}/orders/6ac364edb20df7be8e274004/status`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ status: 'shipped' });

    patchReq.flush({
      order: {
        ...mockOrders[3],
        status: 'shipped'
      }
    });

    const getReq = httpTesting.expectOne(`${environment.apiUrl}/orders/6ac364edb20df7be8e274004`);
    getReq.flush({
      order: {
        ...mockOrders[3],
        status: 'shipped'
      }
    });

    fixture.detectChanges();

    // Shipped count should now be 2, pending should be 0
    expect(component.countShipped).toBe(2);
    expect(component.countPending).toBe(0);
  });

  it('should display Customer Details FIRST in View Details (Name, Email, Phone, Full Address)', () => {
    flushInitRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    const toggleBtn = compiled.querySelector('.order-details-toggle') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    toggleBtn.click();
    fixture.detectChanges();

    const detailsPane = compiled.querySelector('.order-details-pane');
    expect(detailsPane).toBeTruthy();

    // Customer section must be present
    const customerSection = detailsPane?.querySelector('.customer-section');
    expect(customerSection).toBeTruthy();

    // Customer details content
    expect(customerSection?.textContent).toContain('Aarav Sharma');
    expect(customerSection?.textContent).toContain('aarav@example.com');
    expect(customerSection?.textContent).toContain('+919876543210');
    expect(customerSection?.textContent).toContain('123 Temple Road, Varanasi, Uttar Pradesh - 221001, India');
  });

  it('should display Product / Order Details BELOW Customer Details (Order No, Product Name, Product ID, Quantity, Price, Total, Payment Method, Payment Status, Order Status)', () => {
    flushInitRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    const toggleBtn = compiled.querySelector('.order-details-toggle') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    toggleBtn.click();
    fixture.detectChanges();

    const detailsPane = compiled.querySelector('.order-details-pane');
    const sections = detailsPane?.querySelectorAll('.details-section-card');
    expect(sections?.length).toBe(3);

    // First card must be customer-section
    expect(sections?.[0].classList.contains('customer-section')).toBe(true);
    // Second card must be product-order-section
    expect(sections?.[1].classList.contains('product-order-section')).toBe(true);

    const productSection = sections?.[1];
    expect(productSection?.textContent).toContain('#ORD-1001');
    expect(productSection?.textContent).toContain('Rudraksha Mala');
    expect(productSection?.textContent).toContain('prod-rudra-1');
    expect(productSection?.textContent).toContain('Online');
    expect(productSection?.textContent).toContain('Paid');
    expect(productSection?.textContent).toContain('Shipped');
    expect(productSection?.textContent).toContain('2500');

    const storeSection = sections?.[2];
    expect(storeSection?.classList.contains('store-section')).toBe(true);
    expect(storeSection?.textContent).toContain('Jyotish Astro Store');
    expect(storeSection?.textContent).toContain('108 Vedic Temple Marg, Near Ganga Ghat');
    expect(storeSection?.textContent).toContain('Varanasi');
    expect(storeSection?.textContent).toContain('Uttar Pradesh');
    expect(storeSection?.textContent).toContain('221001');
    expect(storeSection?.textContent).toContain('India');
  });

  it('should display Download / Print Slip button and trigger printOrderSlip', () => {
    flushInitRequests();

    const compiled = fixture.nativeElement as HTMLElement;
    const toggleBtn = compiled.querySelector('.order-details-toggle') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    toggleBtn.click();
    fixture.detectChanges();

    const printBtn = compiled.querySelector('.btn-print-slip') as HTMLButtonElement;
    expect(printBtn).toBeTruthy();
    expect(printBtn.textContent).toContain('Download / Print Slip');

    const printSpy = vi.spyOn(component, 'printOrderSlip');
    printBtn.click();
    expect(printSpy).toHaveBeenCalled();
  });

  it('should not include Official Packing & Dispatch Slip block in the generated slip', () => {
    flushInitRequests();

    let capturedHtml = '';
    const mockWindow = {
      document: {
        open: () => {},
        write: (html: string) => { capturedHtml = html; },
        close: () => {}
      },
      focus: () => {}
    };
    vi.spyOn(window, 'open').mockReturnValue(mockWindow as unknown as Window);

    const testOrder = component.orderList[0];
    (component as any).executePrintSlip(testOrder);

    expect(capturedHtml).not.toContain('Official Packing &amp; Dispatch Slip');
    expect(capturedHtml).not.toContain('Official Packing');
    expect(capturedHtml).not.toContain('ORDER SLIP');
    expect(capturedHtml).toContain(testOrder.customerName);
    expect(capturedHtml).toContain(String(testOrder.orderNumber || testOrder.id));
  });
});
