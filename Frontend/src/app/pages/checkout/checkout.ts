import { ChangeDetectorRef, Component, inject, NgZone, OnInit } from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { BrowserStorageService } from '../../core/services/browser-storage.service';
import { CartItem, CartService } from '../../core/services/cart.service';
import { InventoryService, StockAdjustment } from '../../core/services/inventory.service';
import { NotificationService } from '../../core/services/notification.service';
import {
  PaymentRecordResponse,
  PaymentService
} from '../../core/services/payment.service';
import { OrderService } from '../../core/services/order.service';
import { AddressService, UserAddress } from '../../core/services/address.service';

interface StoredOrder {
  id: number | string;
  customerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  country: string;
  paymentMethod: string;
  paymentStatus: string;
  whatsappOptIn: boolean;
  paymentRecordId: string;
  gatewayOrderId?: string;
  paymentId?: string;
  gatewayMethod?: string;
  orderStatus: string;
  total: number;
  items: CartItem[];
  orderDate: string;
}

declare global {
  interface Window {
    EasebuzzCheckout?: new (key: string, env: string) => {
      initiatePayment: (options: { access_key: string; onResponse: (res: any) => void }) => void;
    };
  }
}

export interface OrderConfirmedDetails {
  orderNumber: string;
  orderId?: string;
  customerName: string;
  mobile: string;
  email: string;
  address: string;
  city: string;
  state: string;
  pin: string;
  country: string;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  total: number;
  items: Array<{ title: string; price: number; quantity: number }>;
  orderDate: string;
}

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './checkout.html',
  styleUrl: './checkout.css'
})
export class Checkout implements OnInit {
  public cartService = inject(CartService);
  private inventoryService = inject(InventoryService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private storage = inject(BrowserStorageService);
  private paymentService = inject(PaymentService);
  private orderService = inject(OrderService);
  private addressService = inject(AddressService);
  private notifications = inject(NotificationService);
  private authService = inject(AuthService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private document: Document = typeof document !== 'undefined' ? document : (inject(DOCUMENT, { optional: true }) || {} as Document);

  fullName = '';
  mobile = '';
  email = '';
  whatsappOptIn = false;
  address = '';
  city = '';
  state = '';
  pin = '';
  country = 'India';
  savedAddressId: string | null = null;
  private isSavingAddress = false;
  private lastSavedAddressPayload = '';

  savedAddresses: UserAddress[] = [];

  paymentMethod: 'easebuzz' = 'easebuzz';
  isSubmitting = false;
  isVerifying = false;
  isGatewayOpen = false;
  errorMessage = '';
  statusMessage = '';
  isEasebuzzModalOpen = false;
  activeEasebuzzRecord: PaymentRecordResponse | null = null;
  orderConfirmedDetails: OrderConfirmedDetails | null = null;

  verificationAttempt: {
    recordId: string;
    payment: any;
  } | null = null;
  private easebuzzScript?: Promise<void>;
  private readonly draftKey = 'astrology_checkout_draft';

  ngOnInit(): void {
    this.paymentMethod = 'easebuzz';

    // Check for Easebuzz redirect callback in query params
    const easebuzzStatus = this.route.snapshot.queryParams['easebuzz_status'];
    if (easebuzzStatus) {
      const recordId = this.route.snapshot.queryParams['recordId'] || '';
      const txnid = this.route.snapshot.queryParams['txnid'] || '';
      const orderParam = this.route.snapshot.queryParams['order'] || '';
      const normStatus = String(easebuzzStatus).toLowerCase().trim();

      this.isVerifying = true;
      this.statusMessage = 'Verifying Easebuzz payment status with server...';
      this.cdr.detectChanges();

      this.paymentService.verifyEasebuzzPayment({
        recordId,
        txnid,
        status: normStatus
      }).subscribe({
        next: (result) => {
          this.zone.run(() => {
            this.isVerifying = false;
            this.isSubmitting = false;
            this.isGatewayOpen = false;

            const resStatus = String(result.status || '').toLowerCase();
            if (resStatus === 'paid') {
              this.inventoryService.consumeStock(this.getStockAdjustments());
              const orderNum = result.order?.orderNumber || result.order?._id || orderParam || result.recordId || '';
              this.finishOrder(
                `Payment successful! Your order #${orderNum} has been placed.`,
                {
                  orderNumber: String(orderNum).replace(/^#+/, ''),
                  orderId: result.order?._id,
                  customerName: result.order?.shippingAddress?.fullName || this.fullName,
                  mobile: result.order?.shippingAddress?.mobile || this.mobile,
                  email: result.order?.shippingAddress?.email || this.email,
                  address: result.order?.shippingAddress?.address || this.address,
                  city: result.order?.shippingAddress?.city || this.city,
                  state: result.order?.shippingAddress?.state || this.state,
                  pin: result.order?.shippingAddress?.postalCode || this.pin,
                  paymentMethod: 'Easebuzz',
                  paymentStatus: 'Paid',
                  orderStatus: 'Order Placed',
                  total: result.order?.total ?? (result.amount ? result.amount / 100 : this.cartService.getSubtotal()),
                  orderDate: result.order?.createdAt || new Date().toISOString()
                }
              );
            } else if (resStatus === 'cancelled' || resStatus === 'usercancelled') {
              this.errorMessage = 'Payment was cancelled. Your cart items are saved so you can try again.';
              this.statusMessage = '';
            } else if (resStatus === 'pending') {
              this.statusMessage = 'Payment confirmation is pending. Please check again.';
              this.errorMessage = '';
            } else {
              const failureMsg = result.message || 'Payment could not be completed';
              this.errorMessage = `Easebuzz payment failed: ${failureMsg}. Your cart is preserved.`;
              this.statusMessage = '';
            }
            this.cdr.detectChanges();
          });
        },
        error: (err) => {
          this.zone.run(() => {
            this.isVerifying = false;
            this.isSubmitting = false;
            this.isGatewayOpen = false;
            this.errorMessage = this.getErrorMessage(err, 'Easebuzz payment verification failed. Please contact support.');
            this.statusMessage = '';
            this.cdr.detectChanges();
          });
        }
      });
    }

    if (this.authService.isLoggedIn()) {
      this.cartService.adoptGuestItemsForCheckout();
      this.loadSavedAddress();
    } else {
      this.restoreDraftDeliveryDetails();
      const currentUser = this.authService.getCurrentUser();
      if (currentUser) {
        if (!this.fullName && currentUser.name) this.fullName = currentUser.name;
        if (!this.email && currentUser.email) this.email = currentUser.email;
        if (!this.mobile && currentUser.mobile) this.mobile = currentUser.mobile;
      }
    }
  }

  loadSavedAddress(): void {
    this.savedAddresses = [];
    this.savedAddressId = null;

    if (!this.authService.isLoggedIn()) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (currentUser) {
      if (!this.fullName && currentUser.name) this.fullName = currentUser.name;
      if (!this.email && currentUser.email) this.email = currentUser.email;
      if (!this.mobile && currentUser.mobile) this.mobile = currentUser.mobile;
    }
  }

  selectSavedAddress(addr: UserAddress): void {
    this.savedAddressId = addr?._id || null;
  }

  deleteSavedAddress(addr: UserAddress, event: Event): void {
    event.stopPropagation();
  }

  saveOrUpdateAddressInDb(): void {
    // Saved address feature removed as requested
  }

  private saveDraftDeliveryDetails(): void {
    const draft = {
      fullName: this.fullName,
      mobile: this.mobile,
      email: this.email,
      city: this.city,
      state: this.state,
      pin: this.pin,
      address: this.address
    };
    this.storage.setItem(this.draftKey, JSON.stringify(draft));
  }

  private restoreDraftDeliveryDetails(): void {
    const raw = this.storage.getItem(this.draftKey);
    if (raw) {
      try {
        const draft = JSON.parse(raw);
        if (draft.fullName) this.fullName = draft.fullName;
        if (draft.mobile) this.mobile = draft.mobile;
        if (draft.email) this.email = draft.email;
        if (draft.city) this.city = draft.city;
        if (draft.state) this.state = draft.state;
        if (draft.pin) this.pin = draft.pin;
        if (draft.address) this.address = draft.address;
      } catch {
        // ignore parse error
      }
    }
  }

  private clearDraftDeliveryDetails(): void {
    this.storage.removeItem(this.draftKey);
  }

  hasDeliveryDetails(): boolean {
    return Boolean(
      this.fullName?.trim() &&
      this.mobile?.trim() &&
      this.email?.trim() &&
      this.city?.trim() &&
      this.state?.trim() &&
      this.pin?.trim() &&
      this.address?.trim()
    );
  }

  getCartAmountInPaise(): number {
    return Math.round(this.cartService.getSubtotal() * 100);
  }

  retryVerification(): void {
    if (this.activeEasebuzzRecord) {
      void this.openEasebuzzCheckout(this.activeEasebuzzRecord);
    }
  }

  get hasPendingVerification(): boolean {
    return this.verificationAttempt !== null;
  }

  async placeOrder(): Promise<void> {
    if (
      this.isSubmitting ||
      this.isVerifying ||
      this.isGatewayOpen ||
      this.verificationAttempt
    ) {
      return;
    }

    this.errorMessage = '';
    this.statusMessage = '';

    // Check whether the customer is logged in before proceeding to payment
    if (!this.authService.isLoggedIn()) {
      this.saveDraftDeliveryDetails();
      this.router.navigate(['/login'], {
        queryParams: { returnUrl: '/checkout' }
      });
      return;
    }

    if (!this.hasDeliveryDetails()) {
      this.errorMessage = 'Please fill all delivery details.';
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.email.trim())) {
      this.errorMessage = 'Please enter a valid email address.';
      return;
    }

    const cleanedMobile = this.mobile.replace(/\D/g, '');
    if (cleanedMobile.length < 10) {
      this.errorMessage = 'Please enter a valid 10-digit mobile number.';
      return;
    }

    const cartItems = this.cartService.getItems();
    if (cartItems.length === 0) {
      this.errorMessage = 'Your cart is empty. Add products before checkout.';
      return;
    }

    const items = cartItems.map(item => ({
      productId: item.product.id,
      quantity: item.quantity
    }));

    if (!this.inventoryService.canFulfill(items)) {
      this.errorMessage = 'One or more products are unavailable or have insufficient stock. Please update your cart.';
      return;
    }



    // Online Payment Flow (Razorpay / Easebuzz)
    this.isSubmitting = true;
    try {
      const normalizedMobile = this.mobile.startsWith('+91') ? this.mobile : `+91${this.mobile.replace(/\D/g, '')}`;
      const shippingAddress = {
        fullName: this.fullName.trim(),
        mobile: normalizedMobile,
        email: this.email.trim(),
        address: this.address.trim(),
        city: this.city.trim(),
        state: this.state.trim(),
        postalCode: this.pin.trim(),
        country: this.country.trim() || 'India'
      };

      const selectedGateway = 'easebuzz';
      const paymentRecord = await firstValueFrom(
        this.paymentService.createOrder(items, shippingAddress, selectedGateway)
      );
      if (paymentRecord.amount !== this.getCartAmountInPaise()) {
        this.errorMessage = 'The checkout total does not match the server catalog. Please contact the store before paying.';
        return;
      }

      await this.loadEasebuzzScript();
      await this.openEasebuzzCheckout(paymentRecord);
    } catch (error) {
      this.errorMessage = this.getErrorMessage(
        error,
        'Could not initiate Easebuzz online payment. Please check your connection and retry.'
      );
    } finally {
      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  closeEasebuzzModal(): void {
    this.zone.run(() => {
      this.isEasebuzzModalOpen = false;
      this.isGatewayOpen = false;
      this.isSubmitting = false;
      this.cdr.detectChanges();
    });
  }

  async simulateEasebuzzSuccess(): Promise<void> {
    if (!this.activeEasebuzzRecord) return;
    const record = this.activeEasebuzzRecord;
    this.zone.run(() => {
      this.isEasebuzzModalOpen = false;
      this.isGatewayOpen = false;
      this.cdr.detectChanges();
    });
    await this.handleEasebuzzResponse(record, {
      status: 'success',
      txnid: record.txnid,
      easepayid: 'EP_' + Date.now(),
      amount: record.amount / 100,
      firstname: this.fullName.split(' ')[0] || 'Customer',
      email: this.email,
      productinfo: 'Astrology Products Checkout',
      hash: 'easebuzz_simulated_hash'
    });
  }

  async simulateEasebuzzFailure(): Promise<void> {
    if (!this.activeEasebuzzRecord) return;
    const record = this.activeEasebuzzRecord;
    this.zone.run(() => {
      this.isEasebuzzModalOpen = false;
      this.isGatewayOpen = false;
      this.cdr.detectChanges();
    });
    await this.handleEasebuzzResponse(record, {
      status: 'failure',
      txnid: record.txnid,
      error_Message: 'Transaction declined by bank server (Test Mode simulation)'
    });
  }

  async simulateEasebuzzCancel(): Promise<void> {
    if (!this.activeEasebuzzRecord) return;
    const record = this.activeEasebuzzRecord;
    this.zone.run(() => {
      this.isEasebuzzModalOpen = false;
      this.isGatewayOpen = false;
      this.cdr.detectChanges();
    });
    await this.handleEasebuzzResponse(record, {
      status: 'usercancelled',
      txnid: record.txnid,
      error_Message: 'User cancelled payment'
    });
  }

  private async openEasebuzzCheckout(paymentRecord: PaymentRecordResponse): Promise<void> {
    // If the payment is marked simulated (e.g. test credentials returned Hash Mismatch on test server),
    // open the dedicated interactive Easebuzz Test Sandbox modal instead of navigating to a non-existent remote URL!
    if (paymentRecord.simulated) {
      this.zone.run(() => {
        this.activeEasebuzzRecord = paymentRecord;
        this.isEasebuzzModalOpen = true;
        this.isGatewayOpen = true;
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });
      return;
    }

    const EasebuzzCheckout = typeof window !== 'undefined' ? (window as any).EasebuzzCheckout : undefined;
    if (EasebuzzCheckout && paymentRecord.accessKey) {
      try {
        const key = paymentRecord.keyId || '2PBP7IABZ2';
        const easebuzz = new EasebuzzCheckout(key, 'test');
        this.zone.run(() => {
          this.isGatewayOpen = true;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });

        easebuzz.initiatePayment({
          access_key: paymentRecord.accessKey,
          onResponse: (response: any) => {
            this.zone.run(() => {
              this.isGatewayOpen = false;
              this.isSubmitting = false;
              this.cdr.detectChanges();
              void this.handleEasebuzzResponse(paymentRecord, response);
            });
          }
        });
      } catch (err) {
        this.zone.run(() => {
          this.isGatewayOpen = false;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
        if (!paymentRecord.simulated && paymentRecord.payUrl && typeof window !== 'undefined') {
          window.location.href = paymentRecord.payUrl;
          return;
        }
        this.zone.run(() => {
          this.activeEasebuzzRecord = paymentRecord;
          this.isEasebuzzModalOpen = true;
          this.isGatewayOpen = true;
          this.cdr.detectChanges();
        });
      }
    } else if (!paymentRecord.simulated && paymentRecord.payUrl && typeof window !== 'undefined') {
      window.location.href = paymentRecord.payUrl;
    } else {
      this.zone.run(() => {
        this.activeEasebuzzRecord = paymentRecord;
        this.isEasebuzzModalOpen = true;
        this.isGatewayOpen = true;
        this.isSubmitting = false;
        this.cdr.detectChanges();
      });
    }
  }

  private async handleEasebuzzResponse(paymentRecord: PaymentRecordResponse, response: any): Promise<void> {
    const status = String(response?.status || '').toLowerCase().trim();
    this.zone.run(() => {
      this.isGatewayOpen = false;
      this.isSubmitting = false;
      this.isEasebuzzModalOpen = false;
      this.cdr.detectChanges();
    });

    if (status === 'success' || status === 'paid') {
      this.zone.run(() => {
        this.isVerifying = true;
        this.errorMessage = '';
        this.statusMessage = 'Verifying your payment securely with Easebuzz...';
        this.cdr.detectChanges();
      });

      try {
        const result = await firstValueFrom(
          this.paymentService.verifyEasebuzzPayment({
            recordId: paymentRecord.recordId,
            txnid: response.txnid || paymentRecord.txnid || '',
            status: 'success',
            easepayid: response.easepayid,
            amount: response.amount ? parseFloat(response.amount) : paymentRecord.amount / 100,
            hash: response.hash
          })
        );

        this.zone.run(() => {
          if (result.status === 'paid') {
            this.inventoryService.consumeStock(this.getStockAdjustments());
            void this.saveOrder(
              result,
              'Easebuzz',
              'Paid',
              'Order Placed'
            ).then((order) => {
              const orderNumber = result.order?.orderNumber || order.id || result.orderNumber || result.recordId;
              this.finishOrder(
                `Payment successful! Your order #${orderNumber} has been placed.`,
                {
                  orderNumber: String(orderNumber).replace(/^#+/, ''),
                  orderId: result.order?._id || String(order.id),
                  customerName: order.customerName,
                  mobile: order.mobile,
                  email: order.email,
                  address: order.address,
                  city: order.city,
                  state: order.state,
                  pin: order.pin,
                  country: order.country,
                  paymentMethod: 'Easebuzz',
                  paymentStatus: 'Paid',
                  orderStatus: 'Order Placed',
                  total: order.total,
                  items: order.items.map(i => ({ title: i.product.name, price: i.product.price, quantity: i.quantity })),
                  orderDate: order.orderDate
                }
              );
            });
            return;
          }

          if (result.status === 'failed' || result.status === 'verification_failed') {
            this.errorMessage = 'Payment could not be verified. Your cart is preserved; you can retry checkout.';
            this.statusMessage = '';
            this.cdr.detectChanges();
            return;
          }

          this.statusMessage = 'Payment confirmation is pending. Please check again.';
          this.cdr.detectChanges();
        });
      } catch (error) {
        this.zone.run(() => {
          this.errorMessage = this.getErrorMessage(
            error,
            'Easebuzz payment status could not be confirmed. Please contact support.'
          );
          this.statusMessage = '';
          this.cdr.detectChanges();
        });
      } finally {
        this.zone.run(() => {
          this.isVerifying = false;
          this.isSubmitting = false;
          this.cdr.detectChanges();
        });
      }
    } else if (status === 'usercancelled' || status === 'cancelled') {
      try {
        await firstValueFrom(
          this.paymentService.verifyEasebuzzPayment({
            recordId: paymentRecord.recordId,
            txnid: response?.txnid || paymentRecord.txnid || '',
            status: 'usercancelled',
            error_Message: 'User cancelled payment'
          })
        );
      } catch {}
      this.zone.run(() => {
        this.errorMessage = 'Payment was cancelled. Your cart items are saved so you can try again.';
        this.statusMessage = '';
        this.isVerifying = false;
        this.isSubmitting = false;
        this.isGatewayOpen = false;
        this.cdr.detectChanges();
      });
    } else if (status === 'pending') {
      try {
        await firstValueFrom(
          this.paymentService.verifyEasebuzzPayment({
            recordId: paymentRecord.recordId,
            txnid: response?.txnid || paymentRecord.txnid || '',
            status: 'pending'
          })
        );
      } catch {}
      this.zone.run(() => {
        this.statusMessage = 'Payment confirmation is pending. Please check again.';
        this.errorMessage = '';
        this.isVerifying = false;
        this.isSubmitting = false;
        this.isGatewayOpen = false;
        this.cdr.detectChanges();
      });
    } else {
      const failureReason = response?.error_Message || response?.error || 'Payment failed.';
      try {
        await firstValueFrom(
          this.paymentService.verifyEasebuzzPayment({
            recordId: paymentRecord.recordId,
            txnid: response?.txnid || paymentRecord.txnid || '',
            status: 'failed',
            error_Message: failureReason
          })
        );
      } catch {}
      this.zone.run(() => {
        this.errorMessage = `Payment could not be completed: ${failureReason}. Your cart items are preserved.`;
        this.statusMessage = '';
        this.isVerifying = false;
        this.isSubmitting = false;
        this.isGatewayOpen = false;
        this.cdr.detectChanges();
      });
    }
  }

  private async loadEasebuzzScript(): Promise<void> {
    if (typeof window !== 'undefined' && (window as any).EasebuzzCheckout) {
      return;
    }
    if (this.easebuzzScript) {
      return this.easebuzzScript;
    }

    this.easebuzzScript = new Promise<void>((resolve) => {
      if (typeof window === 'undefined') {
        resolve();
        return;
      }
      if ((window as any).EasebuzzCheckout) {
        resolve();
        return;
      }

      const existing = this.document.querySelector('script[src*="easebuzz-checkout.js"]');
      if (existing) {
        let count = 0;
        const checkInterval = setInterval(() => {
          count++;
          if ((window as any).EasebuzzCheckout) {
            clearInterval(checkInterval);
            resolve();
          } else if (count > 25) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      const script = this.document.createElement('script');
      script.src = 'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/easebuzz-checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        resolve();
      };
      this.document.head.appendChild(script);
    });

    return this.easebuzzScript;
  }



  private async recordPaymentFailure(recordId: string, reason: string): Promise<void> {
    this.isSubmitting = true;
    try {
      await firstValueFrom(
        this.paymentService.recordFailure(recordId, reason)
      );
      this.errorMessage = reason.includes('cancelled')
        ? 'Payment was cancelled. Your cart items are saved so you can try again.'
        : `Payment could not be completed: ${reason}. Your cart items are preserved.`;
      this.statusMessage = '';
    } catch (error) {
      this.errorMessage = 'Payment was not completed. Your cart items are saved so you can try again.';
      this.statusMessage = '';
    } finally {
      this.isSubmitting = false;
    }
  }

  private async saveOrder(
    paymentRecord: PaymentRecordResponse,
    method: string,
    paymentStatus: string,
    orderStatus: string
  ): Promise<StoredOrder> {
    const mongoOrder = (paymentRecord as any)?.order;
    const resolvedOrderNumber = mongoOrder?.orderNumber
      ? String(mongoOrder.orderNumber).replace(/^#+/, '')
      : ((paymentRecord as any)?.orderNumber
        ? String((paymentRecord as any).orderNumber).replace(/^#+/, '')
        : (mongoOrder?._id || paymentRecord.orderId || String(Date.now())));

    const order: StoredOrder = {
      id: resolvedOrderNumber,
      customerName: this.fullName,
      mobile: this.mobile,
      email: this.email,
      address: this.address,
      city: this.city,
      state: this.state,
      pin: this.pin,
      country: this.country,
      paymentMethod: method,
      paymentStatus,
      whatsappOptIn: this.whatsappOptIn,
      paymentRecordId: paymentRecord.recordId,
      gatewayOrderId: paymentRecord.orderId || paymentRecord.txnid,
      paymentId: paymentRecord.paymentId || paymentRecord.easepayid,
      gatewayMethod: paymentRecord.gatewayMethod || method.toLowerCase(),
      orderStatus,
      total: paymentRecord.amount / 100,
      items: this.cartService.getItems().map(item => ({
        product: { ...item.product },
        quantity: item.quantity
      })),
      orderDate: mongoOrder?.createdAt || new Date().toISOString()
    };

    // Purge any local orders from localStorage - MongoDB is the only source of truth
    this.storage.removeItem('astrology_orders');
    this.clearDraftDeliveryDetails();

    this.notifications.queue(
      'order_confirmation',
      order.email,
      order.customerName,
      order.id
    );
    this.notifications.queueWhatsApp(
      'order_confirmation',
      order.mobile,
      order.customerName,
      order.whatsappOptIn,
      order.id
    );
    if (paymentStatus === 'Paid') {
      this.notifications.queue(
        'payment_confirmation',
        order.email,
        order.customerName,
        order.id
      );
      this.notifications.queueWhatsApp(
        'payment_confirmation',
        order.mobile,
        order.customerName,
        order.whatsappOptIn,
        order.id
      );
    }
    return order;
  }

  private getStockAdjustments(): StockAdjustment[] {
    return this.cartService.getItems().map(item => ({
      productId: item.product.id,
      quantity: item.quantity
    }));
  }

  finishOrder(message: string, details?: Partial<OrderConfirmedDetails>): void {
    const cartSnapshot = this.cartService.getItems().map(i => ({
      title: i.product.name,
      price: i.product.price,
      quantity: i.quantity
    }));
    const totalAmount = this.cartService.getSubtotal();

    this.cartService.clearCart();
    this.statusMessage = message;
    this.inventoryService.syncWithBackend();

    this.orderConfirmedDetails = {
      orderNumber: details?.orderNumber || 'ORD-SUCCESS',
      orderId: details?.orderId || '',
      customerName: details?.customerName || this.fullName,
      mobile: details?.mobile || this.mobile,
      email: details?.email || this.email,
      address: details?.address || this.address,
      city: details?.city || this.city,
      state: details?.state || this.state,
      pin: details?.pin || this.pin,
      country: details?.country || this.country || 'India',
      paymentMethod: details?.paymentMethod || 'Easebuzz',
      paymentStatus: details?.paymentStatus || 'Paid',
      orderStatus: details?.orderStatus || 'Order Placed',
      total: typeof details?.total === 'number' ? details.total : totalAmount,
      items: details?.items && details.items.length > 0 ? details.items : cartSnapshot,
      orderDate: details?.orderDate || new Date().toISOString()
    };
    this.cdr.detectChanges();
  }

  goToOrderHistory(): void {
    void this.router.navigate(['/order-history']);
  }

  goToTrackOrder(): void {
    const num = this.orderConfirmedDetails?.orderNumber || '';
    void this.router.navigate(['/track-order'], { queryParams: { orderId: num } });
  }

  continueShopping(): void {
    void this.router.navigate(['/products']);
  }

  private getErrorMessage(error: unknown, fallback: string): string {
    if (
      typeof error === 'object' &&
      error !== null &&
      'error' in error &&
      typeof error.error === 'object' &&
      error.error !== null &&
      'message' in error.error &&
      typeof error.error.message === 'string'
    ) {
      return error.error.message;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return fallback;
  }
}
