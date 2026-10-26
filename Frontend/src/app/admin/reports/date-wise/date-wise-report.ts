import {
  Component,
  OnInit,
  AfterViewInit,
  OnDestroy,
  Inject,
  PLATFORM_ID,
  ChangeDetectorRef,
  ElementRef,
  ViewChild
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ReportService,
  DateWiseReportResponse,
  DetailedReportRow,
  DrillDownOrder
} from '../../../core/services/report.service';
import { AuthService } from '../../../core/services/auth.service';

import * as echarts from 'echarts';

@Component({
  selector: 'app-date-wise-report',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './date-wise-report.html',
  styleUrl: './date-wise-report.css'
})
export class DateWiseReport implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('trendChartContainer') trendChartContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('donutChartContainer') donutChartContainer?: ElementRef<HTMLDivElement>;

  // Filters State
  startDate = '2026-10-01';
  endDate = '2026-10-10';
  activeQuickFilter: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'prevMonth' | 'custom' = 'last7';
  selectedInterval: 'daily' | 'weekly' | 'monthly' | 'yearly' = 'daily';

  // Table Search & Pagination
  searchDate = '';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Component State
  isLoading = false;
  isError = false;
  errorMessage = '';
  reportData: DateWiseReportResponse | null = null;
  filteredRows: DetailedReportRow[] = [];

  // Animated KPI display counters
  displaySales = 0;
  displayTotalOrders = 0;
  displayDispatched = 0;
  displayDelivered = 0;
  displayCancelled = 0;
  displayPending = 0;

  // Drill-down Modal State
  drillDownOpen = false;
  drillDownLoading = false;
  selectedDateForDrillDown = '';
  drillDownOrders: DrillDownOrder[] = [];
  filteredDrillDownOrders: DrillDownOrder[] = [];
  drillDownStatusFilter = 'all';

  // Export menu
  exportDropdownOpen = false;

  // Header real-time clock
  currentTimeString = '';
  currentDateString = '10 Oct 2026';
  private clockInterval?: any;
  private counterInterval?: any;

  // ECharts instances
  private trendChart?: echarts.ECharts;
  private donutChart?: echarts.ECharts;
  private isBrowser: boolean;
  private resizeHandler = () => this.handleResize();

  constructor(
    private reportService: ReportService,
    private authService: AuthService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.initDefaultDates();
    this.updateClock();
    if (this.isBrowser) {
      this.clockInterval = setInterval(() => this.updateClock(), 60000);
      window.addEventListener('resize', this.resizeHandler);
    }
    this.loadReport();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.reportData) {
      setTimeout(() => this.initOrUpdateCharts(), 100);
    }
  }

  ngOnDestroy(): void {
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.counterInterval) clearInterval(this.counterInterval);
    if (this.isBrowser) {
      window.removeEventListener('resize', this.resizeHandler);
    }
    this.trendChart?.dispose();
    this.donutChart?.dispose();
  }

  private updateClock(): void {
    const now = new Date();
    this.currentDateString = now.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
    this.currentTimeString = now.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  private initDefaultDates(): void {
    // Current system date reference is 2026-10-10
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 9);

    this.endDate = this.toInputDate(end);
    this.startDate = this.toInputDate(start);
  }

  private toInputDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // -------------------------------------------------------------
  // Data Loading & API Integration
  // -------------------------------------------------------------
  loadReport(): void {
    this.isLoading = true;
    this.isError = false;
    this.errorMessage = '';

    this.reportService
      .getDateWiseReport({
        startDate: this.startDate,
        endDate: this.endDate,
        interval: this.selectedInterval
      })
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          if (res?.data) {
            this.reportData = res.data;
            this.applyTableSearch();
            this.animateCounters(res.data.summary);
            if (this.isBrowser) {
              setTimeout(() => this.initOrUpdateCharts(), 50);
            }
          }
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isLoading = false;
          this.isError = true;
          this.errorMessage = err?.error?.message || 'Failed to load date-wise report from database.';
          console.error('[DateWiseReport] API Error:', err);
          this.cdr.detectChanges();
        }
      });
  }

  // -------------------------------------------------------------
  // Quick Filters
  // -------------------------------------------------------------
  applyQuickFilter(key: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'prevMonth'): void {
    this.activeQuickFilter = key;
    const now = new Date();

    if (key === 'today') {
      this.startDate = this.toInputDate(now);
      this.endDate = this.toInputDate(now);
    } else if (key === 'yesterday') {
      const yest = new Date(now);
      yest.setDate(yest.getDate() - 1);
      this.startDate = this.toInputDate(yest);
      this.endDate = this.toInputDate(yest);
    } else if (key === 'last7') {
      const past7 = new Date(now);
      past7.setDate(past7.getDate() - 6);
      this.startDate = this.toInputDate(past7);
      this.endDate = this.toInputDate(now);
    } else if (key === 'thisMonth') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      this.startDate = this.toInputDate(firstDay);
      this.endDate = this.toInputDate(now);
    } else if (key === 'prevMonth') {
      const firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);
      this.startDate = this.toInputDate(firstDayPrev);
      this.endDate = this.toInputDate(lastDayPrev);
    }

    this.loadReport();
  }

  onCustomDateChange(): void {
    this.activeQuickFilter = 'custom';
  }

  resetFilters(): void {
    this.initDefaultDates();
    this.activeQuickFilter = 'last7';
    this.selectedInterval = 'daily';
    this.searchDate = '';
    this.loadReport();
  }

  setInterval(val: 'daily' | 'weekly' | 'monthly' | 'yearly'): void {
    this.selectedInterval = val;
    this.loadReport();
  }

  // -------------------------------------------------------------
  // Table Search & Sorting
  // -------------------------------------------------------------
  applyTableSearch(): void {
    if (!this.reportData) {
      this.filteredRows = [];
      return;
    }

    let rows = [...this.reportData.detailedRows];
    if (this.searchDate.trim()) {
      const term = this.searchDate.trim().toLowerCase();
      rows = rows.filter(
        r =>
          r.date.toLowerCase().includes(term) ||
          r.rawDate.toLowerCase().includes(term) ||
          r.shortLabel.toLowerCase().includes(term)
      );
    }

    if (this.sortOrder === 'asc') {
      rows.sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());
    } else {
      rows.sort((a, b) => new Date(b.rawDate).getTime() - new Date(a.rawDate).getTime());
    }

    this.filteredRows = rows;
  }

  toggleSort(): void {
    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    this.applyTableSearch();
  }

  // -------------------------------------------------------------
  // KPI Counter Animations
  // -------------------------------------------------------------
  private animateCounters(summary: any): void {
    if (this.counterInterval) {
      clearInterval(this.counterInterval);
      this.counterInterval = null;
    }

    const targetSales = summary.totalSalesRevenue || 0;
    const targetTotal = summary.totalOrders || 0;
    const targetDispatched = summary.ordersDispatched || 0;
    const targetDelivered = summary.ordersDelivered || 0;
    const targetCancelled = summary.cancelledOrders || 0;
    const targetPending = summary.pendingOrders || 0;

    const prefersReducedMotion =
      this.isBrowser &&
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!this.isBrowser || prefersReducedMotion) {
      this.displaySales = targetSales;
      this.displayTotalOrders = targetTotal;
      this.displayDispatched = targetDispatched;
      this.displayDelivered = targetDelivered;
      this.displayCancelled = targetCancelled;
      this.displayPending = targetPending;
      this.cdr.detectChanges();
      return;
    }

    // Fast smooth count up
    const steps = 25;
    const duration = 600;
    const intervalTime = Math.floor(duration / steps);
    let currentStep = 0;

    this.counterInterval = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      this.displaySales = Math.round(targetSales * progress);
      this.displayTotalOrders = Math.round(targetTotal * progress);
      this.displayDispatched = Math.round(targetDispatched * progress);
      this.displayDelivered = Math.round(targetDelivered * progress);
      this.displayCancelled = Math.round(targetCancelled * progress);
      this.displayPending = Math.round(targetPending * progress);

      this.cdr.detectChanges();

      if (currentStep >= steps) {
        clearInterval(this.counterInterval);
        this.counterInterval = null;
        this.displaySales = targetSales;
        this.displayTotalOrders = targetTotal;
        this.displayDispatched = targetDispatched;
        this.displayDelivered = targetDelivered;
        this.displayCancelled = targetCancelled;
        this.displayPending = targetPending;
        this.cdr.detectChanges();
      }
    }, intervalTime);
  }

  // -------------------------------------------------------------
  private hasCanvasSupport(): boolean {
    if (!this.isBrowser || typeof document === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return !!(c && c.getContext && c.getContext('2d'));
    } catch {
      return false;
    }
  }

  // -------------------------------------------------------------
  // ECharts 3D Cosmic Visualizations
  // -------------------------------------------------------------
  private initOrUpdateCharts(): void {
    if (!this.isBrowser || !this.reportData || !this.hasCanvasSupport()) return;

    this.renderTrendChart();
    this.renderDonutChart();
  }

  private renderTrendChart(): void {
    if (!this.trendChartContainer?.nativeElement) return;
    const elem = this.trendChartContainer.nativeElement;

    if (!this.trendChart) {
      this.trendChart = echarts.init(elem);
      this.trendChart.on('click', (params: any) => {
        if (params && params.dataIndex !== undefined) {
          const rawDate = this.reportData?.trendSeries.rawDates[params.dataIndex];
          if (rawDate) {
            this.openDrillDown(rawDate);
          }
        }
      });
    }

    const seriesData = this.reportData!.trendSeries;
    const maxSales = Math.max(...(seriesData.salesAmount || [1000]), 1000);
    const maxOrders = Math.max(
      ...(seriesData.ordersReceived || [10]),
      ...(seriesData.ordersDispatched || [10]),
      ...(seriesData.ordersDelivered || [10]),
      10
    );

    const isMobile = this.isBrowser && window.innerWidth <= 768;

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'cross',
          crossStyle: { color: 'rgba(216, 184, 142, 0.4)' },
          lineStyle: { color: 'rgba(216, 184, 142, 0.3)', type: 'dashed' }
        },
        backgroundColor: 'rgba(11, 14, 23, 0.95)',
        borderColor: 'rgba(216, 184, 142, 0.35)',
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: '#F0E7D5', fontSize: 12, fontFamily: 'Cinzel, sans-serif' },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const header = `<div style="font-weight:700; color:#D8B88E; margin-bottom:8px; border-bottom:1px solid rgba(216,184,142,0.2); padding-bottom:4px;">✦ ${params[0].axisValue}</div>`;
          const rows = params.map((p: any) => {
            const isSales = p.seriesName === 'Sales Amount';
            const valueStr = isSales
              ? '₹ ' + Number(p.value).toLocaleString('en-IN')
              : p.value + ' orders';
            return `<div style="display:flex; justify-content:space-between; gap:20px; margin:4px 0;">
              <span>${p.marker} <span style="color:#D8B88E;">${p.seriesName}:</span></span>
              <strong style="color:${isSales ? '#FCD34D' : '#FFFFFF'};">${valueStr}</strong>
            </div>`;
          }).join('');
          return header + rows;
        }
      },
      legend: {
        type: 'scroll',
        top: 0,
        left: isMobile ? 0 : undefined,
        right: isMobile ? 0 : 120,
        icon: 'roundRect',
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: '#D8B88E', fontSize: isMobile ? 10 : 12 },
        pageTextStyle: { color: '#D8B88E' },
        pageIconColor: '#D8B88E',
        data: ['Orders Received', 'Dispatched', 'Delivered', 'Cancelled', 'Sales Amount']
      },
      grid: {
        top: 50,
        left: isMobile ? 15 : 50,
        right: isMobile ? 15 : 65,
        bottom: 35,
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: seriesData.categories,
        axisLine: { lineStyle: { color: 'rgba(216, 184, 142, 0.25)' } },
        axisLabel: { color: '#D8B88E', fontSize: 11, margin: 12 },
        axisTick: { show: false }
      },
      yAxis: [
        {
          type: 'value',
          name: 'Orders',
          nameTextStyle: { color: '#D8B88E', fontSize: 11, padding: [0, 0, 4, 0] },
          min: 0,
          max: Math.ceil(maxOrders * 1.2),
          axisLabel: { color: '#D8B88E', fontSize: 11 },
          splitLine: { lineStyle: { color: 'rgba(255, 255, 255, 0.05)', type: 'dashed' } }
        },
        {
          type: 'value',
          name: 'Sales (₹)',
          nameTextStyle: { color: '#FCD34D', fontSize: 11, padding: [0, 0, 4, 0] },
          min: 0,
          max: Math.ceil(maxSales * 1.15),
          axisLabel: {
            color: '#FCD34D',
            fontSize: 11,
            formatter: (val: number) => {
              if (val >= 100000) return '₹' + (val / 100000).toFixed(1) + 'L';
              if (val >= 1000) return '₹' + (val / 1000).toFixed(0) + 'K';
              return '₹' + val;
            }
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'Orders Received',
          type: 'bar',
          data: seriesData.ordersReceived,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#38BDF8' },
              { offset: 1, color: '#0284C7' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barMaxWidth: 16
        },
        {
          name: 'Dispatched',
          type: 'bar',
          data: seriesData.ordersDispatched,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#F59E0B' },
              { offset: 1, color: '#D97706' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barMaxWidth: 16
        },
        {
          name: 'Delivered',
          type: 'bar',
          data: seriesData.ordersDelivered,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#10B981' },
              { offset: 1, color: '#059669' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barMaxWidth: 16
        },
        {
          name: 'Cancelled',
          type: 'bar',
          data: seriesData.ordersCancelled,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: '#EF4444' },
              { offset: 1, color: '#DC2626' }
            ]),
            borderRadius: [4, 4, 0, 0]
          },
          barMaxWidth: 16
        },
        {
          name: 'Sales Amount',
          type: 'line',
          yAxisIndex: 1,
          data: seriesData.salesAmount,
          smooth: true,
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 8,
          itemStyle: {
            color: '#FCD34D',
            borderColor: '#FFFFFF',
            borderWidth: 2
          },
          lineStyle: {
            width: 3.5,
            color: '#FCD34D',
            shadowColor: 'rgba(252, 211, 77, 0.45)',
            shadowBlur: 12
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(252, 211, 77, 0.28)' },
              { offset: 1, color: 'rgba(252, 211, 77, 0.0)' }
            ])
          }
        }
      ]
    };

    this.trendChart.setOption(option, true);
  }

  private renderDonutChart(): void {
    if (!this.donutChartContainer?.nativeElement) return;
    const elem = this.donutChartContainer.nativeElement;

    if (!this.donutChart) {
      this.donutChart = echarts.init(elem);
    }

    const dist = this.reportData!.statusDistribution;
    const pieData = dist.items.map(i => ({
      name: i.label,
      value: i.count,
      itemStyle: { color: i.color }
    }));

    const isMobile = this.isBrowser && window.innerWidth <= 600;

    const option: echarts.EChartsOption = {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(11, 14, 23, 0.95)',
        borderColor: 'rgba(216, 184, 142, 0.35)',
        textStyle: { color: '#F0E7D5' },
        formatter: (params: any) => {
          return `<div style="font-family:Cinzel,sans-serif;">
            <strong>${params.marker} ${params.name}</strong><br/>
            Count: <strong>${params.value}</strong> (${params.percent}%)
          </div>`;
        }
      },
      legend: {
        orient: isMobile ? 'horizontal' : 'vertical',
        right: isMobile ? 'auto' : 10,
        left: isMobile ? 'center' : undefined,
        bottom: isMobile ? 5 : undefined,
        top: isMobile ? undefined : 'middle',
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: '#D8B88E', fontSize: isMobile ? 10 : 12 },
        formatter: (name: string) => {
          const item = dist.items.find(i => i.label === name);
          if (!item) return name;
          return isMobile ? `${name} (${item.count})` : `${name}:  ${item.count} (${item.percentage}%)`;
        }
      },
      title: {
        text: `${dist.total}\nTotal Orders`,
        left: isMobile ? '50%' : '32%',
        top: isMobile ? '34%' : '44%',
        textAlign: 'center',
        textStyle: {
          color: '#FFFFFF',
          fontSize: isMobile ? 14 : 16,
          fontWeight: 'bold',
          lineHeight: isMobile ? 18 : 22
        }
      },
      series: [
        {
          name: 'Order Status',
          type: 'pie',
          radius: isMobile ? ['40%', '64%'] : ['48%', '70%'],
          center: isMobile ? ['50%', '40%'] : ['32%', '50%'],
          avoidLabelOverlap: false,
          label: { show: false },
          emphasis: {
            scale: true,
            scaleSize: 6,
            itemStyle: {
              shadowBlur: 15,
              shadowColor: 'rgba(216, 184, 142, 0.5)'
            }
          },
          itemStyle: {
            borderRadius: 6,
            borderColor: '#0B0E17',
            borderWidth: 3
          },
          data: pieData
        }
      ]
    };

    this.donutChart.setOption(option, true);
  }

  private handleResize(): void {
    if (this.isBrowser && this.reportData) {
      this.initOrUpdateCharts();
    } else {
      this.trendChart?.resize();
      this.donutChart?.resize();
    }
  }

  // -------------------------------------------------------------
  // Drill-down Modal (Orders by Date)
  // -------------------------------------------------------------
  openDrillDown(dateStr: string): void {
    this.selectedDateForDrillDown = dateStr;
    this.drillDownOpen = true;
    this.drillDownLoading = true;
    this.drillDownStatusFilter = 'all';

    this.reportService
      .getDateWiseOrders({ date: dateStr })
      .subscribe({
        next: (res) => {
          this.drillDownLoading = false;
          this.drillDownOrders = res?.data?.orders || [];
          this.filteredDrillDownOrders = [...this.drillDownOrders];
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.drillDownLoading = false;
          console.error('[DateWiseReport] Drill-down orders load error:', err);
          this.cdr.detectChanges();
        }
      });
  }

  closeDrillDown(): void {
    this.drillDownOpen = false;
    this.drillDownOrders = [];
    this.filteredDrillDownOrders = [];
  }

  filterDrillDown(status: string): void {
    this.drillDownStatusFilter = status;
    if (status === 'all') {
      this.filteredDrillDownOrders = [...this.drillDownOrders];
    } else if (status === 'shipped') {
      this.filteredDrillDownOrders = this.drillDownOrders.filter(
        o => o.status === 'shipped' || o.status === 'dispatched' || o.status === 'out_for_delivery'
      );
    } else {
      this.filteredDrillDownOrders = this.drillDownOrders.filter(o => o.status === status);
    }
  }

  // -------------------------------------------------------------
  // Exports
  // -------------------------------------------------------------
  toggleExportDropdown(): void {
    this.exportDropdownOpen = !this.exportDropdownOpen;
  }

  exportCsv(): void {
    this.exportDropdownOpen = false;
    if (!this.reportData) return;
    this.reportService.exportToCsv(
      this.filteredRows,
      `Astro_Orders_Sales_Report_${this.startDate}_to_${this.endDate}.csv`
    );
  }

  exportExcel(): void {
    this.exportDropdownOpen = false;
    if (!this.reportData) return;
    this.reportService.exportToExcel(
      this.filteredRows,
      `Astro_Orders_Sales_Report_${this.startDate}_to_${this.endDate}.xls`
    );
  }

  printReport(): void {
    this.exportDropdownOpen = false;
    if (this.isBrowser) {
      window.print();
    }
  }

  formatCurrency(amount: number): string {
    return '₹ ' + (amount || 0).toLocaleString('en-IN');
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'delivered': return 'status-delivered';
      case 'shipped': return 'status-shipped';
      case 'processing': return 'status-processing';
      case 'placed': return 'status-placed';
      case 'cancelled': return 'status-cancelled';
      default: return 'status-pending';
    }
  }
}
