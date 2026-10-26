import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CustomerReturns } from './customer-returns';
import { ReturnsService } from '../../core/services/returns.service';
import { AuthService } from '../../core/services/auth.service';

describe('CustomerReturns Component', () => {
  let component: CustomerReturns;
  let fixture: ComponentFixture<CustomerReturns>;
  let returnsService: ReturnsService;

  const mockCustomerReturns = {
    returns: [
      {
        _id: 'ret-customer-1',
        orderNumber: 'ORD-2026-101',
        status: 'Requested',
        reason: 'Product damaged',
        comments: 'Crystal was cracked upon arrival.',
        evidenceImages: [
          { url: '/images/evidence1.jpg', originalName: 'crack1.jpg', size: 102400 }
        ],
        items: [
          { name: 'Sphatik Mala', quantity: 1, price: 1500, image: '/images/mala.jpg' }
        ],
        refundAmount: 1500,
        createdAt: '2026-10-21T10:00:00Z',
        adminMessage: '',
        statusHistory: [
          { fromStatus: null, toStatus: 'Requested', message: 'Return requested', timestamp: '2026-10-21T10:00:00Z' }
        ]
      },
      {
        _id: 'ret-customer-2',
        orderNumber: 'ORD-2026-102',
        status: 'Processed',
        reason: 'Wrong product received',
        comments: '',
        evidenceImages: [],
        items: [
          { name: 'Rudraksha Bracelet', quantity: 2, price: 800, image: '/images/bracelet.jpg' }
        ],
        refundAmount: 1600,
        refundGateway: 'Razorpay',
        refundReference: 'rfnd_rzp_123456',
        refundedAt: '2026-10-21T14:30:00Z',
        createdAt: '2026-10-20T12:00:00Z',
        adminMessage: 'Refund processed to original payment method.',
        statusHistory: [
          { fromStatus: 'Requested', toStatus: 'Accepted', message: 'Accepted', timestamp: '2026-10-20T13:00:00Z' },
          { fromStatus: 'Accepted', toStatus: 'Processed', message: 'Settled', timestamp: '2026-10-21T14:30:00Z' }
        ]
      }
    ],
    pagination: { total: 2, page: 1, limit: 10 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomerReturns],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        ReturnsService,
        {
          provide: AuthService,
          useValue: {
            getCurrentUser: () => ({ email: 'test@example.com', role: 'customer' }),
            getToken: () => 'mock-jwt-token'
          }
        }
      ]
    }).compileComponents();

    returnsService = TestBed.inject(ReturnsService);
    vi.spyOn(returnsService, 'getMyReturns').mockReturnValue(of(mockCustomerReturns));

    fixture = TestBed.createComponent(CustomerReturns);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load customer return requests from server', () => {
    expect(component).toBeTruthy();
    expect(component.returns.length).toBe(2);
    expect(component.filteredReturns.length).toBe(2);
    expect(component.returns[0].orderNumber).toBe('ORD-2026-101');
    expect(component.returns[0].status).toBe('Requested');
  });

  it('should correctly filter returns by status tabs', () => {
    component.setFilter('Processed');
    expect(component.filteredReturns.length).toBe(1);
    expect(component.filteredReturns[0].id).toBe('ret-customer-2');

    component.setFilter('Requested');
    expect(component.filteredReturns.length).toBe(1);
    expect(component.filteredReturns[0].id).toBe('ret-customer-1');

    component.setFilter('All');
    expect(component.filteredReturns.length).toBe(2);
  });

  it('should accurately calculate step states for vertical timeline', () => {
    // For 'Requested' status
    expect(component.getStepState('Requested', 'Requested')).toBe('active');
    expect(component.getStepState('Requested', 'Accepted')).toBe('upcoming');
    expect(component.getStepState('Requested', 'Processing')).toBe('upcoming');
    expect(component.getStepState('Requested', 'Processed')).toBe('upcoming');

    // For 'Processed' status
    expect(component.getStepState('Processed', 'Requested')).toBe('completed');
    expect(component.getStepState('Processed', 'Accepted')).toBe('completed');
    expect(component.getStepState('Processed', 'Processing')).toBe('completed');
    expect(component.getStepState('Processed', 'Processed')).toBe('active');

    // For 'Rejected' status
    expect(component.getStepState('Rejected', 'Requested')).toBe('completed');
    expect(component.getStepState('Rejected', 'Accepted')).toBe('rejected');
    expect(component.getStepState('Rejected', 'Processing')).toBe('disabled');
  });

  it('should open and close the lightbox preview modal for evidence images', () => {
    expect(component.previewImageUrl).toBeNull();

    component.openPreview('/images/test-evidence.jpg', 'Damaged crystal photo');
    expect(component.previewImageUrl).toBe('/images/test-evidence.jpg');
    expect(component.previewImageAlt).toBe('Damaged crystal photo');

    component.closePreview();
    expect(component.previewImageUrl).toBeNull();
  });

  it('should render customer return card with reason, evidence, and timeline in DOM', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.return-card');
    expect(cards.length).toBe(2);

    const firstCard = cards[0];
    expect(firstCard.textContent).toContain('ORD-2026-101');
    expect(firstCard.textContent).toContain('Product damaged');
    expect(firstCard.textContent).toContain('Crystal was cracked upon arrival.');
    expect(firstCard.textContent).toContain('Sphatik Mala');

    // Verify vertical timeline exists
    const timeline = firstCard.querySelector('.vertical-timeline');
    expect(timeline).toBeTruthy();
    expect(timeline?.textContent).toContain('Requested');
    expect(timeline?.textContent).toContain('Accepted');
    expect(timeline?.textContent).toContain('Processing');
    expect(timeline?.textContent).toContain('Processed');
  });
});
