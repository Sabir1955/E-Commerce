import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConsultationService, ConsultationBooking, Astrologer, PaymentGatewayOption } from '../../core/services/consultation.service';
import { AuthService } from '../../core/services/auth.service';

interface ConsultationPaymentData {
  bookingId: string;
  bookingNumber: string;
  fee: number;
  txnid: string;
  accessKey?: string;
  keyId?: string;
  payUrl?: string;
  simulated?: boolean;
}

@Component({
  selector: 'app-my-consultations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './my-consultations.html',
  styleUrl: './my-consultations.css'
})
export class MyConsultations implements OnInit {
  bookings: ConsultationBooking[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Cancel dialog state
  selectedForCancel: ConsultationBooking | null = null;
  cancelReason = '';
  isCancelling = false;

  // Payment Options Dialog State
  showPaymentModal = false;
  selectedBookingForPay: ConsultationBooking | null = null;
  selectedGateway: 'easebuzz' = 'easebuzz';
  availableGateways: PaymentGatewayOption[] = [];
  isLoadingGateways = false;

  // Online Payment state
  isPaying = false;
  payingBookingId = '';
  private isVerifyingPayment = false;
  private easebuzzScriptLoaded = false;
  sandboxPayment: ConsultationPaymentData | null = null;

  currentAstrologer: Astrologer | null = null;

  defaultOffice = {
    name: 'Astro Poonam Vaish Mam — Astro Nirvan',
    address: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001.',
    visitingHours: '10:00 AM – 06:30 PM (IST) · Monday to Saturday',
    instructions: 'Please arrive 10 minutes prior to your scheduled consultation slot. Carry existing Kundali birth charts or birth details.',
    mapsUrl: 'https://maps.app.goo.gl/FGPF4X8xwjzsVdrt6?g_st=iw',
    venueTitle: 'Physical Office Venue — Patna'
  };

  constructor(
    private consultationService: ConsultationService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object
  ) { }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadBookings();
      this.loadConsultationSettings();
    }
  }

  loadConsultationSettings(): void {
    this.consultationService.getConsultationSettings().subscribe({
      next: (settings) => {
        if (settings) {
          this.currentAstrologer = settings;
          const parts = [
            settings.officeAddress,
            settings.officeCity,
            settings.officeState ? `${settings.officeState} ${settings.officePincode || ''}`.trim() : settings.officePincode
          ].filter(Boolean);
          const fullAddr = parts.length > 0 ? parts.join(', ') : this.defaultOffice.address;
          const visitingStr = [settings.visitingHours, settings.workingDays].filter(Boolean).join(' · ');

          this.defaultOffice = {
            name: settings.officeName || `${settings.name} — ${settings.organizationName || 'Astro Nirvan'}`,
            address: fullAddr,
            visitingHours: visitingStr || this.defaultOffice.visitingHours,
            instructions: settings.officeInstructions || this.defaultOffice.instructions,
            mapsUrl: settings.officeMapsUrl || (fullAddr ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}` : this.defaultOffice.mapsUrl),
            venueTitle: settings.venueTitle || 'Physical Office Venue — Patna'
          };
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.warn('Could not load consultation settings for MyConsultations:', err);
      }
    });
  }

  loadBookings(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.consultationService.getMyBookings().subscribe({
      next: (list) => {
        this.isLoading = false;
        this.bookings = list || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to load your consultation bookings.';
        this.cdr.detectChanges();
      }
    });
  }

  getStatusLabel(b: ConsultationBooking): string {
    if (b.bookingStatus === 'pending_admin_approval' || b.bookingStatus === 'pending_approval') {
      return 'Pending Admin Approval';
    }
    if (b.bookingStatus === 'approved_pending_payment') {
      return 'Approved — Payment Required';
    }
    if (b.bookingStatus === 'confirmed') {
      return b.consultationMode === 'offline' ? 'Confirmed — Offline Office Visit' : 'Confirmed — Online Google Meet';
    }
    if (b.bookingStatus === 'meeting_creation_pending') {
      return 'Meeting Creation Pending';
    }
    if (b.bookingStatus === 'pending_payment') {
      return 'Pending Payment';
    }
    if (b.bookingStatus === 'payment_failed') {
      return 'Payment Failed';
    }
    if (b.bookingStatus === 'payment_expired') {
      return 'Payment Expired';
    }
    if (b.bookingStatus === 'refund_pending') {
      return 'Refund Pending';
    }
    if (b.bookingStatus === 'refunded') {
      return 'Refunded';
    }
    if (b.bookingStatus === 'rejected') {
      return 'Rejected';
    }
    if (b.bookingStatus === 'cancelled') {
      return 'Cancelled';
    }
    if (b.bookingStatus === 'completed') {
      return 'Completed';
    }
    return String(b.bookingStatus || '').replace(/_/g, ' ');
  }

  getStatusClass(b: ConsultationBooking): string {
    if (b.bookingStatus === 'pending_admin_approval' || b.bookingStatus === 'pending_approval') {
      return 'status-pending-approval';
    }
    if (b.bookingStatus === 'approved_pending_payment') {
      return 'status-approved-pay';
    }
    if (b.bookingStatus === 'confirmed') {
      return b.consultationMode === 'offline' ? 'status-confirmed-offline' : 'status-confirmed-online';
    }
    if (b.bookingStatus === 'meeting_creation_pending') return 'status-pending-meet';
    if (b.bookingStatus === 'pending_payment') return 'status-pending-pay';
    if (b.bookingStatus === 'rejected' || b.bookingStatus === 'cancelled' || b.bookingStatus === 'payment_failed' || b.bookingStatus === 'payment_expired') {
      return 'status-cancelled';
    }
    if (b.bookingStatus === 'refund_pending' || b.bookingStatus === 'refunded') return 'status-refund';
    if (b.bookingStatus === 'completed') return 'status-completed';
    return '';
  }

  /**
   * Pay Now opens the Payment Options dialog for customer selection
   */
  payNow(b: ConsultationBooking): void {
    if (this.isPaying) return;
    this.openPaymentModal(b);
  }

  openPaymentModal(b: ConsultationBooking): void {
    if (this.isPaying) return;
    this.selectedBookingForPay = b;
    this.selectedGateway = 'easebuzz';
    this.errorMessage = '';
    this.successMessage = '';
    this.showPaymentModal = true;
    this.loadPaymentGateways();
    this.cdr.detectChanges();
  }

  closePaymentModal(): void {
    if (this.isPaying) return;
    this.showPaymentModal = false;
    this.selectedBookingForPay = null;
    this.cdr.detectChanges();
  }

  loadPaymentGateways(): void {
    if (this.availableGateways.length > 0 || this.isLoadingGateways) return;
    this.isLoadingGateways = true;
    this.consultationService.getPaymentGateways().subscribe({
      next: (gateways) => {
        this.isLoadingGateways = false;
        this.availableGateways = (gateways || []).filter(g => g.id === 'easebuzz');
        if (this.availableGateways.length === 0) {
          this.availableGateways = [
            {
              id: 'easebuzz',
              name: 'Easebuzz Payment Gateway',
              description: 'Fast & secure payment via UPI, Credit / Debit Cards, NetBanking, or QR code',
              badge: '⚡ Fast & Secure',
              icon: '💳',
              isConfigured: true,
              methods: ['Instant UPI', 'Cards', 'NetBanking', 'QR Code']
            }
          ];
        }
        this.selectedGateway = 'easebuzz';
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoadingGateways = false;
        this.availableGateways = [
          {
            id: 'easebuzz',
            name: 'Easebuzz Payment Gateway',
            description: 'Fast & secure payment via UPI, Credit / Debit Cards, NetBanking, or QR code',
            badge: '⚡ Fast & Secure',
            icon: '💳',
            isConfigured: true,
            methods: ['Instant UPI', 'Cards', 'NetBanking', 'QR Code']
          }
        ];
        this.selectedGateway = 'easebuzz';
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Proceed to pay with the selected payment gateway
   */
  async proceedToPayment(): Promise<void> {
    if (this.isPaying || !this.selectedBookingForPay) return;
    const b = this.selectedBookingForPay;
    this.isPaying = true;
    this.payingBookingId = b.id;
    this.errorMessage = '';
    this.successMessage = '';

    this.consultationService.initiatePayment(b.id, 'easebuzz').subscribe({
      next: async (res) => {
        try {
          await this.loadEasebuzzScript();
          this.openEasebuzzModal(res);
        } catch (err: any) {
          this.isPaying = false;
          this.payingBookingId = '';
          this.errorMessage = err?.message || 'Failed to open payment gateway. Please retry.';
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.isPaying = false;
        this.payingBookingId = '';
        this.errorMessage = err?.error?.message || 'Failed to initiate payment. Please retry.';
        this.cdr.detectChanges();
      }
    });
  }

  private loadEasebuzzScript(): Promise<void> {
    if (this.easebuzzScriptLoaded || (typeof window !== 'undefined' && (window as any).EasebuzzCheckout)) {
      this.easebuzzScriptLoaded = true;
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const existing = this.document.querySelector('script[src*="easebuzz"]');
      if (existing) {
        this.easebuzzScriptLoaded = true;
        resolve();
        return;
      }

      const script = this.document.createElement('script');
      script.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/easebuzz-checkout.js';
      script.async = true;
      script.onload = () => {
        this.easebuzzScriptLoaded = true;
        resolve();
      };
      script.onerror = () => {
        resolve();
      };
      this.document.head.appendChild(script);
    });
  }

  private openEasebuzzModal(paymentData: ConsultationPaymentData): void {
    if (paymentData.simulated) {
      this.sandboxPayment = paymentData;
      this.showPaymentModal = false;
      this.cdr.detectChanges();
      return;
    }

    const EasebuzzCheckout = typeof window !== 'undefined' ? (window as any).EasebuzzCheckout : null;

    if (EasebuzzCheckout && paymentData.accessKey) {
      try {
        const key = paymentData.keyId || '2PBP7IABZ2';
        const easebuzz = new EasebuzzCheckout(key, 'test');
        this.showPaymentModal = false;
        easebuzz.initiatePayment({
          access_key: paymentData.accessKey,
          onResponse: (response: any) => {
            this.zone.run(() => {
              this.handleEasebuzzResponse(paymentData, response);
            });
          }
        });
        return;
      } catch (err) {
        console.warn('Easebuzz modal launch error:', err);
        if (paymentData.payUrl && typeof window !== 'undefined') {
          window.location.href = paymentData.payUrl;
          return;
        }
      }
    }

    if (paymentData.payUrl && typeof window !== 'undefined') {
      window.location.href = paymentData.payUrl;
      return;
    }

    this.isPaying = false;
    this.payingBookingId = '';
    this.errorMessage = 'Easebuzz did not return a checkout link. Please retry or contact support.';
    this.cdr.detectChanges();
  }

  simulateEasebuzzSuccess(): void {
    if (!this.sandboxPayment || this.isVerifyingPayment) return;
    const payment = this.sandboxPayment;
    this.sandboxPayment = null;
    this.verifyEasebuzzPayment(payment.bookingId, payment.txnid, {
      status: 'success',
      txnid: payment.txnid,
      easepayid: `EBZ_SIM_${Date.now()}`
    });
  }

  simulateEasebuzzFailure(): void {
    if (!this.sandboxPayment) return;
    this.sandboxPayment = null;
    this.isPaying = false;
    this.payingBookingId = '';
    this.errorMessage = 'Test payment failed. Your consultation has not been confirmed.';
    this.cdr.detectChanges();
  }

  cancelEasebuzzSandbox(): void {
    this.sandboxPayment = null;
    this.isPaying = false;
    this.payingBookingId = '';
    this.cdr.detectChanges();
  }

  private handleEasebuzzResponse(paymentData: ConsultationPaymentData, response: any): void {
    const status = String(response?.status || '').toLowerCase().trim();
    if (status === 'success' || status === 'paid') {
      this.sandboxPayment = null;
      this.verifyEasebuzzPayment(paymentData.bookingId, paymentData.txnid, response);
    } else {
      this.isPaying = false;
      this.payingBookingId = '';
      this.sandboxPayment = null;
      this.errorMessage = response?.error_Message || 'Payment was cancelled or failed.';
      this.cdr.detectChanges();
    }
  }

  private verifyEasebuzzPayment(bookingId: string, txnid: string, response: any): void {
    if (this.isVerifyingPayment) return;
    this.isVerifyingPayment = true;
    this.consultationService.verifyPayment({
      bookingId,
      gateway: 'easebuzz',
      txnid: txnid || response.txnid,
      easepayid: response.easepayid,
      hash: response.hash,
      status: response.status || 'success'
    }).subscribe({
      next: () => {
        this.isVerifyingPayment = false;
        this.isPaying = false;
        this.payingBookingId = '';
        this.showPaymentModal = false;
        this.sandboxPayment = null;
        this.selectedBookingForPay = null;
        this.successMessage = 'Payment verified successfully! Your consultation is now confirmed and your Google Meet link is active.';
        this.loadBookings();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isVerifyingPayment = false;
        this.isPaying = false;
        this.payingBookingId = '';
        this.sandboxPayment = null;
        this.errorMessage = err?.error?.message || 'Payment verification failed. Please contact support.';
        this.loadBookings();
        this.cdr.detectChanges();
      }
    });
  }



  openCancelModal(b: ConsultationBooking): void {
    this.selectedForCancel = b;
    this.cancelReason = '';
    this.cdr.detectChanges();
  }

  closeCancelModal(): void {
    this.selectedForCancel = null;
    this.cdr.detectChanges();
  }

  confirmCancellation(): void {
    if (!this.selectedForCancel) return;
    this.isCancelling = true;

    this.consultationService.cancelMyBooking(this.selectedForCancel.id, this.cancelReason.trim()).subscribe({
      next: () => {
        this.isCancelling = false;
        this.selectedForCancel = null;
        this.loadBookings();
      },
      error: (err) => {
        this.isCancelling = false;
        alert(err?.error?.message || 'Failed to cancel booking.');
        this.cdr.detectChanges();
      }
    });
  }
}
