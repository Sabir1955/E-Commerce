import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PaymentRequestItem {
  productId: number | string;
  quantity: number;
}

export interface PaymentRecordResponse {
  recordId: string;
  status: 'created' | 'verification_pending' | 'paid' | 'failed' | 'verification_failed' | 'cancelled' | 'usercancelled' | 'pending';
  paymentMethod?: 'razorpay' | 'easebuzz';
  gatewayMethod?: string;
  amount: number;
  currency: 'INR';
  orderId?: string;
  paymentId?: string;
  keyId?: string;
  accessKey?: string;
  txnid?: string;
  easepayid?: string;
  payUrl?: string;
  simulated?: boolean;
  gatewayError?: string;
  message?: string;
  orderNumber?: string;
  dbOrderId?: string;
  order?: any;
}

export interface RazorpayPaymentDetails {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface EasebuzzPaymentDetails {
  recordId: string;
  txnid: string;
  status: string;
  easepayid?: string;
  amount?: number;
  hash?: string;
  error_Message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  createOrder(
    items: PaymentRequestItem[],
    shippingAddress?: any,
    gateway: 'easebuzz' = 'easebuzz'
  ): Observable<PaymentRecordResponse> {
    return this.http.post<PaymentRecordResponse>(
      `${this.apiUrl}/payments/create-order`,
      { items, shippingAddress, gateway: 'easebuzz' }
    );
  }

  verifyPayment(
    recordId: string,
    payment: RazorpayPaymentDetails
  ): Observable<PaymentRecordResponse> {
    return this.http.post<PaymentRecordResponse>(
      `${this.apiUrl}/payments/verify`,
      {
        recordId,
        orderId: payment.razorpay_order_id,
        paymentId: payment.razorpay_payment_id,
        signature: payment.razorpay_signature
      }
    );
  }

  verifyEasebuzzPayment(
    paymentDetails: EasebuzzPaymentDetails
  ): Observable<PaymentRecordResponse> {
    return this.http.post<any>(
      `${this.apiUrl}/consultations/verify-payment`,
      paymentDetails
    ).pipe(
      map(res => {
        const data = res?.data || res;
        return {
          ...data,
          status: data.status || (res?.success ? 'paid' : 'failed')
        } as PaymentRecordResponse;
      })
    );
  }

  recordFailure(recordId: string, reason: string): Observable<PaymentRecordResponse> {
    return this.http.post<PaymentRecordResponse>(
      `${this.apiUrl}/payments/failure`,
      { recordId, reason }
    );
  }
}
