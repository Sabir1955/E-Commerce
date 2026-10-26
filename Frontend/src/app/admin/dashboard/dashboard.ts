import { Component, ChangeDetectorRef, Inject, PLATFORM_ID, OnInit, OnDestroy } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';

import { BrowserStorageService } from '../../core/services/browser-storage.service';
import { ProductService } from '../../core/services/product.service';
import { CategoryService } from '../../core/services/category.service';
import { NotificationService, NotificationEvent } from '../../core/services/notification.service';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface StatusOption {
  value: string;
  label: string;
}

interface DashboardOrder {
  id: number | string;
  rawId?: string;
  orderNumber?: string;
  customerName: string;
  mobile?: string;
  email: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  total: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod?: string;
  orderDate: string;
  deliveredAt?: string;
  whatsappOptIn?: boolean;
  courierName?: string;
  trackingId?: string;
  items?: {
    product?: {
      name?: string;
      price?: number;
    };
    quantity?: number;
  }[];
}

export interface DashboardCustomer {
  id?: string;
  name: string;
  email: string;
  mobile?: string;
  totalOrders: number;
  totalSpent: number;
  status: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard implements OnInit, OnDestroy {

  products = 0;
  categories = 0;
  customers = 0;
  orders = 0;
  sales = 0;
  actualSalesRevenue = 0;
  awaitingConfirmationOrders = 0;
  confirmedProcessingOrders = 0;
  dispatchedOrders = 0;
  deliveredOrders = 0;
  pendingOrders = 0;
  completedOrders = 0;
  outOfStock = 0;
  shippedOrders = 0;
  outForDeliveryOrders = 0;
  cancelledOrders = 0;
  statusFilter = 'ALL';
  orderList: DashboardOrder[] = [];
  recentCustomers: DashboardCustomer[] = [];
  orderSearch = '';
  expandedOrderIds = new Set<string>();
  currentAdmin: AuthUser | null = null;
  private authSub?: Subscription;
  private pollInterval?: any;
  isRefreshing = false;

  orderStatuses: StatusOption[] = [];
  shippingCourierName: Record<string | number, string> = {};
  shippingTrackingId: Record<string | number, string> = {};
  isSavingShipment: Record<string | number, boolean> = {};
  isConfirming: Record<string | number, boolean> = {};
  isCancelling: Record<string | number, boolean> = {};
  shippingFormOrderId: string | number | null = null;

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private storage: BrowserStorageService,
    private notifications: NotificationService,
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.loadDashboard();
    }
  }

  ngOnInit(): void {
    this.currentAdmin = this.authService.getCurrentUser();
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.currentAdmin = user;
      this.cdr.detectChanges();
    });


  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  loadDashboard(): void {
    this.loadOrderStatuses();
    this.loadDashboardMetrics();
    this.loadOrders();
    this.loadRecentCustomers();
  }

  loadOrderStatuses(): void {
    this.http.get<any>(`${environment.apiUrl}/orders/statuses`).subscribe({
      next: (res) => {
        const statuses = res?.data || res?.statuses || (Array.isArray(res) ? res : []);
        if (Array.isArray(statuses) && statuses.length > 0) {
          this.orderStatuses = statuses.map((item: any) => {
            if (typeof item === 'string') {
              return {
                value: item,
                label: item === 'placed'
                  ? 'Order Placed'
                  : item === 'out_for_delivery'
                  ? 'Out for Delivery'
                  : item.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
              };
            }
            return {
              value: item.value || item.status,
              label: item.label || item.name || item.value
            };
          });

          // Ensure any already loaded orders map to the correct status value
          if (this.orderList.length > 0) {
            this.orderList.forEach(o => {
              o.orderStatus = this.matchStatusValue(o.orderStatus);
            });
          }
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to load order statuses from API:', err);
      }
    });
  }

  matchStatusValue(status?: string): string {
    if (!status) return '';
    const clean = String(status).trim().toLowerCase();
    const byValue = this.orderStatuses.find(s => s.value.toLowerCase() === clean);
    if (byValue) return byValue.value;

    const byLabel = this.orderStatuses.find(s => s.label.toLowerCase() === clean);
    if (byLabel) return byLabel.value;

    if (clean === 'order placed' || clean === 'order_placed') {
      const placed = this.orderStatuses.find(s => s.value === 'placed');
      if (placed) return placed.value;
    }

    const cleanUnderscore = clean.replace(/[\s-]+/g, '_');
    const byUnderscore = this.orderStatuses.find(s => s.value.toLowerCase() === cleanUnderscore);
    if (byUnderscore) return byUnderscore.value;

    return clean;
  }

  loadDashboardMetrics(): void {
    this.http.get<any>(`${environment.apiUrl}/admin/dashboard`).subscribe({
      next: (stats) => {
        const data = stats?.data || stats;
        this.products = data.products ?? 0;
        this.categories = data.categories ?? 0;
        this.customers = data.customers ?? this.customers;
        this.orders = data.orders ?? 0;
        this.sales = data.totalSales || data.actualSalesRevenue || 0;
        this.actualSalesRevenue = data.actualSalesRevenue || data.totalSales || 0;
        this.awaitingConfirmationOrders = data.awaitingConfirmationOrders ?? 0;
        this.confirmedProcessingOrders = data.confirmedProcessingOrders ?? 0;
        this.dispatchedOrders = data.dispatchedOrders ?? 0;
        this.deliveredOrders = data.deliveredOrders ?? 0;
        this.pendingOrders = data.pendingOrders ?? (this.awaitingConfirmationOrders + this.confirmedProcessingOrders);
        this.completedOrders = data.completedOrders ?? this.deliveredOrders;
        this.outOfStock = data.outOfStock ?? 0;
        this.shippedOrders = data.shippedOrders ?? this.dispatchedOrders;
        this.outForDeliveryOrders = data.outForDeliveryOrders ?? 0;
        this.cancelledOrders = data.cancelledOrders ?? 0;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to load dashboard metrics from API:', err);
      }
    });
  }

  loadDashboardSilently(): void {
    this.loadDashboardMetrics();
    this.http.get<{ orders?: any[]; data?: { orders?: any[] } }>(`${environment.apiUrl}/orders`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res?.data) ? res.data : []);
        if (Array.isArray(orderArray)) {
          this.orderList = orderArray.map((o: any) => this.mapToDashboardOrder(o));
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  manualRefresh(): void {
    this.isRefreshing = true;
    this.loadDashboard();
    setTimeout(() => {
      this.isRefreshing = false;
      this.cdr.detectChanges();
    }, 800);
  }

  confirmOrder(order: DashboardOrder): void {
    const orderId = String(order.orderNumber || order.id);
    const confirmed = confirm(`Are you sure you want to CONFIRM Order #${orderId} from ${order.customerName}?`);
    if (!confirmed) return;

    this.isConfirming[order.id] = true;
    const targetId = order.rawId || order.id;

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, { status: 'confirmed' }).subscribe({
      next: () => {
        this.isConfirming[order.id] = false;
        order.orderStatus = 'confirmed';
        this.loadDashboardMetrics();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isConfirming[order.id] = false;
        console.error('Failed to confirm order:', err);
        this.cdr.detectChanges();
      }
    });
  }

  cancelOrder(order: DashboardOrder): void {
    const orderId = String(order.orderNumber || order.id);
    const confirmed = confirm(`Are you sure you want to CANCEL Order #${orderId}? Stock will be restored to inventory.`);
    if (!confirmed) return;

    this.isCancelling[order.id] = true;
    const targetId = order.rawId || order.id;

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, { status: 'cancelled' }).subscribe({
      next: () => {
        this.isCancelling[order.id] = false;
        order.orderStatus = 'cancelled';
        this.loadDashboardMetrics();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isCancelling[order.id] = false;
        console.error('Failed to cancel order:', err);
        this.cdr.detectChanges();
      }
    });
  }

  loadRecentCustomers(): void {
    this.http.get<any>(`${environment.apiUrl}/admin/customers?limit=20`).subscribe({
      next: (res) => {
        const list = res?.customers || res?.data?.customers || (Array.isArray(res) ? res : []);
        const custMap = new Map<string, DashboardCustomer>();

        if (Array.isArray(list)) {
          for (const c of list) {
            const email = (c.email || '').trim().toLowerCase();
            const key = email || String(c._id || c.name);
            custMap.set(key, {
              id: c._id ? String(c._id) : undefined,
              name: c.name || 'Customer',
              email: c.email || '',
              mobile: c.mobile || '',
              totalOrders: 0,
              totalSpent: 0,
              status: c.active !== false ? 'active' : 'inactive'
            });
          }
        }

        // Correlate with orders
        this.http.get<any>(`${environment.apiUrl}/orders`).subscribe({
          next: (ordRes) => {
            const orderArray = ordRes?.orders || ordRes?.data?.orders || (Array.isArray(ordRes) ? ordRes : []);
            if (Array.isArray(orderArray)) {
              for (const o of orderArray) {
                const orderEmail = (o.shippingAddress?.email || o.email || o.user?.email || '').trim().toLowerCase();
                const orderMobile = (o.shippingAddress?.mobile || o.user?.mobile || '').trim();
                const orderName = (o.shippingAddress?.fullName || o.user?.name || '').trim();
                const orderUserId = o.user?._id ? String(o.user._id) : (o.user ? String(o.user) : '');

                let matched: DashboardCustomer | undefined;
                if (orderEmail && custMap.has(orderEmail)) {
                  matched = custMap.get(orderEmail);
                } else if (orderUserId) {
                  matched = Array.from(custMap.values()).find(c => c.id === orderUserId);
                } else if (orderMobile) {
                  matched = Array.from(custMap.values()).find(c => c.mobile === orderMobile);
                }

                const total = Number(o.total) || 0;

                if (matched) {
                  matched.totalOrders += 1;
                  matched.totalSpent += total;
                  if (!matched.mobile && orderMobile) matched.mobile = orderMobile;
                  if ((!matched.name || matched.name === 'Customer') && orderName) matched.name = orderName;
                } else {
                  const key = orderEmail || orderMobile || `order-${o.orderNumber || o._id}`;
                  custMap.set(key, {
                    id: orderUserId || undefined,
                    name: orderName || 'Customer',
                    email: orderEmail,
                    mobile: orderMobile,
                    totalOrders: 1,
                    totalSpent: total,
                    status: 'active'
                  });
                }
              }
            }

            this.recentCustomers = Array.from(custMap.values()).sort((a, b) => b.totalOrders - a.totalOrders || (a.name || '').localeCompare(b.name || ''));
            if (this.customers === 0 && this.recentCustomers.length > 0) {
              this.customers = this.recentCustomers.length;
            }
            this.cdr.detectChanges();
          },
          error: () => {
            this.recentCustomers = Array.from(custMap.values());
            if (this.customers === 0 && this.recentCustomers.length > 0) {
              this.customers = this.recentCustomers.length;
            }
            this.cdr.detectChanges();
          }
        });
      },
      error: () => {
        // Fallback: populate customers directly from orders
        this.http.get<any>(`${environment.apiUrl}/orders`).subscribe({
          next: (ordRes) => {
            const orderArray = ordRes?.orders || ordRes?.data?.orders || (Array.isArray(ordRes) ? ordRes : []);
            if (Array.isArray(orderArray)) {
              const custMap = new Map<string, DashboardCustomer>();
              for (const o of orderArray) {
                const orderEmail = (o.shippingAddress?.email || o.email || o.user?.email || '').trim().toLowerCase();
                const orderMobile = (o.shippingAddress?.mobile || o.user?.mobile || '').trim();
                const orderName = (o.shippingAddress?.fullName || o.user?.name || '').trim();
                const key = orderEmail || orderMobile || `order-${o.orderNumber || o._id}`;
                const total = Number(o.total) || 0;
                const existing = custMap.get(key);
                if (existing) {
                  existing.totalOrders += 1;
                  existing.totalSpent += total;
                } else {
                  custMap.set(key, {
                    id: o.user?._id ? String(o.user._id) : (o.user ? String(o.user) : undefined),
                    name: orderName || 'Customer',
                    email: orderEmail,
                    mobile: orderMobile,
                    totalOrders: 1,
                    totalSpent: total,
                    status: 'active'
                  });
                }
              }
              this.recentCustomers = Array.from(custMap.values());
              if (this.customers === 0 && this.recentCustomers.length > 0) {
                this.customers = this.recentCustomers.length;
              }
              this.cdr.detectChanges();
            }
          }
        });
      }
    });
  }

  displayDashboardCustomerEmail(email?: string, mobile?: string): string {
    if (!email || email.endsWith('@customer.store')) {
      return mobile ? `Mobile: ${mobile}` : 'Order Customer';
    }
    return email;
  }

  mapToDashboardOrder(o: any): DashboardOrder {
    const rawId = String(o._id || o.id || '');
    const displayId = o.orderNumber
      ? String(o.orderNumber).replace(/^#+/, '')
      : (rawId && /^[a-f\d]{24}$/i.test(rawId) ? `ORD-${rawId.slice(-4).toUpperCase()}` : rawId);
    return {
      id: displayId,
      rawId: rawId,
      orderNumber: o.orderNumber || displayId,
      customerName: o.shippingAddress?.fullName || o.user?.name || 'Customer',
      mobile: o.shippingAddress?.mobile || o.user?.mobile || '',
      email: o.shippingAddress?.email || o.user?.email || o.email || '',
      address: o.shippingAddress?.address || '',
      city: o.shippingAddress?.city || '',
      state: o.shippingAddress?.state || '',
      pin: o.shippingAddress?.postalCode || '',
      total: o.total || 0,
      orderStatus: this.matchStatusValue(o.status),
      paymentStatus: o.paymentStatus || '',
      paymentMethod: o.paymentMethod || 'Online',
      orderDate: o.createdAt || '',
      deliveredAt: o.deliveredAt,
      whatsappOptIn: o.whatsappOptIn,
      courierName: o.courierName || o.shipment?.provider || '',
      trackingId: o.trackingId || o.shipment?.awb || o.shipment?.shipmentId || '',
      items: o.items
    };
  }

  loadOrders(): void {
    this.http.get<{ orders?: any[]; data?: { orders?: any[] } }>(`${environment.apiUrl}/orders`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res?.data) ? res.data : []);
        if (Array.isArray(orderArray)) {
          this.orderList = orderArray.map((o: any) => this.mapToDashboardOrder(o));

          // Pre-populate courier and tracking IDs for existing shipped orders
          this.orderList.forEach(ord => {
            if (ord.courierName) this.shippingCourierName[ord.id] = ord.courierName;
            if (ord.trackingId) this.shippingTrackingId[ord.id] = ord.trackingId;
          });

          this.cdr.detectChanges();
        } else {
          this.orderList = [];
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to load orders from database API:', err);
        this.orderList = [];
        this.cdr.detectChanges();
      }
    });
  }

  updateOrderStatus(orderId: number | string, newStatus: string): void {
    if (!orderId || !newStatus) return;

    const order = this.orderList.find(item => String(item.id) === String(orderId) || String(item.rawId) === String(orderId));
    const previousStatus = order ? order.orderStatus : '';
    const targetId = order?.rawId || orderId;

    if (order) {
      order.orderStatus = newStatus;
      if (newStatus === 'delivered' && !order.deliveredAt) {
        order.deliveredAt = new Date().toISOString();
      }
      this.cdr.detectChanges();
    }

    // 1. Save/update the selected status through the existing backend API and database
    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, { status: newStatus }).subscribe({
      next: (patchRes) => {
        // 2. Reload the status from the database after updating
        this.http.get<any>(`${environment.apiUrl}/orders/${targetId}`).subscribe({
          next: (getRes) => {
            const reloadedOrder = getRes?.order || getRes?.data?.order || getRes?.data || patchRes?.data || patchRes?.order;
            if (reloadedOrder && order) {
              order.orderStatus = this.matchStatusValue(reloadedOrder.status);
              if (reloadedOrder.deliveredAt) {
                order.deliveredAt = reloadedOrder.deliveredAt;
              }
              this.cdr.detectChanges();
            }
          },
          error: () => {
            // Fallback reload using patch response from database
            const patchOrder = patchRes?.data || patchRes?.order;
            if (patchOrder && order) {
              order.orderStatus = this.matchStatusValue(patchOrder.status);
              this.cdr.detectChanges();
            }
          }
        });

        // Notifications
        if (order) {
          const eventByStatus: Partial<Record<string, NotificationEvent>> = {
            processing: 'order_processing',
            shipped: 'order_shipped',
            delivered: 'order_delivered',
            cancelled: 'order_cancelled'
          };
          const event = eventByStatus[newStatus.toLowerCase()];
          if (event) {
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

        // Refresh live metrics
        this.loadDashboardMetrics();

        // If newly changed to Shipped, open shipping form if courier details not yet set
        if (newStatus.toLowerCase() === 'shipped') {
          this.expandedOrderIds.add(String(orderId));
          if (!order?.courierName || !order?.trackingId) {
            this.shippingFormOrderId = orderId;
          }
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error('Failed to update status in database:', err);
        // Revert UI to previous status from database if update failed
        if (order) {
          order.orderStatus = previousStatus;
          this.cdr.detectChanges();
        }
      }
    });
  }

  openShippingForm(order: DashboardOrder): void {
    this.shippingFormOrderId = order.id;
    if (order.courierName) this.shippingCourierName[order.id] = order.courierName;
    if (order.trackingId) this.shippingTrackingId[order.id] = order.trackingId;
    this.cdr.detectChanges();
  }

  cancelShippingForm(order: DashboardOrder): void {
    this.shippingFormOrderId = null;
    this.cdr.detectChanges();
  }

  saveShipmentDetails(order: DashboardOrder): void {
    const courier = (this.shippingCourierName[order.id] || '').trim();
    const tracking = (this.shippingTrackingId[order.id] || '').trim();

    if (!courier || !tracking) {
      alert('Please enter both Courier/Company Name and Courier/Tracking Order ID.');
      return;
    }

    this.isSavingShipment[order.id] = true;
    const targetId = order.rawId || order.id;

    this.http.patch<any>(`${environment.apiUrl}/orders/${targetId}/status`, {
      status: 'shipped',
      courierName: courier,
      trackingId: tracking
    }).subscribe({
      next: () => {
        this.isSavingShipment[order.id] = false;
        this.shippingFormOrderId = null;
        order.orderStatus = 'shipped';
        order.courierName = courier;
        order.trackingId = tracking;
        this.loadDashboardMetrics();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isSavingShipment[order.id] = false;
        console.error('Failed to update shipment in MongoDB:', err);
        alert('Failed to save shipment details to database.');
        this.cdr.detectChanges();
      }
    });
  }

  deliveredDateInput(value?: string): string {
    if (!value) return '';
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp)
      ? new Date(timestamp).toISOString().slice(0, 10)
      : '';
  }

  updateDeliveredDate(orderId: number | string, date: string): void {
    const order = this.orderList.find(item => String(item.id) === String(orderId) || String(item.rawId) === String(orderId));
    if (!order || (order.orderStatus !== 'delivered' && order.orderStatus !== 'Delivered')) return;

    if (!date) {
      delete order.deliveredAt;
    } else {
      const timestamp = Date.parse(`${date}T12:00:00`);
      if (!Number.isFinite(timestamp)) return;
      order.deliveredAt = new Date(timestamp).toISOString();
    }
    this.cdr.detectChanges();
  }

  get countShipped(): number {
    return this.orderList.filter(o => (o.orderStatus || '').toLowerCase() === 'shipped').length;
  }
  get countOutForDelivery(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'out_for_delivery' || s === 'out for delivery';
    }).length;
  }
  get countCancelled(): number {
    return this.orderList.filter(o => (o.orderStatus || '').toLowerCase() === 'cancelled').length;
  }
  get countPending(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'order placed' || s === 'processing' || s === 'placed' || s === 'pending';
    }).length;
  }
  get countDelivered(): number {
    return this.orderList.filter(o => {
      const s = (o.orderStatus || '').toLowerCase();
      return s === 'delivered' || s === 'completed';
    }).length;
  }

  setStatusFilter(filter: string): void {
    this.statusFilter = filter;
    this.cdr.detectChanges();
  }

  get filteredOrders(): DashboardOrder[] {
    const query = this.orderSearch.trim().toLowerCase();
    return this.orderList.filter(order => {
      if (this.statusFilter !== 'ALL') {
        const fLower = this.statusFilter.toLowerCase();
        const sLower = (order.orderStatus || '').toLowerCase();
        if (fLower === 'awaiting confirmation' || fLower === 'awaiting_confirmation') {
          if (sLower !== 'placed' && sLower !== 'order placed') return false;
        } else if (fLower === 'confirmed & processing' || fLower === 'confirmed_processing' || fLower === 'confirmed') {
          if (sLower !== 'confirmed' && sLower !== 'processing') return false;
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
        } else if (fLower === 'out for delivery' || fLower === 'out_for_delivery') {
          if (sLower !== 'out for delivery' && sLower !== 'out_for_delivery') return false;
        } else if (fLower === 'cancelled') {
          if (sLower !== 'cancelled') return false;
        } else if (sLower !== fLower) {
          return false;
        }
      }

      if (!query) {
        return true;
      }

      return [
        order.id,
        order.orderNumber,
        order.customerName,
        order.email,
        order.mobile,
        order.orderStatus,
        this.getStatusLabel(order.orderStatus),
        order.paymentStatus,
        order.paymentMethod
      ].some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }

  getStatusLabel(statusValue?: string): string {
    if (!statusValue) return '';
    const match = this.orderStatuses.find(s => s.value.toLowerCase() === statusValue.toLowerCase());
    return match ? match.label : statusValue;
  }

  toggleOrderDetails(orderId: number | string): void {
    const key = String(orderId);
    if (this.expandedOrderIds.has(key)) {
      this.expandedOrderIds.delete(key);
    } else {
      this.expandedOrderIds.add(key);
    }
  }

  isOrderExpanded(orderId: number | string): boolean {
    return this.expandedOrderIds.has(String(orderId));
  }
}