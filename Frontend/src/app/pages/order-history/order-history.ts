import { DatePipe, UpperCasePipe } from '@angular/common';
import { Component, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../core/services/auth.service';
import { BrowserStorageService } from '../../core/services/browser-storage.service';
import { BackendReview, ReviewService } from '../../core/services/review.service';
import { ReturnsService } from '../../core/services/returns.service';
import { environment } from '../../../environments/environment';
import { resolveImageUrl } from '../../core/utils/image-url.util';

interface HistoryOrderItem {
  productId?: string;
  product?: {
    _id?: string;
    name?: string;
    price?: number;
    image?: string;
  };
  quantity?: number;
}

interface HistoryOrder {
  id: number | string;
  orderNumber?: string;
  rawOrderId?: string;
  customerName?: string;
  email: string;
  orderStatus: string;
  orderDate?: string;
  deliveredAt?: string;
  courierName?: string;
  trackingId?: string;
  total?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  items?: HistoryOrderItem[];
}

interface HistoryUser {
  email?: string;
  role?: string;
}

export interface ReturnSelectableItem {
  productId: string;
  name: string;
  price?: number;
  image?: string;
  purchasedQuantity: number;
  returnQuantity: number;
  selected: boolean;
}

@Component({
  selector: 'app-order-history',
  standalone: true,
  imports: [DatePipe, UpperCasePipe, FormsModule, RouterLink],
  templateUrl: './order-history.html',
  styleUrl: './order-history.css'
})
export class OrderHistory {
  email = '';
  orders: HistoryOrder[] = [];
  expandedOrderIds = new Set<string>();
  errorMessage = '';
  searched = false;

  // Order Cancellation state
  cancellingOrderId: string | null = null;
  cancelReason = '';
  cancelLoading = false;
  cancelMessage = '';
  cancelError = '';

  // Order Return state
  existingReturns = new Map<string, any>();
  returningOrderId: string | null = null;
  returnReason = '';
  returnType: 'return' | 'replacement' = 'return';
  returnLoading = false;
  returnSuccess = '';
  returnError = '';

  // Product-Level Detailed Return Modal State
  returnModalOpen = false;
  selectedReturnOrder: HistoryOrder | null = null;
  selectedReturnItem: HistoryOrderItem | null = null;
  orderReturnItems: ReturnSelectableItem[] = [];
  returnQuantity = 1;
  selectedReturnReason = '';
  returnComments = '';
  evidenceFiles: File[] = [];
  evidencePreviews: Array<{ file: File; url: string; name: string; size: number }> = [];
  evidenceUploadError = '';
  returnSubmitting = false;
  returnSubmitError = '';
  submittedReturnSuccess = false;
  submittedReturnId = '';

  readonly returnReasonOptions = [
    'Product damaged',
    'Wrong product received',
    'Product defective or not working',
    'Missing items',
    'Product not as described',
    'Other'
  ];

  // Rate & Review state
  myReviews: BackendReview[] = [];
  reviewFormKey: string | null = null;
  reviewRating = 5;
  reviewComment = '';
  reviewSubmitting = false;
  reviewSuccessMsg = '';
  reviewErrorMsg = '';

  constructor(
    private storage: BrowserStorageService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private router: Router,
    authService: AuthService,
    private reviewService: ReviewService,
    private returnsService: ReturnsService
  ) {
    const currentUser = authService.getCurrentUser() as HistoryUser | null;
    this.email = currentUser?.email ?? '';

    if (currentUser || this.email) {
      this.loadHistory();
    }
  }

  loadHistory(): void {
    this.orders = [];
    this.expandedOrderIds.clear();
    this.errorMessage = '';
    this.searched = true;

    // Purge any legacy localStorage orders so only backend database is ever referenced
    this.storage.removeItem('astrology_orders');

    const normalizedEmail = this.email.trim().toLowerCase();
    this.loadMyReviews();
    this.loadMyReturns();

    const queryParam = normalizedEmail ? `?email=${encodeURIComponent(normalizedEmail)}` : '';
    this.http.get<any>(`${environment.apiUrl}/orders/mine${queryParam}`).subscribe({
      next: (res) => {
        const orderArray = res?.orders || res?.data?.orders || (Array.isArray(res?.data) ? res.data : []);
        if (Array.isArray(orderArray) && orderArray.length > 0) {
          const mappedOrders: HistoryOrder[] = orderArray.map((o: any) => {
            const rawId = String(o._id || o.id || '');
            const displayId = o.orderNumber
              ? String(o.orderNumber).replace(/^#+/, '')
              : (rawId && /^[a-f\d]{24}$/i.test(rawId) ? `ORD-${rawId.slice(-4).toUpperCase()}` : rawId);
            return {
              id: displayId,
              orderNumber: o.orderNumber || displayId,
              rawOrderId: rawId,
              customerName: o.shippingAddress?.fullName || 'Customer',
              email: o.shippingAddress?.email || this.email,
              orderStatus: this.normalizeStatus(o.status || o.orderStatus),
              orderDate: o.createdAt,
              deliveredAt: o.deliveredAt,
              courierName: o.courierName || o.shipment?.provider || '',
              trackingId: o.trackingId || o.shipment?.awb || o.shipment?.shipmentId || '',
              total: o.total,
              paymentMethod: o.paymentMethod || 'Online',
              paymentStatus: o.paymentStatus ? (String(o.paymentStatus).charAt(0).toUpperCase() + String(o.paymentStatus).slice(1)) : 'Pending',
              items: (o.items || []).map((item: any) => {
                const prodId = String(item.product?._id || item.product || '');
                const prodImg = resolveImageUrl(item.image || item.product?.imageUrl || item.product?.images?.[0] || item.product?.image || '/api/products/placeholder');
                return {
                  productId: prodId,
                  product: {
                    _id: prodId,
                    name: item.name || item.product?.name || 'Product',
                    price: item.price !== undefined ? item.price : item.product?.price,
                    image: prodImg
                  },
                  quantity: item.quantity
                };
              })
            };
          });

          this.orders = mappedOrders;
        } else {
          this.orders = [];
        }

        this.cdr.detectChanges();
      },
      error: (err) => {
        this.orders = [];
        this.errorMessage = err?.status === 401 
          ? 'Please log in to view your order history.' 
          : 'Could not load orders from server. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }






  // -------------------------------------------------------------
  // Review Methods
  // -------------------------------------------------------------

  loadMyReviews(): void {
    this.reviewService.getMyReviews().subscribe({
      next: (res) => {
        this.myReviews = res?.reviews || [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.myReviews = [];
        this.cdr.detectChanges();
      }
    });
  }

  getReviewForProduct(productId?: string): BackendReview | undefined {
    if (!productId) return undefined;
    return this.myReviews.find(r => {
      const p = r.product;
      const id = typeof p === 'object' && p !== null ? (p._id || p.id) : p;
      return String(id) === String(productId);
    });
  }

  isOrderDelivered(order: HistoryOrder): boolean {
    return String(order.orderStatus || '').trim().toLowerCase() === 'delivered';
  }

  openReviewForm(order: HistoryOrder, item: HistoryOrderItem): void {
    const prodId = item.productId || item.product?._id;
    if (!prodId) return;
    this.reviewFormKey = `${order.id}_${prodId}`;
    this.reviewRating = 5;
    this.reviewComment = '';
    this.reviewErrorMsg = '';
    this.reviewSuccessMsg = '';
  }

  closeReviewForm(): void {
    this.reviewFormKey = null;
    this.reviewErrorMsg = '';
    this.reviewSuccessMsg = '';
  }

  isReviewFormOpen(order: HistoryOrder, item: HistoryOrderItem): boolean {
    const prodId = item.productId || item.product?._id;
    return this.reviewFormKey === `${order.id}_${prodId}`;
  }

  submitProductReview(order: HistoryOrder, item: HistoryOrderItem): void {
    const prodId = item.productId || item.product?._id;
    if (!prodId) {
      this.reviewErrorMsg = 'Valid product identifier not found.';
      return;
    }
    if (this.reviewRating < 1 || this.reviewRating > 5) {
      this.reviewErrorMsg = 'Please select a rating from 1 to 5 stars.';
      return;
    }
    if (!this.reviewComment || this.reviewComment.trim().length < 5) {
      this.reviewErrorMsg = 'Please share your review with at least 5 characters.';
      return;
    }

    this.reviewSubmitting = true;
    this.reviewErrorMsg = '';
    this.reviewSuccessMsg = '';

    const orderIdParam = order.rawOrderId || String(order.id);

    this.reviewService.submitReview(
      String(prodId),
      this.reviewRating,
      this.reviewComment.trim(),
      orderIdParam
    ).subscribe({
      next: () => {
        this.reviewSubmitting = false;
        this.reviewSuccessMsg = 'Review saved successfully!';
        this.loadMyReviews();
        setTimeout(() => {
          this.closeReviewForm();
          this.cdr.detectChanges();
        }, 1200);
      },
      error: (err) => {
        this.reviewSubmitting = false;
        this.reviewErrorMsg = err?.error?.message || 'Failed to save review. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }


  // -------------------------------------------------------------
  // Order Status & Cancellation Logic
  // -------------------------------------------------------------

  canCancelOrder(order: HistoryOrder): boolean {
    const status = String(order.orderStatus || '').trim().toLowerCase();
    return status === 'order placed' || status === 'placed' || status === 'awaiting_payment';
  }

  isCancellationDisabled(order: HistoryOrder): boolean {
    const status = String(order.orderStatus || '').trim().toLowerCase();
    return (
      status === 'confirmed' ||
      status === 'processing' ||
      status === 'packed' ||
      status === 'in preparation' ||
      status === 'pickup_requested'
    );
  }

  openCancelPrompt(orderId: number | string): void {
    this.cancellingOrderId = String(orderId);
    this.cancelReason = '';
    this.cancelMessage = '';
    this.cancelError = '';
  }

  closeCancelPrompt(): void {
    this.cancellingOrderId = null;
    this.cancelReason = '';
    this.cancelMessage = '';
    this.cancelError = '';
  }

  confirmCancelOrder(order: HistoryOrder): void {
    if (this.cancelLoading) return;
    this.cancelLoading = true;
    this.cancelError = '';
    this.cancelMessage = '';

    const orderIdToCancel = order.rawOrderId || String(order.id);
    this.http.post<any>(`${environment.apiUrl}/orders/${orderIdToCancel}/cancel`, {
      reason: this.cancelReason.trim() || undefined
    }).subscribe({
      next: (res) => {
        this.cancelLoading = false;
        this.cancelMessage = res?.message || `Order #${order.id} was successfully cancelled.`;
        order.orderStatus = 'Cancelled';
        this.closeCancelPrompt();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.cancelLoading = false;
        this.cancelError = err?.error?.message || 'Failed to cancel order. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  // -------------------------------------------------------------
  // Order Return Workflow (Delivered Orders)
  // -------------------------------------------------------------

  loadMyReturns(): void {
    this.returnsService.getMyReturnsApi().subscribe({
      next: (res) => {
        const returns = res?.returns || [];
        this.existingReturns.clear();
        for (const ret of returns) {
          const rawId = String(ret.order?._id || (typeof ret.order === 'string' ? ret.order : '') || '');
          const ordId = String(ret.order?.id || '');
          const ordNum = String(ret.order?.orderNumber || '');
          const cleanOrdNum = ordNum.replace(/^#+/, '');

          if (rawId) this.existingReturns.set(rawId, ret);
          if (ordId) this.existingReturns.set(ordId, ret);
          if (ordNum) this.existingReturns.set(ordNum, ret);
          if (cleanOrdNum) this.existingReturns.set(cleanOrdNum, ret);
          if (ret.orderId) this.existingReturns.set(String(ret.orderId), ret);
        }
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  canReturnOrder(order: HistoryOrder): boolean {
    if (!this.isOrderDelivered(order)) return false;
    const existing = this.getActiveReturn(order);
    return !(existing && existing.status !== 'rejected');
  }

  hasActiveReturn(order: HistoryOrder): boolean {
    const existing = this.getActiveReturn(order);
    return Boolean(existing && existing.status !== 'rejected');
  }

  getActiveReturn(order: HistoryOrder): any {
    const rawKey = order.rawOrderId || '';
    const idKey = String(order.id || '');
    const numKey = String(order.orderNumber || '');
    const cleanNumKey = numKey.replace(/^#+/, '');

    return (
      (rawKey && this.existingReturns.get(rawKey)) ||
      (idKey && this.existingReturns.get(idKey)) ||
      (numKey && this.existingReturns.get(numKey)) ||
      (cleanNumKey && this.existingReturns.get(cleanNumKey)) ||
      undefined
    );
  }

  openReturnPrompt(orderId: number | string): void {
    this.returningOrderId = String(orderId);
    this.returnReason = '';
    this.returnType = 'return';
    this.returnError = '';
    this.returnSuccess = '';
  }

  closeReturnPrompt(): void {
    this.returningOrderId = null;
    this.returnReason = '';
    this.returnError = '';
  }

  confirmReturnOrder(order: HistoryOrder): void {
    if (this.returnLoading) return;
    const reason = this.returnReason.trim();
    if (!reason) {
      this.returnError = 'Please provide a reason for the return.';
      return;
    }

    const orderId = order.rawOrderId || String(order.id);
    if (!orderId) {
      this.returnError = 'Order ID missing.';
      return;
    }

    this.returnLoading = true;
    this.returnError = '';
    this.returnSuccess = '';

    this.returnsService.createReturnApi(orderId, reason, this.returnType).subscribe({
      next: () => {
        this.returnLoading = false;
        this.returnSuccess = `Return request submitted successfully for Order #${order.id}.`;
        this.loadMyReturns();
        this.closeReturnPrompt();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.returnLoading = false;
        this.returnError = err?.error?.message || 'Failed to submit return request. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  // -------------------------------------------------------------
  // Product-Level Detailed Return Modal Operations
  // -------------------------------------------------------------

  openOrderReturnModal(order: HistoryOrder): void {
    this.selectedReturnOrder = order;
    this.selectedReturnItem = null;
    this.orderReturnItems = (order.items || []).map((it) => {
      const prodId = String(it.productId || it.product?._id || it.product || '');
      const maxQty = Number(it.quantity || 1);
      return {
        productId: prodId,
        name: it.product?.name || 'Product',
        price: it.product?.price,
        image: it.product?.image || 'assets/placeholder.png',
        purchasedQuantity: maxQty,
        returnQuantity: maxQty,
        selected: true
      };
    });
    this.selectedReturnReason = '';
    this.returnComments = '';
    this.evidenceFiles = [];
    this.evidencePreviews = [];
    this.evidenceUploadError = '';
    this.returnSubmitError = '';
    this.submittedReturnSuccess = false;
    this.submittedReturnId = '';
    this.returnModalOpen = true;
    this.cdr.detectChanges();
  }

  toggleItemSelection(item: ReturnSelectableItem): void {
    item.selected = !item.selected;
    this.cdr.detectChanges();
  }

  adjustItemReturnQty(item: ReturnSelectableItem, delta: number): void {
    const newQty = item.returnQuantity + delta;
    if (newQty >= 1 && newQty <= item.purchasedQuantity) {
      item.returnQuantity = newQty;
      this.cdr.detectChanges();
    }
  }

  get selectedReturnItemsCount(): number {
    return this.orderReturnItems.filter(i => i.selected).length;
  }

  openProductReturnModal(order: HistoryOrder, item?: HistoryOrderItem): void {
    this.openOrderReturnModal(order);
    if (item) {
      const targetId = String(item.productId || item.product?._id || item.product || '');
      this.orderReturnItems.forEach(i => {
        i.selected = i.productId === targetId;
      });
      this.cdr.detectChanges();
    }
  }

  closeProductReturnModal(): void {
    this.returnModalOpen = false;
    this.selectedReturnOrder = null;
    this.selectedReturnItem = null;
    this.orderReturnItems = [];
    for (const preview of this.evidencePreviews) {
      URL.revokeObjectURL(preview.url);
    }
    this.evidenceFiles = [];
    this.evidencePreviews = [];
    this.evidenceUploadError = '';
    this.returnSubmitError = '';
    this.submittedReturnSuccess = false;
    this.submittedReturnId = '';
    this.cdr.detectChanges();
  }

  onEvidenceFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    this.evidenceUploadError = '';
    const files = Array.from(input.files);
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        this.evidenceUploadError = `Invalid file format "${file.name}". Please upload JPG, PNG, or WebP images only.`;
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.evidenceUploadError = `File "${file.name}" exceeds the 5MB size limit.`;
        return;
      }
    }

    if (this.evidencePreviews.length + files.length > 5) {
      this.evidenceUploadError = 'You can upload a maximum of 5 evidence photos.';
      return;
    }

    for (const file of files) {
      const url = URL.createObjectURL(file);
      this.evidenceFiles.push(file);
      this.evidencePreviews.push({
        file,
        url,
        name: file.name,
        size: Math.round(file.size / 1024)
      });
    }

    input.value = '';
    this.cdr.detectChanges();
  }

  removeEvidencePreview(index: number): void {
    if (index >= 0 && index < this.evidencePreviews.length) {
      URL.revokeObjectURL(this.evidencePreviews[index].url);
      this.evidencePreviews.splice(index, 1);
      this.evidenceFiles.splice(index, 1);
      this.cdr.detectChanges();
    }
  }

  submitProductReturn(): void {
    if (this.returnSubmitting) return;
    if (!this.selectedReturnOrder) return;

    const selectedItems = this.orderReturnItems.filter(it => it.selected && it.returnQuantity > 0);
    if (selectedItems.length === 0) {
      this.returnSubmitError = 'Please select at least one product to return.';
      return;
    }

    if (!this.selectedReturnReason) {
      this.returnSubmitError = 'Please select a reason for the return.';
      return;
    }

    if (this.evidenceFiles.length === 0) {
      this.returnSubmitError = 'Please upload at least one evidence image showing the product issue.';
      return;
    }

    this.returnSubmitting = true;
    this.returnSubmitError = '';

    const order = this.selectedReturnOrder;
    const orderId = order.rawOrderId || String(order.id);

    // Step 1: Upload evidence files to PostgreSQL BYTEA via returns service
    this.returnsService.uploadEvidence(this.evidenceFiles).subscribe({
      next: (uploadRes) => {
        const uploadedImages = uploadRes?.images || [];
        // Step 2: Submit return request to PostgreSQL with chosen products and quantities
        this.returnsService.submitReturnRequest({
          orderId,
          reason: this.selectedReturnReason,
          comments: this.returnComments.trim() || undefined,
          type: 'return',
          evidenceImages: uploadedImages,
          items: selectedItems.map(it => ({
            product: it.productId,
            quantity: it.returnQuantity
          }))
        }).subscribe({
          next: (returnRes) => {
            this.returnSubmitting = false;
            this.submittedReturnSuccess = true;
            this.submittedReturnId = returnRes.return?.id || returnRes.return?._id || returnRes.id || `RET-${Date.now()}`;
            this.loadMyReturns();
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.returnSubmitting = false;
            this.returnSubmitError = err?.error?.message || 'Failed to submit return request. Please try again.';
            this.cdr.detectChanges();
          }
        });
      },
      error: (err) => {
        this.returnSubmitting = false;
        this.returnSubmitError = err?.error?.message || 'Failed to upload evidence images. Please check file format and size.';
        this.cdr.detectChanges();
      }
    });
  }

  viewReturnStatus(): void {
    this.closeProductReturnModal();
    this.router.navigate(['/returns']);
  }

  isItemReturnEligible(order: HistoryOrder, item: HistoryOrderItem): boolean {
    if (!this.isOrderDelivered(order)) return false;
    const existing = this.getActiveReturn(order);
    if (!existing) return true;
    if (existing.status === 'rejected' || existing.status === 'Rejected') return false;
    return false;
  }

  getItemReturn(order: HistoryOrder, item: HistoryOrderItem): any {
    return this.getActiveReturn(order);
  }

  private normalizeStatus(status?: string): string {
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
    return map[clean] || (status.charAt(0).toUpperCase() + status.slice(1));
  }

  toggleOrderDetails(orderId: number | string): void {
    const key = String(orderId);
    if (this.expandedOrderIds.has(key)) {
      this.expandedOrderIds.delete(key);
    } else {
      this.expandedOrderIds.add(key);
    }
  }

  isExpanded(orderId: number | string): boolean {
    return this.expandedOrderIds.has(String(orderId));
  }
}
