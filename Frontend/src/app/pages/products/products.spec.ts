import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { Products } from './products';
import { ProductService } from '../../core/services/product.service';

describe('Products Component - Search, Availability & Pagination', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;

  const mockPagedResponse = {
    products: [
      {
        id: 'p1',
        _id: 'p1',
        name: 'Vedic Rudraksha Mala',
        description: 'Authentic 108 beads',
        price: 1500,
        image: '/images/rudraksha.jpg',
        category: 'Rudraksha',
        sku: 'RUD-108',
        stock: 10,
        available: true,
        active: true,
        attributes: {}
      }
    ],
    pagination: {
      page: 1,
      limit: 9,
      total: 25,
      pages: 3
    }
  };

  let mockProductService: {
    fetchProductsPaged: any;
    fetchCategories: any;
    getCategories: any;
    getProducts: any;
  };

  beforeEach(async () => {
    mockProductService = {
      fetchProductsPaged: vi.fn().mockImplementation((filters: any = {}) => of({
        ...mockPagedResponse,
        pagination: {
          ...mockPagedResponse.pagination,
          page: filters.page || 1
        }
      })),
      fetchCategories: vi.fn().mockReturnValue(of(['Rudraksha', 'Gemstones', 'Yantras'])),
      getCategories: vi.fn().mockReturnValue(['Rudraksha', 'Gemstones', 'Yantras']),
      getProducts: vi.fn().mockReturnValue(mockPagedResponse.products)
    };

    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [
        provideRouter([]),
        { provide: ProductService, useValue: mockProductService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should initialize and load first page of products via API', () => {
    expect(mockProductService.fetchProductsPaged).toHaveBeenCalled();
    expect(component.products.length).toBe(1);
    expect(component.totalPages).toBe(3);
    expect(component.currentPage).toBe(1);
    expect(component.totalCount).toBe(25);
  });

  it('should display search input with placeholder "Search"', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const searchInput = compiled.querySelector('input[type="text"]') as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    expect(searchInput.getAttribute('placeholder')).toBe('Search');
    expect(searchInput.getAttribute('placeholder')).not.toContain('SKU');
    expect(searchInput.getAttribute('placeholder')).not.toContain('category');
  });

  it('should not contain any availability filter in the template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const allSelects = compiled.querySelectorAll('select');
    const selectLabels = Array.from(allSelects).map(s => s.getAttribute('aria-label') || '');
    expect(selectLabels.some(l => l.toLowerCase().includes('availability'))).toBe(false);
  });

  it('should render pagination controls with page numbers when totalPages > 1', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const paginationWrapper = compiled.querySelector('.pagination-wrapper');
    expect(paginationWrapper).toBeTruthy();

    const pageButtons = compiled.querySelectorAll('.page-number-btn');
    expect(pageButtons.length).toBeGreaterThan(0);
    expect(pageButtons[0].textContent?.trim()).toBe('1');
  });

  it('should navigate to next page and call API with page 2', () => {
    component.goToPage(2);
    expect(component.currentPage).toBe(2);
    expect(mockProductService.fetchProductsPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 9 })
    );
  });

  it('should reset page to 1 when search or category filter changes', () => {
    component.currentPage = 2;
    component.selectedCategory = 'Gemstones';
    component.onFilterChange();

    expect(component.currentPage).toBe(1);
    expect(mockProductService.fetchProductsPaged).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, category: 'Gemstones' })
    );
  });
});
