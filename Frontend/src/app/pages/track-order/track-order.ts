import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface TrackedOrderItem {
  product?: {
    name?: string;
    price?: number;
  };
  quantity?: number;
}

interface TrackedOrder {
  id: number | string;
  orderNumber?: string;
  displayId?: string;
  userId?: string;
  orderStatus: string;
  orderDate?: string;
  total?: number;
  courierName?: string;
  trackingNumber?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: TrackedOrderItem[];
  returnInfo?: any;
}

@Component({
  selector: 'app-track-order',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './track-order.html',
  styleUrl: './track-order.css'
})
export class TrackOrder {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);

  orderId = '';
  order: TrackedOrder | null = null;
  orders: TrackedOrder[] = [];
  errorMessage = '';
  loading = false;

  readonly defaultSteps = [
    'Order Placed',
    'Processing',
    'Shipped',
    'Out for Delivery',
    'Delivered'
  ];

  readonly returnSteps = [
    'Order Placed',
    'Processing',
    'Shipped',
    'Out for Delivery',
    'Delivered',
    'Return Requested',
    'Return Approved',
    'Returned & Refunded'
  ];

  readonly returnRejectedSteps = [
    'Order Placed',
    'Processing',
    'Shipped',
    'Out for Delivery',
    'Delivered',
    'Return Requested',
    'Return Rejected'
  ];

  constructor() {
    const routeOrderId = this.route.snapshot.queryParamMap.get('orderId') || this.route.snapshot.queryParamMap.get('id');
    if (routeOrderId) {
      this.orderId = routeOrderId.trim();
      this.trackOrder();
    }
  }

  trackOrder(): void {
    this.order = null;
    this.orders = [];
    this.errorMessage = '';

    const cleanOrderId = this.orderId.trim();
    if (!cleanOrderId) {
      this.errorMessage = 'Please enter a valid Order ID to track.';
      return;
    }

    this.loading = true;
    this.http.get<any>(`${environment.apiUrl}/orders/track/order/${encodeURIComponent(cleanOrderId)}`).subscribe({
      next: (res) => {
        this.loading = false;
        const rawOrders = Array.isArray(res?.orders) ? res.orders : (Array.isArray(res?.data?.orders) ? res.data.orders : []);
        const rawOrder = res?.order || res?.data?.order || rawOrders[0];

        if (rawOrder && (rawOrder._id || rawOrder.id || rawOrder.orderNumber)) {
          this.orders = (rawOrders.length > 0 ? rawOrders : [rawOrder]).map((o: any) => this.mapOrder(o));
          this.order = this.orders[0];
          this.cdr.detectChanges();
        } else {
          this.errorMessage = 'No order found with the provided Order ID.';
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        // Fallback to /orders/track/:id
        this.http.get<any>(`${environment.apiUrl}/orders/track/${encodeURIComponent(cleanOrderId)}`).subscribe({
          next: (res) => {
            this.loading = false;
            const rawOrders = Array.isArray(res?.orders) ? res.orders : (Array.isArray(res?.data?.orders) ? res.data.orders : []);
            const rawOrder = res?.order || res?.data?.order || rawOrders[0];
            if (rawOrder && (rawOrder._id || rawOrder.id || rawOrder.orderNumber)) {
              this.orders = (rawOrders.length > 0 ? rawOrders : [rawOrder]).map((o: any) => this.mapOrder(o));
              this.order = this.orders[0];
              this.cdr.detectChanges();
            } else {
              this.errorMessage = 'No order found with the provided Order ID.';
              this.cdr.detectChanges();
            }
          },
          error: (fallbackErr) => {
            this.loading = false;
            const msg = err.error?.message || fallbackErr.error?.message;
            this.errorMessage = (msg && !msg.toLowerCase().includes('user id'))
              ? msg
              : 'No order found with the provided Order ID.';
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  selectOrder(selected: TrackedOrder): void {
    this.order = selected;
    this.cdr.detectChanges();
  }

  private mapOrder(o: any): TrackedOrder {
    const mongoId = o._id || o.id;
    const rawOrderNum = o.orderNumber
      ? String(o.orderNumber).trim()
      : (this.orderId && !/^[a-f\d]{24}$/i.test(this.orderId.trim()) ? this.orderId.trim() : undefined);
    const displayId = rawOrderNum || (mongoId ? `#${mongoId}` : '');
    const ret = o.return || o.activeReturn || null;
    return {
      id: mongoId || o.orderNumber,
      orderNumber: rawOrderNum || o.orderNumber,
      displayId,
      userId: o.user?._id || o.user,
      orderStatus: this.normalizeStatus(o.orderStatus || o.status, ret),
      orderDate: o.createdAt || new Date().toISOString(),
      total: o.total,
      courierName: o.courierName || o.shipment?.provider || '',
      trackingNumber: o.trackingId || o.shipment?.awb || o.shipment?.shipmentId || '',
      paymentMethod: o.paymentMethod || 'Online',
      paymentStatus: o.paymentStatus || 'Pending',
      items: (o.items || []).map((item: any) => ({
        product: {
          name: item.name || item.product?.name || 'Product',
          price: item.price !== undefined ? item.price : item.product?.price
        },
        quantity: item.quantity
      })),
      returnInfo: ret
    };
  }

  private normalizeStatus(status?: string, returnData?: any): string {
    if (returnData) {
      const retStatus = String(returnData.status || '').toLowerCase().trim();
      if (retStatus === 'requested') return 'Return Requested';
      if (retStatus === 'accepted' || retStatus === 'approved') return 'Return Approved';
      if (retStatus === 'processing' || retStatus === 'refund processing') return 'Refund Processing';
      if (retStatus === 'processed' || retStatus === 'refunded') return 'Returned & Refunded';
      if (retStatus === 'rejected') return 'Return Rejected';
    }

    if (!status) return 'Order Placed';
    const clean = String(status).trim().toLowerCase();
    const map: Record<string, string> = {
      placed: 'Order Placed',
      'order placed': 'Order Placed',
      processing: 'Processing',
      packed: 'Processing',
      pickup_requested: 'Processing',
      awaiting_payment: 'Order Placed',
      shipped: 'Shipped',
      out_for_delivery: 'Out for Delivery',
      'out for delivery': 'Out for Delivery',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      return_requested: 'Return Requested',
      'return requested': 'Return Requested',
      return_approved: 'Return Approved',
      'return approved': 'Return Approved',
      returned: 'Returned & Refunded',
      'returned & refunded': 'Returned & Refunded',
      refunded: 'Returned & Refunded',
      'refund processed': 'Returned & Refunded',
      'refund processing': 'Refund Processing',
      'return rejected': 'Return Rejected'
    };
    return map[clean] || (status.charAt(0).toUpperCase() + status.slice(1));
  }

  get currentSteps(): string[] {
    const status = (this.order?.orderStatus || '').toLowerCase();
    const retStatus = String(this.order?.returnInfo?.status || '').toLowerCase();
    if (status.includes('rejected') || retStatus === 'rejected') {
      return this.returnRejectedSteps;
    }
    const hasReturn = Boolean(
      this.order?.returnInfo ||
      status.includes('return') ||
      status.includes('refund')
    );
    return hasReturn ? this.returnSteps : this.defaultSteps;
  }

  get currentStepIndex(): number {
    if (!this.order) {
      return -1;
    }

    const currentStatus = this.order.orderStatus.toLowerCase();
    const retStatus = String(this.order?.returnInfo?.status || '').toLowerCase();
    const steps = this.currentSteps;

    if (currentStatus.includes('rejected') || retStatus === 'rejected') {
      const rejIdx = steps.findIndex(s => s === 'Return Rejected');
      if (rejIdx !== -1) return rejIdx;
    }

    const directIndex = steps.findIndex(
      step => step.toLowerCase() === currentStatus
    );
    if (directIndex !== -1) return directIndex;

    // Special status fallbacks
    if (currentStatus.includes('refund processing')) {
      return steps.findIndex(s => s === 'Return Approved');
    }

    return -1;
  }

  get isCancelled(): boolean {
    return this.order?.orderStatus.toLowerCase() === 'cancelled';
  }

  get isReturnRejected(): boolean {
    const status = (this.order?.orderStatus || '').toLowerCase();
    const retStatus = String(this.order?.returnInfo?.status || '').toLowerCase();
    return status.includes('rejected') || retStatus === 'rejected';
  }
}
