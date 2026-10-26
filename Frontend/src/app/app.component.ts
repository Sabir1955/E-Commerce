import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ViewportScroller } from '@angular/common';
import { Router, RouterOutlet, NavigationStart, NavigationEnd, NavigationSkipped } from '@angular/router';
import { Subscription } from 'rxjs';
import { Header } from './shared/header/header';
import { Footer } from './shared/footer/footer';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    Header,
    Footer
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class App implements OnInit, OnDestroy {
  isAdminRoute = false;
  private routerSub?: Subscription;
  private lastTrigger?: 'imperative' | 'popstate' | 'hashchange';

  constructor(
    private router: Router,
    private cdr: ChangeDetectorRef,
    private viewportScroller: ViewportScroller
  ) {}

  ngOnInit(): void {
    this.checkAdminRoute(this.router.url);
    this.routerSub = this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.lastTrigger = event.navigationTrigger;
      } else if (event instanceof NavigationEnd) {
        this.checkAdminRoute(event.urlAfterRedirects || event.url);
        this.cdr.detectChanges();
        this.handleScroll(event.urlAfterRedirects || event.url);
      } else if (event instanceof NavigationSkipped) {
        this.handleScroll(event.url);
      }
    });
  }

  private handleScroll(url: string): void {
    // If navigation was triggered by browser Back/Forward (popstate),
    // preserve sensible scroll restoration rather than forcing to top.
    if (this.lastTrigger === 'popstate') {
      return;
    }

    const tree = this.router.parseUrl(url);
    if (tree.fragment) {
      this.viewportScroller.scrollToAnchor(tree.fragment);
    } else {
      this.viewportScroller.scrollToPosition([0, 0]);
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  private checkAdminRoute(url: string): void {
    this.isAdminRoute = !!url && (url.startsWith('/admin') || url.includes('/admin/'));
  }
}