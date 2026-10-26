import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Checkout } from './checkout';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { PaymentService } from '../../core/services/payment.service';
import { OrderService } from '../../core/services/order.service';
import { of } from 'rxjs';

describe('Checkout Component Address Form & Proceed to Pay Flow', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;
  let authService: AuthService;
  let cartService: CartService;
  let router: Router;

  beforeEach(async () => {
    localStorage.clear();

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([
          { path: 'login', component: Checkout },
          { path: 'checkout', component: Checkout }
        ]),
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    authService = TestBed.inject(AuthService);
    cartService = TestBed.inject(CartService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate');

    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create the checkout component', () => {
    expect(component).toBeTruthy();
  });

  it('should NOT render the WhatsApp opt-in checkbox or text in the address form', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    // Check that no element has class whatsapp-consent
    const whatsappConsent = compiled.querySelector('.whatsapp-consent');
    expect(whatsappConsent).toBeNull();

    // Check that input with name whatsappOptIn does not exist
    const whatsappInput = compiled.querySelector('input[name="whatsappOptIn"]');
    expect(whatsappInput).toBeNull();

    // Check that the text is not present anywhere in the rendered HTML
    expect(compiled.textContent).not.toContain('I agree to receive order updates on WhatsApp');
    expect(compiled.textContent).not.toContain('opt out anytime');
  });

  it('should retain all standard delivery address fields', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('input#full-name')).toBeTruthy();
    expect(compiled.querySelector('input#mobile')).toBeTruthy();
    expect(compiled.querySelector('input#email')).toBeTruthy();
    expect(compiled.querySelector('input#city')).toBeTruthy();
    expect(compiled.querySelector('input#state')).toBeTruthy();
    expect(compiled.querySelector('input#pin')).toBeTruthy();
    expect(compiled.querySelector('textarea#address')).toBeTruthy();
  });

  it('should display Proceed to Pay on the order button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const button = compiled.querySelector('button.place-order');
    expect(button?.textContent).toContain('Proceed to Pay');
  });

  it('should redirect to /login with returnUrl=/checkout when customer is not logged in on Proceed to Pay', async () => {
    component.fullName = 'Guest Customer';
    component.mobile = '9876543210';
    component.email = 'guest@example.com';
    component.address = '123 Temple Road';
    component.city = 'Varanasi';
    component.state = 'Uttar Pradesh';
    component.pin = '221001';

    await component.placeOrder();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/checkout' }
    });

    // Check that draft delivery details were preserved in storage
    const draft = JSON.parse(localStorage.getItem('astrology_checkout_draft') || '{}');
    expect(draft.fullName).toBe('Guest Customer');
    expect(draft.city).toBe('Varanasi');
  });

  it('should continue normally without redirecting to login when customer is logged in on Proceed to Pay', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    // Empty delivery details to test that it proceeds past the auth check to form validation
    component.fullName = '';
    await component.placeOrder();

    // Router should not have been called with /login
    expect(router.navigate).not.toHaveBeenCalledWith(['/login'], expect.anything());
    // Should proceed to delivery details validation error
    expect(component.errorMessage).toBe('Please fill all delivery details.');
  });

  it('should have novalidate attribute on the checkout form to allow instant auth redirect on Proceed to Pay', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const form = compiled.querySelector('form.checkout-form');
    expect(form?.hasAttribute('novalidate')).toBe(true);
  });

  it('should redirect guest to /login?returnUrl=/checkout even if form fields are empty', async () => {
    // Guest with empty form
    component.fullName = '';
    component.mobile = '';
    component.email = '';

    await component.placeOrder();

    expect(router.navigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { returnUrl: '/checkout' }
    });
  });

  it('should keep guest cart intact in storage when redirecting to login and adopting for checkout', () => {
    cartService.addToCart({
      id: 101,
      name: 'Siddha Rudraksha',
      price: 1100,
      stock: 10,
      image: 'rudraksha.jpg',
      description: 'Blessed bead',
      category: 'Rudraksha'
    });

    expect(cartService.getItems().length).toBe(1);

    // Simulate guest clicking proceed to pay
    component.placeOrder();
    expect(localStorage.getItem('astrology_cart_guest')).toBeTruthy();

    // Simulate login as customer
    authService.saveSession('jwt-token-123', {
      id: 'user_99',
      name: 'Test Customer',
      email: 'customer99@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    // Cart service adopts items for user in checkout
    cartService.adoptGuestItemsForCheckout();

    // Guest cart in localStorage MUST still be intact
    const preservedGuestCart = JSON.parse(localStorage.getItem('astrology_cart_guest') || '[]');
    expect(preservedGuestCart.length).toBe(1);
    expect(preservedGuestCart[0].product.name).toBe('Siddha Rudraksha');

    // And active user cart now has the items for checkout
    const activeItems = cartService.getItems();
    expect(activeItems.length).toBe(1);
    expect(activeItems[0].product.name).toBe('Siddha Rudraksha');
  });

  it('should render only Easebuzz online payment option in the UI (Razorpay and COD removed)', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.payment-option-card');
    expect(cards.length).toBe(1);

    expect(compiled.textContent).toContain('Easebuzz Online Payment');
    expect(compiled.textContent).not.toContain('Razorpay Online Payment');
    expect(compiled.textContent).not.toContain('Cash on Delivery (COD)');
    expect(compiled.querySelector('input#pay-cod')).toBeFalsy();
    expect(compiled.querySelector('input#pay-razorpay')).toBeFalsy();
    expect(compiled.querySelector('input#pay-easebuzz')).toBeTruthy();
  });

  it('should have paymentMethod defaulted to easebuzz with online payment button', () => {
    expect(component.paymentMethod).toBe('easebuzz');
    const compiled = fixture.nativeElement as HTMLElement;
    const easebuzzRadio = compiled.querySelector('input#pay-easebuzz') as HTMLInputElement;
    expect(easebuzzRadio).toBeTruthy();
    expect(easebuzzRadio.checked).toBe(true);

    const button = compiled.querySelector('button.place-order');
    expect(button?.textContent).toContain('Proceed to Pay');
    expect(button?.textContent).not.toContain('Cash on Delivery');
  });

  it('should preserve and render historical order details if an existing order was placed via Cash on Delivery', () => {
    component.finishOrder('Order loaded from history', {
      orderNumber: 'ORD-HISTORICAL-COD-001',
      orderId: 'hist_cod_123',
      customerName: 'Pooja Sharma',
      mobile: '+919876543210',
      email: 'pooja@example.com',
      address: '45 Ganga Ghat',
      city: 'Haridwar',
      state: 'Uttarakhand',
      pin: '249401',
      country: 'India',
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'Pending',
      orderStatus: 'Order Placed (Awaiting Admin Confirmation)',
      total: 999,
      items: [{ title: 'Navgraha Yantra', price: 999, quantity: 1 }],
      orderDate: new Date().toISOString()
    });

    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(component.orderConfirmedDetails?.paymentMethod).toBe('Cash on Delivery');
    expect(compiled.textContent).toContain('Cash on Delivery');
    expect(compiled.textContent).toContain('ORD-HISTORICAL-COD-001');
    expect(compiled.querySelector('.cod-status-tag')).toBeTruthy();
  });

  it('should call paymentService.createOrder and open official Razorpay Checkout modal with order_id, key, amount, and currency', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_test_123',
      status: 'created',
      amount: 99900,
      currency: 'INR',
      orderId: 'order_rzp_test_456',
      keyId: 'rzp_test_sample_key'
    }));

    let passedOptions: any = null;
    const mockOpen = vi.fn();
    const mockOn = vi.fn();

    (window as any).Razorpay = function(options: any) {
      passedOptions = options;
      return {
        open: mockOpen,
        on: mockOn
      };
    };

    await component.placeOrder();

    expect(paymentService.createOrder).toHaveBeenCalled();
    expect(mockOpen).toHaveBeenCalled();
    expect(passedOptions).toBeTruthy();
    expect(passedOptions.key).toBe('rzp_test_sample_key');
    expect(passedOptions.order_id).toBe('order_rzp_test_456');
    expect(passedOptions.amount).toBe(99900);
    expect(passedOptions.currency).toBe('INR');
    expect(passedOptions.prefill.name).toBe('Pooja Sharma');
    expect(passedOptions.prefill.contact).toBe('9876543210');
  });

  it('should handle successful Razorpay payment, verify signature, clear cart, and finish order', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_test_123',
      status: 'created',
      amount: 99900,
      currency: 'INR',
      orderId: 'order_rzp_test_456',
      keyId: 'rzp_test_sample_key'
    }));

    vi.spyOn(paymentService, 'verifyPayment').mockReturnValue(of({
      recordId: 'rec_test_123',
      status: 'paid',
      amount: 99900,
      currency: 'INR',
      orderNumber: 'ORD-1002',
      order: {
        orderNumber: 'ORD-1002',
        status: 'placed',
        paymentStatus: 'paid'
      }
    }));

    vi.spyOn(window, 'alert').mockImplementation(() => {});

    (window as any).Razorpay = function(options: any) {
      return {
        open: () => {
          options.handler({
            razorpay_order_id: 'order_rzp_test_456',
            razorpay_payment_id: 'pay_test_789',
            razorpay_signature: 'test_sig_abc'
          });
        },
        on: vi.fn()
      };
    };

    await component.placeOrder();
    await new Promise(r => setTimeout(r, 50));

    expect(paymentService.verifyPayment).toHaveBeenCalledWith('rec_test_123', {
      razorpay_order_id: 'order_rzp_test_456',
      razorpay_payment_id: 'pay_test_789',
      razorpay_signature: 'test_sig_abc'
    });

    expect(cartService.getItems().length).toBe(0);
    expect(component.statusMessage).toContain('ORD-1002');
  });

  it('should handle payment modal dismissal and failure properly by recording failure and showing message', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_test_123',
      status: 'created',
      amount: 99900,
      currency: 'INR',
      orderId: 'order_rzp_test_456',
      keyId: 'rzp_test_sample_key'
    }));

    vi.spyOn(paymentService, 'recordFailure').mockReturnValue(of({
      recordId: 'rec_test_123',
      status: 'failed',
      amount: 99900,
      currency: 'INR'
    }));

    (window as any).Razorpay = function(options: any) {
      return {
        open: () => {
          options.modal.ondismiss();
        },
        on: vi.fn()
      };
    };

    await component.placeOrder();
    await new Promise(r => setTimeout(r, 50));

    expect(paymentService.recordFailure).toHaveBeenCalledWith(
      'rec_test_123',
      expect.stringContaining('cancelled')
    );
    expect(component.errorMessage).toContain('cancelled');
    expect(cartService.getItems().length).toBe(1);
  });

  it('should call paymentService.createOrder with gateway=easebuzz and open Easebuzz modal', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.paymentMethod = 'easebuzz';
    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_ebz_test_123',
      status: 'created',
      paymentMethod: 'easebuzz',
      amount: 99900,
      currency: 'INR',
      accessKey: 'ebz_access_key_999',
      txnid: 'EBZ_TXN_888',
      keyId: '2PBP7IABZ2'
    }));

    let initiatedOptions: any = null;
    (window as any).EasebuzzCheckout = function(key: string, env: string) {
      return {
        initiatePayment: (options: any) => {
          initiatedOptions = options;
        }
      };
    };

    await component.placeOrder();

    expect(paymentService.createOrder).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Object),
      'easebuzz'
    );
    expect(initiatedOptions).toBeTruthy();
    expect(initiatedOptions.access_key).toBe('ebz_access_key_999');
  });

  it('should handle successful Easebuzz payment, verify on backend, clear cart, and finish order', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.paymentMethod = 'easebuzz';
    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_ebz_test_123',
      status: 'created',
      paymentMethod: 'easebuzz',
      amount: 99900,
      currency: 'INR',
      accessKey: 'ebz_access_key_999',
      txnid: 'EBZ_TXN_888',
      keyId: '2PBP7IABZ2'
    }));

    vi.spyOn(paymentService, 'verifyEasebuzzPayment').mockReturnValue(of({
      recordId: 'rec_ebz_test_123',
      status: 'paid',
      paymentMethod: 'easebuzz',
      amount: 99900,
      currency: 'INR',
      orderNumber: 'ORD-EBZ-2001',
      order: {
        orderNumber: 'ORD-EBZ-2001',
        status: 'placed',
        paymentStatus: 'paid'
      }
    }));

    vi.spyOn(window, 'alert').mockImplementation(() => {});

    (window as any).EasebuzzCheckout = function(key: string, env: string) {
      return {
        initiatePayment: (options: any) => {
          options.onResponse({
            status: 'success',
            txnid: 'EBZ_TXN_888',
            easepayid: 'EPAY_9999',
            amount: '999.00',
            hash: 'mock_verified_hash'
          });
        }
      };
    };

    await component.placeOrder();
    await new Promise(r => setTimeout(r, 50));

    expect(paymentService.verifyEasebuzzPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: 'rec_ebz_test_123',
        status: 'success',
        easepayid: 'EPAY_9999'
      })
    );
    expect(cartService.getItems().length).toBe(0);
    expect(component.statusMessage).toContain('ORD-EBZ-2001');
  });

  it('should handle user-cancelled Easebuzz payment without clearing cart or marking order paid', async () => {
    authService.saveSession('valid-token', {
      id: 'customer_1',
      name: 'Logged In User',
      email: 'user@example.com',
      mobile: '9876543210',
      role: 'customer'
    });

    cartService.addToCart({
      id: 1,
      name: 'Navgraha Yantra',
      price: 999,
      stock: 10,
      image: 'yantra.jpg',
      description: 'Blessed yantra',
      category: 'Yantra'
    });

    component.paymentMethod = 'easebuzz';
    component.fullName = 'Pooja Sharma';
    component.mobile = '9876543210';
    component.email = 'pooja@example.com';
    component.address = '45 Ganga Ghat';
    component.city = 'Haridwar';
    component.state = 'Uttarakhand';
    component.pin = '249401';

    const paymentService = TestBed.inject(PaymentService);
    vi.spyOn(paymentService, 'createOrder').mockReturnValue(of({
      recordId: 'rec_ebz_test_123',
      status: 'created',
      paymentMethod: 'easebuzz',
      amount: 99900,
      currency: 'INR',
      accessKey: 'ebz_access_key_999',
      txnid: 'EBZ_TXN_888',
      keyId: '2PBP7IABZ2'
    }));

    vi.spyOn(paymentService, 'verifyEasebuzzPayment').mockReturnValue(of({
      recordId: 'rec_ebz_test_123',
      status: 'cancelled',
      paymentMethod: 'easebuzz',
      amount: 99900,
      currency: 'INR'
    }));

    (window as any).EasebuzzCheckout = function(key: string, env: string) {
      return {
        initiatePayment: (options: any) => {
          options.onResponse({
            status: 'userCancelled',
            txnid: 'EBZ_TXN_888'
          });
        }
      };
    };

    await component.placeOrder();
    await new Promise(r => setTimeout(r, 50));

    expect(component.errorMessage).toContain('cancelled');
    expect(cartService.getItems().length).toBe(1);
  });
});

