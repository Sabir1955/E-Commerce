import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ProductService, Product } from '../../core/services/product.service';
import { CategoryService, MostBoughtCategory } from '../../core/services/category.service';
import { HoroscopeService, DailyHoroscope, ZodiacSign } from '../../core/services/horoscope.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css'
})
export class Home implements OnInit {
  categories: MostBoughtCategory[] = [];
  featuredProducts: Product[] = [];
  isLoadingCategories = false;

  // Today's Horoscope state
  zodiacSigns: ZodiacSign[] = [];
  todayHoroscopes: DailyHoroscope[] = [];
  activeSign = 'Aries';
  activeHoroscope: DailyHoroscope | null = null;
  horoscopeDateStr = '';
  isLoadingHoroscope = false;

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private horoscopeService: HoroscopeService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.loadMostBoughtCategories();
      this.getFeaturedProducts();
      this.loadZodiacSigns();
      this.loadTodayHoroscopes();
    }
  }

  getFeaturedProducts(): void {
    this.productService.fetchProductsPaged({ limit: 4 }).subscribe({
      next: (res) => {
        this.featuredProducts = Array.isArray(res?.products) ? res.products : [];
        this.cdr.detectChanges();
      },
      error: () => {
        this.featuredProducts = [];
        this.cdr.detectChanges();
      }
    });
  }

  loadMostBoughtCategories(): void {
    this.isLoadingCategories = true;
    this.categoryService.getMostBoughtCategories().subscribe({
      next: (res) => {
        this.isLoadingCategories = false;
        const list = res?.categories || (Array.isArray(res) ? res : []);
        if (Array.isArray(list)) {
          this.categories = list.slice(0, 6);
        } else {
          this.categories = [];
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingCategories = false;
        console.error('Failed to load most bought categories from database API:', err);
        this.categories = [];
        this.cdr.detectChanges();
      }
    });
  }

  loadZodiacSigns(): void {
    this.horoscopeService.getZodiacSigns().subscribe({
      next: (signs) => {
        this.zodiacSigns = signs || [];
        this.cdr.detectChanges();
      },
      error: () => {}
    });
  }

  loadTodayHoroscopes(): void {
    this.isLoadingHoroscope = true;
    this.horoscopeService.getTodayHoroscopes().subscribe({
      next: (res) => {
        this.isLoadingHoroscope = false;
        this.horoscopeDateStr = res.date;
        this.todayHoroscopes = res.horoscopes || [];
        this.updateActiveHoroscope();
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoadingHoroscope = false;
        console.error('Failed to load today horoscopes:', err);
        this.cdr.detectChanges();
      }
    });
  }

  selectSign(signName: string): void {
    this.activeSign = signName;
    this.updateActiveHoroscope();
    this.cdr.detectChanges();
  }

  private updateActiveHoroscope(): void {
    this.activeHoroscope = this.todayHoroscopes.find(
      h => h.zodiacSign.toLowerCase() === this.activeSign.toLowerCase()
    ) || null;
  }

  getActiveSignMeta(): ZodiacSign | undefined {
    return this.zodiacSigns.find(s => s.sign.toLowerCase() === this.activeSign.toLowerCase());
  }

  navigateToCategory(categoryName: string): void {
    if (!categoryName) return;
    this.router.navigate(['/products'], { queryParams: { category: categoryName } });
  }
}