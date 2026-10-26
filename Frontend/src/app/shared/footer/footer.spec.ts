import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Footer } from './footer';

describe('Footer Component', () => {
  let component: Footer;
  let fixture: ComponentFixture<Footer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Footer],
      providers: [provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(Footer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the footer component', () => {
    expect(component).toBeTruthy();
  });

  it('should display the current year in the copyright notice', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.copyright-text')?.textContent).toContain(
      String(component.currentYear)
    );
  });

  it('should render brand title and highlights', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.logo-text')?.textContent).toContain('Jyotish Astrology');
    expect(compiled.querySelectorAll('.highlight-item').length).toBe(4);
  });

  it('should ensure every footer link has a valid destination and no broken routes exist', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll<HTMLAnchorElement>('.footer-links a'));
    expect(links.length).toBe(15);

    links.forEach(link => {
      const href = link.getAttribute('routerlink') || link.getAttribute('href') || link.getAttribute('ng-reflect-router-link');
      expect(href).toBeTruthy();
      // Ensure no broken legacy /orders (must be /order-history or /track-order) or /profile
      expect(href).not.toBe('/orders');
      expect(href).not.toBe('/profile');
    });

    const linkTextsAndHrefs = links.map(l => ({
      text: l.textContent?.trim(),
      href: l.getAttribute('routerlink') || l.getAttribute('ng-reflect-router-link') || l.getAttribute('href')
    }));

    const trackShipment = linkTextsAndHrefs.find(l => l.text === 'Track Your Shipment');
    expect(trackShipment?.href).toBe('/track-order');

    const orderHistory = linkTextsAndHrefs.find(l => l.text?.includes('Order History'));
    expect(orderHistory?.href).toBe('/order-history');

    const backToTop = linkTextsAndHrefs.find(l => l.text === 'Back to Top' || l.text === 'My Account');
    expect(backToTop).toBeTruthy();

    const returns = linkTextsAndHrefs.find(l => l.text?.includes('Returns'));
    expect(returns?.href).toBe('/order-history');
  });

  it('should call scrollToTop and smoothly scroll window to top when Back to Top is clicked', () => {
    const scrollToTopSpy = vi.spyOn(component, 'scrollToTop');
    const windowScrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});

    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll<HTMLAnchorElement>('.footer-links a'));
    const backToTopLink = links.find(l => l.textContent?.trim() === 'Back to Top');

    expect(backToTopLink).toBeTruthy();
    backToTopLink?.click();

    expect(scrollToTopSpy).toHaveBeenCalled();
    expect(windowScrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, left: 0, behavior: 'smooth' })
    );
  });

  it('should scroll scrollable container elements with scrollTop > 0 to top smoothly', () => {
    const container = document.createElement('div');
    container.className = 'scroll-container';
    container.style.overflowY = 'auto';
    container.scrollTop = 450;
    container.scrollTo = vi.fn().mockImplementation((options: any) => {
      container.scrollTop = typeof options === 'object' ? options.top : options;
    });
    const containerScrollSpy = vi.spyOn(container, 'scrollTo');
    document.body.appendChild(container);

    component.scrollToTop();

    expect(containerScrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({ top: 0, left: 0, behavior: 'smooth' })
    );
    expect(container.scrollTop).toBe(0);
    document.body.removeChild(container);
  });
});
