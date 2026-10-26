import { DatePipe, CommonModule } from '@angular/common';
import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  RefundMethod,
  RefundStatus,
  ReturnEvidenceImage,
  ReturnProductItem,
  ReturnRequest,
  ReturnRequestStatus,
  ReturnStatusHistoryEntry,
  ReturnsPolicy,
  ReturnsService,
  ReturnType as ReturnKind
} from '../../core/services/returns.service';
import { NotificationService } from '../../core/services/notification.service';
import { resolveImageUrl } from '../../core/utils/image-url.util';

export interface ManagedReturn extends ReturnRequest {
  products: { name: string; quantity: number; price?: number; image?: string }[];
  comments?: string;
  evidenceImages?: ReturnEvidenceImage[];
  statusHistory?: ReturnStatusHistoryEntry[];
  adminMessage?: string;
  rejectionReason?: string;
  refundGateway?: string;
  refundError?: string;
  isRestocked?: boolean;
  restockedAt?: string;
  nextStatus: ReturnRequestStatus;
  nextRefundStatus: RefundStatus;
  nextRefundAmount: number;
  nextRefundMethod: RefundMethod;
  nextRefundReference: string;
  nextReplacementTracking: string;
  nextAdminNote: string;
}

@Component({
  selector: 'app-admin-returns',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './returns.html',
  styleUrl: './returns.css'
})
export class AdminReturns implements OnInit {
  policy: ReturnsPolicy;
  requests: ManagedReturn[] = [];
  filteredRequests: ManagedReturn[] = [];
  message = '';
  errorMessage = '';
  loading = false;
  actionLoading = false;

  // Search & Filter state
  searchTerm = '';
  selectedFilter: string = 'All';

  // Details Modal state
  selectedRequest: ManagedReturn | null = null;
  adminActionMessage = '';
  rejectionInputMessage = '';
  customRefundAmount: number = 0;
  isManualRefund = false;
  manualRefundReference = '';
  manualRefundMethod: RefundMethod = 'Manual Bank Transfer';

  // Evidence Lightbox
  previewImageUrl: string | null = null;

  readonly refundStatuses: RefundStatus[] = ['Pending', 'Processing', 'Processed'];
  readonly refundMethods: RefundMethod[] = [
    'Original Payment Method',
    'Manual Bank Transfer',
    'Store Credit'
  ];

  constructor(
    private returnsService: ReturnsService,
    private notifications: NotificationService,
    private cdr: ChangeDetectorRef
  ) {
    this.policy = this.returnsService.getPolicy();
  }

  ngOnInit(): void {
    this.loadRequests();
  }

  getStatuses(request: ManagedReturn): ReturnRequestStatus[] {
    return request.type === 'refund'
      ? ['Requested', 'Approved', 'Rejected', 'Refund Processing', 'Refund Processed']
      : ['Requested', 'Approved', 'Rejected', 'Replacement Processing', 'Replacement Shipped', 'Replacement Delivered'];
  }

  savePolicy(): void {
    this.message = '';
    this.errorMessage = '';
    if (!this.returnsService.savePolicy(this.policy)) {
      this.errorMessage = 'Set a positive whole-number return window when enabled, enable at least one request type, and keep the policy text under 2,000 characters.';
      return;
    }
    this.policy = this.returnsService.getPolicy();
    this.message = this.policy.enabled
      ? 'Returns policy saved and enabled.'
      : 'Returns policy saved and disabled.';
  }

  updateRequest(request: ManagedReturn): void {
    this.message = '';
    this.errorMessage = '';
    this.loading = true;

    const apiStatus = this.mapStatusToApi(request.nextStatus);
    const payload = {
      status: apiStatus,
      adminNote: request.nextAdminNote,
      refundReference: request.nextRefundReference,
      trackingNumber: request.nextReplacementTracking
    };

    this.returnsService.updateReturnApi(request.id, payload).subscribe({
      next: () => {
        this.loading = false;
        this.message = `Return request for order #${request.orderId} updated to ${request.nextStatus}.`;
        this.loadRequests();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err?.error?.message || 'Failed to update return request on server.';
        this.cdr.detectChanges();
      }
    });
  }

  acceptQuick(request: ManagedReturn): void {
    request.nextStatus = 'Approved';
    request.nextAdminNote = request.nextAdminNote || 'Return request approved by administrator';
    this.updateRequest(request);
  }

  rejectQuick(request: ManagedReturn): void {
    request.nextStatus = 'Rejected';
    request.nextAdminNote = request.nextAdminNote || 'Return request rejected after inspection';
    this.updateRequest(request);
  }

  refundQuick(request: ManagedReturn): void {
    request.nextStatus = 'Refund Processed';
    request.nextRefundStatus = 'Processed';
    request.nextAdminNote = request.nextAdminNote || 'Refund processed to original payment method';
    this.updateRequest(request);
  }

  loadRequests(): void {
    this.returnsService.getAdminReturnsApi().subscribe({
      next: (res) => {
        const list = res?.returns || [];
        this.requests = list.map((r: any) => {
          const orderNum = r.order?.orderNumber
            ? String(r.order.orderNumber).replace(/^#+/, '')
            : (r.order?._id || r.order || '');
          const mappedStatus = this.mapStatusFromApi(r.status, r.type);
          const mappedRefundStatus: RefundStatus = r.status === 'refunded'
            ? 'Processed'
            : (r.status === 'approved' ? 'Processing' : 'Pending');

          const products = Array.isArray(r.items) && r.items.length > 0
            ? r.items.map((i: any) => ({
                name: i.product?.name || i.name || 'Sacred Item',
                quantity: i.quantity || 1,
                price: i.product?.price || i.price,
                image: resolveImageUrl(i.product?.image || i.image)
              }))
            : (Array.isArray(r.order?.items) && r.order.items.length > 0
                ? r.order.items.map((i: any) => ({
                    name: i.name || i.product?.name || 'Sacred Item',
                    quantity: i.quantity || 1,
                    price: i.price,
                    image: resolveImageUrl(i.product?.image || i.image)
                  }))
                : []);

          const evidenceImages: ReturnEvidenceImage[] = Array.isArray(r.evidenceImages)
            ? r.evidenceImages.map((img: any) => typeof img === 'string' ? { url: img } : img)
            : [];

          return {
            id: r._id,
            orderId: orderNum,
            email: r.user?.email || '',
            customerName: r.user?.name || 'Customer',
            mobile: r.user?.mobile || '',
            whatsappOptIn: false,
            amount: r.order?.total || r.refundAmount || 0,
            refundAmount: r.refundAmount || 0,
            paymentMethod: r.order?.paymentMethod || 'Online',
            paymentStatus: r.order?.paymentStatus || 'Paid',
            type: (r.type === 'replacement' ? 'replacement' : 'refund') as ReturnKind,
            reason: r.reason,
            comments: r.comments || '',
            evidenceImages,
            products,
            status: mappedStatus,
            refundStatus: mappedRefundStatus,
            refundMethod: 'Original Payment Method' as RefundMethod,
            refundReference: r.refundReference || '',
            refundGateway: r.refundGateway || '',
            refundError: r.refundError || '',
            isRestocked: Boolean(r.isRestocked),
            restockedAt: r.restockedAt,
            replacementTracking: r.trackingNumber || '',
            requestedAt: r.createdAt,
            updatedAt: r.updatedAt,
            adminNote: r.adminNote || r.adminMessage || '',
            adminMessage: r.adminMessage || r.adminNote || '',
            rejectionReason: r.rejectionReason || '',
            statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : [],
            nextStatus: mappedStatus,
            nextRefundStatus: mappedRefundStatus,
            nextRefundAmount: r.refundAmount || 0,
            nextRefundMethod: 'Original Payment Method' as RefundMethod,
            nextRefundReference: r.refundReference || '',
            nextReplacementTracking: r.trackingNumber || '',
            nextAdminNote: r.adminNote || ''
          };
        });

        this.applyFilter();
        // If a modal is open, keep selectedRequest in sync
        if (this.selectedRequest) {
          const updated = this.requests.find(r => r.id === this.selectedRequest?.id);
          if (updated) this.selectedRequest = updated;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.errorMessage = err?.error?.message || 'Could not load return requests from server.';
        this.cdr.detectChanges();
      }
    });
  }

  setFilter(status: string): void {
    this.selectedFilter = status;
    this.applyFilter();
  }

  applyFilter(): void {
    let result = [...this.requests];

    if (this.selectedFilter !== 'All') {
      const target = this.selectedFilter.toLowerCase();
      result = result.filter(r => {
        const s = String(r.status || '').toLowerCase();
        if (target === 'accepted') return s === 'accepted' || s === 'approved';
        if (target === 'processing') return s === 'processing' || s === 'refund processing' || s === 'replacement processing';
        if (target === 'processed') return s === 'processed' || s === 'refunded' || s === 'refund processed';
        return s === target;
      });
    }

    if (this.searchTerm.trim()) {
      const term = this.searchTerm.trim().toLowerCase();
      result = result.filter(r =>
        String(r.id || '').toLowerCase().includes(term) ||
        String(r.orderId || '').toLowerCase().includes(term) ||
        String(r.customerName || '').toLowerCase().includes(term) ||
        String(r.email || '').toLowerCase().includes(term) ||
        String(r.reason || '').toLowerCase().includes(term) ||
        r.products.some(p => p.name.toLowerCase().includes(term))
      );
    }

    this.filteredRequests = result;
  }

  // -------------------------------------------------------------
  // Details Modal & Workflow Controls
  // -------------------------------------------------------------

  openDetailsModal(request: ManagedReturn): void {
    this.selectedRequest = request;
    this.adminActionMessage = '';
    this.rejectionInputMessage = '';
    this.customRefundAmount = request.refundAmount || request.amount;
    this.isManualRefund = String(request.paymentMethod).toUpperCase() === 'COD';
    this.manualRefundReference = '';
    this.manualRefundMethod = 'Manual Bank Transfer';
    this.cdr.detectChanges();
  }

  closeDetailsModal(): void {
    this.selectedRequest = null;
    this.adminActionMessage = '';
    this.rejectionInputMessage = '';
    this.cdr.detectChanges();
  }

  confirmAccept(request: ManagedReturn): void {
    this.actionLoading = true;
    this.message = '';
    this.errorMessage = '';

    const payload = {
      refundAmount: this.customRefundAmount,
      adminMessage: this.adminActionMessage.trim() || 'Return request approved by store administrator.'
    };

    this.returnsService.acceptReturn(request.id, payload).subscribe({
      next: (res) => {
        this.actionLoading = false;
        this.message = `Return request for order #${request.orderId} accepted successfully.`;
        this.loadRequests();
      },
      error: (err) => {
        this.actionLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to accept return request.';
        this.cdr.detectChanges();
      }
    });
  }

  confirmReject(request: ManagedReturn): void {
    const reason = this.rejectionInputMessage.trim();
    if (!reason) {
      this.errorMessage = 'An explanation message is required when rejecting a return request.';
      return;
    }

    this.actionLoading = true;
    this.message = '';
    this.errorMessage = '';

    this.returnsService.rejectReturn(request.id, { adminMessage: reason }).subscribe({
      next: () => {
        this.actionLoading = false;
        this.message = `Return request for order #${request.orderId} rejected.`;
        this.loadRequests();
      },
      error: (err) => {
        this.actionLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to reject return request.';
        this.cdr.detectChanges();
      }
    });
  }

  confirmProcessRefund(request: ManagedReturn): void {
    this.actionLoading = true;
    this.message = '';
    this.errorMessage = '';

    const isCod = String(request.paymentMethod).toUpperCase() === 'COD' || this.isManualRefund;
    const payload: any = {
      refundAmount: this.customRefundAmount || request.refundAmount,
      manual: isCod
    };

    if (isCod) {
      payload.refundMethod = this.manualRefundMethod;
      payload.refundReference = this.manualRefundReference.trim() || `MANUAL_${Date.now()}`;
    }

    this.returnsService.processRefund(request.id, payload).subscribe({
      next: (res) => {
        this.actionLoading = false;
        if (res.success) {
          this.message = `Refund of ₹${res.return?.refundAmount || payload.refundAmount} processed successfully (Ref: ${res.refundReference}).`;
        } else {
          this.errorMessage = `Refund attempt recorded in Processing state: ${res.error || 'Gateway error'}. You can retry.`;
        }
        this.loadRequests();
      },
      error: (err) => {
        this.actionLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to initiate refund.';
        this.cdr.detectChanges();
      }
    });
  }

  confirmRestock(request: ManagedReturn): void {
    this.actionLoading = true;
    this.message = '';
    this.errorMessage = '';

    this.returnsService.restockReturn(request.id).subscribe({
      next: (res) => {
        this.actionLoading = false;
        this.message = res.message || 'Items successfully restocked into inventory.';
        this.loadRequests();
      },
      error: (err) => {
        this.actionLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to restock inventory.';
        this.cdr.detectChanges();
      }
    });
  }

  sendAdminMessage(request: ManagedReturn): void {
    const text = this.adminActionMessage.trim();
    if (!text) return;

    this.actionLoading = true;
    this.returnsService.sendAdminMessage(request.id, text).subscribe({
      next: () => {
        this.actionLoading = false;
        this.message = 'Message sent to customer.';
        this.adminActionMessage = '';
        this.loadRequests();
      },
      error: (err) => {
        this.actionLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to send message.';
        this.cdr.detectChanges();
      }
    });
  }

  openEvidencePreview(url: string): void {
    this.previewImageUrl = resolveImageUrl(url);
  }

  closeEvidencePreview(): void {
    this.previewImageUrl = null;
  }

  resolveImg(url?: string): string {
    return resolveImageUrl(url);
  }

  private mapStatusFromApi(status: string, type: string = 'return'): ReturnRequestStatus {
    const s = String(status || '').toLowerCase();
    const isReplacement = String(type).toLowerCase() === 'replacement';

    if (s === 'requested') return 'Requested';
    if (s === 'approved' || s === 'accepted') return 'Accepted';
    if (s === 'rejected') return 'Rejected';

    if (isReplacement) {
      if (s === 'picked_up') return 'Replacement Processing';
      if (s === 'in_transit') return 'Replacement Shipped';
      if (s === 'received') return 'Replacement Delivered';
      return 'Replacement Processing';
    } else {
      if (s === 'refunded' || s === 'processed') return 'Processed';
      if (s === 'processing' || s === 'picked_up' || s === 'in_transit' || s === 'received') return 'Processing';
      return 'Processing';
    }
  }

  private mapStatusToApi(status: ReturnRequestStatus): string {
    switch (status) {
      case 'Requested': return 'requested';
      case 'Accepted':
      case 'Approved': return 'approved';
      case 'Rejected': return 'rejected';
      case 'Processing':
      case 'Refund Processing': return 'in_transit';
      case 'Processed':
      case 'Refund Processed': return 'refunded';
      case 'Replacement Processing': return 'picked_up';
      case 'Replacement Shipped': return 'in_transit';
      case 'Replacement Delivered': return 'received';
      default: return 'requested';
    }
  }
}
