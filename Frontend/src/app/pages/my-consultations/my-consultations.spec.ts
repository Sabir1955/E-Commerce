import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyConsultations } from './my-consultations';
import { environment } from '../../../environments/environment';
import { ConsultationBooking, PaymentGatewayOption } from '../../core/services/consultation.service';

describe('MyConsultations Component Payment Options Flow', () => {
  let component: MyConsultations;
  let fixture: ComponentFixture<MyConsultations>;
  let httpTesting: HttpTestingController;

  const mockConsultation: ConsultationBooking = {
    id: 'cn-book-100',
    bookingNumber: 'ASTRO-CN-123456',
    customerId: 'user-1',
    astrologerId: 'astro-1',
    customerName: 'Gulam Sabir',
    customerEmail: 'sabirmmd000@gmail.com',
    customerMobile: '+91 9876543210',
    serviceName: '1-on-1 Vedic Astrology Consultation',
    astrologerName: 'Astro Poonam Vaish Mam',
    scheduledDate: '2026-10-25',
    startTime: '10:00 AM',
    endTime: '10:45 AM',
    durationMinutes: 45,
    startTimestamp: '2026-10-25T10:00:00.000Z',
    endTimestamp: '2026-10-25T10:45:00.000Z',
    consultationMode: 'online',
    fee: 1200,
    bookingStatus: 'approved_pending_payment',
    paymentStatus: 'pending',
    googleMeetStatus: 'pending',
    createdAt: '2026-10-16T10:00:00.000Z'
  };

  const mockGateways: PaymentGatewayOption[] = [
    {
      id: 'easebuzz',
      name: 'Easebuzz Smart Checkout',
      description: 'UPI QR, Cards, EMI, Wallets & NetBanking',
      isConfigured: true,
      methods: ['UPI QR', 'Cards', 'Wallets']
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MyConsultations],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MyConsultations);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it('should load customer bookings and display Pay Now button for approved_pending_payment', () => {
    fixture.detectChanges();

    const bookingsReq = httpTesting.expectOne(`${environment.apiUrl}/consultations/my-bookings`);
    expect(bookingsReq.request.method).toBe('GET');
    bookingsReq.flush({ data: [mockConsultation] });

    const settingsReq = httpTesting.expectOne(`${environment.apiUrl}/consultations/settings`);
    expect(settingsReq.request.method).toBe('GET');
    settingsReq.flush({ data: null });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const payBtn = compiled.querySelector('.btn-pay-now') as HTMLButtonElement;
    expect(payBtn).toBeTruthy();
    expect(payBtn.textContent).toContain('Pay Now (₹1200)');
  });

  it('clicking Pay Now should open payment options modal and load available gateways', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/consultations/my-bookings`).flush({ data: [mockConsultation] });
    httpTesting.expectOne(`${environment.apiUrl}/consultations/settings`).flush({ data: null });
    fixture.detectChanges();

    // Trigger Pay Now
    component.openPaymentModal(mockConsultation);
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/consultations/payment-gateways`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: mockGateways });
    fixture.detectChanges();

    expect(component.showPaymentModal).toBe(true);
    expect(component.availableGateways.length).toBe(1);
    expect(component.selectedGateway).toBe('easebuzz');

    const compiled = fixture.nativeElement as HTMLElement;
    const modal = compiled.querySelector('.modal-card-payment');
    expect(modal).toBeTruthy();
    expect(modal?.textContent).toContain('Select Payment Gateway');

    const gatewayOptions = compiled.querySelectorAll('.gateway-option-card');
    expect(gatewayOptions.length).toBe(1);
    expect(gatewayOptions[0].textContent).toContain('Easebuzz');

    // Proceed button is present
    const proceedBtn = compiled.querySelector('.btn-proceed-pay') as HTMLButtonElement;
    expect(proceedBtn).toBeTruthy();
    expect(proceedBtn.textContent).toContain('Proceed to Pay ₹1200');
  });

  it('customer uses Easebuzz gateway before proceeding to payment', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/consultations/my-bookings`).flush({ data: [mockConsultation] });
    httpTesting.expectOne(`${environment.apiUrl}/consultations/settings`).flush({ data: null });
    fixture.detectChanges();

    component.openPaymentModal(mockConsultation);
    const req = httpTesting.expectOne(`${environment.apiUrl}/consultations/payment-gateways`);
    req.flush({ data: mockGateways });
    fixture.detectChanges();

    expect(component.selectedGateway).toBe('easebuzz');
  });

  it('should open the Easebuzz test checkout and verify only after the customer chooses success', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/consultations/my-bookings`).flush({ data: [mockConsultation] });
    httpTesting.expectOne(`${environment.apiUrl}/consultations/settings`).flush({ data: null });
    fixture.detectChanges();

    component.isPaying = true;
    component.payingBookingId = mockConsultation.id;
    (component as any).openEasebuzzModal({
      bookingId: mockConsultation.id,
      bookingNumber: mockConsultation.bookingNumber,
      fee: mockConsultation.fee,
      txnid: 'EBZ_TEST_TXN',
      simulated: true
    });
    fixture.detectChanges();

    expect(component.sandboxPayment).toBeTruthy();
    expect(component.isPaying).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Easebuzz Test Checkout');
    httpTesting.expectNone(`${environment.apiUrl}/consultations/verify-payment`);

    const payButton = fixture.nativeElement.querySelector('.easebuzz-sandbox-pay') as HTMLButtonElement;
    payButton.click();

    const verifyRequest = httpTesting.expectOne(`${environment.apiUrl}/consultations/verify-payment`);
    expect(verifyRequest.request.method).toBe('POST');
    expect(verifyRequest.request.body.status).toBe('success');
    verifyRequest.flush({ data: { booking: { ...mockConsultation, bookingStatus: 'confirmed' } } });

    httpTesting.expectOne(`${environment.apiUrl}/consultations/my-bookings`).flush({
      data: [{ ...mockConsultation, bookingStatus: 'confirmed' }]
    });
    fixture.detectChanges();

    expect(component.sandboxPayment).toBeNull();
    expect(component.isPaying).toBe(false);
    expect(component.successMessage).toContain('Payment verified successfully');
  });
});
