import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminConsultations } from './consultations';
import { environment } from '../../../environments/environment';
import { ConsultationBooking } from '../../core/services/consultation.service';

describe('AdminConsultations Component Layout and Details Modal', () => {
  let component: AdminConsultations;
  let fixture: ComponentFixture<AdminConsultations>;
  let httpTesting: HttpTestingController;

  const mockBookings: ConsultationBooking[] = [
    {
      id: 'book-1',
      bookingNumber: 'BK-20261015-XYZ1234567890',
      customerId: 'user-1',
      astrologerId: 'astro-1',
      customerName: 'Shri Ramachandra Sharma',
      customerEmail: 'shri.ramachandra.sharma.astrology.consultation@longorganizationname.co.in',
      customerMobile: '+91 9876543210',
      customerNotes: 'Seeking comprehensive Kundali Janampatri analysis for upcoming career transition.',
      serviceId: 'srv-1',
      serviceName: 'Comprehensive Kundali & Career Astrology',
      astrologerName: 'Astro Poonam Vaish Mam',
      scheduledDate: '2026-10-25',
      startTime: '10:00 AM',
      endTime: '10:45 AM',
      durationMinutes: 45,
      startTimestamp: '2026-10-25T10:00:00.000Z',
      endTimestamp: '2026-10-25T10:45:00.000Z',
      consultationMode: 'online',
      fee: 1099,
      amountPaid: 1099,
      bookingStatus: 'confirmed',
      paymentStatus: 'paid',
      paymentTransactionId: 'pay_razorpay_live_txnid_9876543210_abcdef123456789',
      paymentGatewayOrderId: 'order_gateway_live_555444333222111',
      googleMeetLink: 'https://meet.google.com/xyz-uvwx-rst',
      googleMeetStatus: 'created',
      createdAt: '2026-10-15T10:00:00.000Z'
    },
    {
      id: 'book-2',
      bookingNumber: 'BK-20261016-PAT998877',
      customerId: 'user-2',
      astrologerId: 'astro-1',
      customerName: 'Priya Verma',
      customerEmail: 'priya.verma@gmail.com',
      customerMobile: '+91 9123456780',
      customerNotes: 'Marriage horoscope compatibility check.',
      serviceId: 'srv-2',
      serviceName: 'Kundali Milan & Compatibility',
      astrologerName: 'Astro Poonam Vaish Mam',
      scheduledDate: '2026-10-26',
      startTime: '02:00 PM',
      endTime: '02:30 PM',
      durationMinutes: 30,
      startTimestamp: '2026-10-26T14:00:00.000Z',
      endTimestamp: '2026-10-26T14:30:00.000Z',
      consultationMode: 'offline',
      fee: 0,
      bookingStatus: 'pending_admin_approval',
      paymentStatus: 'pending',
      officeAddress: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001.',
      googleMeetStatus: 'not_applicable',
      createdAt: '2026-10-15T11:30:00.000Z'
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminConsultations],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminConsultations);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize, load consultation bookings, and render clean table with explicit columns', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`);
    expect(req.request.method).toBe('GET');
    req.flush({ data: { bookings: mockBookings, total: 2 } });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Check table headers
    const thCols = compiled.querySelectorAll('.consultations-table th');
    expect(thCols.length).toBe(7);
    expect(thCols[0].textContent).toContain('Booking ID');
    expect(thCols[1].textContent).toContain('Customer Name');
    expect(thCols[2].textContent).toContain('Mode');
    expect(thCols[3].textContent).toContain('Duration');
    expect(thCols[4].textContent).toContain('Appointment Date & Time');
    expect(thCols[5].textContent).toContain('Status');
    expect(thCols[6].textContent).toContain('Action');

    // Check table rows
    const rows = compiled.querySelectorAll('.consultations-table tbody tr.table-row');
    expect(rows.length).toBe(2);

    // Verify chips and pills
    const firstRow = rows[0];
    const idChip = firstRow.querySelector('.booking-id-chip');
    expect(idChip).toBeTruthy();
    expect(idChip?.textContent).toContain('#BK-20261015-XYZ1234567890');

    const modePill = firstRow.querySelector('.mode-pill');
    expect(modePill?.textContent).toContain('📹 Online');

    const durationBadge = firstRow.querySelector('.duration-badge');
    expect(durationBadge?.textContent).toContain('45m');

    const statusPill = firstRow.querySelector('.status-pill');
    expect(statusPill?.textContent).toContain('Confirmed (Online)');

    const actionBtn = firstRow.querySelector('.btn-view-details') as HTMLButtonElement;
    expect(actionBtn).toBeTruthy();
    expect(actionBtn.textContent).toContain('View Details');
  });

  it('should render toolbar filter controls neatly with consistent structure', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const toolbar = compiled.querySelector('.toolbar');
    expect(toolbar).toBeTruthy();

    const statusSelect = compiled.querySelector('#status-filter') as HTMLSelectElement;
    const modeSelect = compiled.querySelector('#mode-filter') as HTMLSelectElement;
    const searchInput = compiled.querySelector('#search-input') as HTMLInputElement;
    const refreshBtn = compiled.querySelector('.filter-action .btn-outline-gold') as HTMLButtonElement;

    expect(statusSelect).toBeTruthy();
    expect(modeSelect).toBeTruthy();
    expect(searchInput).toBeTruthy();
    expect(refreshBtn).toBeTruthy();
    expect(refreshBtn.textContent).toContain('Refresh');
  });

  it('clicking View Details button should open the View Details modal with single vertical scroll and fixed header/footer', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Modal initially closed
    expect(compiled.querySelector('.modal-backdrop')).toBeNull();

    // Click View Details on first booking
    const firstRowBtn = compiled.querySelector('.btn-view-details') as HTMLButtonElement;
    firstRowBtn.click();
    fixture.detectChanges();

    expect(component.showDetailsModal).toBe(true);
    expect(component.selectedBookingForDetails?.id).toBe('book-1');

    // Modal DOM inspection
    const modalBackdrop = compiled.querySelector('.modal-backdrop');
    expect(modalBackdrop).toBeTruthy();

    const modalCard = compiled.querySelector('.modal-card.modal-card-wide');
    expect(modalCard).toBeTruthy();

    const modalHeader = modalCard?.querySelector('.modal-header');
    expect(modalHeader).toBeTruthy();
    expect(modalHeader?.textContent).toContain('BK-20261015-XYZ1234567890');

    const modalBody = modalCard?.querySelector('.modal-body.details-modal-body');
    expect(modalBody).toBeTruthy();

    const modalFooter = modalCard?.querySelector('.modal-footer');
    expect(modalFooter).toBeTruthy();
    expect(modalFooter?.querySelector('.btn-back')).toBeTruthy();

    // Verify 4-card 2-column info grid exists inside body
    const grid = modalBody?.querySelector('.details-sections-grid');
    expect(grid).toBeTruthy();
    const cards = grid?.querySelectorAll('.details-card-box');
    expect(cards?.length).toBe(4);

    expect(cards?.[0].textContent).toContain('Customer Information');
    expect(cards?.[1].textContent).toContain('Session Details');
    expect(cards?.[2].textContent).toContain('Amount & Payment Status');
    expect(cards?.[3].textContent).toContain('Google Meet Video Link');
  });

  it('View Details modal should properly display long email address, transaction ID, gateway order, and dates with wrap-safe classes', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    // Open details for booking 1 with long data
    component.openDetailsModal(mockBookings[0]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Check long email rendering
    const emailValue = compiled.querySelector('.details-card-box .detail-value.detail-value-break');
    expect(emailValue).toBeTruthy();
    expect(emailValue?.textContent).toContain('shri.ramachandra.sharma.astrology.consultation@longorganizationname.co.in');

    // Check transaction ID with break-safe and txn-code class
    const txnCodes = compiled.querySelectorAll('.txn-code');
    expect(txnCodes.length).toBeGreaterThanOrEqual(2);
    expect(txnCodes[0].textContent).toContain('pay_razorpay_live_txnid_9876543210_abcdef123456789');
    expect(txnCodes[1].textContent).toContain('order_gateway_live_555444333222111');

    // Check payment status pill
    const payStatusPill = compiled.querySelector('.pay-status-pill');
    expect(payStatusPill).toBeTruthy();
    expect(payStatusPill?.textContent?.trim()).toBe('PAID');
    expect(payStatusPill?.classList.contains('paid')).toBe(true);

    // Check fee highlight
    const feeHighlight = compiled.querySelector('.fee-highlight');
    expect(feeHighlight).toBeTruthy();
    expect(feeHighlight?.textContent).toContain('₹1099');

    // Check Google Meet link button
    const meetBtn = compiled.querySelector('.btn-meet-join');
    expect(meetBtn).toBeTruthy();
    expect(meetBtn?.getAttribute('href')).toBe('https://meet.google.com/xyz-uvwx-rst');
  });

  it('View Details modal for offline booking should display Patna office venue details and no meet link required notice', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    // Open details for booking 2 (offline)
    component.openDetailsModal(mockBookings[1]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    const offlineVenue = compiled.querySelector('.offline-venue-admin');
    expect(offlineVenue).toBeTruthy();
    expect(offlineVenue?.textContent).toContain('Shivani Apartment, Riga Road');
    expect(offlineVenue?.textContent).toContain('In-person offline consultation');

    // Fee should show In-Person (Collected at Office)
    const feeHighlight = compiled.querySelector('.fee-highlight');
    expect(feeHighlight?.textContent).toContain('In-Person (Collected at Office)');

    // Since pending approval, Accept Booking and Reject Booking buttons should be visible in footer
    const confirmBtn = compiled.querySelector('.modal-footer .btn-confirm') as HTMLButtonElement;
    const rejectBtn = compiled.querySelector('.modal-footer .btn-reject') as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.textContent).toContain('Accept Booking');
    expect(rejectBtn).toBeTruthy();
    expect(rejectBtn.textContent).toContain('Reject Booking');
  });

  it('should hide Reject button and show accepted badge when consultation is accepted (approved_pending_payment or confirmed)', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    // mockBookings[0] has bookingStatus: 'confirmed'
    component.openDetailsModal(mockBookings[0]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const confirmBtn = compiled.querySelector('.modal-footer .btn-confirm');
    const rejectBtn = compiled.querySelector('.modal-footer .btn-reject');
    const acceptBadge = compiled.querySelector('.modal-footer .badge-status-accepted');

    expect(confirmBtn).toBeNull();
    expect(rejectBtn).toBeNull();
    expect(acceptBadge).toBeTruthy();
    expect(acceptBadge?.textContent).toContain('Accepted');

    // Test approved_pending_payment state
    component.openDetailsModal({
      ...mockBookings[0],
      bookingStatus: 'approved_pending_payment'
    });
    fixture.detectChanges();

    expect(compiled.querySelector('.modal-footer .btn-confirm')).toBeNull();
    expect(compiled.querySelector('.modal-footer .btn-reject')).toBeNull();
    expect(compiled.querySelector('.modal-footer .badge-status-accepted')).toBeTruthy();
  });

  it('should hide Accept button and show rejected badge when consultation is rejected', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    component.openDetailsModal({
      ...mockBookings[0],
      bookingStatus: 'rejected'
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const confirmBtn = compiled.querySelector('.modal-footer .btn-confirm');
    const rejectBtn = compiled.querySelector('.modal-footer .btn-reject');
    const rejectBadge = compiled.querySelector('.modal-footer .badge-status-rejected');

    expect(confirmBtn).toBeNull();
    expect(rejectBtn).toBeNull();
    expect(rejectBadge).toBeTruthy();
    expect(rejectBadge?.textContent).toContain('Booking Rejected');
  });

  it('closing the modal via close button or Close button sets showDetailsModal to false', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    component.openDetailsModal(mockBookings[0]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.modal-backdrop')).toBeTruthy();

    const closeBtn = compiled.querySelector('.btn-close') as HTMLButtonElement;
    closeBtn.click();
    fixture.detectChanges();

    expect(component.showDetailsModal).toBe(false);
    expect(compiled.querySelector('.modal-backdrop')).toBeNull();
  });

  it('should render Settings button in header and open Settings modal when clicked', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const settingsBtn = compiled.querySelector('.btn-settings-gold') as HTMLButtonElement;
    expect(settingsBtn).toBeTruthy();
    expect(settingsBtn.textContent).toContain('Settings');

    // Click settings button
    settingsBtn.click();
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/settings`);
    expect(req.request.method).toBe('GET');
    req.flush({
      data: {
        id: 'astro_poonam_vaish_mam',
        name: 'Astro Poonam Vaish Mam',
        consultationTitle: 'Vedic Astrology Consultation',
        organizationName: 'Astro Nirvan',
        venueTitle: 'Physical Office Venue — Patna',
        officeName: 'Astro Poonam Vaish Mam — Astro Nirvan',
        officeAddress: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
        officeCity: 'Patna',
        officeState: 'Bihar',
        officePincode: '800001',
        officeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment',
        visitingHours: '10:00 AM – 06:30 PM (IST)',
        workingDays: 'Monday to Saturday',
        officeInstructions: 'Please arrive 10 minutes early.'
      }
    });
    fixture.detectChanges();

    expect(component.showSettingsModal).toBe(true);
    const settingsModal = compiled.querySelector('.settings-modal-card');
    expect(settingsModal).toBeTruthy();
    expect(settingsModal?.textContent).toContain('Consultation & Office Settings');
  });

  it('should save updated consultation profile and physical office details via API', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/bookings`).flush({ data: { bookings: mockBookings, total: 2 } });
    fixture.detectChanges();

    component.settingsForm.name = 'Acharya Dev Sharma';
    component.settingsForm.consultationTitle = 'Advanced Kundali & Jyotish Reading';
    component.settingsForm.officeAddress = '123 Sacred Mandir Marg';
    component.settingsForm.officeCity = 'Patna';

    component.saveSettings();

    const req = httpTesting.expectOne(`${environment.apiUrl}/consultations/admin/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Acharya Dev Sharma');
    expect(req.request.body.consultationTitle).toBe('Advanced Kundali & Jyotish Reading');

    req.flush({
      data: {
        id: 'astro_poonam_vaish_mam',
        name: 'Acharya Dev Sharma',
        consultationTitle: 'Advanced Kundali & Jyotish Reading',
        officeAddress: '123 Sacred Mandir Marg',
        officeCity: 'Patna'
      }
    });
    fixture.detectChanges();

    expect(component.showSettingsModal).toBe(false);
    expect(component.settingsForm.name).toBe('Acharya Dev Sharma');
    expect(component.officeForm.officeAddress).toContain('123 Sacred Mandir Marg');
  });
});
