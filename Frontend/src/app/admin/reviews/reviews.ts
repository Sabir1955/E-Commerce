import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReviewService, BackendReview } from '../../core/services/review.service';

@Component({
  selector: 'app-admin-reviews',
  standalone: true,
  imports: [DatePipe, UpperCasePipe, FormsModule],
  templateUrl: './reviews.html',
  styleUrl: './reviews.css'
})
export class AdminReviews implements OnInit {
  reviews: BackendReview[] = [];
  loading = false;
  selectedStatus: 'all' | 'approved' | 'pending' | 'rejected' = 'all';
  searchQuery = '';
  currentPage = 1;
  totalPages = 1;
  totalReviews = 0;

  stats = {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    averageRating: 0
  };

  alertMessage = '';
  alertType: 'success' | 'error' = 'success';

  constructor(
    private reviewService: ReviewService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadReviews();
  }

  loadReviews(): void {
    this.loading = true;
    this.reviewService.getModerationReviews(
      this.selectedStatus,
      this.searchQuery,
      this.currentPage,
      50
    ).subscribe({
      next: (res) => {
        this.loading = false;
        this.reviews = res.reviews || [];
        if (res.pagination) {
          this.currentPage = res.pagination.page;
          this.totalPages = res.pagination.pages || 1;
          this.totalReviews = res.pagination.total;
        }
        if (res.stats) {
          this.stats = res.stats;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.showAlert(err?.error?.message || 'Failed to load reviews from database', 'error');
        this.cdr.detectChanges();
      }
    });
  }

  setStatusFilter(status: 'all' | 'approved' | 'pending' | 'rejected'): void {
    this.selectedStatus = status;
    this.currentPage = 1;
    this.loadReviews();
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadReviews();
  }

  updateReviewStatus(review: BackendReview, newStatus: 'approved' | 'pending' | 'rejected'): void {
    if (review.status === newStatus) return;
    this.reviewService.moderateReview(review._id, newStatus).subscribe({
      next: (updated) => {
        review.status = updated.status;
        this.showAlert(`Review status updated to ${newStatus}.`, 'success');
        this.loadReviews();
      },
      error: (err) => {
        this.showAlert(err?.error?.message || 'Failed to update review status', 'error');
      }
    });
  }

  deleteReview(review: BackendReview): void {
    if (!confirm('Are you sure you want to permanently delete this review from the database?')) {
      return;
    }
    this.reviewService.deleteReview(review._id).subscribe({
      next: () => {
        this.showAlert('Review deleted permanently.', 'success');
        this.loadReviews();
      },
      error: (err) => {
        this.showAlert(err?.error?.message || 'Failed to delete review', 'error');
      }
    });
  }

  getProductName(product: any): string {
    if (!product) return 'Unknown Product';
    return typeof product === 'object' && product.name ? product.name : String(product);
  }

  getProductSku(product: any): string {
    if (!product || typeof product !== 'object') return '';
    return product.sku || '';
  }

  getUserName(user: any): string {
    if (!user) return 'Anonymous Devotee';
    return typeof user === 'object' && user.name ? user.name : 'Customer';
  }

  getUserEmail(user: any): string {
    if (!user || typeof user !== 'object') return '';
    return user.email || '';
  }

  getOrderNumber(order: any): string {
    if (!order) return '';
    if (typeof order === 'object' && order.orderNumber) {
      return String(order.orderNumber).replace(/^#+/, '');
    }
    const str = String(order).replace(/^#+/, '');
    if (/^[a-f\d]{24}$/i.test(str)) {
      return `ORD-${str.slice(-4).toUpperCase()}`;
    }
    return str;
  }

  showAlert(message: string, type: 'success' | 'error'): void {
    this.alertMessage = message;
    this.alertType = type;
    this.cdr.detectChanges();
    setTimeout(() => {
      this.alertMessage = '';
      this.cdr.detectChanges();
    }, 4000);
  }
}
