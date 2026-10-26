import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BackendReview {
  _id: string;
  product: {
    _id?: string;
    id?: string | number;
    name?: string;
    price?: number;
    image?: string;
    images?: string[];
    slug?: string;
    sku?: string;
  } | string;
  user: {
    _id?: string;
    name?: string;
    email?: string;
    mobile?: string;
  } | string;
  order?: {
    _id?: string;
    orderNumber?: string;
    status?: string;
    deliveredAt?: string;
    total?: number;
  } | string;
  verifiedPurchase?: boolean;
  rating: number;
  comment?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt?: string;
}

export interface ReviewsResponse {
  reviews: BackendReview[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface ReviewModerationResponse {
  reviews: BackendReview[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
  stats?: {
    total: number;
    approved: number;
    pending: number;
    rejected: number;
    averageRating: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ReviewService {
  get apiUrl(): string {
    return environment.apiUrl;
  }

  constructor(private http: HttpClient) {}

  getProductReviews(productId: string): Observable<ReviewsResponse> {
    return this.http.get<ReviewsResponse>(`${this.apiUrl}/reviews/product/${productId}`);
  }

  getMyReviews(): Observable<{ reviews: BackendReview[] }> {
    return this.http.get<{ reviews: BackendReview[] }>(`${this.apiUrl}/reviews/mine`);
  }

  submitReview(
    productId: string,
    rating: number,
    comment?: string,
    orderId?: string
  ): Observable<BackendReview> {
    const payload: { product: string; rating: number; comment?: string; orderId?: string } = {
      product: productId,
      rating
    };
    if (comment !== undefined) {
      payload.comment = comment;
    }
    if (orderId) {
      payload.orderId = orderId;
    }
    return this.http.post<BackendReview>(`${this.apiUrl}/reviews`, payload);
  }

  updateReview(id: string, rating: number, comment?: string): Observable<BackendReview> {
    return this.http.patch<BackendReview>(`${this.apiUrl}/reviews/${id}`, {
      rating,
      comment
    });
  }

  deleteReview(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/reviews/${id}`);
  }

  getModerationReviews(
    status?: string,
    search?: string,
    page: number = 1,
    limit: number = 50
  ): Observable<ReviewModerationResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (status && status !== 'all') {
      params = params.set('status', status);
    }
    if (search && search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<ReviewModerationResponse>(`${this.apiUrl}/reviews/moderation`, { params });
  }

  moderateReview(id: string, status: 'pending' | 'approved' | 'rejected'): Observable<BackendReview> {
    return this.http.patch<BackendReview>(`${this.apiUrl}/reviews/${id}/moderate`, { status });
  }
}

