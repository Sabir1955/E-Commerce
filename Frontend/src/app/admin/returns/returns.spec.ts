import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AdminReturns } from './returns';
import { ReturnsService } from '../../core/services/returns.service';
import { NotificationService } from '../../core/services/notification.service';

describe('AdminReturns Component', () => {
  let component: AdminReturns;
  let fixture: ComponentFixture<AdminReturns>;
  let returnsService: ReturnsService;

  const mockReturnsData = {
    returns: [
      {
        _id: 'ret-101',
        order: {
          _id: 'ord-101',
          orderNumber: 'ORD 2026/10/001',
          items: [{ name: 'Rudraksha Mala', quantity: 1, price: 1200 }]
        },
        type: 'refund',
        amount: 1200,
        status: 'requested',
        reason: 'Item defective',
        customerName: 'Astro Buyer',
        email: 'buyer@example.com',
        paymentMethod: 'Online',
        paymentStatus: 'paid',
        requestedAt: new Date().toISOString()
      }
    ],
    pagination: { total: 1, page: 1, limit: 10, totalPages: 1 }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminReturns],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ReturnsService,
        NotificationService
      ]
    }).compileComponents();

    returnsService = TestBed.inject(ReturnsService);
    vi.spyOn(returnsService, 'getAdminReturnsApi').mockReturnValue(of(mockReturnsData));

    fixture = TestBed.createComponent(AdminReturns);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and load customer return requests', () => {
    expect(component).toBeTruthy();
    expect(component.requests.length).toBe(1);
    expect(component.requests[0].orderId).toBe('ORD 2026/10/001');
  });

  it('should render View Full Details button on card and remove card-level quick accept and reject buttons', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const viewDetailsBtn = compiled.querySelector('.view-details-cta-btn') as HTMLButtonElement;
    expect(viewDetailsBtn).toBeTruthy();
    expect(viewDetailsBtn.textContent?.trim()).toContain('View Full Details & Workflow');

    // Verify quick accept and reject buttons are removed from card
    const actionContainer = compiled.querySelector('.admin-request-actions');
    expect(actionContainer).toBeNull();
    const quickAcceptBtn = compiled.querySelector('.quick-accept-btn');
    expect(quickAcceptBtn).toBeNull();
    const quickRejectBtn = compiled.querySelector('.quick-reject-btn');
    expect(quickRejectBtn).toBeNull();
  });

  it('clicking View Full Details should open details modal with approve and reject workflow options', () => {
    const viewDetailsBtn = fixture.nativeElement.querySelector('.view-details-cta-btn') as HTMLButtonElement;
    viewDetailsBtn.click();
    fixture.detectChanges();

    expect(component.selectedRequest).toBeTruthy();
    expect(component.selectedRequest?.id).toBe('ret-101');

    const modal = fixture.nativeElement.querySelector('.modal-container');
    expect(modal).toBeTruthy();

    const acceptBtn = modal.querySelector('.action-btn.accept-btn') as HTMLButtonElement;
    const rejectBtn = modal.querySelector('.action-btn.reject-btn') as HTMLButtonElement;
    expect(acceptBtn).toBeTruthy();
    expect(rejectBtn).toBeTruthy();
  });
});
