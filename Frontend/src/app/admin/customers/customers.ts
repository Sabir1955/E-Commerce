import { Component, ChangeDetectorRef, OnInit, AfterViewInit, Inject, PLATFORM_ID, Optional } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { environment } from '../../../environments/environment';
import { resolveImageUrl } from '../../core/utils/image-url.util';

export interface StoredCustomer {
  _id?: string;
  name?: string;
  email: string;
  mobile?: string;
  role?: string;
  active?: boolean;
  accountStatus?: string;
}

export interface CustomerOrderItem {
  name?: string;
  image?: string;
  quantity?: number;
  price?: number;
  productId?: string;
  product?: {
    name?: string;
    imageUrl?: string;
    images?: string[];
    price?: number;
  };
}

export interface CustomerOrder {
  id: number | string;
  _id?: string;
  orderNumber?: string;
  email: string;
  customerName?: string;
  mobile?: string;
  address?: string;
  city?: string;
  state?: string;
  pin?: string;
  total?: number;
  orderStatus?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  orderDate?: string;
  courierName?: string;
  trackingId?: string;
  items?: CustomerOrderItem[];
}

export interface CustomerRecord extends StoredCustomer {
  email: string;
  address?: string;
  orders: CustomerOrder[];
}

@Component({
  selector: 'app-admin-customers',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './customers.html',
  styleUrl: './customers.css'
})
export class AdminCustomers implements OnInit, AfterViewInit {
  customers: CustomerRecord[] = [];
  selectedCustomer: CustomerRecord | null = null;
  private _searchText = '';
  get searchText(): string {
    return this._searchText;
  }
  set searchText(val: string) {
    this._searchText = val;
    this.cdr.markForCheck();
  }
  errorMessage = '';
  isLoading = false;
  readonly expandedEmails = new Set<string>();
  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Optional() private route?: ActivatedRoute,
    @Inject(PLATFORM_ID) private platformId: object = {}
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    if (this.route) {
      this.route.queryParams.subscribe(params => {
        const searchParam = params['search'];
        if (searchParam) {
          this.searchText = searchParam;
        }
      });
    }
    this.loadCustomers();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.customers.length === 0 && !this.isLoading) {
      this.loadCustomers();
    }
  }

  get filteredCustomers(): CustomerRecord[] {
    const query = this.searchText.trim().toLowerCase();
    if (!query) return this.customers;

    return this.customers.filter(customer =>
      [
        customer.name,
        customer.email,
        customer.mobile,
        customer.address,
        customer.active === false || customer.accountStatus === 'inactive'
          ? 'inactive'
          : 'active'
      ].some(value => String(value ?? '').toLowerCase().includes(query))
    );
  }

  loadCustomers(): void {
    this.errorMessage = '';
    this.isLoading = true;
    this.cdr.detectChanges();

    this.http.get<any>(`${environment.apiUrl}/admin/customers?limit=100`).subscribe({
      next: (res) => {
        this.isLoading = false;
        const list = res?.customers || res?.data?.customers || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) {
          this.customers = list.map((c: any) => ({
            _id: c._id || c.id,
            name: c.name || 'Customer',
            email: c.email || '',
            mobile: c.mobile || '',
            address: c.address || 'Address not provided',
            role: c.role || 'customer',
            active: c.active !== false,
            accountStatus: c.active !== false ? 'active' : 'inactive',
            orders: []
          })).sort((a: CustomerRecord, b: CustomerRecord) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
        }

        // Always correlate with customer orders from database and incorporate order customers
        this.loadCustomerOrders();
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('Could not load customers from /api/admin/customers, trying fallback:', err);
        this.fallbackLoadCustomers();
      }
    });
  }

  private fallbackLoadCustomers(): void {
    this.http.get<any>(`${environment.apiUrl}/customers`).subscribe({
      next: (res) => {
        this.isLoading = false;
        const list = res?.customers || res?.data?.customers || (Array.isArray(res) ? res : []);
        if (Array.isArray(list) && list.length > 0) {
          this.customers = list.map((c: any) => ({
            _id: c._id || c.id,
            name: c.name || 'Customer',
            email: c.email || '',
            mobile: c.mobile || '',
            address: c.address || 'Address not provided',
            role: c.role || 'customer',
            active: c.active !== false,
            accountStatus: c.active !== false ? 'active' : 'inactive',
            orders: []
          })).sort((a: CustomerRecord, b: CustomerRecord) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
        }
        this.loadCustomerOrders();
        this.cdr.detectChanges();
      },
      error: () => {
        this.isLoading = false;
        // Even if registered customers endpoint fails, populate from database orders
        this.loadCustomerOrders();
      }
    });
  }

  private loadCustomerOrders(): void {
    this.http.get<any>(`${environment.apiUrl}/orders`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res) ? res : []);
        if (Array.isArray(orderArray) && orderArray.length > 0) {
          for (const o of orderArray) {
            const orderUserId = o.user?._id ? String(o.user._id) : (o.user ? String(o.user) : '');
            const orderEmail = (o.shippingAddress?.email || o.email || o.user?.email || '').trim();
            const orderMobile = (o.shippingAddress?.mobile || o.user?.mobile || '').trim();
            const orderName = (o.shippingAddress?.fullName || o.user?.name || '').trim();

            let matched = this.customers.find(c => {
              const cId = c._id ? String(c._id) : '';
              const cEmail = (c.email || '').trim().toLowerCase();
              const cMobile = (c.mobile || '').trim();
              return (cId && orderUserId && cId === orderUserId) ||
                     (cEmail && orderEmail && cEmail === orderEmail.toLowerCase()) ||
                     (cMobile && orderMobile && cMobile === orderMobile);
            });

            const mapped = this.mapOrder(
              o,
              matched?.email || orderEmail,
              matched?.name || orderName,
              matched?.mobile || orderMobile
            );

            if (matched) {
              if (!matched.orders.some(ex => String(ex.id) === String(mapped.id) || String(ex._id) === String(mapped._id))) {
                matched.orders.push(mapped);
              }
              if (!matched.mobile && orderMobile) matched.mobile = orderMobile;
              if ((!matched.name || matched.name === 'Customer') && orderName) matched.name = orderName;
              if ((!matched.address || matched.address === 'Address not provided') && o.shippingAddress) {
                const sa = o.shippingAddress;
                matched.address = `${sa.address || ''}, ${sa.city || ''}, ${sa.state || ''} - ${sa.postalCode || sa.pin || ''}, ${sa.country || 'India'}`.replace(/^, /, '').trim();
              }
            } else {
              // Create customer record from order details
              const customerEmail = orderEmail || (orderMobile ? `${orderMobile}@customer.store` : `order-${o.orderNumber || o._id}@customer.store`);
              let customerAddr = 'Address not provided';
              if (o.shippingAddress) {
                const sa = o.shippingAddress;
                customerAddr = `${sa.address || ''}, ${sa.city || ''}, ${sa.state || ''} - ${sa.postalCode || sa.pin || ''}, ${sa.country || 'India'}`.replace(/^, /, '').trim();
              }
              const newCustomer: CustomerRecord = {
                _id: orderUserId || undefined,
                name: orderName || 'Customer',
                email: customerEmail,
                mobile: orderMobile,
                address: customerAddr,
                role: 'customer',
                active: true,
                accountStatus: 'active',
                orders: [mapped]
              };
              this.customers.push(newCustomer);
            }
          }

          // Sort customers alphabetically
          this.customers.sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.warn('Could not load customer orders from API:', err);
        if (this.customers.length === 0) {
          this.errorMessage = 'Could not load customer directory from database.';
        }
        this.cdr.detectChanges();
      }
    });
  }

  selectCustomer(customer: CustomerRecord): void {
    this.selectedCustomer = customer;
    this.expandedEmails.add(customer.email.toLowerCase());
    if (customer._id) {
      this.fetchCustomerPurchaseHistory(customer);
    }
    this.cdr.detectChanges();
  }

  clearSelectedCustomer(): void {
    this.selectedCustomer = null;
    this.cdr.detectChanges();
  }

  fetchCustomerPurchaseHistory(customer: CustomerRecord): void {
    if (!customer._id) return;
    this.http.get<any>(`${environment.apiUrl}/admin/customers/${customer._id}`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || [];
        if (Array.isArray(orderArray) && orderArray.length > 0) {
          customer.orders = orderArray.map((o: any) =>
            this.mapOrder(o, customer.email, customer.name, customer.mobile)
          );
        }
        if (res?.customer?.address && (!customer.address || customer.address === 'Address not provided')) {
          customer.address = res.customer.address;
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  private mapOrder(o: any, customerEmail: string, customerName?: string, customerMobile?: string): CustomerOrder {
    const rawId = String(o._id || o.id || '');
    const displayId = o.orderNumber
      ? String(o.orderNumber).replace(/^#+/, '')
      : (rawId && /^[a-f\d]{24}$/i.test(rawId) ? `ORD-${rawId.slice(-4).toUpperCase()}` : rawId);

    const items: CustomerOrderItem[] = (o.items || []).map((it: any) => {
      const prodName = it.name || it.product?.name || (typeof it.product === 'string' ? it.product : '') || 'Product';
      const quantity = Number(it.quantity) || 1;
      const price = Number(it.price ?? it.product?.price ?? 0);
      const image = resolveImageUrl(it.image || it.product?.imageUrl || (it.product?.images && it.product.images[0]) || '');
      const productId = it.productId || it.product?._id || it.product?.id || (typeof it.product === 'string' && it.product.length > 5 ? it.product : '') || it._id || '';
      return {
        name: prodName,
        quantity,
        price,
        image,
        productId,
        product: {
          name: prodName,
          price,
          imageUrl: image
        }
      };
    });

    return {
      id: displayId,
      _id: rawId,
      orderNumber: displayId,
      email: customerEmail,
      customerName: o.shippingAddress?.fullName || customerName,
      mobile: o.shippingAddress?.mobile || customerMobile,
      address: o.shippingAddress?.address,
      city: o.shippingAddress?.city,
      state: o.shippingAddress?.state,
      pin: o.shippingAddress?.postalCode,
      total: o.total,
      orderStatus: o.status || 'Order Placed',
      paymentStatus: o.paymentStatus || 'Pending',
      paymentMethod: o.paymentMethod || 'Online',
      orderDate: o.createdAt,
      courierName: o.courierName || o.shipment?.courierName,
      trackingId: o.trackingId || o.shipment?.trackingId,
      items
    };
  }

  toggleAccount(customer: CustomerRecord): void {
    const active = customer.active === false || customer.accountStatus === 'inactive';

    if (customer._id) {
      this.http.patch(`${environment.apiUrl}/admin/customers/${customer._id}/status`, { active }).subscribe({
        next: () => {
          customer.active = active;
          customer.accountStatus = active ? 'active' : 'inactive';
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.errorMessage = err.error?.message || 'Could not update customer status in backend.';
          this.cdr.detectChanges();
        }
      });
      return;
    }

    // For order-created customer records without DB user ID, toggle state locally
    customer.active = active;
    customer.accountStatus = active ? 'active' : 'inactive';
    this.cdr.detectChanges();
  }

  toggleCustomerDetails(email: string): void {
    const customer = this.customers.find(c => c.email.toLowerCase() === email.toLowerCase());
    if (customer) {
      if (this.selectedCustomer?.email.toLowerCase() === email.toLowerCase()) {
        this.clearSelectedCustomer();
      } else {
        this.selectCustomer(customer);
      }
    }
  }

  isExpanded(email: string): boolean {
    return this.selectedCustomer?.email.toLowerCase() === email.toLowerCase() || this.expandedEmails.has(email.toLowerCase());
  }

  getCustomerTotalSpent(customer: CustomerRecord): number {
    return (customer.orders || []).reduce((sum, order) => sum + (Number(order.total) || 0), 0);
  }

  getCustomerOrders(customer: CustomerRecord): CustomerOrder[] {
    return [...customer.orders].sort(
      (first, second) => Date.parse(second.orderDate ?? '') - Date.parse(first.orderDate ?? '')
    );
  }

  displayCustomerEmail(email: string, mobile?: string): string {
    if (!email || email.endsWith('@customer.store')) {
      return mobile ? `Mobile: ${mobile}` : 'Order Customer';
    }
    return email;
  }

  formatProductId(id?: string): string {
    if (!id) return '—';
    const clean = String(id).trim();
    if (!clean) return '—';
    if (clean.length > 10) {
      return `#${clean.slice(-6).toUpperCase()}`;
    }
    return clean.startsWith('#') ? clean : `#${clean}`;
  }
}
