import { DatePipe, UpperCasePipe, SlicePipe } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
  BackendNotificationLog,
  NotificationEvent,
  NotificationRecord,
  NotificationService
} from '../../core/services/notification.service';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [DatePipe, UpperCasePipe, SlicePipe, FormsModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.css'
})
export class AdminNotifications {
  logs: BackendNotificationLog[] = [];
  records: NotificationRecord[] = [];
  loading = false;
  markingAll = false;
  errorMessage = '';
  successMessage = '';


  private readonly eventLabels: Record<NotificationEvent, string> = {
    registration_confirmation: 'Registration confirmation',
    order_confirmation: 'Order confirmation',
    payment_confirmation: 'Payment confirmation',
    order_processing: 'Order processing',
    order_shipped: 'Order shipped',
    order_delivered: 'Order delivered',
    order_cancelled: 'Order cancelled',
    refund_processed: 'Refund processed'
  };

  constructor(
    private notifications: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {
    this.loadNotifications();
  }

  get unreadCount(): number {
    return this.logs.filter(l => !l.read).length;
  }

  getEventLabel(event: NotificationEvent): string {
    return this.eventLabels[event] || event;
  }

  getChannelLabel(channel: string): string {
    const map: Record<string, string> = {
      email: 'Email',
      whatsapp: 'WhatsApp',
      sms: 'SMS',
      system: 'System'
    };
    return map[channel] || (channel.charAt(0).toUpperCase() + channel.slice(1));
  }

  getChannelIcon(channel: string): string {
    switch (channel) {
      case 'whatsapp': return '💬';
      case 'sms': return '📱';
      case 'email': return '✉️';
      default: return '🔔';
    }
  }

  getDestinationLabel(log: BackendNotificationLog): string {
    if (log.returnRequest || /return|refund/i.test(log.subject || '') || /return|refund/i.test(log.message || '')) {
      return 'View Return Request ➔';
    }
    if (log.order) {
      return `View Order #${log.order.orderNumber || log.order._id.slice(-6).toUpperCase()} ➔`;
    }
    if (log.user) {
      return `View Customer (${log.user.name || log.user.email}) ➔`;
    }
    if (/order|purchase|invoice/i.test(log.subject || '') || /order|purchase|invoice/i.test(log.message || '')) {
      return 'View Orders ➔';
    }
    if (/customer|user|account|registered/i.test(log.subject || '') || /customer|user|account|registered/i.test(log.message || '')) {
      return 'View Customers ➔';
    }
    return 'Open Details ➔';
  }

  loadNotifications(): void {
    this.loading = true;
    this.errorMessage = '';

    this.notifications.getLogsApi({ limit: 100 }).subscribe({
      next: (res) => {
        this.loading = false;
        const rawLogs = res.logs || [];
        const seen = new Set<string>();
        const uniqueLogs: BackendNotificationLog[] = [];
        for (const log of rawLogs) {
          const orderKey = log.order ? String(log.order._id || log.order.orderNumber) : null;
          const returnKey = log.returnRequest ? String(log.returnRequest._id) : null;
          const subjKey = (log.subject || log.message || '').trim();
          const eventKey = orderKey ? `order_${orderKey}_${subjKey}` : (returnKey ? `return_${returnKey}_${subjKey}` : String(log._id));
          if (!seen.has(eventKey)) {
            seen.add(eventKey);
            uniqueLogs.push(log);
          }
        }
        this.logs = uniqueLogs;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to load notification logs from API:', err);
        this.errorMessage = 'Could not load notifications from server. Please refresh or try again.';
        this.cdr.detectChanges();
      }
    });
  }

  onNotificationClick(log: BackendNotificationLog): void {
    if (!log.read) {
      log.read = true;
      log.readAt = new Date().toISOString();
      this.notifications.markAsReadApi(log._id).subscribe({
        next: () => {},
        error: (err) => console.error('Failed to mark notification as read:', err)
      });
    }

    // Navigate to the relevant section or record
    if (log.returnRequest || /return|refund/i.test(log.subject || '') || /return|refund/i.test(log.message || '')) {
      this.router.navigate(['/admin/returns']);
    } else if (log.order) {
      const searchTarget = log.order.orderNumber || log.order._id;
      this.router.navigate(['/admin/orders'], { queryParams: { search: searchTarget } });
    } else if (log.user) {
      const userTarget = log.user.email || log.user.name;
      this.router.navigate(['/admin/customers'], { queryParams: { search: userTarget } });
    } else if (/order|purchase|invoice/i.test(log.subject || '') || /order|purchase|invoice/i.test(log.message || '')) {
      this.router.navigate(['/admin/orders']);
    } else if (/customer|user|account|registered/i.test(log.subject || '') || /customer|user|account|registered/i.test(log.message || '')) {
      this.router.navigate(['/admin/customers']);
    } else {
      this.router.navigate(['/admin/dashboard']);
    }
  }

  markAllAsRead(): void {
    if (this.markingAll || this.unreadCount === 0) return;
    this.markingAll = true;

    this.notifications.markAllAsReadApi().subscribe({
      next: () => {
        this.markingAll = false;
        this.logs.forEach(l => {
          l.read = true;
          l.readAt = new Date().toISOString();
        });
        this.successMessage = 'All notifications marked as read.';
        setTimeout(() => {
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 3000);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.markingAll = false;
        console.error('Failed to mark all notifications as read:', err);
        this.errorMessage = 'Failed to mark all as read.';
        this.cdr.detectChanges();
      }
    });
  }

  deleteNotification(id: string, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.notifications.deleteLogApi(id).subscribe({
      next: () => {
        this.logs = this.logs.filter(l => l._id !== id);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to delete notification:', err);
        this.errorMessage = 'Failed to delete notification.';
        this.cdr.detectChanges();
      }
    });
  }
}
