import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface ZodiacSign {
  sign: string;
  symbol: string;
  element: string;
  dates: string;
  ruler: string;
}

export interface DailyHoroscope {
  id: string;
  horoscopeDate: string;
  zodiacSign: string;
  prediction: string;
  love?: string;
  career?: string;
  finance?: string;
  health?: string;
  luckyNumber?: string;
  luckyColor?: string;
  imageUrl?: string;
  language: string;
  status: 'Published' | 'Draft';
  createdAt?: string;
  updatedAt?: string;
}

export interface TodayHoroscopeResponse {
  date: string;
  isLatestAvailable?: boolean;
  horoscopes: DailyHoroscope[];
}

@Injectable({
  providedIn: 'root'
})
export class HoroscopeService {
  private readonly apiUrl = `${environment.apiUrl}/horoscope`;

  constructor(private http: HttpClient) {}

  getZodiacSigns(): Observable<ZodiacSign[]> {
    return this.http.get<{ data: ZodiacSign[] }>(`${this.apiUrl}/signs`).pipe(
      map(res => res.data || [])
    );
  }

  getTodayHoroscopes(sign?: string, date?: string): Observable<TodayHoroscopeResponse> {
    let params = new HttpParams();
    if (sign) params = params.set('sign', sign);
    if (date) params = params.set('date', date);

    return this.http.get<{ data: TodayHoroscopeResponse }>(`${this.apiUrl}/today`, { params }).pipe(
      map(res => res.data)
    );
  }

  // Admin CMS Methods
  getAdminHoroscopes(paramsData?: { date?: string; sign?: string; status?: string; limit?: number; offset?: number }): Observable<{ horoscopes: DailyHoroscope[]; total: number }> {
    let params = new HttpParams();
    if (paramsData?.date) params = params.set('date', paramsData.date);
    if (paramsData?.sign) params = params.set('sign', paramsData.sign);
    if (paramsData?.status) params = params.set('status', paramsData.status);
    if (paramsData?.limit) params = params.set('limit', String(paramsData.limit));
    if (paramsData?.offset) params = params.set('offset', String(paramsData.offset));

    return this.http.get<{ data: { horoscopes: DailyHoroscope[]; total: number } }>(`${this.apiUrl}/admin/all`, { params }).pipe(
      map(res => res.data)
    );
  }

  saveHoroscope(data: Partial<DailyHoroscope>): Observable<DailyHoroscope> {
    return this.http.post<{ data: DailyHoroscope }>(`${this.apiUrl}/admin`, data).pipe(
      map(res => res.data)
    );
  }

  updateHoroscope(id: string, data: Partial<DailyHoroscope>): Observable<DailyHoroscope> {
    return this.http.put<{ data: DailyHoroscope }>(`${this.apiUrl}/admin/${id}`, data).pipe(
      map(res => res.data)
    );
  }

  updateStatus(id: string, status: 'Published' | 'Draft'): Observable<DailyHoroscope> {
    return this.http.patch<{ data: DailyHoroscope }>(`${this.apiUrl}/admin/${id}/status`, { status }).pipe(
      map(res => res.data)
    );
  }

  deleteHoroscope(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ data: { success: boolean } }>(`${this.apiUrl}/admin/${id}`).pipe(
      map(res => res.data)
    );
  }
}
