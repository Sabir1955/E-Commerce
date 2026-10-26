import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID, NgZone } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ConsultationService,
  Astrologer,
  ConsultationSlot,
  ConsultationServiceItem,
  ReserveSlotResponse,
  ConsultationBooking
} from '../../core/services/consultation.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-consultations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './consultations.html',
  styleUrl: './consultations.css'
})
export class Consultations implements OnInit, OnDestroy {
  astrologers: Astrologer[] = [];
  services: ConsultationServiceItem[] = [];
  isLoading = false;
  errorMessage = '';

  // Active Astrologer (strictly Astro Poonam Vaish Mam)
  selectedAstrologer: Astrologer | null = null;

  // Step 1: Selected Service
  selectedService: ConsultationServiceItem | null = null;

  // Step 2: Consultation Mode ('online' | 'offline')
  consultationMode: 'online' | 'offline' = 'online';

  // Step 3: Duration & Date
  selectedDuration = 30;
  selectedDate = '';

  // Step 4: Dropdown-style Time Picker
  selectedHour = '10';
  selectedMinute = '00';
  selectedPeriod: 'AM' | 'PM' = 'AM';
  isTimeDropdownOpen = false;
  isDatePickerOpen = false;

  toggleDatePicker(): void {
    this.isDatePickerOpen = !this.isDatePickerOpen;
    this.cdr.detectChanges();
  }

  openDatePicker(): void {
    this.isDatePickerOpen = true;
    this.cdr.detectChanges();
  }

  // Consultation Booking Flow Navigation: 'select' (Step 1) -> 'summary' (Step 2)
  currentStep: 'select' | 'summary' = 'select';

  readonly hoursList: string[] = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
  readonly allMinutesList: string[] = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // Quick select time options covering the whole day (morning to late evening)
  readonly dayTimeOptions: string[] = [
    '06:00 AM', '06:30 AM', '07:00 AM', '07:30 AM',
    '08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM',
    '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
    '12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM',
    '02:00 PM', '02:30 PM', '03:00 PM', '03:30 PM',
    '04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM',
    '06:00 PM', '06:30 PM', '07:00 PM', '07:30 PM',
    '08:00 PM', '08:30 PM', '09:00 PM', '09:30 PM',
    '10:00 PM', '10:30 PM', '11:00 PM', '11:30 PM'
  ];

  selectedSlot: ConsultationSlot | null = null;
  slots: ConsultationSlot[] = [];
  isLoadingSlots = false;
  isHoliday = false;
  holidayReason = '';
  isWeeklyOff = false;
  offlineDisabled = false;

  // Step 5: Birth Details & Customer Notes
  customerName = '';
  birthDate = '';
  birthTime = '';
  birthPlace = '';
  customerNotes = '';

  // Payment Gating & Slot Hold State
  isReserving = false;
  isVerifying = false;
  reservedBooking: ReserveSlotResponse | null = null;
  holdTimeRemaining = '';
  holdExpiresAt = 0;
  private holdTimerInterval: any = null;
  bookingError = '';
  bookingSuccess: ConsultationBooking | null = null;

  // Dynamic Physical Office Details (synced from backend astrologer configuration)
  officeDetails = {
    name: 'Astro Poonam Vaish Mam — Astro Nirvan',
    address: 'Shivani Apartment, Riga Road, Near Dr. Gopal Prasad Clinic, North Sri Krishna Puri, Patna, Bihar 800001.',
    city: 'Patna',
    state: 'Bihar',
    pincode: '800001',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Shivani+Apartment%2C+Riga+Road%2C+Near+Dr.+Gopal+Prasad+Clinic%2C+North+Sri+Krishna+Puri%2C+Patna%2C+Bihar+800001',
    visitingHours: '10:00 AM – 06:30 PM (IST) · Monday to Saturday',
    instructions: 'Please arrive 10 minutes prior to your scheduled consultation slot. Carry existing Kundali birth charts or birth details.'
  };

  constructor(
    private consultationService: ConsultationService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private zone: NgZone,
    @Inject(DOCUMENT) private document: Document,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.selectedDate = this.getTodayDateString();
      const currentUser = this.authService.getCurrentUser();
      if (currentUser) {
        this.customerName = currentUser.name || '';
      }
      this.loadAstrologersAndServices();
    }
  }

  ngOnDestroy(): void {
    this.clearHoldTimer();
    // If user leaves the page while holding a slot, release it
    if (this.reservedBooking?.bookingId && !this.bookingSuccess) {
      this.consultationService.cancelSlotHold(this.reservedBooking.bookingId, 'User left page').subscribe();
    }
  }

  getTodayDateString(): string {
    return this.getDateString(0);
  }

  getDateString(daysOffset: number = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(d);
  }

  loadAstrologersAndServices(): void {
    this.isLoading = true;
    this.errorMessage = '';

    // Load active astrologer and consultation settings from backend
    this.consultationService.getActiveAstrologers().subscribe({
      next: (list) => {
        this.astrologers = list || [];
        if (this.astrologers.length > 0) {
          this.selectedAstrologer = this.astrologers[0];
          this.syncOfficeDetails(this.selectedAstrologer);
          this.loadServicesForAstrologer();
        } else {
          this.isLoading = false;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to load astrologers. Please refresh.';
        this.cdr.detectChanges();
      }
    });
  }

  syncOfficeDetails(astro: Astrologer): void {
    if (!astro) return;
    const parts = [
      astro.officeAddress,
      astro.officeCity,
      astro.officeState ? `${astro.officeState} ${astro.officePincode || ''}`.trim() : astro.officePincode
    ].filter(Boolean);

    const fullAddr = parts.length > 0 ? parts.join(', ') : this.officeDetails.address;
    let maps = astro.officeMapsUrl;
    if (!maps && fullAddr) {
      maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddr)}`;
    }

    const visitingStr = [astro.visitingHours, astro.workingDays].filter(Boolean).join(' · ');

    this.officeDetails = {
      name: astro.officeName || `${astro.name} — ${astro.organizationName || 'Astro Nirvan'}`,
      address: fullAddr,
      city: astro.officeCity || 'Patna',
      state: astro.officeState || 'Bihar',
      pincode: astro.officePincode || '800001',
      mapsUrl: maps || this.officeDetails.mapsUrl,
      visitingHours: visitingStr || this.officeDetails.visitingHours,
      instructions: astro.officeInstructions || this.officeDetails.instructions
    };
  }

  loadServicesForAstrologer(): void {
    if (!this.selectedAstrologer) return;

    this.consultationService.getServices(this.selectedAstrologer.id, this.consultationMode).subscribe({
      next: (servicesList) => {
        this.isLoading = false;
        this.services = servicesList || [];
        if (this.services.length > 0 && !this.selectedService) {
          this.selectedService = this.services[0];
        }
        this.loadSlots();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to load consultation services:', err);
        this.cdr.detectChanges();
      }
    });
  }

  selectService(service: ConsultationServiceItem): void {
    this.selectedService = service;
    this.selectedSlot = null;
    this.bookingError = '';
    // Adjust mode if service only allows one
    if (this.consultationMode === 'online' && !service.allowOnline && service.allowOffline) {
      this.consultationMode = 'offline';
    } else if (this.consultationMode === 'offline' && !service.allowOffline && service.allowOnline) {
      this.consultationMode = 'online';
    }
    this.loadSlots();
  }

  setMode(mode: 'online' | 'offline'): void {
    if (this.consultationMode === mode) return;
    this.consultationMode = mode;
    this.selectedSlot = null;
    this.bookingError = '';
    this.loadServicesForAstrologer();
  }

  setDuration(dur: number): void {
    this.selectedDuration = dur;
    this.selectedSlot = null;
    this.loadSlots();
  }

  onDateChange(): void {
    this.selectedSlot = null;
    this.loadSlots();
  }

  setQuickDate(daysOffset: number): void {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    this.selectedDate = formatter.format(d);
    this.selectedSlot = null;
    this.loadSlots();
  }

  get availableSlotsCount(): number {
    return this.slots ? this.slots.filter(s => s.isAvailable).length : 0;
  }

  get unavailableSlotsCount(): number {
    return this.slots ? this.slots.filter(s => !s.isAvailable).length : 0;
  }

  formatSlotTime(time24: string): string {
    if (!time24) return '';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return time24;
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${String(h12).padStart(2, '0')}:${m} ${period}`;
  }

  loadSlots(): void {
    if (!this.selectedAstrologer || !this.selectedDate) return;

    this.isLoadingSlots = true;
    this.slots = [];
    this.isHoliday = false;
    this.isWeeklyOff = false;
    this.offlineDisabled = false;

    this.consultationService.getAvailableSlots(
      this.selectedAstrologer.id,
      this.selectedDate,
      this.selectedDuration,
      this.consultationMode
    ).subscribe({
      next: (res) => {
        this.isLoadingSlots = false;
        this.slots = res?.slots || [];
        this.isHoliday = Boolean(res?.isHoliday);
        this.holidayReason = res?.holidayReason || '';
        this.isWeeklyOff = Boolean(res?.isWeeklyOff);
        this.offlineDisabled = Boolean(res?.offlineDisabled);

        // Keep or select an available slot
        if (this.selectedSlot) {
          const match = this.slots.find(s => s.startTime === this.selectedSlot?.startTime);
          if (match && match.isAvailable) {
            this.selectedSlot = match;
          } else {
            this.selectedSlot = null;
          }
        }
        if (!this.selectedSlot) {
          const firstAvail = this.slots.find(s => s.isAvailable);
          if (firstAvail) {
            this.selectSlot(firstAvail);
          }
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingSlots = false;
        console.error('Failed to load slots:', err);
        this.cdr.detectChanges();
      }
    });
  }

  selectSlot(slot: ConsultationSlot): void {
    if (!slot || !slot.isAvailable) return;
    this.selectedSlot = slot;
    this.bookingError = '';

    // Synchronize 12-hour components for consistency
    const [hStr, mStr] = slot.startTime.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    this.selectedHour = String(h12).padStart(2, '0');
    this.selectedMinute = m;
    this.selectedPeriod = period;

    this.cdr.detectChanges();
  }

  get currentFee(): number {
    if (this.selectedService) {
      const modeKey = this.consultationMode;
      const pricing = this.selectedService.durationPricing?.[modeKey] || {};
      const durationFee = pricing[String(this.selectedDuration)];
      if (durationFee) return Number(durationFee);
      return modeKey === 'offline' ? this.selectedService.offlineFee : this.selectedService.onlineFee;
    }

    if (this.selectedAstrologer) {
      const pricing = this.selectedAstrologer.durationPricing || {};
      const fee = Number(pricing[String(this.selectedDuration)]);
      if (fee) {
        return this.consultationMode === 'offline' ? fee + 300 : fee;
      }
    }

    return this.consultationMode === 'offline' ? 1199 : 899;
  }

  get selectedTimeFormatted(): string {
    return `${this.selectedHour}:${this.selectedMinute} ${this.selectedPeriod}`;
  }

  get startTime24(): string {
    let hour = parseInt(this.selectedHour, 10);
    if (isNaN(hour)) hour = 10;
    if (this.selectedPeriod === 'PM' && hour < 12) {
      hour += 12;
    } else if (this.selectedPeriod === 'AM' && hour === 12) {
      hour = 0;
    }
    const minute = this.selectedMinute || '00';
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }

  get endTime24(): string {
    if (!this.startTime24) return '';
    const [h, m] = this.startTime24.split(':').map(Number);
    const totalMinutes = h * 60 + m + (this.selectedDuration || 30);
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  get endTimeFormatted(): string {
    if (!this.endTime24) return '';
    const [h24, m24] = this.endTime24.split(':').map(Number);
    const period = h24 >= 12 ? 'PM' : 'AM';
    let h12 = h24 % 12;
    if (h12 === 0) h12 = 12;
    return `${String(h12).padStart(2, '0')}:${String(m24).padStart(2, '0')} ${period}`;
  }

  toggleTimeDropdown(): void {
    this.isTimeDropdownOpen = !this.isTimeDropdownOpen;
    this.cdr.detectChanges();
  }

  closeTimeDropdown(): void {
    this.isTimeDropdownOpen = false;
    this.cdr.detectChanges();
  }

  setTimePreset(timeStr: string): void {
    const parts = timeStr.trim().split(' ');
    if (parts.length === 2) {
      const [hm, period] = parts;
      const [h, m] = hm.split(':');
      this.selectedHour = h;
      this.selectedMinute = m;
      this.selectedPeriod = (period === 'PM' ? 'PM' : 'AM');
      this.bookingError = '';
      this.cdr.detectChanges();
    }
  }

  onTimeComponentChange(): void {
    this.bookingError = '';
    this.cdr.detectChanges();
  }

  goToSummaryStep(): void {
    if (!this.selectedDate || !this.startTime24) {
      this.bookingError = 'Please select a date and consultation appointment slot before proceeding.';
      return;
    }
    if (this.slots && this.slots.length > 0) {
      const match = this.slots.find(s => s.startTime === this.startTime24);
      if (match && !match.isAvailable) {
        this.bookingError = `The selected slot (${this.formatSlotTime(match.startTime)} – ${this.formatSlotTime(match.endTime)}) is unavailable (${match.reason || 'Booked'}). Please choose an available slot.`;
        return;
      }
    }
    this.bookingError = '';
    this.isDatePickerOpen = false;
    this.currentStep = 'summary';
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
    this.cdr.detectChanges();
  }

  goToSelectStep(): void {
    this.bookingError = '';
    this.isDatePickerOpen = false;
    this.currentStep = 'select';
    if (isPlatformBrowser(this.platformId)) {
      window.scrollTo({ top: 120, behavior: 'smooth' });
    }
    this.cdr.detectChanges();
  }

  /**
   * Submit Consultation Booking Request (Status: Pending Admin Approval)
   */
  submitBookingRequest(): void {
    if (!this.authService.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: '/consultations' } });
      return;
    }

    if (!this.selectedAstrologer || !this.selectedDate || !this.startTime24) {
      this.bookingError = 'Please select a date and consultation time.';
      return;
    }

    this.isReserving = true;
    this.bookingError = '';

    const payload = {
      astrologerId: this.selectedAstrologer.id,
      scheduledDate: this.selectedDate,
      startTime: this.startTime24,
      durationMinutes: this.selectedDuration,
      consultationMode: this.consultationMode
    };

    this.consultationService.requestBooking(payload).subscribe({
      next: (booking) => {
        this.isReserving = false;
        this.bookingSuccess = booking;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isReserving = false;
        this.bookingError = err?.error?.message || 'Failed to submit booking request. Please select another time.';
        this.cdr.detectChanges();
      }
    });
  }

  /**
   * Initiate Payment & Reserve Slot (Backwards compatibility)
   */
  async proceedToPayment(): Promise<void> {
    this.submitBookingRequest();
  }

  /**
   * Hold Countdown Timer
   */
  private startHoldTimer(expiresAtIso: string): void {
    this.clearHoldTimer();
    this.holdExpiresAt = new Date(expiresAtIso).getTime();

    const updateTimer = () => {
      const now = Date.now();
      const diff = this.holdExpiresAt - now;

      if (diff <= 0) {
        this.clearHoldTimer();
        this.holdTimeRemaining = '00:00';
        if (this.reservedBooking && !this.bookingSuccess) {
          this.consultationService.cancelSlotHold(this.reservedBooking.bookingId, 'Hold expired').subscribe();
          this.reservedBooking = null;
          this.bookingError = 'Your 10-minute slot hold has expired. Please select a slot again to proceed.';
          this.loadSlots();
          this.cdr.detectChanges();
        }
        return;
      }

      const totalSec = Math.floor(diff / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      this.holdTimeRemaining = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.cdr.detectChanges();
    };

    updateTimer();
    this.holdTimerInterval = setInterval(updateTimer, 1000);
  }

  private clearHoldTimer(): void {
    if (this.holdTimerInterval) {
      clearInterval(this.holdTimerInterval);
      this.holdTimerInterval = null;
    }
  }



  resetBooking(): void {
    this.clearHoldTimer();
    this.bookingSuccess = null;
    this.reservedBooking = null;
    this.selectedSlot = null;
    this.selectedHour = '10';
    this.selectedMinute = '00';
    this.selectedPeriod = 'AM';
    this.isTimeDropdownOpen = false;
    this.isDatePickerOpen = false;
    this.currentStep = 'select';
    this.bookingError = '';
    this.cdr.detectChanges();
  }
}
