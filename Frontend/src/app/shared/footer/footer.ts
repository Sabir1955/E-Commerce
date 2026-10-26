import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, DOCUMENT, isPlatformBrowser, ViewportScroller } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './footer.html',
  styleUrl: './footer.css'
})
export class Footer {
  currentYear = new Date().getFullYear();

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    @Inject(DOCUMENT) private document: Document,
    private viewportScroller: ViewportScroller
  ) {}

  scrollToTop(event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    // 1. Angular ViewportScroller
    try {
      this.viewportScroller.scrollToPosition([0, 0]);
    } catch {
      // safe fallback
    }

    // 2. Window smooth scrolling
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth'
        });
      } catch {
        window.scrollTo(0, 0);
      }
    }

    const doc = this.document;
    if (doc) {
      const scrollEl = (el: HTMLElement | null) => {
        if (!el) return;
        try {
          if (typeof el.scrollTo === 'function') {
            el.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          }
        } catch {
          // ignore
        }
        try {
          el.scrollTop = 0;
        } catch {
          // ignore
        }
      };

      // 3. DocumentElement & Body scrolling
      scrollEl(doc.documentElement);
      scrollEl(doc.body);

      // 4. Scrollable container handling (for pages with custom scroll wrappers)
      try {
        // Query common structural containers
        const containers = doc.querySelectorAll<HTMLElement>(
          'main, [role="main"], app-root, .main-content, .page-container, .scroll-container, router-outlet + *'
        );
        containers.forEach((el) => {
          if (el && (el.scrollTop > 0 || el.scrollHeight > el.clientHeight)) {
            scrollEl(el);
          }
        });

        // Walk up from footer parent to catch any ancestor scroll container
        let parent: HTMLElement | null = event?.target ? (event.target as HTMLElement).parentElement : null;
        if (!parent && doc.querySelector('app-footer')) {
          parent = doc.querySelector('app-footer')?.parentElement || null;
        }
        while (parent && parent !== doc.body && parent !== doc.documentElement) {
          if (parent.scrollTop > 0 || parent.scrollHeight > parent.clientHeight) {
            scrollEl(parent);
          }
          parent = parent.parentElement;
        }

        // Generic fallback for any scrolled element on page
        const allScrolled = doc.querySelectorAll<HTMLElement>('*');
        allScrolled.forEach((el) => {
          if (el && el !== doc.documentElement && el !== doc.body && el.scrollTop > 0) {
            scrollEl(el);
          }
        });

        // 5. Scroll header or top anchor into view as final guarantee
        const topEl = doc.querySelector('app-header') || doc.querySelector('#top') || doc.body;
        if (topEl && typeof topEl.scrollIntoView === 'function') {
          topEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch {
        // safe fallback
      }
    }
  }
}
