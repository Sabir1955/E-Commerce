import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminReviews } from './reviews';

describe('AdminReviews Component', () => {
  let component: AdminReviews;
  let fixture: ComponentFixture<AdminReviews>;
  let httpTesting: HttpTestingController;

  const mockReviews = [
    {
      _id: 'rev-1',
      product: { name: 'Dhan Yog Bracelet', sku: 'DYB-01' },
      user: { name: 'Astro User', email: 'user@example.com' },
      rating: 5,
      comment: 'Excellent quality and spiritually authentic product!',
      verifiedPurchase: true,
      order: 'ORD 2026/10/014',
      status: 'approved' as const,
      createdAt: '2026-10-07T12:00:00.000Z'
    },
    {
      _id: 'rev-2',
      product: { name: 'Rudraksha Mala', sku: 'RDM-05' },
      user: { name: 'Devotee 2', email: 'devotee@example.com' },
      rating: 4,
      comment: 'Good beads and energizing presence.',
      verifiedPurchase: false,
      status: 'pending' as const,
      createdAt: '2026-10-07T13:00:00.000Z'
    }
  ];

  const mockStats = {
    total: 2,
    approved: 1,
    pending: 1,
    rejected: 0,
    averageRating: 4.5
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminReviews],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminReviews);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize and display ratings & reviews overview and table container with all columns intact', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) => r.url.includes('/reviews/moderation'));
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      reviews: mockReviews,
      stats: mockStats,
      pagination: { total: 2, page: 1, pages: 1 }
    });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.reviews-admin')).toBeTruthy();
    expect(compiled.querySelector('.reviews-header h1')?.textContent).toContain('Reviews & Ratings Management');

    // Table container and table exists
    const tableContainer = compiled.querySelector('.table-container');
    expect(tableContainer).toBeTruthy();

    const table = compiled.querySelector('.reviews-table');
    expect(table).toBeTruthy();

    // Verify remaining 5 table headers exist and removed columns are absent
    const headers = compiled.querySelectorAll('.reviews-table th');
    expect(headers.length).toBe(5);
    const headerTexts = Array.from(headers).map((h) => h.textContent?.trim());
    expect(headerTexts).toContain('Product');
    expect(headerTexts).toContain('Customer');
    expect(headerTexts).toContain('Rating');
    expect(headerTexts).toContain('Review Text');
    expect(headerTexts).toContain('Date');
    expect(headerTexts).not.toContain('Order / Verification');
    expect(headerTexts).not.toContain('Status');
    expect(headerTexts).not.toContain('Moderation Actions');

    // Verify rows rendered
    const rows = compiled.querySelectorAll('.reviews-table tbody tr');
    expect(rows.length).toBe(2);
  });

  it('should update review status when clicking moderation action button', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) => r.url.includes('/reviews/moderation'));
    req.flush({
      success: true,
      reviews: mockReviews,
      stats: mockStats,
      pagination: { total: 2, page: 1, pages: 1 }
    });

    fixture.detectChanges();

    // Call moderate review on rev-2 to approve it
    component.updateReviewStatus(component.reviews[1], 'approved');

    const patchReq = httpTesting.expectOne((r) => r.url.includes('/reviews/rev-2/moderate'));
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ status: 'approved' });
    patchReq.flush({
      ...mockReviews[1],
      status: 'approved'
    });

    // It refreshes data
    const refreshReq = httpTesting.expectOne((r) => r.url.includes('/reviews/moderation'));
    refreshReq.flush({
      success: true,
      reviews: [{ ...mockReviews[0] }, { ...mockReviews[1], status: 'approved' }],
      stats: { ...mockStats, approved: 2, pending: 0 },
      pagination: { total: 2, page: 1, pages: 1 }
    });

    fixture.detectChanges();
    expect(component.alertMessage).toContain('Review status updated to approved');
  });
});
