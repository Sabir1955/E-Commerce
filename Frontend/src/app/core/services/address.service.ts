import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UserAddress {
  _id?: string;
  fullName: string;
  mobile: string;
  useRegisteredMobile?: boolean;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault?: boolean;
  user?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AddressResponse {
  addresses?: UserAddress[];
  data?: {
    addresses?: UserAddress[];
  };
  pagination?: any;
}

@Injectable({
  providedIn: 'root'
})
export class AddressService {
  get apiUrl(): string {
    return environment.apiUrl;
  }

  constructor(private http: HttpClient) {}

  getAddresses(): Observable<AddressResponse> {
    return this.http.get<AddressResponse>(`${this.apiUrl}/addresses`);
  }

  createAddress(payload: Partial<UserAddress>): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/addresses`, payload);
  }

  updateAddress(id: string, payload: Partial<UserAddress>): Observable<any> {
    return this.http.patch<any>(`${this.apiUrl}/addresses/${id}`, payload);
  }

  deleteAddress(id: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/addresses/${id}`);
  }
}
