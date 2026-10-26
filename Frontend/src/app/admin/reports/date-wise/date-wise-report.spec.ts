import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { DateWiseReport } from './date-wise-report';
import { ReportService, DateWiseReportResponse, DrillDownOrdersResponse } from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';

describe('DateWiseReport Component', () => {
  let fixture: ComponentFixture<DateWiseReport>;
  let component: DateWiseReport;
  let reportServiceMock: any;
  let authServiceMock: any;

  const mockReportData: DateWiseReportResponse = {
    period: {
      startDate: '2026-10-01',
      endDate: '2026-10-10',
      displayStart: '01 Oct 2026',
      displayEnd: '10 Oct 2026',
      interval: 'daily'
    },
    summary: {
      totalSalesRevenue: 125000,
      totalOrders: 65,
      ordersReceived: 65,
      ordersDispatched: 25,
      ordersDelivered: 20,
      cancelledOrders: 5,
      pendingOrders: 15,
      cancellationRate: 7.69,
      cancelledAmount: 8500,
      comparison: {
        hasPreviousData: true,
        totalSalesChangePct: 14.2,
        totalOrdersChangePct: 8.5,
        ordersDispatchedChangePct: 12.0,
        ordersDeliveredChangePct: 18.5,
        ordersCancelledChangePct: -4.2,
        ordersPendingChangePct: -2.0,
        cancellationRateChangePct: -1.1
      }
    },
    trendSeries: {
      categories: ['01 Oct', '02 Oct', '03 Oct'],
      rawDates: ['2026-10-01', '2026-10-02', '2026-10-03'],
      ordersReceived: [15, 20, 30],
      ordersDispatched: [5, 10, 10],
      ordersDelivered: [4, 8, 8],
      ordersCancelled: [1, 2, 2],
      salesAmount: [25000, 45000, 55000]
    },
    statusDistribution: {
      total: 65,
      items: [
        { status: 'delivered', label: 'Delivered', count: 20, percentage: 30.8, color: '#10b981' },
        { status: 'shipped', label: 'Dispatched / In Transit', count: 25, percentage: 38.5, color: '#3b82f6' },
        { status: 'pending', label: 'Processing / Pending', count: 15, percentage: 23.1, color: '#f59e0b' },
        { status: 'cancelled', label: 'Cancelled', count: 5, percentage: 7.7, color: '#ef4444' }
      ]
    },
    detailedRows: [
      {
        rawDate: '2026-10-03',
        date: '03 Oct 2026',
        shortLabel: 'Sat, 03 Oct',
        ordersReceived: 30,
        dispatched: 10,
        delivered: 8,
        cancelled: 2,
        pending: 10,
        salesAmount: 55000,
        cancelledAmount: 3200
      },
      {
        rawDate: '2026-10-02',
        date: '02 Oct 2026',
        shortLabel: 'Fri, 02 Oct',
        ordersReceived: 20,
        dispatched: 10,
        delivered: 8,
        cancelled: 2,
        pending: 0,
        salesAmount: 45000,
        cancelledAmount: 2800
      }
    ]
  };

  const mockDrillDownData: DrillDownOrdersResponse = {
    date: '03 Oct 2026',
    rawDate: '2026-10-03',
    count: 1,
    orders: [
      {
        _id: 'ord-101',
        orderNumber: 'ORD-2026-1001',
        customerName: 'Aarav Sharma',
        customerEmail: 'aarav@example.com',
        customerMobile: '9876543210',
        itemsCount: 2,
        itemsSummary: 'Rudraksha Mala, Brass Diya',
        total: 4500,
        status: 'Delivered',
        paymentStatus: 'PAID',
        paymentMethod: 'UPI',
        createdAt: '2026-10-03T10:30:00.000Z',
        deliveredAt: '2026-10-03T15:00:00.000Z'
      }
    ]
  };

  beforeEach(async () => {
    localStorage.setItem(
      'astrology_current_user',
      JSON.stringify({ id: 'adm-1', name: 'Master Astrologer', email: 'master@jyotish.com', role: 'admin' })
    );

    reportServiceMock = {
      getDateWiseReport: vi.fn().mockReturnValue(of({ success: true, data: mockReportData })),
      getDateWiseOrders: vi.fn().mockReturnValue(of({ success: true, data: mockDrillDownData })),
      exportToCsv: vi.fn(),
      exportToExcel: vi.fn()
    };

    authServiceMock = {
      getCurrentUser: vi.fn().mockReturnValue({ id: 'adm-1', name: 'Master Astrologer', email: 'master@jyotish.com', role: 'admin' }),
      logout: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [DateWiseReport],
      providers: [
        provideRouter([]),
        { provide: ReportService, useValue: reportServiceMock },
        { provide: AuthService, useValue: authServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DateWiseReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    localStorage.clear();
  });

  it('should create DateWiseReport component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the cosmic header with title and celestial brand banner', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.page-title')?.textContent).toContain('Date-wise Orders & Sales Report');
    expect(el.querySelector('.banner-brand-name')?.textContent).toContain('ASTRO NIRVAN');
    expect(el.querySelector('.page-subtitle')?.textContent).toContain('Track your business performance');
  });

  it('should call getDateWiseReport on init and render 6 KPI cards with formatted values', () => {
    expect(reportServiceMock.getDateWiseReport).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll('.kpi-card');
    expect(cards.length).toBe(6);

    expect(el.textContent).toContain('Total Orders');
    expect(el.textContent).toContain('Dispatched');
    expect(el.textContent).toContain('Delivered');
    expect(el.textContent).toContain('Cancelled');
    expect(el.textContent).toContain('Pending');
    expect(el.textContent).toContain('Total Sales');
  });

  it('should render detailed date-wise rows in the data table', () => {
    const el = fixture.nativeElement as HTMLElement;
    const tableRows = el.querySelectorAll('.astro-report-table tbody tr.table-data-row');
    expect(tableRows.length).toBe(2);

    expect(tableRows[0].textContent).toContain('03 Oct 2026');
    expect(tableRows[1].textContent).toContain('02 Oct 2026');
  });

  it('should filter table rows when search input changes', () => {
    component.searchDate = '03 Oct';
    component.applyTableSearch();
    fixture.detectChanges();

    expect(component.filteredRows.length).toBe(1);
    expect(component.filteredRows[0].date).toBe('03 Oct 2026');
  });

  it('should switch quick filter and reload report data', () => {
    component.applyQuickFilter('today');
    expect(component.activeQuickFilter).toBe('today');
    expect(reportServiceMock.getDateWiseReport).toHaveBeenCalledTimes(2);
  });

  it('should switch interval to weekly or monthly and reload report data', () => {
    component.setInterval('weekly');
    expect(component.selectedInterval).toBe('weekly');
    expect(reportServiceMock.getDateWiseReport).toHaveBeenCalledTimes(2);
  });

  it('should open drill-down modal on date click and fetch drill-down orders', () => {
    component.openDrillDown('2026-10-03');
    expect(component.drillDownOpen).toBe(true);
    expect(component.selectedDateForDrillDown).toBe('2026-10-03');
    expect(reportServiceMock.getDateWiseOrders).toHaveBeenCalledWith({ date: '2026-10-03' });
    expect(component.drillDownOrders.length).toBe(1);
    expect(component.drillDownOrders[0].orderNumber).toBe('ORD-2026-1001');

    component.closeDrillDown();
    expect(component.drillDownOpen).toBe(false);
  });

  it('should trigger CSV export when exportCsv is called', () => {
    component.exportCsv();
    expect(reportServiceMock.exportToCsv).toHaveBeenCalled();
  });

  it('should trigger Excel export when exportExcel is called', () => {
    component.exportExcel();
    expect(reportServiceMock.exportToExcel).toHaveBeenCalled();
  });
});
