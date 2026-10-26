import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminCustomers } from './customers';
import { environment } from '../../../environments/environment';

describe('AdminCustomers Component', () => {
  let component: AdminCustomers;
  let fixture: ComponentFixture<AdminCustomers>;
  let httpTesting: HttpTestingController;

  const mockCustomers = [
    {
      _id: 'cust-1',
      name: 'Salman Khan',
      email: 'salman@gmail.com',
      mobile: '+919876543211',
      address: 'Galaxy Apts, Bandra, Mumbai - 400050, India',
      role: 'customer',
      active: true
    },
    {
      _id: 'cust-2',
      name: 'Gulam Sabir',
      email: 'sabirmmd000@gmail.com',
      mobile: '+919876543212',
      address: 'Connaught Place, New Delhi - 110001, India',
      role: 'customer',
      active: false
    }
  ];

  const mockOrders = [
    {
      _id: 'ord-1',
      user: 'cust-1',
      total: 2500,
      status: 'Delivered',
      paymentStatus: 'Paid',
      paymentMethod: 'UPI',
      createdAt: '2026-10-01T10:00:00.000Z',
      shippingAddress: {
        fullName: 'Salman Khan',
        email: 'salman@gmail.com',
        address: 'Galaxy Apts, Bandra',
        city: 'Mumbai',
        state: 'Maharashtra',
        postalCode: '400050'
      },
      items: [
        { product: { name: 'Rudraksha Mala', price: 2500 }, quantity: 1 }
      ]
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCustomers],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminCustomers);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should fetch and display customers from backend API in table format', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/admin/customers?limit=100`);
    expect(req.request.method).toBe('GET');
    req.flush({ customers: mockCustomers });

    // Expect orders call
    const ordersReq = httpTesting.expectOne(`${environment.apiUrl}/orders`);
    expect(ordersReq.request.method).toBe('GET');
    ordersReq.flush({ orders: mockOrders });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const table = compiled.querySelector('.customer-table');
    expect(table).toBeTruthy();

    const rows = compiled.querySelectorAll('.customer-tr');
    expect(rows.length).toBe(2);

    expect(compiled.textContent).toContain('Salman Khan');
    expect(compiled.textContent).toContain('salman@gmail.com');
    expect(compiled.textContent).toContain('Gulam Sabir');
    expect(compiled.textContent).toContain('sabirmmd000@gmail.com');

    // Phone and Address columns checked
    expect(compiled.textContent).toContain('+919876543211');
    expect(compiled.textContent).toContain('Galaxy Apts');
  });

  it('should filter customers by search term', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/admin/customers?limit=100`).flush({ customers: mockCustomers });
    httpTesting.expectOne(`${environment.apiUrl}/orders`).flush({ orders: [] });

    fixture.detectChanges();

    component.searchText = 'salman';
    fixture.detectChanges();

    expect(component.filteredCustomers.length).toBe(1);
    expect(component.filteredCustomers[0].name).toBe('Salman Khan');

    component.searchText = 'sabirmmd';
    fixture.detectChanges();

    expect(component.filteredCustomers.length).toBe(1);
    expect(component.filteredCustomers[0].email).toBe('sabirmmd000@gmail.com');
  });

  it('should display empty message when no customers match search', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/admin/customers?limit=100`).flush({ customers: mockCustomers });
    httpTesting.expectOne(`${environment.apiUrl}/orders`).flush({ orders: [] });

    component.searchText = 'nonexistent';
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No customers match your search');
  });

  it('clicking View Customer should show only selected customer details and complete purchase history', () => {
    fixture.detectChanges();

    const multiOrders = [
      {
        _id: 'ord-1',
        orderNumber: 'ORD-1008',
        user: 'cust-1',
        total: 5000,
        status: 'Delivered',
        paymentStatus: 'Paid',
        paymentMethod: 'UPI',
        createdAt: '2026-10-01T10:00:00.000Z',
        shippingAddress: {
          fullName: 'Salman Khan',
          email: 'salman@gmail.com'
        },
        items: [
          { name: 'Rudraksha Mala', price: 2500, quantity: 2, image: '/uploads/rudraksha.jpg' }
        ]
      },
      {
        _id: 'ord-2',
        orderNumber: 'ORD-1009',
        user: 'cust-1',
        total: 10500,
        status: 'Processing',
        paymentStatus: 'Pending',
        paymentMethod: 'COD',
        createdAt: '2026-10-02T12:00:00.000Z',
        shippingAddress: {
          fullName: 'Salman Khan',
          email: 'salman@gmail.com'
        },
        items: [
          { name: 'Shree Yantra', price: 1500, quantity: 1, image: '/uploads/yantra.jpg' },
          { name: 'Navratna Gemstones', price: 9000, quantity: 3, image: '/uploads/gemstones.jpg' }
        ]
      }
    ];

    httpTesting.expectOne(`${environment.apiUrl}/admin/customers?limit=100`).flush({ customers: mockCustomers });
    httpTesting.expectOne(`${environment.apiUrl}/orders`).flush({ orders: multiOrders });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Click "View Details" on Salman Khan's row (index 1 due to alphabetical sorting: Gulam Sabir is 0, Salman Khan is 1)
    const rows = compiled.querySelectorAll('.customer-tr');
    const salmanRow = rows[1];
    const viewCustBtn = salmanRow.querySelector('.view-customer-btn') as HTMLButtonElement;
    expect(viewCustBtn).toBeTruthy();
    viewCustBtn.click();
    fixture.detectChanges();

    // It fetches latest purchase history from /api/admin/customers/cust-1
    const custReq = httpTesting.expectOne(`${environment.apiUrl}/admin/customers/cust-1`);
    expect(custReq.request.method).toBe('GET');
    custReq.flush({ orders: multiOrders });
    fixture.detectChanges();

    // The single customer view should now be visible and the customer table hidden
    expect(compiled.querySelector('.customer-table')).toBeNull();
    const singleCustomerView = compiled.querySelector('.single-customer-view');
    expect(singleCustomerView).toBeTruthy();

    // Check multiple purchases shown separately
    const orderCards = singleCustomerView?.querySelectorAll('.customer-order-card') ?? [];
    expect(orderCards.length).toBe(2);

    // Order 1 details
    expect(singleCustomerView?.textContent).toContain('ORD-1008');
    expect(singleCustomerView?.textContent).toContain('UPI');
    expect(singleCustomerView?.textContent).toContain('Rudraksha Mala');
    expect(singleCustomerView?.textContent).toContain('2');

    // Order 2 details
    expect(singleCustomerView?.textContent).toContain('ORD-1009');
    expect(singleCustomerView?.textContent).toContain('COD');
    expect(singleCustomerView?.textContent).toContain('Shree Yantra');
    expect(singleCustomerView?.textContent).toContain('Navratna Gemstones');
    expect(singleCustomerView?.textContent).toContain('3');

    // Clicking Back button returns to the full customer list
    const backBtn = singleCustomerView?.querySelector('.back-to-list-btn') as HTMLButtonElement;
    expect(backBtn).toBeTruthy();
    backBtn.click();
    fixture.detectChanges();

    expect(compiled.querySelector('.customer-table')).toBeTruthy();
    expect(compiled.querySelector('.single-customer-view')).toBeNull();
  });
});
