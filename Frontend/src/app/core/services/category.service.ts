import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, map, of, tap, timeout } from 'rxjs';
import { InventoryService } from './inventory.service';
import { environment } from '../../../environments/environment';

export interface SavedCategory {
  _id?: string;
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  sanskrit?: string;
  active: boolean;
  productCount?: number;
}

export interface MostBoughtCategory {
  _id?: string;
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  sanskrit?: string;
  active?: boolean;
  totalSold: number;
  orderCount: number;
}

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  get apiUrl(): string {
    return environment.apiUrl;
  }
  private categories: SavedCategory[] = [];
  private categoriesSubject = new BehaviorSubject<SavedCategory[]>([]);
  public categories$ = this.categoriesSubject.asObservable();

  constructor(
    private inventoryService: InventoryService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    if (isPlatformBrowser(this.platformId)) {
      this.syncWithBackend();
    }
  }

  fetchCategories(includeInactive = false): Observable<SavedCategory[]> {
    const url = `${this.apiUrl}/categories${includeInactive ? '?all=true' : ''}`;
    return this.http.get<any>(url).pipe(
      timeout(8000),
      map((res) => {
        const list = res?.categories || res?.data?.categories || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
        if (Array.isArray(list)) {
          return list.map((c: any) => ({
            _id: c._id || c.id,
            id: c.id || c._id,
            name: c.name || '',
            slug: c.slug || '',
            description: c.description || '',
            icon: c.icon || '',
            sanskrit: c.sanskrit || '',
            active: c.active !== false,
            productCount: c.productCount || 0
          }));
        }
        return [];
      }),
      tap((cats) => {
        if (!includeInactive) {
          this.categories = cats;
          this.categoriesSubject.next(cats);
        } else {
          this.categories = cats.filter(c => c.active !== false);
          this.categoriesSubject.next(this.categories);
        }
      })
    );
  }

  syncWithBackend(): void {
    this.fetchCategories(false).subscribe({
      next: () => {},
      error: () => {}
    });
  }

  getMostBoughtCategories(limit = 6): Observable<{ categories: MostBoughtCategory[] }> {
    return this.http.get<{ categories: MostBoughtCategory[] }>(`${this.apiUrl}/categories/most-bought?limit=${limit}`);
  }

  getCategories(includeInactive = false): SavedCategory[] {
    return this.categories
      .filter(category => includeInactive || category.active)
      .sort((first, second) => first.name.localeCompare(second.name));
  }

  getProductCount(categoryName: string): number {
    return this.inventoryService.getAdminProducts().filter(product =>
      product.category && product.category.toLowerCase() === categoryName.toLowerCase()
    ).length;
  }

  addCategory(name: string): boolean {
    const normalized = name.trim();
    if (!normalized || normalized.length > 60 || this.getCategories(true).some(
      category => category.name.toLowerCase() === normalized.toLowerCase()
    )) {
      return false;
    }

    const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
    const newCat: SavedCategory = { name: normalized, slug, active: true };
    this.categories.push(newCat);

    // Persist to backend API / MongoDB
    this.http.post<any>(`${this.apiUrl}/categories`, { name: normalized, slug }).subscribe({
      next: (created) => {
        if (created?._id || created?.data?._id) {
          newCat._id = created?._id || created?.data?._id;
        }
        this.syncWithBackend();
      },
      error: (err) => console.warn('Could not sync category to backend:', err?.message)
    });

    return true;
  }

  renameCategory(oldName: string, newName: string): boolean {
    const normalized = newName.trim();
    if (!normalized || normalized.length > 60 || this.getCategories(true).some(
      category => category.name.toLowerCase() === normalized.toLowerCase() &&
        category.name.toLowerCase() !== oldName.toLowerCase()
    )) {
      return false;
    }

    const category = this.getCategories(true).find(
      item => item.name.toLowerCase() === oldName.toLowerCase()
    );
    if (!category) return false;

    for (const product of this.inventoryService.getAdminProducts()) {
      if (product.category && product.category.toLowerCase() === oldName.toLowerCase()) {
        this.inventoryService.updateProduct({ ...product, category: normalized });
      }
    }

    category.name = normalized;
    category.slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (category._id) {
      this.http.patch(`${this.apiUrl}/categories/${category._id}`, { name: normalized, slug: category.slug }).subscribe({
        next: () => this.syncWithBackend(),
        error: () => {}
      });
    }

    return true;
  }

  setActive(name: string, active: boolean): boolean {
    const category = this.getCategories(true).find(
      item => item.name.toLowerCase() === name.toLowerCase()
    );
    if (!category) {
      return false;
    }

    category.active = active;
    if (category._id) {
      this.http.patch(`${this.apiUrl}/categories/${category._id}`, { active }).subscribe({
        next: () => this.syncWithBackend(),
        error: () => {}
      });
    }

    return true;
  }

  deleteCategory(name: string): boolean {
    const category = this.categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (category?._id) {
      this.http.delete(`${this.apiUrl}/categories/${category._id}?hard=true`).subscribe({
        next: () => this.syncWithBackend(),
        error: () => {}
      });
    }
    this.categories = this.categories.filter(c => c.name.toLowerCase() !== name.toLowerCase());
    return true;
  }
}
