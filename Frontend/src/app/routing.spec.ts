import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ViewportScroller } from '@angular/common';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { appConfig } from './app.config';
import { App } from './app.component';

describe('Public Store Routing & Scroll Position', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        ...appConfig.providers,
        provideHttpClientTesting()
      ]
    }).compileComponents();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('navigating to /products should render Products component inside router-outlet with header and footer', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const success = await router.navigateByUrl('/products');
    expect(success).toBe(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('app-footer')).toBeTruthy();
    expect(compiled.querySelector('app-products')).toBeTruthy();
    expect(compiled.querySelector('.page-title h1')?.textContent).toContain('Astrology Products');
  });

  it('navigating to /track-order should render TrackOrder component inside router-outlet with header and footer', async () => {
    const router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    const success = await router.navigateByUrl('/track-order');
    expect(success).toBe(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('app-header')).toBeTruthy();
    expect(compiled.querySelector('app-footer')).toBeTruthy();
    expect(compiled.querySelector('app-track-order')).toBeTruthy();
    expect(compiled.querySelector('.page-title h1')?.textContent).toContain('Track Your Order');
  });

  it('should scroll to top [0, 0] when navigating to new routes and when navigating to same route', async () => {
    const router = TestBed.inject(Router);
    const viewportScroller = TestBed.inject(ViewportScroller);
    const scrollSpy = vi.spyOn(viewportScroller, 'scrollToPosition');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // 1. Initial navigation / navigation to /products
    await router.navigateByUrl('/products');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 2. Navigation to /track-order
    await router.navigateByUrl('/track-order');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 3. Navigation to Home (/)
    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 4. Same URL navigation to Home (/) should also scroll to top
    await router.navigateByUrl('/');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 5. Navigation to Login (/login)
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 6. Navigation to Category (/products?category=Gemstones)
    await router.navigateByUrl('/products?category=Gemstones');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 7. Navigation to Product Details (/product/1)
    await router.navigateByUrl('/product/1');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);

    scrollSpy.mockClear();

    // 8. Navigation to Checkout (/checkout)
    await router.navigateByUrl('/checkout');
    fixture.detectChanges();
    expect(scrollSpy).toHaveBeenCalledWith([0, 0]);
  }, 15000);

  it('should scroll to anchor when fragment exists, and not force [0, 0] on popstate navigation', async () => {
    const router = TestBed.inject(Router);
    const viewportScroller = TestBed.inject(ViewportScroller);
    const scrollPosSpy = vi.spyOn(viewportScroller, 'scrollToPosition');
    const scrollAnchorSpy = vi.spyOn(viewportScroller, 'scrollToAnchor');

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();

    // Navigation with fragment should call scrollToAnchor
    await router.navigateByUrl('/products#catalog-top');
    fixture.detectChanges();
    expect(scrollAnchorSpy).toHaveBeenCalledWith('catalog-top');

    scrollPosSpy.mockClear();
    scrollAnchorSpy.mockClear();

    // Simulate popstate navigation trigger (browser back/forward)
    const appInstance = fixture.componentInstance as any;
    appInstance.lastTrigger = 'popstate';
    appInstance.handleScroll('/products');
    expect(scrollPosSpy).not.toHaveBeenCalled();
  });
});
