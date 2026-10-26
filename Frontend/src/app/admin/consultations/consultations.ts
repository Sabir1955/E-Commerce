import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConsultationService,
  ConsultationBooking
} from '../../core/services/consultation.service';

@Component({
  selector: 'app-admin-consultations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './consultations.html',
  styleUrl: './consultations.css'
})
export class AdminConsultations implements OnInit, OnDestroy {
  // Retain only Bookings management (unnecessary extra features removed)
  activeTab: 'bookings' = 'bookings';

  // Bookings state
  bookings: ConsultationBooking[] = [];
  isLoadingBookings = false;
  bookingStatusFilter = '';
  bookingModeFilter = '';
  searchQuery = '';
  bookingErrorMessage = '';
  bookingSuccessMessage = '';
  private pollIntervalId: any = null;

  // Details Modal State
  showDetailsModal = false;
  selectedBookingForDetails: ConsultationBooking | null = null;

  // Accept Modal State
  showAcceptModal = false;
  selectedBookingForAccept: ConsultationBooking | null = null;
  acceptAmount: number = 799;
  acceptNotes = '';
  isAccepting = false;

  // Reject Modal State
  showRejectModal = false;
  selectedBookingForReject: ConsultationBooking | null = null;
  rejectionReason = '';
  isRejecting = false;

  // Legacy Cancel Modal State
  showCancelModal = false;
  selectedBookingForCancel: ConsultationBooking | null = null;
  cancellationReason = '';
  isCancelling = false;

  // Refund Modal State
  showRefundModal = false;
  selectedBookingForRefund: ConsultationBooking | null = null;
  refundReason = '';
  isRefunding = false;

  // Manual Meet Link Modal
  showMeetLinkModal = false;
  selectedBookingForMeet: ConsultationBooking | null = null;
  manualMeetLink = '';
  isSavingMeetLink = false;
  isRetryingMeet = false;

  // Settings Modal State
  showSettingsModal = false;
  isLoadingSettings = false;
  isSavingSettings = false;
  isUploadingPhoto = false;
  settingsErrorMessage = '';

  settingsForm = {
    name: 'Astro Poonam Vaish Mam',
    photoUrl: 'https://cdn.mos.cms.futurecdn.net/qgBKnfSdNyDah6SfoTMVT4.jpg',
    consultationTitle: 'Vedic Astrology Consultation',
    organizationName: 'Astro Nirvan',
    venueTitle: 'Physical Office Venue — Patna',
    officeName: 'Astro Poonam Vaish Mam — Astro Nirvan',
    officeAddress: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri',
    officeCity: 'Patna',
    officeState: 'Bihar',
    officePincode: '800001',
    officeMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
    visitingHours: '10:00 AM – 06:30 PM (IST)',
    workingDays: 'Monday to Saturday',
    officeInstructions: 'Please arrive 10 minutes prior to your scheduled consultation slot. Carry existing Kundali birth charts or birth details.',
    bio: ''
  };

  get officeForm() {
    return {
      officeName: this.settingsForm.officeName,
      officeAddress: this.getFullOfficeAddress(),
      officeCity: this.settingsForm.officeCity,
      officeState: this.settingsForm.officeState,
      officePincode: this.settingsForm.officePincode,
      officeMapsUrl: this.settingsForm.officeMapsUrl,
      visitingHours: `${this.settingsForm.visitingHours} · ${this.settingsForm.workingDays}`.trim(),
      instructions: this.settingsForm.officeInstructions
    };
  }

  getFullOfficeAddress(): string {
    const parts = [
      this.settingsForm.officeAddress,
      this.settingsForm.officeCity,
      this.settingsForm.officeState ? `${this.settingsForm.officeState} ${this.settingsForm.officePincode || ''}`.trim() : this.settingsForm.officePincode
    ].filter(Boolean);
    return parts.join(', ');
  }

  constructor(
    private consultationService: ConsultationService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadBookings();

    }
  }

  ngOnDestroy(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  get pendingBookingsCount(): number {
    return this.bookings.filter(b => b.bookingStatus === 'pending_admin_approval' || b.bookingStatus === 'pending_approval').length;
  }

  filterPendingOnly(): void {
    this.bookingStatusFilter = 'pending_admin_approval';
    this.loadBookings();
  }

  loadBookings(silent = false): void {
    if (!silent) {
      this.isLoadingBookings = true;
      this.bookingErrorMessage = '';
    }

    this.consultationService.getAdminBookings({
      status: this.bookingStatusFilter || undefined,
      mode: this.bookingModeFilter || undefined,
      search: this.searchQuery || undefined
    }).subscribe({
      next: (res) => {
        this.isLoadingBookings = false;
        this.bookings = res.bookings || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingBookings = false;
        if (!silent) {
          this.bookingErrorMessage = err?.error?.message || 'Failed to load bookings.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  showSuccess(msg: string): void {
    this.bookingSuccessMessage = msg;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.bookingSuccessMessage = '';
      this.cdr.detectChanges();
    }, 5000);
  }

  // ----------------------------------------------------
  // DETAILS MODAL
  // ----------------------------------------------------
  openDetailsModal(booking: ConsultationBooking): void {
    this.selectedBookingForDetails = booking;
    this.showDetailsModal = true;
    this.cdr.detectChanges();
  }

  closeDetailsModal(): void {
    this.showDetailsModal = false;
    this.selectedBookingForDetails = null;
    this.cdr.detectChanges();
  }

  getStatusClass(b: ConsultationBooking): string {
    const s = b.bookingStatus;
    if (s === 'pending_admin_approval' || s === 'pending_approval') return 'status-pending-approval';
    if (s === 'approved_pending_payment') return 'status-approved-pay';
    if (s === 'confirmed') return 'status-confirmed';
    if (s === 'rejected') return 'status-rejected';
    if (s === 'cancelled') return 'status-cancelled';
    if (s === 'completed') return 'status-completed';
    return '';
  }

  getStatusText(b: ConsultationBooking): string {
    const s = b.bookingStatus;
    if (s === 'pending_admin_approval' || s === 'pending_approval') return 'Pending Approval';
    if (s === 'approved_pending_payment') return 'Approved (Pending Payment)';
    if (s === 'confirmed') {
      return b.consultationMode === 'offline' ? 'Confirmed (Patna Office)' : 'Confirmed (Online)';
    }
    if (s === 'rejected') return 'Rejected';
    if (s === 'cancelled') return 'Cancelled';
    if (s === 'completed') return 'Completed';
    return String(s || '').replace(/_/g, ' ');
  }

  // ----------------------------------------------------
  // ACCEPT BOOKING (Online sets fee; Offline confirms without online payment)
  // ----------------------------------------------------
  openAcceptModal(booking: ConsultationBooking): void {
    this.selectedBookingForAccept = booking;
    this.acceptNotes = '';
    if (booking.consultationMode === 'online') {
      const d = Number(booking.durationMinutes);
      if (d === 30) this.acceptAmount = 799;
      else if (d === 45) this.acceptAmount = 1099;
      else if (d === 60) this.acceptAmount = 1499;
      else if (d === 90) this.acceptAmount = 1999;
      else this.acceptAmount = Number(booking.fee) > 0 ? Number(booking.fee) : 799;
    } else {
      this.acceptAmount = 0;
    }
    this.showAcceptModal = true;
    this.cdr.detectChanges();
  }

  closeAcceptModal(): void {
    this.showAcceptModal = false;
    this.selectedBookingForAccept = null;
    this.cdr.detectChanges();
  }

  confirmAcceptAction(): void {
    if (!this.selectedBookingForAccept) return;
    if (this.selectedBookingForAccept.consultationMode === 'online' && (!this.acceptAmount || this.acceptAmount <= 0)) {
      alert('Please enter a valid consultation amount (greater than 0) for this online booking.');
      return;
    }

    this.isAccepting = true;
    this.consultationService.acceptBooking(this.selectedBookingForAccept.id, {
      amount: this.acceptAmount,
      adminNotes: this.acceptNotes.trim()
    }).subscribe({
      next: (updated) => {
        this.isAccepting = false;
        this.showAcceptModal = false;
        if (this.selectedBookingForDetails && this.selectedBookingForDetails.id === updated.id) {
          this.selectedBookingForDetails = updated;
        }
        const msg = this.selectedBookingForAccept?.consultationMode === 'offline'
          ? `Offline booking #${updated.bookingNumber} confirmed without online payment!`
          : `Online booking #${updated.bookingNumber} accepted with fee ₹${this.acceptAmount}. Customer can now pay via gateway.`;
        this.showSuccess(msg);
        this.loadBookings();
      },
      error: (err) => {
        this.isAccepting = false;
        alert(err?.error?.message || 'Failed to accept booking.');
        this.cdr.detectChanges();
      }
    });
  }

  // ----------------------------------------------------
  // REJECT BOOKING (Releases slot and makes it available again)
  // ----------------------------------------------------
  openRejectModal(booking: ConsultationBooking): void {
    this.selectedBookingForReject = booking;
    this.rejectionReason = '';
    this.showRejectModal = true;
    this.cdr.detectChanges();
  }

  closeRejectModal(): void {
    this.showRejectModal = false;
    this.selectedBookingForReject = null;
    this.cdr.detectChanges();
  }

  confirmRejectAction(): void {
    if (!this.selectedBookingForReject) return;
    if (!this.rejectionReason.trim()) {
      alert('Please enter a reason for rejecting this booking.');
      return;
    }

    this.isRejecting = true;
    this.consultationService.rejectBooking(this.selectedBookingForReject.id, this.rejectionReason.trim()).subscribe({
      next: (updated) => {
        this.isRejecting = false;
        this.showRejectModal = false;
        if (this.selectedBookingForDetails && this.selectedBookingForDetails.id === updated.id) {
          this.selectedBookingForDetails = updated;
        }
        this.showSuccess(`Booking #${updated.bookingNumber} rejected and slot released successfully.`);
        this.loadBookings();
      },
      error: (err) => {
        this.isRejecting = false;
        alert(err?.error?.message || 'Failed to reject booking.');
        this.cdr.detectChanges();
      }
    });
  }

  // ----------------------------------------------------
  // CANCEL / REFUND ACTIONS
  // ----------------------------------------------------
  openCancelModal(booking: ConsultationBooking): void {
    this.openRejectModal(booking);
  }

  closeCancelModal(): void {
    this.closeRejectModal();
  }

  openRefundModal(booking: ConsultationBooking): void {
    this.selectedBookingForRefund = booking;
    this.refundReason = '';
    this.showRefundModal = true;
    this.cdr.detectChanges();
  }

  closeRefundModal(): void {
    this.showRefundModal = false;
    this.selectedBookingForRefund = null;
    this.cdr.detectChanges();
  }

  processRefundAction(): void {
    if (!this.selectedBookingForRefund) return;
    this.isRefunding = true;

    this.consultationService.processRefund(this.selectedBookingForRefund.id, this.refundReason.trim()).subscribe({
      next: () => {
        this.isRefunding = false;
        this.showRefundModal = false;
        this.showSuccess(`Refund processed for booking #${this.selectedBookingForRefund?.bookingNumber}`);
        this.loadBookings();
      },
      error: (err) => {
        this.isRefunding = false;
        alert(err?.error?.message || 'Failed to process refund.');
        this.cdr.detectChanges();
      }
    });
  }

  // ----------------------------------------------------
  // GOOGLE MEET LINK ACTIONS
  // ----------------------------------------------------
  openMeetLinkModal(booking: ConsultationBooking): void {
    this.selectedBookingForMeet = booking;
    this.manualMeetLink = booking.googleMeetLink || '';
    this.showMeetLinkModal = true;
    this.cdr.detectChanges();
  }

  closeMeetLinkModal(): void {
    this.showMeetLinkModal = false;
    this.selectedBookingForMeet = null;
    this.cdr.detectChanges();
  }

  saveManualMeetLink(): void {
    if (!this.selectedBookingForMeet || !this.manualMeetLink.trim()) {
      alert('Please enter a valid Google Meet link.');
      return;
    }

    this.isSavingMeetLink = true;
    this.consultationService.updateManualMeetLink(this.selectedBookingForMeet.id, this.manualMeetLink.trim()).subscribe({
      next: () => {
        this.isSavingMeetLink = false;
        this.showMeetLinkModal = false;
        this.showSuccess('Google Meet conference link updated!');
        this.loadBookings();
      },
      error: (err) => {
        this.isSavingMeetLink = false;
        alert(err?.error?.message || 'Failed to update meeting link.');
        this.cdr.detectChanges();
      }
    });
  }

  retryMeetLinkAction(booking: ConsultationBooking): void {
    this.isRetryingMeet = true;
    this.consultationService.retryGoogleMeet(booking.id).subscribe({
      next: () => {
        this.isRetryingMeet = false;
        this.showSuccess('Google Meet conference link generated successfully!');
        this.loadBookings();
      },
      error: (err) => {
        this.isRetryingMeet = false;
        alert(err?.error?.message || 'Failed to generate Google Meet link. Set manually if needed.');
        this.cdr.detectChanges();
      }
    });
  }

  openSettingsModal(): void {
    this.showSettingsModal = true;
    this.isLoadingSettings = true;
    this.settingsErrorMessage = '';
    this.consultationService.getAdminConsultationSettings().subscribe({
      next: (data) => {
        this.isLoadingSettings = false;
        if (data) {
          this.settingsForm = {
            name: data.name || this.settingsForm.name,
            photoUrl: data.photoUrl || this.settingsForm.photoUrl,
            consultationTitle: data.consultationTitle || this.settingsForm.consultationTitle,
            organizationName: data.organizationName || this.settingsForm.organizationName,
            venueTitle: data.venueTitle || this.settingsForm.venueTitle,
            officeName: data.officeName || this.settingsForm.officeName,
            officeAddress: data.officeAddress || this.settingsForm.officeAddress,
            officeCity: data.officeCity || this.settingsForm.officeCity,
            officeState: data.officeState || this.settingsForm.officeState,
            officePincode: data.officePincode || this.settingsForm.officePincode,
            officeMapsUrl: data.officeMapsUrl || this.settingsForm.officeMapsUrl,
            visitingHours: data.visitingHours || this.settingsForm.visitingHours,
            workingDays: data.workingDays || this.settingsForm.workingDays,
            officeInstructions: data.officeInstructions || this.settingsForm.officeInstructions,
            bio: data.bio || ''
          };
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingSettings = false;
        console.warn('Could not load remote settings, using current fallback:', err);
        this.cdr.detectChanges();
      }
    });
  }

  closeSettingsModal(): void {
    this.showSettingsModal = false;
    this.settingsErrorMessage = '';
  }

  generateMapsUrlFromAddress(): void {
    const full = this.getFullOfficeAddress();
    if (full) {
      this.settingsForm.officeMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
    }
  }

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.isUploadingPhoto = true;
      this.consultationService.uploadAstrologerPhoto(file).subscribe({
        next: (res) => {
          this.isUploadingPhoto = false;
          if (res?.url) {
            this.settingsForm.photoUrl = res.url;
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isUploadingPhoto = false;
          alert(err?.error?.message || 'Failed to upload photo. Please ensure it is an image under 10 MB.');
          this.cdr.detectChanges();
        }
      });
    }
  }

  saveSettings(): void {
    if (!this.settingsForm.name.trim()) {
      this.settingsErrorMessage = 'Astrologer name is required.';
      return;
    }
    if (!this.settingsForm.consultationTitle.trim()) {
      this.settingsErrorMessage = 'Consultation title is required.';
      return;
    }
    if (!this.settingsForm.officeAddress.trim()) {
      this.settingsErrorMessage = 'Physical office address is required.';
      return;
    }

    if (!this.settingsForm.officeMapsUrl) {
      this.generateMapsUrlFromAddress();
    }

    this.isSavingSettings = true;
    this.settingsErrorMessage = '';
    this.consultationService.updateConsultationSettings(this.settingsForm).subscribe({
      next: (saved) => {
        this.isSavingSettings = false;
        this.showSettingsModal = false;
        this.showSuccess('Consultation profile and physical office details saved successfully!');
        if (saved) {
          this.settingsForm = {
            ...this.settingsForm,
            name: saved.name || this.settingsForm.name,
            photoUrl: saved.photoUrl || this.settingsForm.photoUrl,
            consultationTitle: saved.consultationTitle || this.settingsForm.consultationTitle,
            organizationName: saved.organizationName || this.settingsForm.organizationName,
            venueTitle: saved.venueTitle || this.settingsForm.venueTitle,
            officeName: saved.officeName || this.settingsForm.officeName,
            officeAddress: saved.officeAddress || this.settingsForm.officeAddress,
            officeCity: saved.officeCity || this.settingsForm.officeCity,
            officeState: saved.officeState || this.settingsForm.officeState,
            officePincode: saved.officePincode || this.settingsForm.officePincode,
            officeMapsUrl: saved.officeMapsUrl || this.settingsForm.officeMapsUrl,
            visitingHours: saved.visitingHours || this.settingsForm.visitingHours,
            workingDays: saved.workingDays || this.settingsForm.workingDays,
            officeInstructions: saved.officeInstructions || this.settingsForm.officeInstructions,
            bio: saved.bio || ''
          };
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSavingSettings = false;
        this.settingsErrorMessage = err?.error?.message || 'Failed to save settings. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }
}
