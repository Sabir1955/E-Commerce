import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ReportPeriod {
  startDate: string;
  endDate: string;
  displayStart: string;
  displayEnd: string;
  interval: string;
}

export interface ReportSummaryComparison {
  hasPreviousData: boolean;
  totalSalesChangePct: number | null;
  totalOrdersChangePct: number | null;
  ordersDispatchedChangePct: number | null;
  ordersDeliveredChangePct: number | null;
  ordersCancelledChangePct: number | null;
  ordersPendingChangePct: number | null;
  cancellationRateChangePct: number | null;
  previousPeriod?: {
    startDate: string;
    endDate: string;
    totalOrders: number;
    ordersReceived: number;
    ordersDispatched: number;
    ordersDelivered: number;
    cancelledOrders: number;
    pendingOrders: number;
    totalSales: number;
    cancelledAmount: number;
  };
}

export interface ReportSummary {
  totalSalesRevenue: number;
  totalOrders: number;
  ordersReceived: number;
  ordersConfirmed?: number;
  ordersDispatched: number;
  ordersDelivered: number;
  cancelledOrders: number;
  pendingOrders: number;
  cancellationRate: number;
  cancelledAmount: number;
  comparison: ReportSummaryComparison;
}

export interface ReportTrendSeries {
  categories: string[];
  rawDates: string[];
  ordersReceived: number[];
  ordersConfirmed?: number[];
  ordersDispatched: number[];
  ordersDelivered: number[];
  ordersCancelled: number[];
  salesAmount: number[];
}

export interface StatusDistributionItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
  color: string;
}

export interface StatusDistribution {
  total: number;
  items: StatusDistributionItem[];
}

export interface DetailedReportRow {
  rawDate: string;
  date: string;
  shortLabel: string;
  ordersReceived: number;
  confirmed?: number;
  dispatched: number;
  delivered: number;
  cancelled: number;
  pending: number;
  salesAmount: number;
  cancelledAmount: number;
}

export interface DateWiseReportResponse {
  period: ReportPeriod;
  summary: ReportSummary;
  trendSeries: ReportTrendSeries;
  statusDistribution: StatusDistribution;
  detailedRows: DetailedReportRow[];
}

export interface DrillDownOrder {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  itemsCount: number;
  itemsSummary: string;
  total: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
  deliveredAt?: string;
  shippedAt?: string;
  courierName?: string;
  trackingId?: string;
}

export interface DrillDownOrdersResponse {
  date: string;
  rawDate: string;
  count: number;
  orders: DrillDownOrder[];
}

@Injectable({
  providedIn: 'root'
})
export class ReportService {
  get apiUrl(): string {
    return `${environment.apiUrl}/admin/reports`;
  }

  constructor(private http: HttpClient) {}

  getDateWiseReport(params: {
    startDate?: string;
    endDate?: string;
    interval?: string;
  } = {}): Observable<{ data: DateWiseReportResponse; message?: string }> {
    let httpParams = new HttpParams();
    if (params.startDate) httpParams = httpParams.set('startDate', params.startDate);
    if (params.endDate) httpParams = httpParams.set('endDate', params.endDate);
    if (params.interval) httpParams = httpParams.set('interval', params.interval);

    return this.http.get<{ data: DateWiseReportResponse; message?: string }>(
      `${this.apiUrl}/date-wise`,
      { params: httpParams }
    );
  }

  getDateWiseOrders(params: {
    date: string;
    status?: string;
  }): Observable<{ data: DrillDownOrdersResponse; message?: string }> {
    let httpParams = new HttpParams().set('date', params.date);
    if (params.status && params.status !== 'all') {
      httpParams = httpParams.set('status', params.status);
    }

    return this.http.get<{ data: DrillDownOrdersResponse; message?: string }>(
      `${this.apiUrl}/date-wise/orders`,
      { params: httpParams }
    );
  }

  exportToCsv(rows: DetailedReportRow[], filename = 'Astro_Date_Wise_Report.csv'): void {
    if (!rows || rows.length === 0) return;

    const headers = [
      'Date',
      'Orders Received',
      'Confirmed',
      'Dispatched',
      'Delivered',
      'Cancelled',
      'Pending',
      'Sales Amount (INR)',
      'Cancelled Amount (INR)'
    ];

    const csvContent = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.date}"`,
        r.ordersReceived,
        r.confirmed || 0,
        r.dispatched,
        r.delivered,
        r.cancelled,
        r.pending,
        r.salesAmount,
        r.cancelledAmount
      ].join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  exportToExcel(rows: DetailedReportRow[], filename = 'Astro_Date_Wise_Report.xls'): void {
    if (!rows || rows.length === 0) return;

    let tableHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>Sales Report</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
      <body>
        <table border="1">
          <thead>
            <tr style="background-color: #20233B; color: #FFFFFF; font-weight: bold;">
              <th>Date</th>
              <th>Orders Received</th>
              <th>Confirmed</th>
              <th>Dispatched</th>
              <th>Delivered</th>
              <th>Cancelled</th>
              <th>Pending</th>
              <th>Sales Amount (INR)</th>
              <th>Cancelled Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${r.date}</td>
                <td>${r.ordersReceived}</td>
                <td>${r.confirmed || 0}</td>
                <td>${r.dispatched}</td>
                <td>${r.delivered}</td>
                <td>${r.cancelled}</td>
                <td>${r.pending}</td>
                <td>${r.salesAmount}</td>
                <td>${r.cancelledAmount}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([tableHtml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}
