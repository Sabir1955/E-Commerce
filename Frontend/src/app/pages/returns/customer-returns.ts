import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe, UpperCasePipe } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReturnsService, ReturnRequest, ReturnEvidenceImage } from '../../core/services/returns.service';
import { AuthService } from '../../core/services/auth.service';
import { resolveImageUrl } from '../../core/utils/image-url.util';

@Component({
  selector: 'app-customer-returns',
  standalone: true,
  imports: [CommonModule, DatePipe, UpperCasePipe, RouterLink, FormsModule],
  templateUrl: './customer-returns.html',
  styleUrl: './customer-returns.css'
})
export class CustomerReturns implements OnInit {
  returns: any[] = [];
  filteredReturns: any[] = [];
  selectedFilter: string = 'All';
  loading = false;
  refreshing = false;
  errorMessage = '';

  // Lightbox / Image modal
  previewImageUrl: string | null = null;
  previewImageAlt: string = 'Evidence image';

  // Expanded history cards
  expandedHistoryIds = new Set<string>();

  constructor(
    private returnsService: ReturnsService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['filter']) {
        this.selectedFilter = params['filter'];
      }
      this.loadReturns();
    });
  }

  loadReturns(isRefresh = false): void {
    if (isRefresh) {
      this.refreshing = true;
    } else {
      this.loading = true;
    }
    this.errorMessage = '';

    this.returnsService.getMyReturns().subscribe({
      next: (res) => {
        this.loading = false;
        this.refreshing = false;
        const list = res?.returns || [];
        this.returns = list.map((item: any) => this.normalizeReturnItem(item));
        this.applyFilter();
        this.cdr.detectChanges();
      },
      error: () => {
        // Fallback to legacy endpoint if needed
        this.returnsService.getMyReturnsApi().subscribe({
          next: (res) => {
            this.loading = false;
            this.refreshing = false;
            const list = res?.returns || [];
            this.returns = list.map((item: any) => this.normalizeReturnItem(item));
            this.applyFilter();
            this.cdr.detectChanges();
          },
          error: (err) => {
            this.loading = false;
            this.refreshing = false;
            this.errorMessage = err?.error?.message || 'Unable to load return requests. Please try again later.';
            this.cdr.detectChanges();
          }
        });
      }
    });
  }

  setFilter(filter: string): void {
    this.selectedFilter = filter;
    this.applyFilter();
  }

  applyFilter(): void {
    if (this.selectedFilter === 'All') {
      this.filteredReturns = [...this.returns];
    } else {
      const target = this.selectedFilter.toLowerCase();
      this.filteredReturns = this.returns.filter(r => {
        const s = String(r.status || '').toLowerCase();
        if (target === 'processing') {
          return s === 'processing' || s === 'refund processing' || s === 'replacement processing';
        }
        if (target === 'processed') {
          return s === 'processed' || s === 'refund processed' || s === 'replacement delivered' || s === 'refunded';
        }
        if (target === 'accepted') {
          return s === 'accepted' || s === 'approved';
        }
        return s === target;
      });
    }
  }

  normalizeReturnItem(r: any): any {
    const rawStatus = String(r.status || 'Requested').trim();
    let normStatus = 'Requested';
    const s = rawStatus.toLowerCase();
    if (s === 'accepted' || s === 'approved') normStatus = 'Accepted';
    else if (s === 'rejected') normStatus = 'Rejected';
    else if (s === 'processing' || s === 'refund processing' || s === 'in_transit' || s === 'picked_up') normStatus = 'Processing';
    else if (s === 'processed' || s === 'refunded' || s === 'refund processed') normStatus = 'Processed';
    else normStatus = 'Requested';

    const orderNum = r.order?.orderNumber
      ? String(r.order.orderNumber)
      : (r.orderNumber || (r.orderId ? `#${r.orderId}` : `#${r.order?._id || r.order || ''}`));

    const evidenceImages: ReturnEvidenceImage[] = Array.isArray(r.evidenceImages)
      ? r.evidenceImages.map((img: any) => typeof img === 'string' ? { url: img } : img)
      : [];

    const items = Array.isArray(r.items) && r.items.length > 0
      ? r.items.map((i: any) => ({
          name: i.product?.name || i.name || 'Sacred Item',
          quantity: i.quantity || 1,
          price: i.product?.price || i.price || 0,
          image: resolveImageUrl(i.product?.image || i.image)
        }))
      : (Array.isArray(r.order?.items) && r.order.items.length > 0
          ? r.order.items.map((i: any) => ({
              name: i.name || i.product?.name || 'Sacred Item',
              quantity: i.quantity || 1,
              price: i.price || 0,
              image: resolveImageUrl(i.product?.image || i.image)
            }))
          : []);

    return {
      ...r,
      id: r.id || r._id,
      orderNumber: orderNum,
      status: normStatus,
      rawStatus,
      evidenceImages,
      items,
      createdAt: r.createdAt || r.requestedAt || new Date().toISOString(),
      adminMessage: r.adminMessage || r.adminNote || '',
      rejectionReason: r.rejectionReason || (normStatus === 'Rejected' ? r.adminMessage || r.adminNote : ''),
      refundAmount: Number(r.refundAmount || 0),
      refundGateway: r.refundGateway || (r.paymentMethod || 'Online Payment'),
      refundReference: r.refundReference || '',
      statusHistory: Array.isArray(r.statusHistory) ? r.statusHistory : []
    };
  }

  resolveImg(url?: string): string {
    return resolveImageUrl(url);
  }

  openPreview(url: string, alt: string = 'Evidence'): void {
    this.previewImageUrl = url;
    this.previewImageAlt = alt;
  }

  closePreview(): void {
    this.previewImageUrl = null;
  }

  toggleHistory(id: string): void {
    if (this.expandedHistoryIds.has(id)) {
      this.expandedHistoryIds.delete(id);
    } else {
      this.expandedHistoryIds.add(id);
    }
  }

  isHistoryExpanded(id: string): boolean {
    return this.expandedHistoryIds.has(id);
  }

  // Timeline step helper: returns 'completed' | 'active' | 'upcoming' | 'rejected'
  getStepState(currentStatus: string, stepName: string): string {
    const s = currentStatus.toLowerCase();
    if (s === 'rejected') {
      if (stepName === 'Requested') return 'completed';
      if (stepName === 'Accepted') return 'rejected';
      return 'disabled';
    }

    const order = ['requested', 'accepted', 'processing', 'processed'];
    const currentIndex = order.indexOf(s);
    const stepIndex = order.indexOf(stepName.toLowerCase());

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'active';
    return 'upcoming';
  }
}
