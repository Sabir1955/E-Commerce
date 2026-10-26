import { isPlatformBrowser } from '@angular/common';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { BrowserStorageService } from './browser-storage.service';
import { PRODUCT_CATALOG, Product } from './product-catalog';
import { environment } from '../../../environments/environment';
import { resolveImageUrl } from '../utils/image-url.util';

export interface InventoryItem {
  productId: number | string;
  stock: number;
  available: boolean;
}

export interface StockAdjustment {
  productId: number | string;
  quantity: number;
}

@Injectable({
  providedIn: 'root'
})
export class InventoryService {
  private readonly storageKey = 'astrology_inventory';
  private readonly catalogStorageKey = 'astrology_products';
  get apiUrl(): string {
    return environment.apiUrl;
  }
  private inventory: InventoryItem[];
  private catalog: Product[];

  constructor(
    private storage: BrowserStorageService,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.catalog = this.readCatalog();
    this.inventory = this.readInventory();
    if (isPlatformBrowser(this.platformId)) {
      this.syncWithBackend();
    }
  }

  syncWithBackend(): void {
    this.http.get<{ products: any[] }>(`${this.apiUrl}/products?limit=100`).pipe(timeout(5000)).subscribe({
      next: (res) => {
        if (Array.isArray(res?.products)) {
          if (res.products.length > 0) {
            const apiProducts: Product[] = res.products.map(p => ({
              id: p._id || p.id,
              _id: p._id,
              name: p.name,
              description: p.description,
              price: p.price,
              image: resolveImageUrl(
                (p.imageUrl && !p.imageUrl.includes('placeholder'))
                  ? p.imageUrl
                  : (Array.isArray(p.images) && p.images.find((img: string) => img && !img.includes('placeholder')))
                    || p.imageUrl
              ),
              imageUrl: resolveImageUrl(p.imageUrl),
              images: Array.isArray(p.images)
                ? p.images.map((img: string) => resolveImageUrl(img))
                : [resolveImageUrl(p.imageUrl)],
              category: p.category,
              sku: p.sku || '',
              stock: p.stock ?? 0,
              available: p.isAvailable !== false && p.is_available !== false && p.available !== false && (p.stock ?? 0) > 0,
              active: p.active !== false,
              createdAt: p.createdAt,
              attributes: p.attributes
            }));
            this.catalog = apiProducts;
            this.persistCatalog();

            this.inventory = apiProducts.map(p => ({
              productId: p.id,
              stock: p.stock,
              available: Boolean(p.available)
            }));
            this.persist();
          } else {
            this.catalog = [];
            this.persistCatalog();
            this.inventory = [];
            this.persist();
          }
        }
      },
      error: (err) => {
        console.warn('Backend products not loaded, using local catalog:', err.message);
      }
    });
  }

  getProducts(): Product[] {
    return this.getAdminProducts().filter(product => product.active !== false);
  }

  getAdminProducts(): Product[] {
    return this.catalog.map(product => {
      const inventory = this.getItem(product.id);
      return {
        ...product,
        stock: inventory.stock,
        available: inventory.available
      };
    });
  }

  getProduct(productId: number | string): Product | undefined {
    const product = this.getAdminProduct(productId);
    return product?.active === false ? undefined : product;
  }

  getAdminProduct(productId: number | string): Product | undefined {
    const product = this.catalog.find(item => 
      String(item.id) === String(productId) ||
      (item._id && String(item._id) === String(productId))
    );
    if (!product) return undefined;
    const inventory = this.getItem(product.id);
    return {
      ...product,
      stock: inventory.stock,
      available: inventory.available
    };
  }

  addProduct(product: Omit<Product, 'id' | 'available' | 'active'>): Product | null {
    if (!this.isValidProduct(product) || (product.sku && this.isSkuInUse(product.sku))) {
      return null;
    }

    const id = Date.now();
    const saved: Product = {
      ...product,
      id,
      active: true,
      available: product.stock > 0,
      createdAt: product.createdAt ?? new Date().toISOString()
    };
    this.catalog.push(saved);
    this.inventory.push({
      productId: id,
      stock: product.stock,
      available: product.stock > 0
    });
    this.persistCatalog();
    this.persist();

    // Sync to backend MongoDB
    this.http.post<any>(`${this.apiUrl}/products`, {
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      stock: product.stock,
      sku: product.sku || undefined,
      imageUrl: product.image
    }).subscribe({
      next: (created) => {
        if (created?._id) {
          saved._id = created._id;
          saved.id = created._id;
          this.persistCatalog();
        }
      },
      error: (err) => console.warn('Could not sync created product to backend:', err.message)
    });

    return this.getAdminProduct(id) ?? null;
  }

  isSkuInUse(sku: string, exceptProductId?: number | string): boolean {
    const normalizedSku = sku.trim().toLowerCase();
    if (!normalizedSku) return false;
    return this.catalog.some(product =>
      String(product.id) !== String(exceptProductId) &&
      (product.sku?.trim().toLowerCase() === normalizedSku)
    );
  }

  isCategoryInUse(category: string): boolean {
    const normalizedCategory = category.trim().toLowerCase();
    return this.catalog.some(product =>
      product.category.trim().toLowerCase() === normalizedCategory
    );
  }

  updateProduct(product: Product): boolean {
    const index = this.catalog.findIndex(item => 
      String(item.id) === String(product.id) ||
      (item._id && String(item._id) === String(product.id))
    );
    if (
      index === -1 ||
      !this.isValidProduct(product) ||
      this.catalog.some(item =>
        String(item.id) !== String(product.id) &&
        item.sku && product.sku &&
        item.sku.trim().toLowerCase() === product.sku.trim().toLowerCase()
      )
    ) {
      return false;
    }

    const current = this.catalog[index];
    this.catalog[index] = {
      ...product,
      createdAt: product.createdAt ?? current.createdAt,
      stock: this.getItem(product.id).stock,
      available: this.getItem(product.id).available,
      active: current.active !== false
    };
    this.persistCatalog();

    // Sync to backend MongoDB
    const targetId = product._id || product.id;
    if (targetId) {
      this.http.patch(`${this.apiUrl}/products/${targetId}`, {
        name: product.name,
        description: product.description,
        category: product.category,
        price: product.price,
        stock: product.stock,
        sku: product.sku,
        imageUrl: product.image
      }).subscribe({
        error: (err) => console.warn('Could not sync updated product to backend:', err.message)
      });
    }

    return true;
  }

  setProductActive(productId: number | string, active: boolean): boolean {
    const product = this.catalog.find(item => 
      String(item.id) === String(productId) ||
      (item._id && String(item._id) === String(productId))
    );
    if (!product) return false;

    product.active = active;
    this.persistCatalog();

    const targetId = product._id || product.id;
    if (targetId) {
      if (!active) {
        this.http.delete(`${this.apiUrl}/products/${targetId}`).subscribe({
          error: () => {}
        });
      } else {
        this.http.patch(`${this.apiUrl}/products/${targetId}`, { active: true }).subscribe({
          error: () => {}
        });
      }
    }

    return true;
  }

  deleteProduct(productId: number | string): boolean {
    return this.setProductActive(productId, false);
  }

  ensureProduct(product: Product): void {
    if (!product || (product.id === undefined && (product as any)._id === undefined)) return;
    const targetId = product.id ?? (product as any)._id;
    const exists = this.catalog.some(p => String(p.id) === String(targetId) || (p._id && String(p._id) === String(targetId)));
    if (!exists) {
      this.catalog.push({ ...product, id: targetId, active: product.active !== false });
      const currentStock = Number(product.stock) > 0 ? Number(product.stock) : 10;
      this.saveItem({
        productId: targetId,
        stock: currentStock,
        available: product.available !== false && currentStock > 0
      }, false);
    }
  }

  getItem(productId: number | string): InventoryItem {
    const saved = this.inventory.find(item => 
      String(item.productId) === String(productId)
    );
    if (saved) {
      return { ...saved };
    }

    const product = this.catalog.find(item => 
      String(item.id) === String(productId) ||
      (item._id && String(item._id) === String(productId))
    );
    return {
      productId,
      stock: product?.stock ?? 0,
      available: !!product && product.available !== false && (product.stock ?? 0) > 0
    };
  }

  addStock(productId: number | string, quantity: number): boolean {
    const item = this.getItem(productId);
    if (!this.isValidQuantity(quantity) || !this.catalog.some(product => String(product.id) === String(productId))) {
      return false;
    }

    const stock = item.stock + quantity;
    if (!Number.isSafeInteger(stock) || stock > 1_000_000) {
      return false;
    }

    this.saveItem({ productId, stock, available: true });

    // Sync to backend
    const product = this.getProduct(productId);
    const targetId = product?._id || productId;
    this.http.post(`${this.apiUrl}/products/${targetId}/inventory/adjust`, { amount: quantity }).subscribe({
      error: () => {}
    });

    return true;
  }

  updateStock(productId: number | string, stock: number): boolean {
    if (
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 1_000_000 ||
      !this.catalog.some(product => String(product.id) === String(productId))
    ) {
      return false;
    }

    const item = this.getItem(productId);
    this.saveItem({
      productId,
      stock,
      available: stock > 0 && item.available
    });

    // Sync to backend
    const product = this.getProduct(productId);
    const targetId = product?._id || productId;
    this.http.patch(`${this.apiUrl}/products/${targetId}/inventory`, { quantity: stock }).subscribe({
      error: () => {}
    });

    return true;
  }

  reduceStock(productId: number | string, quantity: number): boolean {
    const item = this.getItem(productId);
    if (
      !this.isValidQuantity(quantity) ||
      !this.catalog.some(product => String(product.id) === String(productId)) ||
      quantity > item.stock
    ) {
      return false;
    }

    const stock = item.stock - quantity;
    this.saveItem({
      productId,
      stock,
      available: stock > 0 && item.available
    });

    const product = this.getProduct(productId);
    const targetId = product?._id || productId;
    this.http.post(`${this.apiUrl}/products/${targetId}/inventory/adjust`, { amount: -quantity }).subscribe({
      error: () => {}
    });

    return true;
  }

  markOutOfStock(productId: number | string): boolean {
    return this.updateStock(productId, 0);
  }

  setAvailability(productId: number | string, available: boolean): boolean {
    const item = this.getItem(productId);
    const product = this.catalog.find(p =>
      String(p.id) === String(productId) || (p._id && String(p._id) === String(productId))
    );
    if (!product || (available && item.stock === 0)) {
      return false;
    }

    this.saveItem({ ...item, available });
    product.available = available;
    this.persistCatalog();

    // Sync availability to PostgreSQL through backend API
    const targetId = product._id || product.id || productId;
    this.http.patch(`${this.apiUrl}/products/${targetId}`, {
      available,
      isAvailable: available,
      is_available: available
    }).subscribe({
      error: (err) => console.warn('Could not sync product availability to backend:', err.message)
    });

    return true;
  }

  canFulfill(items: StockAdjustment[]): boolean {
    if (items.length === 0) {
      return false;
    }

    const quantities = new Map<string | number, number>();
    for (const { productId, quantity } of items) {
      if (!this.isValidQuantity(quantity)) {
        return false;
      }

      quantities.set(
        productId,
        (quantities.get(productId) ?? 0) + quantity
      );
    }

    return [...quantities].every(([productId, quantity]) => {
      const item = this.getItem(productId);
      return item.available && item.stock >= quantity;
    });
  }

  consumeStock(items: StockAdjustment[]): boolean {
    if (!this.canFulfill(items)) {
      return false;
    }

    const quantities = new Map<string | number, number>();
    for (const item of items) {
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity
      );
    }

    const updatedItems: InventoryItem[] = [];
    for (const [productId, quantity] of quantities) {
      const item = this.getItem(productId);
      const stock = item.stock - quantity;
      updatedItems.push({
        productId,
        stock,
        available: stock > 0 && item.available
      });
      // Sync stock reduction to backend
      const product = this.getProduct(productId);
      const targetId = product?._id || productId;
      this.http.post(`${this.apiUrl}/products/${targetId}/inventory/adjust`, { amount: -quantity }).subscribe({
        error: () => {}
      });
    }

    for (const item of updatedItems) {
      this.saveItem(item, false);
    }
    this.persistCatalog();
    this.persist();
    return true;
  }

  private isValidQuantity(quantity: number): boolean {
    return Number.isSafeInteger(quantity) && quantity > 0;
  }

  private isValidProduct(product: Partial<Product>): boolean {
    return typeof product.name === 'string' &&
      product.name.trim().length > 0 &&
      typeof product.description === 'string' &&
      product.description.trim().length > 0 &&
      Number.isFinite(product.price) &&
      (product.price ?? 0) > 0 &&
      typeof product.category === 'string' &&
      product.category.trim().length > 0 &&
      Number.isSafeInteger(product.stock) &&
      (product.stock ?? -1) >= 0 &&
      (product.stock ?? 1_000_001) <= 1_000_000;
  }

  private saveItem(item: InventoryItem, persist = true): void {
    const index = this.inventory.findIndex(
      saved => String(saved.productId) === String(item.productId)
    );

    if (index === -1) {
      this.inventory.push(item);
    } else {
      this.inventory[index] = item;
    }

    if (persist) {
      this.persist();
    }
  }

  private persist(): void {
    this.storage.setItem(this.storageKey, JSON.stringify(this.inventory));
  }

  private persistCatalog(): void {
    this.storage.setItem(this.catalogStorageKey, JSON.stringify(this.catalog));
  }

  private readCatalog(): Product[] {
    const saved = this.storage.getItem(this.catalogStorageKey);
    if (!saved) {
      return PRODUCT_CATALOG.map(product => ({ ...product, active: true }));
    }

    try {
      const value: unknown = JSON.parse(saved);
      if (!Array.isArray(value)) {
        throw new Error('Saved product catalog is not an array.');
      }

      return value.map((product: any) => ({
        ...product,
        id: product._id || product.id,
        image: resolveImageUrl(product.image || product.imageUrl),
        imageUrl: resolveImageUrl(product.imageUrl || product.image),
        images: Array.isArray(product.images)
          ? product.images.map((img: string) => resolveImageUrl(img))
          : [resolveImageUrl(product.image || product.imageUrl)],
        active: product.active !== false,
        available: product.isAvailable !== false && product.is_available !== false && product.available !== false && (product.stock ?? 0) > 0
      }));
    } catch (error) {
      console.error('Could not read saved product catalog.', error);
      return PRODUCT_CATALOG.map(product => ({ ...product, active: true }));
    }
  }

  private readInventory(): InventoryItem[] {
    const saved = this.storage.getItem(this.storageKey);
    if (!saved) {
      return [];
    }

    try {
      const value: unknown = JSON.parse(saved);
      if (!Array.isArray(value)) {
        return [];
      }

      return value.map((item: any) => ({
        productId: item.productId,
        stock: Number(item.stock) || 0,
        available: Boolean(item.available)
      }));
    } catch {
      return [];
    }
  }
}
