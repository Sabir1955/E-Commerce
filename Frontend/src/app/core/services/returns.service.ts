import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, catchError, of, map } from 'rxjs';
import { BrowserStorageService } from './browser-storage.service';
import { environment } from '../../../environments/environment';

export type ReturnType = 'refund' | 'replacement';

export type ReturnRequestStatus =
  | 'Requested'
  | 'Accepted'
  | 'Approved'
  | 'Rejected'
  | 'Processing'
  | 'Processed'
  | 'Refund Processing'
  | 'Refund Processed'
  | 'Replacement Processing'
  | 'Replacement Shipped'
  | 'Replacement Delivered';

export type RefundStatus = 'Not Applicable' | 'Pending' | 'Processing' | 'Processed';
export type RefundMethod = 'Original Payment Method' | 'Manual Bank Transfer' | 'Store Credit';

export interface ReturnEvidenceImage {
  url: string;
  fileId?: string;
  originalName?: string;
  size?: number;
  mimeType?: string;
}

export interface ReturnStatusHistoryEntry {
  fromStatus?: string;
  toStatus: string;
  message?: string;
  actorId?: string;
  timestamp: string;
}

export interface ReturnProductItem {
  productId?: string;
  name: string;
  quantity: number;
  price?: number;
  image?: string;
}

export interface ReturnsPolicy {
  enabled: boolean;
  returnWindowDays: number;
  refundsEnabled: boolean;
  replacementsEnabled: boolean;
  policyText: string;
}

export interface ReturnRequest {
  id: string;
  orderId: number | string;
  orderNumber?: string;
  email: string;
  customerName: string;
  mobile: string;
  whatsappOptIn: boolean;
  amount: number;
  refundAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  type: ReturnType;
  reason: string;
  comments?: string;
  evidenceImages?: ReturnEvidenceImage[];
  status: ReturnRequestStatus;
  refundStatus: RefundStatus;
  refundMethod?: RefundMethod;
  refundReference?: string;
  refundGateway?: string;
  refundedAt?: string;
  replacementTracking?: string;
  requestedAt: string;
  updatedAt: string;
  adminNote?: string;
  adminMessage?: string;
  rejectionReason?: string;
  statusHistory?: ReturnStatusHistoryEntry[];
  items?: ReturnProductItem[];
  isRestocked?: boolean;
  restockedAt?: string;
}

interface StoredReturnOrder {
  id: number | string;
  rawOrderId?: string;
  email: string;
  customerName?: string;
  mobile?: string;
  whatsappOptIn?: boolean;
  orderStatus: string;
  deliveredAt?: string;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
}

export interface ReturnRequestResult {
  ok: boolean;
  message: string;
  request?: ReturnRequest;
}

export interface ReturnEligibility {
  eligible: boolean;
  reason: string;
}

@Injectable({
  providedIn: 'root'
})
export class ReturnsService {
  private readonly policyKey = 'astrology_returns_policy';
  private readonly requestsKey = 'astrology_return_requests';
  private readonly apiUrl = `${environment.apiUrl}/returns`;

  constructor(
    private storage: BrowserStorageService,
    private http: HttpClient
  ) {}

  // -------------------------------------------------------------
  // Express API -> PostgreSQL Endpoints
  // -------------------------------------------------------------

  uploadEvidence(files: File[]): Observable<{ success: boolean; message: string; images: Array<{ url: string; fileId: string; originalName: string; size: number; mimeType: string }> }> {
    const formData = new FormData();
    for (const file of files) {
      formData.append('evidence', file, file.name);
    }
    return this.http.post<any>(`${this.apiUrl}/upload-evidence`, formData);
  }

  submitReturnRequest(payload: {
    orderId: string;
    reason: string;
    type?: 'return' | 'replacement';
    comments?: string;
    evidenceImages?: Array<{ url: string; fileId?: string; originalName?: string; size?: number; mimeType?: string }>;
    items?: Array<{ product: string; quantity: number }>;
    pickupLocationId?: string;
  }): Observable<any> {
    return this.http.post<any>(this.apiUrl, payload);
  }

  createReturnApi(orderId: string, reason: string, type: 'return' | 'replacement' = 'return', pickupLocationId?: string): Observable<any> {
    return this.http.post<any>(this.apiUrl, {
      orderId,
      reason,
      type,
      pickupLocationId
    });
  }

  getMyReturns(): Observable<{ returns: any[]; pagination: any }> {
    return this.http.get<{ returns: any[]; pagination: any }>(`${this.apiUrl}/my-requests`);
  }

  getMyReturnsApi(): Observable<{ returns: any[]; pagination: any }> {
    return this.http.get<{ returns: any[]; pagination: any }>(`${this.apiUrl}/mine`);
  }

  getReturnById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  getAdminReturns(filters?: { status?: string; search?: string; page?: number; limit?: number }): Observable<{ returns: any[]; pagination: any }> {
    const params: string[] = [];
    if (filters?.status && filters.status !== 'All') {
      params.push(`status=${encodeURIComponent(filters.status)}`);
    }
    if (filters?.search) {
      params.push(`search=${encodeURIComponent(filters.search)}`);
    }
    if (filters?.page) {
      params.push(`page=${filters.page}`);
    }
    if (filters?.limit) {
      params.push(`limit=${filters.limit}`);
    }
    const query = params.length > 0 ? `?${params.join('&')}` : '';
    return this.http.get<{ returns: any[]; pagination: any }>(`${environment.apiUrl}/admin/returns${query}`).pipe(
      catchError(() => this.getAdminReturnsApi(filters?.status))
    );
  }

  getAdminReturnsApi(status?: string): Observable<{ returns: any[]; pagination: any }> {
    const url = status && status !== 'All' ? `${this.apiUrl}?status=${status}` : this.apiUrl;
    return this.http.get<{ returns: any[]; pagination: any }>(url);
  }

  acceptReturn(id: string, payload?: { refundAmount?: number; adminMessage?: string }): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/admin/returns/${id}/accept`, payload || {});
  }

  rejectReturn(id: string, payload: { adminMessage: string }): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/admin/returns/${id}/reject`, payload);
  }

  processRefund(id: string, payload?: { refundAmount?: number; refundMethod?: string; refundReference?: string; manual?: boolean }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/admin/returns/${id}/process-refund`, payload || {});
  }

  restockReturn(id: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/admin/returns/${id}/restock`, {});
  }

  sendAdminMessage(id: string, message: string): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/admin/returns/${id}/message`, { message });
  }

  updateReturnApi(id: string, payload: any): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}`, payload);
  }

  getReturnTrackingApi(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}/tracking`);
  }

  // -------------------------------------------------------------
  // Policy Management
  // -------------------------------------------------------------

  getPolicy(): ReturnsPolicy {
    const saved = this.storage.getItem(this.policyKey);
    if (!saved) {
      return {
        enabled: true,
        returnWindowDays: 7,
        refundsEnabled: true,
        replacementsEnabled: true,
        policyText: 'Sacred items may be returned within 7 days of delivery in their original energized condition.'
      };
    }

    try {
      const value = JSON.parse(saved);
      return {
        enabled: value.enabled ?? true,
        returnWindowDays: value.returnWindowDays ?? 7,
        refundsEnabled: value.refundsEnabled ?? true,
        replacementsEnabled: value.replacementsEnabled ?? true,
        policyText: value.policyText || 'Sacred items may be returned within 7 days of delivery.'
      };
    } catch {
      return {
        enabled: true,
        returnWindowDays: 7,
        refundsEnabled: true,
        replacementsEnabled: true,
        policyText: 'Sacred items may be returned within 7 days of delivery.'
      };
    }
  }

  savePolicy(policy: ReturnsPolicy): boolean {
    if (
      !Number.isSafeInteger(policy.returnWindowDays) ||
      policy.returnWindowDays < (policy.enabled ? 1 : 0) ||
      (policy.enabled && !policy.refundsEnabled && !policy.replacementsEnabled) ||
      policy.policyText.trim().length > 2000
    ) {
      return false;
    }

    this.storage.setItem(this.policyKey, JSON.stringify({
      ...policy,
      policyText: policy.policyText.trim()
    }));
    return true;
  }

  // -------------------------------------------------------------
  // Eligibility & Helper Methods
  // -------------------------------------------------------------

  isEligible(order: StoredReturnOrder, email: string): boolean {
    return this.getEligibility(order, email).eligible;
  }

  getEligibility(order: StoredReturnOrder, email: string): ReturnEligibility {
    const policy = this.getPolicy();
    if (!policy.enabled || policy.returnWindowDays < 1) {
      return { eligible: false, reason: 'The store has not enabled return requests.' };
    }
    if (!policy.refundsEnabled && !policy.replacementsEnabled) {
      return { eligible: false, reason: 'The store has not enabled a refund or replacement request type.' };
    }
    const cleanStatus = String(order.orderStatus || '').trim().toLowerCase();
    if (cleanStatus !== 'delivered') {
      return { eligible: false, reason: 'Return requests are available only after the order is delivered.' };
    }
    if (email && order.email && order.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      return { eligible: false, reason: 'Use the registered email address for this order.' };
    }

    const deliveredDateStr = order.deliveredAt;
    if (deliveredDateStr) {
      const deliveredTime = Date.parse(deliveredDateStr);
      if (Number.isFinite(deliveredTime)) {
        const elapsedDays = (Date.now() - deliveredTime) / (24 * 60 * 60 * 1000);
        if (elapsedDays > policy.returnWindowDays) {
          return { eligible: false, reason: `The ${policy.returnWindowDays}-day return window has expired.` };
        }
      }
    }

    return { eligible: true, reason: 'This order is eligible for a return request.' };
  }

  // -------------------------------------------------------------
  // Requests Management (Local + Sync)
  // -------------------------------------------------------------

  getRequests(): ReturnRequest[] {
    const saved = this.storage.getItem(this.requestsKey);
    if (!saved) return [];

    try {
      const requests = JSON.parse(saved);
      if (!Array.isArray(requests)) return [];
      return requests;
    } catch {
      return [];
    }
  }

  getRequestsForOrder(orderId: number | string, email: string): ReturnRequest[] {
    const normalizedEmail = email.trim().toLowerCase();
    return this.getRequests().filter(request =>
      String(request.orderId) === String(orderId) &&
      (!normalizedEmail || request.email.toLowerCase() === normalizedEmail)
    );
  }

  createRequest(
    orderId: number | string,
    email: string,
    type: ReturnType,
    reason: string
  ): ReturnRequestResult {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 5 || normalizedReason.length > 1000) {
      return { ok: false, message: 'Please provide a reason between 5 and 1,000 characters.' };
    }

    const request: ReturnRequest = {
      id: `return_${Date.now()}`,
      orderId,
      email: normalizedEmail,
      customerName: normalizedEmail,
      mobile: '',
      whatsappOptIn: false,
      amount: 0,
      refundAmount: 0,
      paymentMethod: 'Online',
      paymentStatus: 'Paid',
      type,
      reason: normalizedReason,
      status: 'Requested',
      refundStatus: type === 'refund' ? 'Pending' : 'Not Applicable',
      requestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const requests = this.getRequests();
    requests.push(request);
    this.storage.setItem(this.requestsKey, JSON.stringify(requests));

    return { ok: true, message: 'Your request has been submitted.', request };
  }

  updateRequest(
    requestId: string,
    changes: Pick<ReturnRequest, 'status'> & Partial<Pick<
      ReturnRequest,
    'refundAmount' | 'refundStatus' | 'refundMethod' | 'refundReference' | 'replacementTracking' | 'adminNote'
    >>
  ): ReturnRequestResult {
    const requests = this.getRequests();
    const request = requests.find(item => item.id === requestId);
    if (!request) {
      return { ok: false, message: 'Return request not found.' };
    }

    Object.assign(request, {
      ...changes,
      adminNote: changes.adminNote?.trim().slice(0, 1000),
      updatedAt: new Date().toISOString()
    });
    this.storage.setItem(this.requestsKey, JSON.stringify(requests));
    return { ok: true, message: 'Return request updated.', request };
  }
}
