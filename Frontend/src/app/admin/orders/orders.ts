import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';

import { BrowserStorageService } from '../../core/services/browser-storage.service';
import { NotificationService, NotificationEvent } from '../../core/services/notification.service';
import { environment } from '../../../environments/environment';
import { resolveImageUrl } from '../../core/utils/image-url.util';

export interface AdminOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  product?: {
    _id?: string;
    id?: string;
    name?: string;
    price?: number;
    image?: string;
  } | string;
  image?: string;
}

export interface AdminOrder {
  id: string | number;
  rawId?: string;
  orderNumber?: string;
  customerName: string;
  mobile?: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  country?: string;
  fullAddress: string;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  orderDate: string;
  deliveredAt?: string;
  confirmedAt?: string;
  confirmedBy?: {
    adminId?: string;
    name?: string;
    email?: string;
  };
  courierName?: string;
  trackingId?: string;
  whatsappOptIn?: boolean;
  items?: AdminOrderItem[];
}

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css'
})
export class AdminOrders implements OnInit, OnDestroy {
  orderList: AdminOrder[] = [];
  orderSearch = '';
  statusFilter = 'ALL';
  expandedOrderIds = new Set<string>();
  loading = false;
  isRefreshing = false;
  message = '';
  isError = false;
  storeAddress: any = null;
  private pollInterval?: any;

  orderStatuses: string[] = [
    'Order Placed',
    'Confirmed',
    'Processing',
    'Shipped',
    'Delivered',
    'Cancelled'
  ];

  shippingFormOrderId: string | null = null;
  shippingCourierName: Record<string, string> = {};
  shippingTrackingId: Record<string, string> = {};
  isSavingShipment: Record<string, boolean> = {};
  isConfirming: Record<string | number, boolean> = {};
  isCancelling: Record<string | number, boolean> = {};

  constructor(
    private storage: BrowserStorageService,
    private notifications: NotificationService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private route: ActivatedRoute,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: object
  ) { }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      const statusParam = params['status'];
      if (statusParam) {
        this.statusFilter = statusParam;
      }
      const searchParam = params['search'];
      if (searchParam) {
        this.orderSearch = searchParam;
      }
      this.cdr.detectChanges();
    });

    if (isPlatformBrowser(this.platformId)) {
      this.storage.removeItem('astrology_orders');
      this.fetchStatuses();
      this.fetchStoreAddress();
      this.fetchOrders();


    }
  }

  ngOnDestroy(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  fetchOrdersSilently(): void {
    this.http.get<any>(`${environment.apiUrl}/orders`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res?.data) ? res.data : []);
        if (Array.isArray(orderArray)) {
          this.orderList = orderArray.map((o: any) => this.mapToAdminOrder(o));
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  manualRefresh(): void {
    this.isRefreshing = true;
    this.fetchOrders();
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }, 800);
  }

  fetchStoreAddress(): void {
    this.http.get<any>(`${environment.apiUrl}/orders/store-address`).subscribe({
      next: (res) => {
        const data = res?.data || res;
        const addr = data?.address || data;
        if (addr) {
          this.storeAddress = {
            ...addr,
            storeName: data.storeName || addr.storeName || 'Jyotish Astro Store',
            fullName: data.contactName || addr.fullName || addr.contactName || 'Master Astrologer',
            contactName: data.contactName || addr.contactName || 'Master Astrologer',
            mobile: data.phone || addr.mobile || addr.phone || '+919876543210',
            phone: data.phone || addr.phone || '+919876543210',
            address: addr.addressLine || addr.address || '',
            addressLine: addr.addressLine || addr.address || '',
            city: addr.city || 'Varanasi',
            state: addr.state || 'Uttar Pradesh',
            postalCode: addr.pinCode || addr.postalCode || '221001',
            pinCode: addr.pinCode || addr.postalCode || '221001',
            country: addr.country || 'India',
            formattedAddress: data.formattedAddress || addr.formattedAddress
          };
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.warn('Could not fetch store address from MongoDB:', err);
      }
    });
  }

  fetchStatuses(): void {
    this.http.get<any>(`${environment.apiUrl}/orders/statuses`).subscribe({
      next: (res) => {
        const statuses = res?.data || res?.statuses || (Array.isArray(res) ? res : []);
        if (Array.isArray(statuses) && statuses.length > 0) {
          this.orderStatuses = statuses.map((item: any) =>
            typeof item === 'string'
              ? item
              : item.label || item.value
          );
          this.cdr.detectChanges();
        }
      },
      error: () => { }
    });
  }

  setStatusFilter(filter: string): void {
    this.statusFilter = filter;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: filter === 'ALL' ? {} : { status: filter },
      queryParamsHandling: 'replace'
    });
    this.cdr.detectChanges();
  }


  fetchOrders(): void {
    this.loading = true;
    this.storage.removeItem('astrology_orders');
    this.http.get<any>(`${environment.apiUrl}/orders`).subscribe({
      next: (res) => {
        this.loading = false;
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res?.data) ? res.data : []);
        if (Array.isArray(orderArray)) {
          this.orderList = orderArray.map((o: any) => this.mapToAdminOrder(o));
        } else {
          this.orderList = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to load orders from MongoDB:', err);
        this.orderList = [];
        this.showMessage('Failed to load orders from server.', true);
        this.cdr.detectChanges();
      }
    });
  }

  private mapToAdminOrder(o: any): AdminOrder {
    const rawId = String(o._id || o.id || '');
    const displayId = o.orderNumber
      ? String(o.orderNumber).replace(/^#+/, '')
      : (rawId && /^[a-f\d]{24}$/i.test(rawId) ? `ORD-${rawId.slice(-4).toUpperCase()}` : rawId);

    const sa = o.shippingAddress;
    let fullAddress = 'No address provided';
    if (sa) {
      if (typeof sa === 'string') {
        fullAddress = sa;
      } else {
        const parts = [
          sa.address,
          sa.city,
          sa.state ? (sa.state + (sa.postalCode ? ' - ' + sa.postalCode : '')) : sa.postalCode,
          sa.country
        ].filter(Boolean);
        fullAddress = parts.join(', ') || 'No address provided';
      }
    } else {
      const parts = [o.address, o.city, o.state ? (o.state + (o.pin ? ' - ' + o.pin : '')) : o.pin, o.country].filter(Boolean);
      fullAddress = parts.join(', ') || 'No address provided';
    }

    const mappedItems: AdminOrderItem[] = (o.items || []).map((item: any) => {
      const prodObj = typeof item.product === 'object' && item.product !== null ? item.product : null;
      const productId = prodObj?._id || prodObj?.id || (typeof item.product === 'string' ? item.product : (item.productId || item._id || 'N/A'));
      const name = item.name || prodObj?.name || 'Product';
      const price = Number(item.price ?? prodObj?.price ?? 0);
      const quantity = Number(item.quantity) || 1;
      const image = resolveImageUrl(item.image || prodObj?.imageUrl || prodObj?.images?.[0] || prodObj?.image || '/api/products/placeholder');
      return {
        productId,
        name,
        price,
        quantity,
        total: price * quantity,
        image,
        product: prodObj || productId
      };
    });

    return {
      id: displayId,
      rawId: rawId,
      orderNumber: o.orderNumber || displayId,
      customerName: o.shippingAddress?.fullName || o.user?.name || o.customerName || 'Customer',
      mobile: o.shippingAddress?.mobile || o.user?.mobile || o.mobile || 'N/A',
      email: o.shippingAddress?.email || o.user?.email || o.email || 'N/A',
      address: o.shippingAddress?.address || o.address,
      city: o.shippingAddress?.city || o.city,
      state: o.shippingAddress?.state || o.state,
      pin: o.shippingAddress?.postalCode || o.pin,
      country: o.shippingAddress?.country || o.country || 'India',
      fullAddress,
      total: o.total,
      orderStatus: this.normalizeStatus(o.status || o.orderStatus),
      paymentStatus: o.paymentStatus ? (String(o.paymentStatus).charAt(0).toUpperCase() + String(o.paymentStatus).slice(1)) : 'Pending',
      paymentMethod: o.paymentMethod || 'Online',
      orderDate: o.createdAt || o.orderDate || new Date().toISOString(),
      deliveredAt: o.deliveredAt,
      confirmedAt: o.confirmedAt,
      confirmedBy: o.confirmedBy,
      courierName: o.courierName || o.shipment?.provider || '',
      trackingId: o.trackingId || o.shipment?.awb || o.shipment?.shipmentId || '',
      whatsappOptIn: o.whatsappOptIn,
      items: mappedItems
    };
  }

  normalizeStatus(status?: string): string {
    if (!status) return 'Order Placed';
    const clean = String(status).trim().toLowerCase();
    const map: Record<string, string> = {
      placed: 'Order Placed',
      'order placed': 'Order Placed',
      awaiting_payment: 'Order Placed',
      confirmed: 'Confirmed',
      processing: 'Processing',
      packed: 'Processing',
      pickup_requested: 'Processing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled'
    };
    return map[clean] || 'Order Placed';
  }

  get filteredOrders(): AdminOrder[] {
    const query = this.orderSearch.trim().toLowerCase();
    return this.orderList.filter(order => {
      // Status filter
      if (this.statusFilter !== 'ALL') {
        const fLower = this.statusFilter.toLowerCase();
        const sLower = (order.orderStatus || '').toLowerCase();
        if (fLower === 'awaiting confirmation' || fLower === 'awaiting_confirmation') {
          if (sLower !== 'order placed' && sLower !== 'placed') return false;
        } else if (fLower === 'confirmed & processing' || fLower === 'confirmed_processing') {
          if (sLower !== 'confirmed' && sLower !== 'processing') return false;
        } else if (fLower === 'confirmed') {
          if (sLower !== 'confirmed') return false;
        } else if (fLower === 'pending') {
          const isPending =
            sLower === 'order placed' ||
            sLower === 'confirmed' ||
            sLower === 'processing' ||
            sLower === 'placed' ||
            sLower === 'pending';
          if (!isPending) return false;
        } else if (fLower === 'completed' || fLower === 'delivered') {
          if (sLower !== 'delivered' && sLower !== 'completed') return false;
        } else if (fLower === 'shipped') {
          if (sLower !== 'shipped') return false;
        } else if (fLower === 'cancelled') {
          if (sLower !== 'cancelled') return false;
        } else if (sLower !== fLower) {
          return false;
        }
      }
      // Search query filter
      if (!query) {
        return true;
      }
      return [
        order.id,
        order.orderNumber,
        order.customerName,
        order.email,
        order.mobile,
        order.city,
        order.state,
        order.orderStatus,
        order.paymentStatus,
        order.paymentMethod
      ].some(val => val && String(val).toLowerCase().includes(query));
    });
  }

  // Statistics
  get countTotal(): number { return this.orderList.length; }
  get countAwaitingConfirmation(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'order placed' || s === 'placed';
    }).length;
  }
  get countConfirmedProcessing(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'confirmed' || s === 'processing';
    }).length;
  }
  get countPending(): number {
    return this.countAwaitingConfirmation + this.countConfirmedProcessing;
  }
  get countShipped(): number {
    return this.orderList.filter(o => (o.orderStatus || '').toLowerCase() === 'shipped').length;
  }
  get countInTransit(): number {
    return this.countShipped;
  }
  get countDelivered(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'delivered' || s === 'completed';
    }).length;
  }
  get countCancelled(): number {
    return this.orderList.filter(o => (o.orderStatus || '').toLowerCase() === 'cancelled').length;
  }
  get totalRevenue(): number {
    return this.orderList
      .filter(o => {
        const s = (o.orderStatus || '').toLowerCase();
        if (s === 'cancelled') return false;
        const pStatus = (o.paymentStatus || '').toLowerCase();
        const pMethod = (o.paymentMethod || '').toLowerCase();
        return pStatus === 'paid' || (pMethod === 'cod' && s === 'delivered');
      })
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }

  confirmOrder(order: AdminOrder): void {
    const orderId = String(order.orderNumber || order.id);
    const confirmed = confirm(`Are you sure you want to CONFIRM Order #${orderId} from ${order.customerName}?`);
    if (!confirmed) return;

    this.isConfirming[order.id] = true;
    const targetId = order.rawId || order.id;

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, { status: 'confirmed' }).subscribe({
      next: (res) => {
        this.isConfirming[order.id] = false;
        order.orderStatus = 'Confirmed';
        const updated = res?.order || res?.data?.order || res?.data;
        if (updated?.confirmedAt) order.confirmedAt = updated.confirmedAt;
        if (updated?.confirmedBy) order.confirmedBy = updated.confirmedBy;
        this.showMessage(`Order #${orderId} confirmed successfully!`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isConfirming[order.id] = false;
        console.error('Failed to confirm order:', err);
        this.showMessage('Failed to confirm order on server.', true);
        this.cdr.detectChanges();
      }
    });
  }

  cancelOrder(order: AdminOrder): void {
    const orderId = String(order.orderNumber || order.id);
    const reason = prompt(`Please enter the REASON for rejecting/cancelling Order #${orderId}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      alert("A rejection reason is required to cancel an order.");
      return;
    }

    this.isCancelling[order.id] = true;
    const targetId = order.rawId || order.id;

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, {
      status: 'cancelled',
      rejectionReason: reason.trim()
    }).subscribe({
      next: () => {
        this.isCancelling[order.id] = false;
        order.orderStatus = 'Cancelled';
        (order as any).rejectionReason = reason.trim();
        this.showMessage(`Order #${orderId} rejected/cancelled and customer notified.`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isCancelling[order.id] = false;
        console.error('Failed to cancel order:', err);
        this.showMessage('Failed to cancel order on server.', true);
        this.cdr.detectChanges();
      }
    });
  }

  toggleExpand(orderId: string | number): void {
    const idStr = String(orderId);
    if (this.expandedOrderIds.has(idStr)) {
      this.expandedOrderIds.delete(idStr);
    } else {
      this.expandedOrderIds.add(idStr);
    }
  }

  isExpanded(orderId: string | number): boolean {
    return this.expandedOrderIds.has(String(orderId));
  }

  onStatusChange(order: AdminOrder, newStatus: string): void {
    if (newStatus === 'Shipped') {
      this.shippingFormOrderId = String(order.id);
      if (!this.shippingCourierName[order.id]) {
        this.shippingCourierName[order.id] = order.courierName || '';
      }
      if (!this.shippingTrackingId[order.id]) {
        this.shippingTrackingId[order.id] = order.trackingId || '';
      }
      this.cdr.detectChanges();
    } else {
      this.shippingFormOrderId = null;
      this.updateOrderStatus(order.rawId || order.id, newStatus);
    }
  }

  saveShipmentDetails(order: AdminOrder): void {
    const courier = (this.shippingCourierName[order.id] || '').trim();
    const tracking = (this.shippingTrackingId[order.id] || '').trim();

    if (!courier || !tracking) {
      this.showMessage('Please enter both Courier/Company Name and Courier/Tracking Order ID.', true);
      return;
    }

    this.isSavingShipment[order.id] = true;
    const targetId = encodeURIComponent(order.rawId || order.id);

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, {
      status: 'shipped',
      courierName: courier,
      trackingId: tracking
    }).subscribe({
      next: (patchRes) => {
        this.isSavingShipment[order.id] = false;
        this.shippingFormOrderId = null;
        order.orderStatus = 'Shipped';
        order.courierName = courier;
        order.trackingId = tracking;
        this.showMessage(`Order #${order.orderNumber || order.id} marked as Shipped via ${courier} (${tracking}).`);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSavingShipment[order.id] = false;
        console.error('Failed to update shipment in database:', err);
        this.showMessage('Failed to save shipment details to database.', true);
        this.cdr.detectChanges();
      }
    });
  }

  cancelShippingForm(order: AdminOrder): void {
    this.shippingFormOrderId = null;
    this.cdr.detectChanges();
  }

  updateOrderStatus(orderId: string | number, newStatus: string): void {
    const order = this.orderList.find(o => String(o.id) === String(orderId) || String(o.rawId) === String(orderId));
    if (order) {
      order.orderStatus = newStatus;
      if (newStatus === 'Delivered' && !order.deliveredAt) {
        order.deliveredAt = new Date().toISOString();
      }
    }

    const backendStatusMap: Record<string, string> = {
      'Order Placed': 'placed',
      'Confirmed': 'confirmed',
      'Processing': 'processing',
      'Shipped': 'shipped',
      'Delivered': 'delivered',
      'Cancelled': 'cancelled'
    };
    const apiStatus = backendStatusMap[newStatus] || newStatus.toLowerCase().replace(/\s+/g, '_');
    const targetId = encodeURIComponent(order?.rawId || orderId);

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, { status: apiStatus }).subscribe({
      next: (patchRes) => {
        this.showMessage(`Order #${order?.id || orderId} status updated to ${newStatus}`);
        // Reload order from database after updating
        this.http.get<any>(`${environment.apiUrl}/orders/${targetId}`).subscribe({
          next: (getRes) => {
            const reloaded = getRes?.order || getRes?.data?.order || getRes?.data || patchRes?.data || patchRes?.order;
            if (reloaded && order) {
              order.orderStatus = this.normalizeStatus(reloaded.status);
              if (reloaded.deliveredAt) {
                order.deliveredAt = reloaded.deliveredAt;
              }
              this.cdr.detectChanges();
            }
          }
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error(`Failed to update status in MongoDB for Order #${order?.id || orderId}:`, err);
        this.showMessage(`Failed to save status to database for Order #${order?.id || orderId}`, true);
        this.cdr.detectChanges();
      }
    });

    // Notifications
    const eventByStatus: Partial<Record<string, NotificationEvent>> = {
      Processing: 'order_processing',
      Shipped: 'order_shipped',
      Delivered: 'order_delivered',
      Cancelled: 'order_cancelled'
    };
    const event = eventByStatus[newStatus];
    if (event && order) {
      this.notifications.queue(event, order.email, order.customerName, order.id);
      this.notifications.queueWhatsApp(
        event,
        order.mobile ?? '',
        order.customerName,
        order.whatsappOptIn === true,
        order.id
      );
    }
  }

  deliveredDateInput(value?: string): string {
    if (!value) return '';
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 10)
      : '';
  }

  updateDeliveredDate(orderId: string | number, date: string): void {
    const order = this.orderList.find(o => String(o.id) === String(orderId) || String(o.rawId) === String(orderId));
    if (order) {
      if (!date) {
        delete order.deliveredAt;
      } else {
        const timestamp = Date.parse(`${date}T12:00:00`);
        if (Number.isFinite(timestamp)) {
          order.deliveredAt = new Date(timestamp).toISOString();
        }
      }
    }
  }

  printOrderSlip(order: AdminOrder): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (!this.storeAddress) {
      this.http.get<any>(`${environment.apiUrl}/orders/store-address`).subscribe({
        next: (res) => {
          const data = res?.data || res;
          if (data?.address) {
            this.storeAddress = {
              ...data.address,
              storeName: data.storeName || 'Jyotish Astro Store',
              formattedAddress: data.formattedAddress
            };
          }
          this.executePrintSlip(order);
        },
        error: () => {
          this.executePrintSlip(order);
        }
      });
    } else {
      this.executePrintSlip(order);
    }
  }

  private executePrintSlip(order: AdminOrder): void {
    const store = this.storeAddress || {
      storeName: 'Jyotish Astro Store',
      contactName: 'Master Astrologer',
      fullName: 'Master Astrologer',
      phone: '+919876543210',
      mobile: '+919876543210',
      addressLine: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
      address: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      pinCode: '221001',
      postalCode: '221001',
      country: 'India',
      formattedAddress: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi, Uttar Pradesh - 221001, India'
    };

    const storeFullAddress = store.formattedAddress || [
      store.addressLine || store.address,
      store.city,
      store.state ? (store.state + ((store.pinCode || store.postalCode) ? ' - ' + (store.pinCode || store.postalCode) : '')) : (store.pinCode || store.postalCode),
      store.country || 'India'
    ].filter(Boolean).join(', ');

    const itemsRows = (order.items || []).map((item, idx) => `
      <tr>
        <td style="text-align:center; padding: 10px; border: 1px solid #cbd5e1;">${idx + 1}</td>
        <td style="padding: 10px; border: 1px solid #cbd5e1;">
          <strong style="color: #0f172a;">${this.escapeHtml(item.name)}</strong>
        </td>
        <td style="text-align:center; padding: 10px; border: 1px solid #cbd5e1; font-weight: bold;">
          ${item.quantity}
        </td>
        <td style="text-align:right; padding: 10px; border: 1px solid #cbd5e1;">
          ₹${item.price}
        </td>
        <td style="text-align:right; padding: 10px; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">
          ₹${item.total}
        </td>
      </tr>
    `).join('');

    const slipHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Order Slip - #${order.id || order.orderNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 10mm; }
          * { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: #1e293b;
            background: #f1f5f9;
            margin: 0;
            padding: 24px;
            font-size: 13px;
          }
          .slip-container {
            max-width: 820px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 4px 16px rgba(0,0,0,0.06);
          }
          .no-print-toolbar {
            display: flex;
            justify-content: flex-end;
            gap: 12px;
            margin-bottom: 20px;
            max-width: 820px;
            margin-left: auto;
            margin-right: auto;
          }
          .btn-action {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 9px 18px;
            font-size: 13px;
            font-weight: 600;
            border-radius: 6px;
            cursor: pointer;
            border: 1px solid transparent;
          }
          .btn-print {
            background: #0f172a;
            color: #ffffff;
          }
          .btn-close {
            background: #e2e8f0;
            color: #334155;
          }
          .slip-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #b89327;
            padding-bottom: 18px;
            margin-bottom: 22px;
          }
          .store-brand h1 {
            margin: 0 0 4px;
            font-size: 22px;
            color: #0f172a;
            letter-spacing: 0.02em;
          }
          .store-tagline {
            margin: 0 0 6px;
            color: #b89327;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.1em;
          }
          .store-meta {
            margin: 2px 0;
            font-size: 12px;
            color: #475569;
          }
          .slip-title-area {
            text-align: right;
          }
          .slip-title-area h2 {
            margin: 0 0 4px;
            font-size: 20px;
            color: #b89327;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .order-number-badge {
            display: inline-block;
            background: #f1f5f9;
            color: #0f172a;
            font-weight: 700;
            font-size: 14px;
            padding: 4px 10px;
            border-radius: 4px;
            border: 1px solid #cbd5e1;
            margin-bottom: 4px;
          }
          .slip-date {
            margin: 0;
            font-size: 11px;
            color: #64748b;
          }
          .status-bar {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 12px;
            background: #0f172a;
            color: #ffffff;
            padding: 12px 18px;
            border-radius: 6px;
            margin-bottom: 22px;
            font-size: 12px;
          }
          .status-bar-item {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }
          .status-bar-label {
            color: #94a3b8;
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .status-bar-val {
            font-weight: 700;
            color: #f8fafc;
          }
          .addresses-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
          }
          .address-card {
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            padding: 14px 16px;
            background: #f8fafc;
          }
          .address-card h3 {
            margin: 0 0 10px;
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            color: #0f172a;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 6px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .address-card p {
            margin: 4px 0;
            font-size: 12px;
            line-height: 1.5;
            color: #334155;
          }
          .address-card strong {
            color: #0f172a;
          }
          .products-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          .products-table th {
            background: #f1f5f9;
            color: #334155;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 11px;
            letter-spacing: 0.05em;
            padding: 10px 12px;
            border: 1px solid #cbd5e1;
            text-align: left;
          }
          .products-table tfoot td {
            padding: 12px 14px;
            border: 1px solid #cbd5e1;
            font-size: 13px;
          }
          .grand-total-label {
            text-align: right;
            font-weight: 700;
            color: #0f172a;
            background: #f8fafc;
          }
          .grand-total-val {
            text-align: right;
            font-weight: 800;
            font-size: 16px;
            color: #b89327;
            background: #f8fafc;
          }
          .slip-footer {
            margin-top: 24px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 14px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 11px;
            color: #64748b;
          }
          @media print {
            body {
              background: #ffffff;
              padding: 0;
            }
            .slip-container {
              border: none;
              box-shadow: none;
              padding: 0;
            }
            .no-print-toolbar {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="no-print-toolbar">
          <button type="button" class="btn-action btn-print" onclick="window.print()">🖨️ Print / Save as PDF</button>
          <button type="button" class="btn-action btn-close" onclick="window.close()">✕ Close</button>
        </div>

        <div class="slip-container">
          <!-- Order Status Bar -->
          <div class="status-bar">
            <div class="status-bar-item">
              <span class="status-bar-label">Order ID</span>
              <span class="status-bar-val">#${this.escapeHtml(String(order.id || order.orderNumber))}</span>
            </div>
            <div class="status-bar-item">
              <span class="status-bar-label">Order Date</span>
              <span class="status-bar-val">${new Date(order.orderDate).toLocaleString()}</span>
            </div>
            <div class="status-bar-item">
              <span class="status-bar-label">Order Status</span>
              <span class="status-bar-val">${this.escapeHtml(order.orderStatus)}</span>
            </div>
            <div class="status-bar-item">
              <span class="status-bar-label">Payment Method</span>
              <span class="status-bar-val">${this.escapeHtml(order.paymentMethod || 'Online')}</span>
            </div>
            <div class="status-bar-item">
              <span class="status-bar-label">Payment Status</span>
              <span class="status-bar-val">${this.escapeHtml(order.paymentStatus || 'Pending')}</span>
            </div>
          </div>

          <!-- Customer & Store Addresses Side-by-Side -->
          <div class="addresses-grid">
            <!-- Customer Details (Dispatch To) -->
            <div class="address-card">
              <h3>👤 Customer Details (Ship To)</h3>
              <p><strong>Customer Name:</strong> ${this.escapeHtml(order.customerName)}</p>
              <p><strong>Email:</strong> ${this.escapeHtml(order.email || 'N/A')}</p>
              <p><strong>Phone:</strong> ${this.escapeHtml(order.mobile || 'N/A')}</p>
              <p><strong>Full Address:</strong> ${this.escapeHtml(order.fullAddress)}</p>
            </div>

            <!-- Store Details (Dispatch From) -->
            <div class="address-card">
              <h3>🏛️ Store Address (Ship From)</h3>
              <p><strong>Store Name:</strong> ${this.escapeHtml(store.storeName || 'Jyotish Astro Store')}</p>
              <p><strong>Manager / Contact:</strong> ${this.escapeHtml(store.contactName || store.fullName || 'Master Astrologer')}</p>
              ${(store.phone || store.mobile) ? `<p><strong>Phone:</strong> ${this.escapeHtml(store.phone || store.mobile)}</p>` : ''}
              <p><strong>Address:</strong> ${this.escapeHtml(storeFullAddress)}</p>
            </div>
          </div>

          <!-- Purchased Products Table -->
          <table class="products-table">
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Product Name</th>
                <th style="width: 70px; text-align: center;">Qty</th>
                <th style="width: 100px; text-align: right;">Price</th>
                <th style="width: 110px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" class="grand-total-label">Grand Total:</td>
                <td class="grand-total-val">₹${order.total}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Footer -->
          <div class="slip-footer">
            <span>Verified Order &bull; Jyotish Astro Store Fulfillment System</span>
            <span>Generated: ${new Date().toLocaleString()}</span>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=900,height=800,menubar=no,toolbar=no,location=no,status=no');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(slipHtml);
      printWin.document.close();
    }
  }

  private escapeHtml(str: string): string {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private showMessage(msg: string, isError = false): void {
    this.message = msg;
    this.isError = isError;
    setTimeout(() => {
      if (this.message === msg) {
        this.message = '';
      }
    }, 4000);
  }
}
