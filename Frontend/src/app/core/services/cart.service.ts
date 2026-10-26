import { Injectable, signal, computed, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { BrowserStorageService } from './browser-storage.service';
import { InventoryService } from './inventory.service';
import { Product } from './product.service';
import { AuthService, AuthUser } from './auth.service';
import { environment } from '../../../environments/environment';
import { resolveImageUrl } from '../utils/image-url.util';

export interface CartItem {
  product: Product;
  quantity: number;
}

export function getCartStorageKey(user: AuthUser | null): string {
  if (!user) {
    return 'astrology_cart_guest';
  }
  const identifier = (user.id || (user as any)._id || user.email || 'session').toString().trim().toLowerCase();
  const rolePrefix = user.role === 'admin' ? 'admin' : 'user';
  return `astrology_cart_${rolePrefix}_${identifier}`;
}

@Injectable({
  providedIn: 'root'
})
export class CartService implements OnDestroy {
  private items: CartItem[] = [];
  private currentStorageKey = 'astrology_cart_guest';
  private authSub?: Subscription;

  get apiUrl(): string {
    return environment.apiUrl;
  }

  // Reactive signals for instant view updates across components
  readonly cartItems = signal<CartItem[]>([]);
  readonly cartCount = computed(() =>
    this.cartItems().reduce((total, item) => total + item.quantity, 0)
  );
  readonly subtotal = computed(() =>
    this.cartItems().reduce((total, item) => total + (item.product.price || 0) * item.quantity, 0)
  );

  constructor(
    private storage: BrowserStorageService,
    private inventoryService: InventoryService,
    private authService: AuthService,
    private http: HttpClient
  ) {
    const currentUser = this.authService.getCurrentUser();
    this.currentStorageKey = getCartStorageKey(currentUser);
    this.loadSessionCart();

    // React whenever user session changes (login, logout, switch account)
    this.authSub = this.authService.currentUser$.subscribe(user => {
      this.switchSession(user);
    });
  }

  ngOnDestroy(): void {
    this.authSub?.unsubscribe();
  }

  /**
   * Load logged-in user cart directly from MongoDB backend API
   */
  loadCartFromBackend(): void {
    if (!this.authService.isLoggedIn()) {
      return;
    }

    this.http.get<{ cart?: any; data?: { cart?: any } }>(`${this.apiUrl}/cart`).subscribe({
      next: (res) => {
        const cart = res?.data?.cart || res?.cart;
        if (cart && Array.isArray(cart.items)) {
          const loaded: CartItem[] = cart.items
            .filter((entry: any) => entry.product)
            .map((entry: any) => {
              const p = entry.product;
              const invProduct = this.inventoryService.getProduct(p._id || p.id);
              const product: Product = {
                id: p._id || p.id,
                _id: p._id,
                name: p.name,
                description: p.description,
                price: p.price,
                image: resolveImageUrl(p.imageUrl || (Array.isArray(p.images) && p.images[0]) || invProduct?.image || '/images/navgraha-yantra.svg'),
                imageUrl: p.imageUrl,
                images: p.images,
                category: p.category,
                sku: p.sku || invProduct?.sku || '',
                stock: p.stock ?? invProduct?.stock ?? 0,
                available: (p.stock ?? invProduct?.stock ?? 0) > 0,
                active: p.active !== false,
                createdAt: p.createdAt,
                attributes: p.attributes
              };
              return {
                product,
                quantity: entry.quantity
              };
            });

          this.items = loaded;
          this.cartItems.set([...this.items]);
        }
      },
      error: (err) => {
        console.warn('Could not load cart from MongoDB:', err.message);
      }
    });
  }

  private loadSessionCart(): void {
    const saved = this.storage.getItem(this.currentStorageKey);
    if (saved) {
      try {
        this.items = JSON.parse(saved);
        if (Array.isArray(this.items)) {
          this.items.forEach(item => {
            if (item?.product) {
              item.product.image = resolveImageUrl(item.product.image || item.product.imageUrl);
            }
          });
        }
      } catch {
        this.items = [];
      }
    } else {
      this.items = [];
    }
    this.cartItems.set([...this.items]);

    if (this.authService.isLoggedIn()) {
      this.loadCartFromBackend();
    }
  }

  getActiveCartKey(): string {
    this.ensureSessionSync();
    return this.currentStorageKey;
  }

  switchSession(user: AuthUser | null): void {
    this.currentStorageKey = getCartStorageKey(user);
    this.loadSessionCart();
  }

  private syncItemsToBackend(itemsToSync: CartItem[]): void {
    let completed = 0;
    for (const item of itemsToSync) {
      const prodId = item.product._id || item.product.id;
      this.http.post<any>(`${this.apiUrl}/cart/items`, {
        product: prodId,
        quantity: item.quantity
      }).subscribe({
        next: () => {
          completed++;
          if (completed === itemsToSync.length) {
            this.loadCartFromBackend();
          }
        },
        error: () => {
          completed++;
          if (completed === itemsToSync.length) {
            this.loadCartFromBackend();
          }
        }
      });
    }
  }

  adoptGuestItemsForCheckout(): void {
    if (!this.authService.isLoggedIn()) {
      return;
    }
    const guestCartRaw = this.storage.getItem('astrology_cart_guest');
    if (guestCartRaw) {
      try {
        const guestItems = JSON.parse(guestCartRaw) as CartItem[];
        if (Array.isArray(guestItems) && guestItems.length > 0) {
          this.items = [...guestItems];
          this.cartItems.set([...this.items]);
          this.storage.setItem(this.currentStorageKey, JSON.stringify(this.items));
          this.syncItemsToBackend(guestItems);
        }
      } catch {
        // ignore parse error
      }
    }
  }

  private ensureSessionSync(): void {
    const currentUser = this.authService.getCurrentUser();
    const expectedKey = getCartStorageKey(currentUser);
    if (expectedKey !== this.currentStorageKey) {
      this.switchSession(currentUser);
    }
  }

  addToCart(product: Product, quantity: number = 1): boolean {
    this.ensureSessionSync();
    if (product) {
      this.inventoryService.ensureProduct(product);
    }
    const baseProduct = this.inventoryService.getProduct(product.id) ?? product;
    const currentProduct = { ...baseProduct, image: resolveImageUrl(baseProduct.image || baseProduct.imageUrl) };
    const isAvailable = currentProduct.available !== false && (currentProduct.stock === undefined || currentProduct.stock > 0);
    if (!isAvailable) {
      return false;
    }

    const addQty = Math.max(1, Number(quantity) || 1);
    const targetStock = currentProduct.stock ?? 999;
    const existingItem = this.items.find(
      item => String(item.product.id) === String(product.id) ||
              (item.product._id && product._id && String(item.product._id) === String(product._id))
    );

    if (existingItem) {
      if (existingItem.quantity + addQty > targetStock) {
        return false;
      }
      existingItem.quantity += addQty;
      existingItem.product = currentProduct;
    } else {
      if (addQty > targetStock) {
        return false;
      }
      this.items.push({
        product: currentProduct,
        quantity: addQty
      });
    }

    this.cartItems.set([...this.items]);

    if (this.authService.isLoggedIn()) {
      const prodId = currentProduct._id || currentProduct.id || product._id || product.id;
      this.http.post<any>(`${this.apiUrl}/cart/items`, {
        product: prodId,
        quantity: addQty
      }).subscribe({
        next: () => {},
        error: (err) => console.warn('Failed to add to MongoDB cart:', err.message)
      });
    }
    this.storage.setItem(this.currentStorageKey, JSON.stringify(this.items));

    return true;
  }

  getItems(): CartItem[] {
    this.ensureSessionSync();
    for (const item of this.items) {
      const product = this.inventoryService.getProduct(item.product.id);
      if (product) {
        item.product = product;
      }
      if (item?.product) {
        item.product.image = resolveImageUrl(item.product.image || item.product.imageUrl);
      }
    }
    return this.items;
  }

  increaseQuantity(productId: number | string): boolean {
    this.ensureSessionSync();
    const item = this.items.find(
      cartItem => String(cartItem.product.id) === String(productId) ||
                  (cartItem.product._id && String(cartItem.product._id) === String(productId))
    );

    const currentProduct = this.inventoryService.getProduct(productId) ?? item?.product;
    const targetStock = currentProduct?.stock ?? 999;
    if (item && currentProduct?.available !== false && item.quantity < targetStock) {
      item.quantity++;
      if (currentProduct) {
        item.product = currentProduct;
      }
      this.cartItems.set([...this.items]);
      this.storage.setItem(this.currentStorageKey, JSON.stringify(this.items));

      if (this.authService.isLoggedIn()) {
        const prodId = item.product._id || item.product.id || productId;
        this.http.patch<any>(`${this.apiUrl}/cart/items/${prodId}`, {
          quantity: item.quantity
        }).subscribe({
          next: () => {},
          error: (err) => console.warn('Failed to update MongoDB cart item quantity:', err.message)
        });
      }
      return true;
    }

    return false;
  }

  canAddMore(productId: number | string): boolean {
    this.ensureSessionSync();
    const item = this.items.find(
      cartItem => String(cartItem.product.id) === String(productId) ||
                  (cartItem.product._id && String(cartItem.product._id) === String(productId))
    );
    const currentProduct = this.inventoryService.getProduct(productId) ?? item?.product;
    const targetStock = currentProduct?.stock ?? 999;
    return !!item &&
      currentProduct?.available !== false &&
      item.quantity < targetStock;
  }

  decreaseQuantity(productId: number | string): void {
    this.ensureSessionSync();
    const item = this.items.find(
      cartItem => String(cartItem.product.id) === String(productId) ||
                  (cartItem.product._id && String(cartItem.product._id) === String(productId))
    );

    if (item && item.quantity > 1) {
      item.quantity--;
      this.cartItems.set([...this.items]);
      this.storage.setItem(this.currentStorageKey, JSON.stringify(this.items));

      if (this.authService.isLoggedIn()) {
        const prodId = item.product._id || item.product.id || productId;
        this.http.patch<any>(`${this.apiUrl}/cart/items/${prodId}`, {
          quantity: item.quantity
        }).subscribe({
          next: () => {},
          error: (err) => console.warn('Failed to update MongoDB cart item quantity:', err.message)
        });
      }
    }
  }

  removeFromCart(productId: number | string): void {
    this.ensureSessionSync();
    const target = this.items.find(
      item => String(item.product.id) === String(productId) ||
              (item.product._id && String(item.product._id) === String(productId))
    );
    const resolvedId = target?.product._id || target?.product.id || productId;

    this.items = this.items.filter(
      item => String(item.product.id) !== String(productId) &&
              (!item.product._id || String(item.product._id) !== String(productId)) &&
              String(item.product.id) !== String(resolvedId) &&
              (!item.product._id || String(item.product._id) !== String(resolvedId))
    );

    this.cartItems.set([...this.items]);
    this.storage.setItem(this.currentStorageKey, JSON.stringify(this.items));

    if (this.authService.isLoggedIn()) {
      this.http.delete<any>(`${this.apiUrl}/cart/items/${resolvedId}`).subscribe({
        next: () => {},
        error: (err) => console.warn('Failed to remove item from MongoDB cart:', err.message)
      });
    }
  }

  getSubtotal(): number {
    this.ensureSessionSync();
    return this.subtotal();
  }

  getCartCount(): number {
    this.ensureSessionSync();
    return this.cartCount();
  }

  clearCart(): void {
    this.ensureSessionSync();
    this.items = [];
    this.cartItems.set([...this.items]);
    this.storage.setItem(this.currentStorageKey, JSON.stringify([]));

    if (this.authService.isLoggedIn()) {
      this.http.delete<any>(`${this.apiUrl}/cart`).subscribe({
        next: () => {},
        error: (err) => console.warn('Failed to clear MongoDB cart:', err.message)
      });
    }
  }
}