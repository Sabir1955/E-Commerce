import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OrderItem {
  product: any;
  name?: string;
  quantity: number;
  price?: number;
}

export interface ShippingAddress {
  fullName: string;
  mobile: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderPayload {
  items: { product: string; quantity: number }[];
  shippingAddress: ShippingAddress;
  paymentMethod: 'upi' | 'card' | 'razorpay' | 'easebuzz' | 'online';
  addressId?: string;
}

export interface OrderResponse {
  _id: string;
  orderNumber?: string;
  items: OrderItem[];
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingAddress: ShippingAddress;
  createdAt: string;
}

@Injectable({
  providedIn: 'root'
})
export class OrderService {
  get apiUrl(): string {
    return environment.apiUrl;
  }

  constructor(private http: HttpClient) {}

  createOrder(payload: OrderPayload): Observable<{ order: OrderResponse; payment?: any }> {
    return this.http.post<{ order: OrderResponse; payment?: any }>(`${this.apiUrl}/orders`, payload);
  }

  getMyOrders(): Observable<{ orders: OrderResponse[] }> {
    return this.http.get<{ orders: OrderResponse[] }>(`${this.apiUrl}/orders/mine`);
  }

  getOrderById(id: string): Observable<{ order: OrderResponse }> {
    return this.http.get<{ order: OrderResponse }>(`${this.apiUrl}/orders/${id}`);
  }

  trackOrder(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/orders/${id}/tracking`);
  }

  getAllOrders(): Observable<{ orders: OrderResponse[] }> {
    return this.http.get<{ orders: OrderResponse[] }>(`${this.apiUrl}/orders`);
  }

  updateOrderStatus(orderId: string, status: string, trackingNumber?: string, carrier?: string): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/orders/${orderId}/status`, {
      status,
      trackingNumber,
      carrier
    });
  }
}
