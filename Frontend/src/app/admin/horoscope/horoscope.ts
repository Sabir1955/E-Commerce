import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HoroscopeService, DailyHoroscope, ZodiacSign } from '../../core/services/horoscope.service';

@Component({
  selector: 'app-admin-horoscope',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './horoscope.html',
  styleUrl: './horoscope.css'
})
export class AdminHoroscope implements OnInit {
  horoscopes: DailyHoroscope[] = [];
  zodiacSigns: ZodiacSign[] = [];
  isLoading = false;
  errorMessage = '';
  successMessage = '';

  // Filter state
  selectedDate = '';
  selectedSign = '';
  selectedStatus = '';

  // Modal state
  showEditModal = false;
  modalMode: 'create' | 'edit' = 'create';
  isSaving = false;

  currentForm: {
    id?: string;
    horoscopeDate: string;
    zodiacSign: string;
    prediction: string;
    love: string;
    career: string;
    finance: string;
    health: string;
    luckyNumber: string;
    luckyColor: string;
    status: 'Published' | 'Draft';
  } = {
    horoscopeDate: '',
    zodiacSign: 'Aries',
    prediction: '',
    love: '',
    career: '',
    finance: '',
    health: '',
    luckyNumber: '',
    luckyColor: '',
    status: 'Published'
  };

  // Preview modal
  showPreviewModal = false;
  previewItem: DailyHoroscope | null = null;

  constructor(
    private horoscopeService: HoroscopeService,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.selectedDate = this.getTodayDateString();
      this.currentForm.horoscopeDate = this.selectedDate;
      this.loadZodiacSigns();
      this.loadHoroscopes();
    }
  }

  getTodayDateString(): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return formatter.format(new Date());
  }

  loadZodiacSigns(): void {
    this.horoscopeService.getZodiacSigns().subscribe({
      next: (signs) => {
        this.zodiacSigns = signs;
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadHoroscopes(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.horoscopeService.getAdminHoroscopes({
      date: this.selectedDate || undefined,
      sign: this.selectedSign || undefined,
      status: this.selectedStatus || undefined
    }).subscribe({
      next: (res) => {
        this.isLoading = false;
        this.horoscopes = res.horoscopes || [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.message || 'Failed to load daily horoscopes.';
        this.cdr.detectChanges();
      }
    });
  }

  setDateFilter(date: string): void {
    this.selectedDate = date;
    this.loadHoroscopes();
  }

  setToday(): void {
    this.selectedDate = this.getTodayDateString();
    this.loadHoroscopes();
  }

  setTomorrow(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    this.selectedDate = formatter.format(tomorrow);
    this.loadHoroscopes();
  }

  openCreateModal(): void {
    this.modalMode = 'create';
    this.currentForm = {
      horoscopeDate: this.selectedDate || this.getTodayDateString(),
      zodiacSign: this.selectedSign || 'Aries',
      prediction: '',
      love: '',
      career: '',
      finance: '',
      health: '',
      luckyNumber: '',
      luckyColor: '',
      status: 'Published'
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  openEditModal(item: DailyHoroscope): void {
    this.modalMode = 'edit';
    this.currentForm = {
      id: item.id,
      horoscopeDate: item.horoscopeDate ? item.horoscopeDate.split('T')[0] : this.getTodayDateString(),
      zodiacSign: item.zodiacSign,
      prediction: item.prediction,
      love: item.love || '',
      career: item.career || '',
      finance: item.finance || '',
      health: item.health || '',
      luckyNumber: item.luckyNumber || '',
      luckyColor: item.luckyColor || '',
      status: item.status
    };
    this.showEditModal = true;
    this.cdr.detectChanges();
  }

  closeModal(): void {
    this.showEditModal = false;
    this.cdr.detectChanges();
  }

  saveHoroscope(): void {
    if (!this.currentForm.prediction.trim()) {
      this.errorMessage = 'General prediction cannot be empty.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    const payload: Partial<DailyHoroscope> = {
      ...this.currentForm
    };

    const action = this.modalMode === 'create'
      ? this.horoscopeService.saveHoroscope(payload)
      : this.horoscopeService.updateHoroscope(this.currentForm.id!, payload);

    action.subscribe({
      next: () => {
        this.isSaving = false;
        this.showEditModal = false;
        this.successMessage = `Horoscope for ${this.currentForm.zodiacSign} saved successfully!`;
        this.loadHoroscopes();
        setTimeout(() => {
          this.successMessage = '';
          this.cdr.detectChanges();
        }, 3500);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage = err?.error?.message || 'Failed to save horoscope.';
        this.cdr.detectChanges();
      }
    });
  }

  toggleStatus(item: DailyHoroscope): void {
    const newStatus = item.status === 'Published' ? 'Draft' : 'Published';
    this.horoscopeService.updateStatus(item.id, newStatus).subscribe({
      next: (updated) => {
        item.status = updated.status;
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to update status');
      }
    });
  }

  deleteHoroscope(item: DailyHoroscope): void {
    if (!confirm(`Are you sure you want to delete the horoscope for ${item.zodiacSign}?`)) {
      return;
    }

    this.horoscopeService.deleteHoroscope(item.id).subscribe({
      next: () => {
        this.horoscopes = this.horoscopes.filter(h => h.id !== item.id);
        this.cdr.detectChanges();
      },
      error: (err) => {
        alert(err?.error?.message || 'Failed to delete horoscope');
      }
    });
  }

  openPreview(item: DailyHoroscope): void {
    this.previewItem = item;
    this.showPreviewModal = true;
    this.cdr.detectChanges();
  }

  closePreview(): void {
    this.showPreviewModal = false;
    this.previewItem = null;
    this.cdr.detectChanges();
  }

  itemSign(sign: string): string {
    const map: { [key: string]: string } = {
      Aries: '♈', Taurus: '♉', Gemini: '♊', Cancer: '♋',
      Leo: '♌', Virgo: '♍', Libra: '♎', Scorpio: '♏',
      Sagittarius: '♐', Capricorn: '♑', Aquarius: '♒', Pisces: '♓'
    };
    return map[sign] || '✦';
  }
}
