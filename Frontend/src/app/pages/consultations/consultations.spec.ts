import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { Consultations } from './consultations';
import { environment } from '../../../environments/environment';
import { Astrologer, ConsultationSlot } from '../../core/services/consultation.service';

describe('Consultations Page Appointment Slots UI & Availability', () => {
  let component: Consultations;
  let fixture: ComponentFixture<Consultations>;
  let httpTesting: HttpTestingController;

  const mockAstrologer: Astrologer = {
    id: 'astro_poonam_vaish_mam',
    name: 'Astro Poonam Vaish Mam',
    rating: 5.0,
    reviewCount: 120,
    experienceYears: 15,
    specialties: ['Vedic Astrology', 'Kundali'],
    languages: ['Hindi', 'English'],
    allowedDurations: [30, 45, 60],
    durationPricing: { '30': 799, '45': 1099, '60': 1499 },
    active: true,
    displayOrder: 1,
    allowOnline: true,
    allowOffline: true
  };

  const mockSlots: ConsultationSlot[] = [
    {
      startTime: '10:00',
      endTime: '10:30',
      durationMinutes: 30,
      isAvailable: true,
      reason: 'Available'
    },
    {
      startTime: '10:30',
      endTime: '11:00',
      durationMinutes: 30,
      isAvailable: false,
      reason: 'Booked / Reserved'
    },
    {
      startTime: '11:00',
      endTime: '11:30',
      durationMinutes: 30,
      isAvailable: true,
      reason: 'Available'
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Consultations],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    });

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Consultations);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
    TestBed.resetTestingModule();
  });

  it('should render appointment slots with available and unavailable slots clearly indicated', () => {
    fixture.detectChanges();

    // 1. Astrologers call
    const astroReq = httpTesting.expectOne(`${environment.apiUrl}/consultations/astrologers`);
    expect(astroReq.request.method).toBe('GET');
    astroReq.flush({ data: [mockAstrologer] });

    // 2. Services call
    const srvReq = httpTesting.expectOne((req) => req.url.includes('/consultations/services'));
    expect(srvReq.request.method).toBe('GET');
    srvReq.flush({ data: [] });

    // 3. Slots call
    const slotReq = httpTesting.expectOne((req) => req.url.includes('/slots'));
    expect(slotReq.request.method).toBe('GET');
    slotReq.flush({
      data: {
        date: component.selectedDate,
        slots: mockSlots,
        isHoliday: false,
        isWeeklyOff: false
      }
    });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Check legend exists
    const legend = compiled.querySelector('.slots-legend');
    expect(legend).toBeTruthy();
    expect(legend?.textContent).toContain('Available');
    expect(legend?.textContent).toContain('Unavailable / Reserved');

    // Check available count badge
    const badge = compiled.querySelector('.slots-count-badge');
    expect(badge).toBeTruthy();
    expect(badge?.textContent).toContain('2 of 3 Slots Available');

    // Check slots cards
    const slotCards = compiled.querySelectorAll('.slot-card');
    expect(slotCards.length).toBe(3);

    // Slot 1: Available
    expect(slotCards[0].classList.contains('available')).toBe(true);
    expect(slotCards[0].classList.contains('unavailable')).toBe(false);
    expect((slotCards[0] as HTMLButtonElement).disabled).toBe(false);
    expect(slotCards[0].textContent).toContain('10:00 AM');
    expect(slotCards[0].textContent).toContain('✓ Available');

    // Slot 2: Unavailable (Booked / Reserved)
    expect(slotCards[1].classList.contains('unavailable')).toBe(true);
    expect(slotCards[1].classList.contains('available')).toBe(false);
    expect((slotCards[1] as HTMLButtonElement).disabled).toBe(true);
    expect(slotCards[1].textContent).toContain('10:30 AM');
    expect(slotCards[1].textContent).toContain('✕ Booked / Reserved');

    // Slot 3: Available
    expect(slotCards[2].classList.contains('available')).toBe(true);
    expect((slotCards[2] as HTMLButtonElement).disabled).toBe(false);
  });

  it('should allow selection only for available slots and reject selection for unavailable slots', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/consultations/astrologers`).flush({ data: [mockAstrologer] });
    httpTesting.expectOne((req) => req.url.includes('/consultations/services')).flush({ data: [] });
    httpTesting.expectOne((req) => req.url.includes('/slots')).flush({
      data: {
        date: component.selectedDate,
        slots: mockSlots
      }
    });
    fixture.detectChanges();

    // Available slot 3 can be selected
    component.selectSlot(mockSlots[2]);
    expect(component.selectedSlot?.startTime).toBe('11:00');
    expect(component.startTime24).toBe('11:00');

    // Attempting to select unavailable slot 2 must be ignored
    component.selectSlot(mockSlots[1]);
    expect(component.selectedSlot?.startTime).toBe('11:00'); // remains previous available slot
  });
});
