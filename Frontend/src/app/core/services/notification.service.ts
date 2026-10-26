import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BrowserStorageService } from './browser-storage.service';
import { environment } from '../../../environments/environment';

export type NotificationEvent =
  | 'registration_confirmation'
  | 'order_confirmation'
  | 'payment_confirmation'
  | 'order_processing'
  | 'order_shipped'
  | 'order_delivered'
  | 'order_cancelled'
  | 'refund_processed';

export interface NotificationRecord {
  id: string;
  event: NotificationEvent;
  channel: 'email' | 'whatsapp';
  recipient: string;
  customerName: string;
  orderId?: number | string;
  status: 'awaiting_configuration';
  createdAt: string;
}

export interface BackendNotificationLog {
  _id: string;
  user?: {
    _id: string;
    name: string;
    email: string;
    mobile?: string;
    role?: string;
  };
  order?: {
    _id: string;
    orderNumber?: string;
    status: string;
    total?: number;
    shippingAddress?: any;
    createdAt?: string;
  };
  returnRequest?: {
    _id: string;
    status: string;
    reason: string;
    type: string;
    refundAmount?: number;
  };
  channel: 'email' | 'sms' | 'whatsapp' | 'system';
  recipient: string;
  subject?: string;
  message: string;
  status: 'sent' | 'skipped' | 'failed';
  detail?: string;
  read: boolean;
  readAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InAppNotificationItem {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string;
  link?: string;
  isRead: boolean;
  readAt?: string;
  metadata?: any;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly storageKey = 'astrology_notification_outbox';
  private readonly apiUrl = `${environment.apiUrl}/notifications`;

  constructor(
    private storage: BrowserStorageService,
    private http: HttpClient
  ) {}

  getLogsApi(query?: { channel?: string; status?: string; read?: boolean; page?: number; limit?: number }): Observable<{ logs: BackendNotificationLog[]; pagination: any }> {
    let params = new HttpParams();
    if (query?.channel) params = params.set('channel', query.channel);
    if (query?.status) params = params.set('status', query.status);
    if (query?.read !== undefined) params = params.set('read', String(query.read));
    if (query?.page) params = params.set('page', String(query.page));
    if (query?.limit) params = params.set('limit', String(query.limit));

    return this.http.get<{ logs: BackendNotificationLog[]; pagination: any }>(`${this.apiUrl}/logs`, { params }).pipe(
      map((res: any) => {
        if (res?.data?.logs) {
          return res.data;
        }
        return res;
      })
    );
  }

  markAsReadApi(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/logs/${id}/read`, {});
  }

  markAllAsReadApi(): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/logs/mark-all-read`, {});
  }

  deleteLogApi(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/logs/${id}`);
  }

  getMyInAppNotifications(limit = 20, offset = 0): Observable<{ notifications: InAppNotificationItem[]; total: number; unreadCount: number }> {
    const params = new HttpParams().set('limit', String(limit)).set('offset', String(offset));
    return this.http.get<{ data: { notifications: InAppNotificationItem[]; total: number; unreadCount: number } }>(`${this.apiUrl}`, { params }).pipe(
      map(res => res.data)
    );
  }

  getMyUnreadCount(): Observable<number> {
    return this.http.get<{ data: { count: number } }>(`${this.apiUrl}/unread-count`).pipe(
      map(res => res.data?.count || 0)
    );
  }

  markInAppAsRead(id: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/${id}/read`, {});
  }

  markAllInAppAsRead(): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/read-all`, {});
  }

  queue(
    event: NotificationEvent,
    recipient: string,
    customerName: string,
    orderId?: number | string
  ): NotificationRecord | null {
    const email = recipient.trim().toLowerCase();
    if (!this.isEmail(email)) {
      console.error('Cannot queue notification: recipient email is invalid.');
      return null;
    }

    try {
      const records = this.getRecords();
      const record: NotificationRecord = {
        id: this.createId(),
        event,
        channel: 'email',
        recipient: email,
        customerName: customerName.trim(),
        orderId,
        status: 'awaiting_configuration',
        createdAt: new Date().toISOString()
      };
      records.push(record);
      this.storage.setItem(this.storageKey, JSON.stringify(records));
      return record;
    } catch (error) {
      console.error('Could not save email notification to outbox.', error);
      return null;
    }
  }

  queueWhatsApp(
    event: NotificationEvent,
    mobile: string,
    customerName: string,
    whatsappOptIn: boolean,
    orderId?: number | string
  ): NotificationRecord | null {
    if (!whatsappOptIn) return null;

    const phone = this.normalizePhone(mobile);
    if (!phone) {
      console.error('Cannot queue WhatsApp notification: phone number must include a valid country code or be a 10-digit Indian mobile number.');
      return null;
    }

    try {
      const records = this.getRecords();
      const record: NotificationRecord = {
        id: this.createId(),
        event,
        channel: 'whatsapp',
        recipient: phone,
        customerName: customerName.trim(),
        orderId,
        status: 'awaiting_configuration',
        createdAt: new Date().toISOString()
      };
      records.push(record);
      this.storage.setItem(this.storageKey, JSON.stringify(records));
      return record;
    } catch (error) {
      console.error('Could not save WhatsApp notification to outbox.', error);
      return null;
    }
  }

  getRecords(): NotificationRecord[] {
    const saved = this.storage.getItem(this.storageKey);
    if (!saved) return [];

    try {
      const records: unknown = JSON.parse(saved);
      if (!Array.isArray(records)) {
        throw new Error('Notification outbox is not an array.');
      }
      return records.filter((record): record is NotificationRecord =>
        typeof record === 'object' &&
        record !== null &&
        'id' in record &&
        typeof record.id === 'string' &&
        'recipient' in record &&
        typeof record.recipient === 'string' &&
        'event' in record &&
        [
          'registration_confirmation',
          'order_confirmation',
          'payment_confirmation',
          'order_processing',
          'order_shipped',
          'order_delivered',
          'order_cancelled',
          'refund_processed'
        ].includes(String(record.event)) &&
        'channel' in record &&
        (record.channel === 'email' || record.channel === 'whatsapp') &&
        'customerName' in record &&
        typeof record.customerName === 'string' &&
        'status' in record &&
        record.status === 'awaiting_configuration' &&
        'createdAt' in record &&
        typeof record.createdAt === 'string'
      );
    } catch (error) {
      console.error('Could not read email notification outbox.', error);
      throw new Error('Saved email notification outbox could not be read.');
    }
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private normalizePhone(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const digits = trimmed.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) {
      return digits;
    }
    return null;
  }

  private createId(): string {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}
