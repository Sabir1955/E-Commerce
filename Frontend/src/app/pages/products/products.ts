import { Component, DestroyRef, ChangeDetectorRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  Product,
  ProductService,
  ProductQueryFilters
} from '../../core/services/product.service';
import { CartService } from '../../core/services/cart.service';

type ProductSort = 'relevance' | 'price-asc' | 'price-desc' | 'newest' | 'popularity';

interface AttributeFilter {
  name: string;
  values: string[];
}

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products implements OnInit {
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  products: Product[] = [];
  filteredProducts: Product[] = [];

  searchText = '';
  selectedCategory = 'All';
  minimumPrice: number | null = null;
  maximumPrice: number | null = null;
  sortBy: ProductSort = 'relevance';
  attributeValues: Record<string, string> = {};
  attributeFilters: AttributeFilter[] = [];

  categories: string[] = [];

  // Server-side MongoDB Pagination
  currentPage = 1;
  pageSize = 9;
  totalPages = 1;
  totalCount = 0;
  isLoading = false;

  private searchDebounceTimer?: any;

  constructor() {
    this.categories = this.productService.getCategories();

    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const querySearch = params.get('search');
        if (querySearch !== null) {
          this.searchText = querySearch;
        }
        const catParam = params.get('category');
        if (catParam) {
          const matched = this.categories.find(c =>
            c.toLowerCase() === catParam.toLowerCase() ||
            c.toLowerCase().includes(catParam.toLowerCase()) ||
            catParam.toLowerCase().includes(c.toLowerCase())
          );
          this.selectedCategory = matched || catParam;
        }
        const pageParam = Number(params.get('page'));
        if (pageParam && pageParam > 0) {
          this.currentPage = pageParam;
        }
        this.loadProducts(false);
      });
  }

  ngOnInit(): void {
    const catObs = typeof this.productService.fetchCategories === 'function'
      ? this.productService.fetchCategories()
      : (typeof this.productService.getCategories === 'function' ? of(this.productService.getCategories()) : of([]));

    catObs
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cats: string[]) => {
          this.categories = cats;
          const catParam = this.route.snapshot.queryParamMap.get('category');
          if (catParam) {
            const matched = this.categories.find(c =>
              c.toLowerCase() === catParam.toLowerCase() ||
              c.toLowerCase().includes(catParam.toLowerCase()) ||
              catParam.toLowerCase().includes(c.toLowerCase())
            );
            if (matched && matched !== this.selectedCategory) {
              this.selectedCategory = matched;
              this.loadProducts(true);
            }
          }
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.warn('Could not load categories from server:', err);
        }
      });
  }

  onSearchInput(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = setTimeout(() => {
      this.currentPage = 1;
      this.loadProducts(true);
    }, 280);
  }

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadProducts(true);
  }

  loadProducts(resetPage = false): void {
    if (resetPage) {
      this.currentPage = 1;
    }

    this.isLoading = true;

    let apiSort: string | undefined;
    if (this.sortBy === 'price-asc') {
      apiSort = 'price_asc';
    } else if (this.sortBy === 'price-desc') {
      apiSort = 'price_desc';
    } else if (this.sortBy === 'newest') {
      apiSort = 'newest';
    } else if (this.sortBy === 'popularity') {
      apiSort = 'popularity';
    }

    const filters: ProductQueryFilters = {
      page: this.currentPage,
      limit: this.pageSize,
      search: this.searchText.trim() || undefined,
      category: this.selectedCategory !== 'All' ? this.selectedCategory : undefined,
      minPrice: this.minimumPrice !== null && Number.isFinite(this.minimumPrice) ? this.minimumPrice : undefined,
      maxPrice: this.maximumPrice !== null && Number.isFinite(this.maximumPrice) ? this.maximumPrice : undefined,
      sort: apiSort
    };

    this.productService.fetchProductsPaged(filters)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.isLoading = false;
          let list = res.products;

          // Client-side attribute refinement if specific attributes were selected
          const activeAttributes = Object.entries(this.attributeValues).filter(([_, val]) => !!val);
          if (activeAttributes.length > 0) {
            list = list.filter(p =>
              activeAttributes.every(([k, v]) => (p.attributes?.[k] ?? '').toLowerCase() === v.toLowerCase())
            );
          }

          this.products = list;
          this.filteredProducts = list;
          this.totalCount = res.pagination.total;
          this.totalPages = Math.max(1, res.pagination.pages);
          this.currentPage = res.pagination.page || this.currentPage;

          if (this.categories.length === 0) {
            this.categories = this.productService.getCategories();
          }
          this.attributeFilters = this.getAttributeFilters();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isLoading = false;
          console.error('API error loading products from server:', err?.message);
          this.products = [];
          this.filteredProducts = [];
          this.totalCount = 0;
          this.totalPages = 1;
          this.cdr.markForCheck();
        }
      });
  }

  goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
    this.loadProducts(false);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 300, behavior: 'smooth' });
    }
  }

  prevPage(): void {
    this.goToPage(this.currentPage - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage + 1);
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }

  setAttributeValue(name: string, value: string): void {
    this.attributeValues[name] = value;
    this.onFilterChange();
  }

  clearFilters(): void {
    this.searchText = '';
    this.selectedCategory = 'All';
    this.minimumPrice = null;
    this.maximumPrice = null;
    this.sortBy = 'relevance';
    this.attributeValues = {};
    this.currentPage = 1;
    this.loadProducts(true);
  }

  get hasInvalidPriceRange(): boolean {
    return this.minimumPrice !== null &&
      this.maximumPrice !== null &&
      Number.isFinite(this.minimumPrice) &&
      Number.isFinite(this.maximumPrice) &&
      this.minimumPrice > this.maximumPrice;
  }

  private getAttributeFilters(): AttributeFilter[] {
    const values = new Map<string, Set<string>>();
    for (const product of this.products) {
      for (const [name, value] of Object.entries(product.attributes ?? {})) {
        const key = name.trim();
        const option = value.trim();
        if (!key || !option || key.toLowerCase() === 'stone') continue;
        const options = values.get(key) ?? new Set<string>();
        options.add(option);
        values.set(key, options);
      }
    }

    return [...values.entries()]
      .filter(([name]) => name.toLowerCase() !== 'stone')
      .sort(([first], [second]) => first.localeCompare(second))
      .map(([name, options]) => ({
        name,
        values: [...options].sort((first, second) => first.localeCompare(second))
      }));
  }

  addToCart(product: Product): void {
    const added = this.cartService.addToCart(product);
    this.cdr.markForCheck();
    setTimeout(() => {
      alert(added
        ? `${product.name} added to cart`
        : `${product.name} is unavailable or the available stock is already in your cart.`);
    }, 30);
  }
}