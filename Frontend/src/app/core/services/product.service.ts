import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { CategoryService } from './category.service';
import { InventoryService } from './inventory.service';
import { Product } from './product-catalog';
import { environment } from '../../../environments/environment';

import { resolveImageUrl as utilResolveImageUrl, getBackendBaseUrl } from '../utils/image-url.util';

export type { Product } from './product-catalog';

export interface ProductPaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ProductsPagedResponse {
  products: Product[];
  pagination: ProductPaginationMeta;
}

export interface ProductQueryFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  get apiUrl(): string {
    return environment.apiUrl;
  }

  constructor(
    private http: HttpClient,
    private inventoryService: InventoryService,
    private categoryService: CategoryService
  ) {}

  fetchProductsPaged(filters: ProductQueryFilters = {}): Observable<ProductsPagedResponse> {
    let params = new HttpParams()
      .set('page', String(filters.page || 1))
      .set('limit', String(filters.limit || 9));

    if (filters.search && filters.search.trim()) {
      params = params.set('search', filters.search.trim());
    }
    if (filters.category && filters.category !== 'All') {
      params = params.set('category', filters.category.trim());
    }
    if (filters.minPrice !== null && filters.minPrice !== undefined && Number.isFinite(filters.minPrice)) {
      params = params.set('minPrice', String(filters.minPrice));
    }
    if (filters.maxPrice !== null && filters.maxPrice !== undefined && Number.isFinite(filters.maxPrice)) {
      params = params.set('maxPrice', String(filters.maxPrice));
    }
    if (filters.sort && filters.sort !== 'relevance') {
      params = params.set('sort', filters.sort);
    }

    return this.http.get<{ products: any[]; pagination: ProductPaginationMeta }>(`${this.apiUrl}/products`, { params }).pipe(
      map(res => {
        const rawList = Array.isArray(res?.products)
          ? res.products
          : (Array.isArray((res as any)?.data?.products)
            ? (res as any).data.products
            : (Array.isArray(res as any) ? (res as any) : []));
        const products = rawList.map((p: any) => this.mapProduct(p));
        const pagination = res.pagination || (res as any)?.data?.pagination || {
          page: filters.page || 1,
          limit: filters.limit || 9,
          total: products.length,
          pages: Math.max(1, Math.ceil(products.length / (filters.limit || 9)))
        };
        return { products, pagination };
      })
    );
  }

  static getBackendUrl(): string {
    return getBackendBaseUrl();
  }

  static resolveImageUrl(url?: string): string {
    return utilResolveImageUrl(url);
  }

  private mapProduct(p: any): Product {
    const prodId = p._id || p.id;
    const rawImage = (p.imageUrl && !p.imageUrl.includes('placeholder'))
      ? p.imageUrl
      : (Array.isArray(p.images) && p.images.find((img: string) => img && !img.includes('placeholder')))
        || p.imageUrl
        || (p.imageFileId || p.image_file_id ? `/api/products/images/${p.imageFileId || p.image_file_id}` : '')
        || (prodId ? `/api/products/${prodId}/image` : '')
        || '/api/products/placeholder';

    const resolvedImage = ProductService.resolveImageUrl(rawImage);
    const resolvedImages = Array.isArray(p.images)
      ? p.images.map((img: string) => ProductService.resolveImageUrl(img))
      : [resolvedImage];

    return {
      id: p._id || p.id,
      _id: p._id,
      name: p.name || 'Unnamed Product',
      description: p.description || '',
      price: Number(p.price) || 0,
      image: resolvedImage,
      imageUrl: resolvedImage,
      images: resolvedImages,
      category: p.category || 'General',
      categoryId: p.categoryId || p.category_id || undefined,
      sku: p.sku || '',
      stock: Number(p.stock) ?? 0,
      available: p.isAvailable !== false && p.is_available !== false && p.available !== false && (Number(p.stock) ?? 0) > 0,
      active: p.active !== false,
      createdAt: p.createdAt,
      attributes: p.attributes || {},
      rating: p.rating !== undefined ? Number(p.rating) : 0,
      reviewCount: p.reviewCount !== undefined ? Number(p.reviewCount) : (p.review_count !== undefined ? Number(p.review_count) : 0),
      slug: p.slug || '',
      brand: p.brand || '',
      material: p.material || ''
    };
  }

  getProducts(): Product[] {
    return this.inventoryService.getProducts();
  }

  getAllProducts(): Product[] {
    return this.inventoryService.getAdminProducts();
  }

  getProductById(id: number | string): Product | undefined {
    const product = this.inventoryService.getProduct(id);
    if (product) {
      product.image = ProductService.resolveImageUrl(product.image || product.imageUrl);
      product.imageUrl = product.image;
    }
    return product;
  }

  fetchProductById(id: number | string): Observable<Product | null> {
    return this.http.get<any>(`${this.apiUrl}/products/${id}`).pipe(
      map(res => {
        const raw = res?.data || res?.product || res;
        return raw ? this.mapProduct(raw) : null;
      }),
      catchError(() => of(null))
    );
  }

  fetchCategories(): Observable<string[]> {
    return this.categoryService.fetchCategories().pipe(
      map(cats => cats.map(c => c.name).filter(Boolean))
    );
  }

  getCategories(): string[] {
    return this.categoryService.getCategories().map(category => category.name);
  }
}