import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface Astrologer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  specialties: string[];
  languages: string[];
  bio?: string;
  allowedDurations: number[];
  durationPricing: { [duration: string]: number };
  officeName?: string;
  officeAddress?: string;
  officeCity?: string;
  officeState?: string;
  officePincode?: string;
  officeMapsUrl?: string;
  officeInstructions?: string;
  allowOnline?: boolean;
  allowOffline?: boolean;
  active: boolean;
  displayOrder: number;
  consultationTitle?: string;
  organizationName?: string;
  venueTitle?: string;
  visitingHours?: string;
  workingDays?: string;
}

export interface ConsultationServiceItem {
  id: string;
  astrologerId: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
  allowOnline: boolean;
  allowOffline: boolean;
  onlineFee: number;
  offlineFee: number;
  allowedDurations: number[];
  durationPricing: {
    online?: { [duration: string]: number };
    offline?: { [duration: string]: number };
    [duration: string]: any;
  };
  displayOrder: number;
}

export interface ConsultationSlot {
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isAvailable: boolean;
  reason?: string;
}

export interface SlotsResponse {
  date: string;
  isPast?: boolean;
  isHoliday?: boolean;
  holidayReason?: string;
  isWeeklyOff?: boolean;
  offlineDisabled?: boolean;
  slots: ConsultationSlot[];
}

export interface PaymentGatewayOption {
  id: 'razorpay' | 'easebuzz' | string;
  name: string;
  description: string;
  badge?: string;
  icon?: string;
  isConfigured: boolean;
  methods: string[];
}

export interface ConsultationBooking {
  id: string;
  bookingNumber: string;
  customerId: string;
  customerName?: string;
  customerEmail?: string;
  customerMobile?: string;
  astrologerId: string;
  astrologerName?: string;
  astrologerPhoto?: string;
  astrologerSpecialties?: string[];
  serviceId?: string;
  serviceName?: string;
  consultationMode: 'online' | 'offline';
  officeAddress?: string;
  officeMapsUrl?: string;
  effectiveOfficeAddress?: string;
  effectiveOfficeMapsUrl?: string;
  scheduledDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  startTimestamp: string;
  endTimestamp: string;
  fee: number;
  amountPaid?: number;
  paymentStatus: 'pending' | 'paid' | 'failed' | 'expired' | 'refund_pending' | 'refunded' | 'not_required' | string;
  bookingStatus:
    | 'pending_admin_approval'
    | 'approved_pending_payment'
    | 'pending_approval'
    | 'pending_payment'
    | 'payment_failed'
    | 'payment_expired'
    | 'confirmed'
    | 'meeting_creation_pending'
    | 'completed'
    | 'rejected'
    | 'cancelled'
    | 'refund_pending'
    | 'refunded'
    | string;
  slotHoldExpiresAt?: string;
  paymentGatewayOrderId?: string;
  paymentTransactionId?: string;
  paymentMethod?: string;
  refundStatus?: string;
  refundAmount?: number;
  refundReason?: string;
  customerNotes?: string;
  adminNotes?: string;
  astrologerNotes?: string;
  rejectionReason?: string;
  cancellationReason?: string;
  googleMeetLink?: string;
  googleMeetStatus: 'pending' | 'created' | 'failed' | 'pending_credentials' | 'not_applicable';
  googleMeetError?: string;
  confirmedAt?: string;
  createdAt: string;
}

export interface ReserveSlotResponse {
  booking: ConsultationBooking;
  bookingId: string;
  bookingNumber: string;
  fee: number;
  consultationMode: 'online' | 'offline';
  officeAddress?: string;
  officeMapsUrl?: string;
  holdExpiresAt: string;
  razorpayOrder: {
    id: string;
    amount: number;
    currency: string;
    receipt: string;
    status: string;
  };
  keyId: string;
}

@Injectable({
  providedIn: 'root'
})
export class ConsultationService {
  private readonly apiUrl = `${environment.apiUrl}/consultations`;

  constructor(private http: HttpClient) {}

  // Customer Public Methods
  getActiveAstrologers(): Observable<Astrologer[]> {
    return this.http.get<{ data: Astrologer[] }>(`${this.apiUrl}/astrologers`).pipe(
      map(res => res.data || [])
    );
  }

  getAstrologerDetails(id: string): Observable<Astrologer & { availability: any[]; services: ConsultationServiceItem[] }> {
    return this.http.get<{ data: Astrologer & { availability: any[]; services: ConsultationServiceItem[] } }>(`${this.apiUrl}/astrologers/${id}`).pipe(
      map(res => res.data)
    );
  }

  getServices(astrologerId?: string, mode?: string): Observable<ConsultationServiceItem[]> {
    let params = new HttpParams();
    if (astrologerId) params = params.set('astrologerId', astrologerId);
    if (mode) params = params.set('mode', mode);

    return this.http.get<{ data: ConsultationServiceItem[] }>(`${this.apiUrl}/services`, { params }).pipe(
      map(res => res.data || [])
    );
  }

  getAvailableSlots(astrologerId: string, date: string, duration = 30, mode = 'online'): Observable<SlotsResponse> {
    const params = new HttpParams()
      .set('date', date)
      .set('duration', String(duration))
      .set('mode', mode);

    return this.http.get<{ data: SlotsResponse }>(`${this.apiUrl}/astrologers/${astrologerId}/slots`, { params }).pipe(
      map(res => res.data)
    );
  }

  // Reservation & Payment Gating
  reserveSlot(payload: {
    astrologerId: string;
    serviceId?: string;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    consultationMode: 'online' | 'offline';
    birthDetails?: any;
    customerNotes?: string;
  }): Observable<ReserveSlotResponse> {
    return this.http.post<{ data: ReserveSlotResponse }>(`${this.apiUrl}/reserve-slot`, payload).pipe(
      map(res => res.data)
    );
  }

  getPaymentGateways(): Observable<PaymentGatewayOption[]> {
    return this.http.get<{ data: PaymentGatewayOption[] }>(`${this.apiUrl}/payment-gateways`).pipe(
      map(res => res.data || [])
    );
  }

  verifyPayment(payload: {
    bookingId: string;
    gateway?: string;
    razorpayOrderId?: string;
    transactionId?: string;
    signature?: string;
    txnid?: string;
    easepayid?: string;
    hash?: string;
    status?: string;
    [key: string]: any;
  }): Observable<{ booking: ConsultationBooking; alreadyConfirmed?: boolean }> {
    return this.http.post<{ data: { booking: ConsultationBooking; alreadyConfirmed?: boolean } }>(`${this.apiUrl}/verify-payment`, payload).pipe(
      map(res => res.data)
    );
  }

  cancelSlotHold(bookingId: string, reason?: string): Observable<boolean> {
    return this.http.post<{ data: { released: boolean } }>(`${this.apiUrl}/cancel-hold`, { bookingId, reason }).pipe(
      map(res => Boolean(res.data?.released))
    );
  }

  // Request Booking (Status: Pending Admin Approval)
  requestBooking(payload: {
    astrologerId: string;
    serviceId?: string;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    consultationMode: 'online' | 'offline';
    birthDetails?: any;
    customerNotes?: string;
  }): Observable<ConsultationBooking> {
    return this.http.post<{ data: ConsultationBooking }>(`${this.apiUrl}/request-booking`, payload).pipe(
      map(res => res.data)
    );
  }

  // Customer initiates payment for approved online booking
  initiatePayment(bookingId: string, gateway: string = 'easebuzz'): Observable<{
    booking: ConsultationBooking;
    bookingId: string;
    bookingNumber: string;
    fee: number;
    gateway?: string;
    razorpayOrder?: any;
    keyId?: string;
    txnid: string;
    accessKey?: string;
    payUrl?: string;
    simulated?: boolean;
    [key: string]: any;
  }> {
    return this.http.post<{ data: any }>(`${this.apiUrl}/my-bookings/${bookingId}/initiate-payment`, { gateway }).pipe(
      map(res => res.data)
    );
  }

  // Legacy Book Consultation
  bookConsultation(payload: {
    astrologerId: string;
    serviceId?: string;
    scheduledDate: string;
    startTime: string;
    durationMinutes: number;
    consultationMode?: 'online' | 'offline';
    customerNotes?: string;
  }): Observable<any> {
    return this.http.post<{ data: any }>(`${this.apiUrl}/book`, payload).pipe(
      map(res => res.data)
    );
  }

  getMyBookings(): Observable<ConsultationBooking[]> {
    return this.http.get<{ data: ConsultationBooking[] }>(`${this.apiUrl}/my-bookings`).pipe(
      map(res => res.data || [])
    );
  }

  cancelMyBooking(id: string, reason?: string): Observable<ConsultationBooking> {
    return this.http.post<{ data: ConsultationBooking }>(`${this.apiUrl}/my-bookings/${id}/cancel`, { reason }).pipe(
      map(res => res.data)
    );
  }

  // Admin Methods
  getAdminBookings(paramsData?: {
    status?: string;
    mode?: string;
    date?: string;
    astrologerId?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Observable<{ bookings: ConsultationBooking[]; total: number }> {
    let params = new HttpParams();
    if (paramsData?.status) params = params.set('status', paramsData.status);
    if (paramsData?.mode) params = params.set('mode', paramsData.mode);
    if (paramsData?.date) params = params.set('date', paramsData.date);
    if (paramsData?.astrologerId) params = params.set('astrologerId', paramsData.astrologerId);
    if (paramsData?.search) params = params.set('search', paramsData.search);
    if (paramsData?.limit) params = params.set('limit', String(paramsData.limit));
    if (paramsData?.offset) params = params.set('offset', String(paramsData.offset));

    return this.http.get<{ data: { bookings: ConsultationBooking[]; total: number } }>(`${this.apiUrl}/admin/bookings`, { params }).pipe(
      map(res => res.data)
    );
  }

  acceptBooking(id: string, data: { amount?: number; adminNotes?: string }): Observable<ConsultationBooking> {
    return this.http.patch<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/accept`, data).pipe(
      map(res => res.data)
    );
  }

  rejectBooking(id: string, reason: string): Observable<ConsultationBooking> {
    return this.http.patch<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/reject`, { reason }).pipe(
      map(res => res.data)
    );
  }

  confirmBooking(id: string, adminNotes?: string): Observable<ConsultationBooking> {
    return this.http.patch<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/confirm`, { adminNotes }).pipe(
      map(res => res.data)
    );
  }

  cancelBookingAdmin(id: string, reason: string): Observable<ConsultationBooking> {
    return this.http.patch<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/cancel`, { reason }).pipe(
      map(res => res.data)
    );
  }

  processRefund(id: string, reason?: string): Observable<ConsultationBooking> {
    return this.http.post<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/refund`, { reason }).pipe(
      map(res => res.data)
    );
  }

  updateManualMeetLink(id: string, meetLink: string, adminNotes?: string): Observable<ConsultationBooking> {
    return this.http.patch<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/manual-meet`, { meetLink, adminNotes }).pipe(
      map(res => res.data)
    );
  }

  retryGoogleMeet(id: string): Observable<ConsultationBooking> {
    return this.http.post<{ data: ConsultationBooking }>(`${this.apiUrl}/admin/bookings/${id}/retry-meet`, {}).pipe(
      map(res => res.data)
    );
  }

  // Admin Services Management
  getAdminServices(): Observable<ConsultationServiceItem[]> {
    return this.http.get<{ data: ConsultationServiceItem[] }>(`${this.apiUrl}/admin/services`).pipe(
      map(res => res.data || [])
    );
  }

  createService(data: Partial<ConsultationServiceItem>): Observable<ConsultationServiceItem> {
    return this.http.post<{ data: ConsultationServiceItem }>(`${this.apiUrl}/admin/services`, data).pipe(
      map(res => res.data)
    );
  }

  updateService(id: string, data: Partial<ConsultationServiceItem>): Observable<ConsultationServiceItem> {
    return this.http.put<{ data: ConsultationServiceItem }>(`${this.apiUrl}/admin/services/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  deleteService(id: string): Observable<boolean> {
    return this.http.delete<any>(`${this.apiUrl}/admin/services/${id}`).pipe(
      map(() => true)
    );
  }

  updateOfficeSettings(astrologerId: string, data: any): Observable<Astrologer> {
    return this.http.patch<{ data: Astrologer }>(`${this.apiUrl}/admin/astrologers/${astrologerId}/office`, data).pipe(
      map(res => res.data)
    );
  }

  getAllAstrologersAdmin(): Observable<Astrologer[]> {
    return this.http.get<{ data: Astrologer[] }>(`${this.apiUrl}/admin/astrologers`).pipe(
      map(res => res.data || [])
    );
  }

  createAstrologer(data: Partial<Astrologer>): Observable<Astrologer> {
    return this.http.post<{ data: Astrologer }>(`${this.apiUrl}/admin/astrologers`, data).pipe(
      map(res => res.data)
    );
  }

  updateAstrologer(id: string, data: Partial<Astrologer>): Observable<Astrologer> {
    return this.http.put<{ data: Astrologer }>(`${this.apiUrl}/admin/astrologers/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  // Consultation & Physical Office Settings
  getConsultationSettings(): Observable<Astrologer> {
    return this.http.get<{ data: Astrologer }>(`${this.apiUrl}/settings`).pipe(
      map(res => res.data)
    );
  }

  getAdminConsultationSettings(): Observable<Astrologer> {
    return this.http.get<{ data: Astrologer }>(`${this.apiUrl}/admin/settings`).pipe(
      map(res => res.data)
    );
  }

  updateConsultationSettings(data: Partial<Astrologer>): Observable<Astrologer> {
    return this.http.put<{ data: Astrologer }>(`${this.apiUrl}/admin/settings`, data).pipe(
      map(res => res.data)
    );
  }

  uploadAstrologerPhoto(file: File): Observable<{ url: string; fileId?: string }> {
    const formData = new FormData();
    formData.append('photo', file, file.name);
    return this.http.post<{ data: { url: string; fileId?: string } }>(`${this.apiUrl}/admin/upload-photo`, formData).pipe(
      map(res => res.data)
    );
  }
}
