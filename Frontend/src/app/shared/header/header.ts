import {
  Component,
  ChangeDetectorRef,
  ElementRef,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  NgZone,
  effect
} from '@angular/core';
import { isPlatformBrowser, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter, catchError, of, distinctUntilChanged, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';
import { NotificationService, InAppNotificationItem } from '../../core/services/notification.service';

interface HeaderUser {
  name?: string;
  email?: string;
  role?: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [FormsModule, RouterLink, RouterLinkActive, DatePipe],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class Header implements OnInit, OnDestroy {
  searchText = '';
  mobileNavOpen = false;
  profileOpen = false;
  notificationsOpen = false;
  unreadCount = 0;
  inAppNotifications: InAppNotificationItem[] = [];
  loadingNotifications = false;

  private routerSub?: Subscription;
  private authSub?: Subscription;
  private pollInterval?: any;
  private isCheckingNotifications = false;
  private lastNotificationCheckTime = 0;

  constructor(
    public cartService: CartService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private elementRef: ElementRef,
    private zone: NgZone,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // Automatically trigger change detection when cart signal changes
    effect(() => {
      this.cartService.cartCount();
      this.cdr.markForCheck();
    });

    this.routerSub = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.closeMobileNav();
      this.closeProfile();
      this.closeNotifications();
    });

    this.authSub = this.authService.currentUser$.pipe(
      distinctUntilChanged((prev, curr) => {
        const prevId = prev?.id || (prev as any)?._id;
        const currId = curr?.id || (curr as any)?._id;
        return prevId === currId;
      })
    ).subscribe((user) => {
      if (user) {
        this.checkNotifications();
      } else {
        this.unreadCount = 0;
        this.inAppNotifications = [];
        this.closeNotifications();
      }
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.checkNotifications();
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    this.authSub?.unsubscribe();
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
    }
  }

  get currentUser(): HeaderUser | null {
    return this.authService.getCurrentUser();
  }

  searchProducts(): void {
    const search = this.searchText.trim();
    this.router.navigate(['/products'], {
      queryParams: { search: search || null }
    });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen = !this.mobileNavOpen;
    this.cdr.markForCheck();
  }

  closeMobileNav(): void {
    if (this.mobileNavOpen) {
      this.mobileNavOpen = false;
      this.cdr.markForCheck();
    }
  }

  checkNotifications(force = false): void {
    if (!isPlatformBrowser(this.platformId) || !this.currentUser || this.isCheckingNotifications) {
      return;
    }
    const now = Date.now();
    if (!force && now - this.lastNotificationCheckTime < 15000) {
      return;
    }
    this.isCheckingNotifications = true;
    this.notificationService.getMyUnreadCount().pipe(
      catchError(() => of(0)),
      finalize(() => {
        this.isCheckingNotifications = false;
        this.lastNotificationCheckTime = Date.now();
      })
    ).subscribe(count => {
      this.unreadCount = count;
      this.cdr.markForCheck();
    });
  }

  toggleNotifications(): void {
    this.notificationsOpen = !this.notificationsOpen;
    if (this.notificationsOpen) {
      this.closeProfile();
      this.loadNotificationsList();
    }
    this.cdr.markForCheck();
  }

  closeNotifications(): void {
    if (this.notificationsOpen) {
      this.notificationsOpen = false;
      this.cdr.markForCheck();
    }
  }

  loadNotificationsList(): void {
    if (!this.currentUser) return;
    this.loadingNotifications = true;
    this.notificationService.getMyInAppNotifications(10).pipe(
      catchError(() => of({ notifications: [], total: 0, unreadCount: 0 }))
    ).subscribe(res => {
      this.inAppNotifications = res.notifications || [];
      this.unreadCount = res.unreadCount ?? 0;
      this.loadingNotifications = false;
      this.cdr.markForCheck();
    });
  }

  markNotificationAsRead(item: InAppNotificationItem): void {
    if (!item.isRead) {
      this.notificationService.markInAppAsRead(item.id).pipe(
        catchError(() => of(null))
      ).subscribe(() => {
        item.isRead = true;
        if (this.unreadCount > 0) {
          this.unreadCount--;
        }
        this.cdr.markForCheck();
      });
    }
    this.closeNotifications();
    if (item.link) {
      this.router.navigateByUrl(item.link);
    }
  }

  markAllNotificationsAsRead(): void {
    this.notificationService.markAllInAppAsRead().pipe(
      catchError(() => of(null))
    ).subscribe(() => {
      this.inAppNotifications.forEach(n => n.isRead = true);
      this.unreadCount = 0;
      this.cdr.markForCheck();
    });
  }

  toggleProfile(): void {
    this.profileOpen = !this.profileOpen;
    if (this.profileOpen) {
      this.closeNotifications();
    }
    this.cdr.markForCheck();
  }

  closeProfile(): void {
    if (this.profileOpen) {
      this.profileOpen = false;
      this.cdr.markForCheck();
    }
  }

  logout(): void {
    this.authService.logout();
    this.closeProfile();
    this.closeNotifications();
    this.router.navigate(['/login']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const hostNative = this.elementRef.nativeElement as HTMLElement;
    const path = typeof event.composedPath === 'function' ? event.composedPath() : [];

    if (this.profileOpen) {
      const profileControl = hostNative.querySelector('.profile-control');
      const isInside = path.length > 0
        ? path.some(el => el === profileControl || (el instanceof HTMLElement && el.classList?.contains('profile-control')))
        : Boolean(profileControl && profileControl.contains(target));

      if (!isInside) {
        this.closeProfile();
      }
    }

    if (this.notificationsOpen) {
      const notifControl = hostNative.querySelector('.notification-control');
      const isInside = path.length > 0
        ? path.some(el => el === notifControl || (el instanceof HTMLElement && el.classList?.contains('notification-control')))
        : Boolean(notifControl && notifControl.contains(target));

      if (!isInside) {
        this.closeNotifications();
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMobileNav();
    this.closeProfile();
    this.closeNotifications();
  }
}
