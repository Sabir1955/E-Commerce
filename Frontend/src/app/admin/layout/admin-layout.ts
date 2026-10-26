import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subscription, filter } from 'rxjs';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-admin-layout',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css'
})
export class AdminLayout implements OnInit, OnDestroy {
  currentAdmin: AuthUser | null = null;
  mobileSidebarOpen = false;
  reportsMenuOpen = true;

  // Real-Time Notification & Audio Chime
  soundEnabled = true;
  unconfirmedCount = 0;
  liveAlert: { orderNumber: string; customerName: string; total: number } | null = null;
  private knownOrderIds = new Set<string>();
  private isFirstPoll = true;
  private pollInterval?: any;
  private subs = new Subscription();

  constructor(
    private authService: AuthService,
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    this.currentAdmin = this.authService.getCurrentUser();
    this.subs.add(
      this.authService.currentUser$.subscribe(user => {
        this.currentAdmin = user;
        this.cdr.detectChanges();
      })
    );

    // Auto-close mobile drawer when route changes
    this.subs.add(
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd)
      ).subscribe(() => {
        this.mobileSidebarOpen = false;
        this.cdr.detectChanges();
      })
    );

    if (isPlatformBrowser(this.platformId)) {
      const savedSound = localStorage.getItem('astro_admin_sound_enabled');
      if (savedSound !== null) {
        this.soundEnabled = savedSound === 'true';
      }

      this.checkUnconfirmedOrders();
    }
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('astro_admin_sound_enabled', String(this.soundEnabled));
    }
    if (this.soundEnabled) {
      this.playChimeSound();
    }
    this.cdr.detectChanges();
  }

  playChimeSound(): void {
    if (!this.soundEnabled || !isPlatformBrowser(this.platformId)) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Note 1: D5 (587.33 Hz)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
      gain1.gain.setValueAtTime(0.15, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start();
      osc1.stop(ctx.currentTime + 0.35);

      // Note 2: A5 (880.00 Hz) celestial harmonic
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.12);
      gain2.gain.setValueAtTime(0.18, ctx.currentTime + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(ctx.currentTime + 0.12);
      osc2.stop(ctx.currentTime + 0.65);
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  checkUnconfirmedOrders(): void {
    this.http.get<any>(`${environment.apiUrl}/admin/dashboard`).subscribe({
      next: (res) => {
        const data = res?.data || res;
        this.unconfirmedCount = data.awaitingConfirmationOrders || 0;

        const recents = data.recentUnconfirmedOrders || [];
        if (Array.isArray(recents)) {
          let hasNewOrder = false;
          let newestOrder: any = null;

          for (const ord of recents) {
            const ordKey = String(ord.order_number || ord.id);
            if (!this.knownOrderIds.has(ordKey)) {
              this.knownOrderIds.add(ordKey);
              if (!this.isFirstPoll) {
                hasNewOrder = true;
                newestOrder = ord;
              }
            }
          }

          if (hasNewOrder && newestOrder) {
            this.playChimeSound();
            this.liveAlert = {
              orderNumber: newestOrder.order_number || newestOrder.id,
              customerName: newestOrder.customer_name || 'Customer',
              total: Number(newestOrder.total) || 0
            };
            setTimeout(() => {
              if (this.liveAlert?.orderNumber === (newestOrder.order_number || newestOrder.id)) {
                this.liveAlert = null;
                this.cdr.detectChanges();
              }
            }, 10000);
          }
        }

        this.isFirstPoll = false;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  dismissLiveAlert(): void {
    this.liveAlert = null;
    this.cdr.detectChanges();
  }

  viewLiveOrder(): void {
    this.liveAlert = null;
    this.router.navigate(['/admin/orders'], { queryParams: { status: 'awaiting_confirmation' } });
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen = !this.mobileSidebarOpen;
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen = false;
  }

  toggleReportsMenu(): void {
    this.reportsMenuOpen = !this.reportsMenuOpen;
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
