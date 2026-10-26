import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CartService, getCartStorageKey } from './cart.service';
import { AuthService, AuthUser } from './auth.service';
import { BrowserStorageService } from './browser-storage.service';
import { Product } from './product.service';

describe('CartService State Isolation', () => {
  let cartService: CartService;
  let authService: AuthService;
  let storage: BrowserStorageService;

  const mockProductA: Product = {
    id: 101,
    name: 'Brass Diya',
    price: 500,
    category: 'Puja',
    image: '',
    description: 'Diya',
    stock: 10,
    available: true
  };

  const mockProductB: Product = {
    id: 102,
    name: 'Gemstone Ring',
    price: 1500,
    category: 'Gemstones',
    image: '',
    description: 'Ring',
    stock: 5,
    available: true
  };

  const mockProductC: Product = {
    id: 103,
    name: 'Rudraksha Mala',
    price: 800,
    category: 'Rudraksha',
    image: '',
    description: 'Mala',
    stock: 8,
    available: true
  };

  const userA: AuthUser = {
    id: 'user_a_123',
    name: 'User A',
    email: 'usera@example.com',
    mobile: '9876543210',
    role: 'customer'
  };

  const userB: AuthUser = {
    id: 'user_b_456',
    name: 'User B',
    email: 'userb@example.com',
    mobile: '9876543211',
    role: 'customer'
  };

  const adminUser: AuthUser = {
    id: 'admin_root',
    name: 'Admin Astro',
    email: 'astro@gmail.com',
    mobile: '9876543212',
    role: 'admin'
  };

  beforeEach(() => {
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });

    storage = TestBed.inject(BrowserStorageService);
    authService = TestBed.inject(AuthService);
    cartService = TestBed.inject(CartService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('getCartStorageKey should generate unique isolated storage keys', () => {
    expect(getCartStorageKey(null)).toBe('astrology_cart_guest');
    expect(getCartStorageKey(userA)).toBe('astrology_cart_user_user_a_123');
    expect(getCartStorageKey(userB)).toBe('astrology_cart_user_user_b_456');
    expect(getCartStorageKey(adminUser)).toBe('astrology_cart_admin_admin_root');

    // Ensure all 4 are distinct
    const keys = new Set([
      getCartStorageKey(null),
      getCartStorageKey(userA),
      getCartStorageKey(userB),
      getCartStorageKey(adminUser)
    ]);
    expect(keys.size).toBe(4);
  });

  it('guest cart should maintain isolated items and counts', () => {
    expect(cartService.getActiveCartKey()).toBe('astrology_cart_guest');
    expect(cartService.getCartCount()).toBe(0);

    cartService.addToCart(mockProductA);
    cartService.addToCart(mockProductA);

    expect(cartService.getCartCount()).toBe(2);
    expect(cartService.getItems().length).toBe(1);
    expect(cartService.getItems()[0].quantity).toBe(2);

    const savedGuest = storage.getItem('astrology_cart_guest');
    expect(savedGuest).toBeTruthy();
    expect(JSON.parse(savedGuest!).length).toBe(1);
  });

  it('logging in as User A isolates cart from guest and preserves guest cart in storage', () => {
    // 1. Guest adds product A
    cartService.addToCart(mockProductA);
    expect(cartService.getCartCount()).toBe(1);

    // 2. User A logs in
    authService.saveSession('token_a', userA);

    expect(cartService.getActiveCartKey()).toBe('astrology_cart_user_user_a_123');
    // User A starts with their own clean cart (count 0)
    expect(cartService.getCartCount()).toBe(0);
    expect(cartService.getItems().length).toBe(0);

    // 3. User A adds product B
    cartService.addToCart(mockProductB);
    cartService.addToCart(mockProductB);
    expect(cartService.getCartCount()).toBe(2);

    // Verify User A and Guest have different storage records
    const guestCart = JSON.parse(storage.getItem('astrology_cart_guest')!);
    const userACart = JSON.parse(storage.getItem('astrology_cart_user_user_a_123')!);

    expect(guestCart.length).toBe(1);
    expect(guestCart[0].product.name).toBe('Brass Diya');
    expect(userACart.length).toBe(1);
    expect(userACart[0].product.name).toBe('Gemstone Ring');
  });

  it('logging out restores guest cart and preserves User A cart', () => {
    // Guest adds Product A
    cartService.addToCart(mockProductA);
    expect(cartService.getCartCount()).toBe(1);

    // User A logs in and adds Product B
    authService.saveSession('token_a', userA);
    cartService.addToCart(mockProductB);
    expect(cartService.getCartCount()).toBe(1);

    // User A logs out
    authService.logout();

    expect(cartService.getActiveCartKey()).toBe('astrology_cart_guest');
    // Guest cart should be restored with Product A
    expect(cartService.getCartCount()).toBe(1);
    expect(cartService.getItems()[0].product.name).toBe('Brass Diya');

    // User A cart is still saved in storage
    const userACart = JSON.parse(storage.getItem('astrology_cart_user_user_a_123')!);
    expect(userACart.length).toBe(1);
    expect(userACart[0].product.name).toBe('Gemstone Ring');
  });

  it('User B and Admin Store View never share cart items or counts with User A or Guest', () => {
    // 1. Guest cart
    cartService.addToCart(mockProductA); // qty 1

    // 2. User A logs in and adds Product B (qty 2)
    authService.saveSession('token_a', userA);
    cartService.addToCart(mockProductB);
    cartService.addToCart(mockProductB);
    expect(cartService.getCartCount()).toBe(2);

    // 3. User B logs in
    authService.saveSession('token_b', userB);
    expect(cartService.getActiveCartKey()).toBe('astrology_cart_user_user_b_456');
    expect(cartService.getCartCount()).toBe(0); // Clean cart for User B

    // User B adds Product C (qty 3)
    cartService.addToCart(mockProductC);
    cartService.addToCart(mockProductC);
    cartService.addToCart(mockProductC);
    expect(cartService.getCartCount()).toBe(3);

    // 4. Admin logs in (Admin Store View)
    authService.saveSession('token_admin', adminUser);
    expect(cartService.getActiveCartKey()).toBe('astrology_cart_admin_admin_root');
    expect(cartService.getCartCount()).toBe(0); // Clean cart for Admin

    // Admin adds Product A (qty 4)
    cartService.addToCart(mockProductA);
    cartService.addToCart(mockProductA);
    cartService.addToCart(mockProductA);
    cartService.addToCart(mockProductA);
    expect(cartService.getCartCount()).toBe(4);

    // 5. Verify all four separate carts in storage
    const guestStored = JSON.parse(storage.getItem('astrology_cart_guest')!);
    const userAStored = JSON.parse(storage.getItem('astrology_cart_user_user_a_123')!);
    const userBStored = JSON.parse(storage.getItem('astrology_cart_user_user_b_456')!);
    const adminStored = JSON.parse(storage.getItem('astrology_cart_admin_admin_root')!);

    expect(guestStored[0].quantity).toBe(1);
    expect(userAStored[0].quantity).toBe(2);
    expect(userBStored[0].quantity).toBe(3);
    expect(adminStored[0].quantity).toBe(4);

    // 6. Switch back to User A
    authService.saveSession('token_a', userA);
    expect(cartService.getCartCount()).toBe(2);
    expect(cartService.getItems()[0].product.name).toBe('Gemstone Ring');

    // 7. Switch back to User B
    authService.saveSession('token_b', userB);
    expect(cartService.getCartCount()).toBe(3);
    expect(cartService.getItems()[0].product.name).toBe('Rudraksha Mala');

    // 8. Switch back to Admin
    authService.saveSession('token_admin', adminUser);
    expect(cartService.getCartCount()).toBe(4);

    // 9. Logout to guest
    authService.logout();
    expect(cartService.getCartCount()).toBe(1);
    expect(cartService.getItems()[0].product.name).toBe('Brass Diya');
  });

  it('clearCart should only clear the active session cart without touching others', () => {
    // Guest adds Product A
    cartService.addToCart(mockProductA);

    // User A adds Product B
    authService.saveSession('token_a', userA);
    cartService.addToCart(mockProductB);

    // User A clears cart
    cartService.clearCart();
    expect(cartService.getCartCount()).toBe(0);
    expect(cartService.getItems().length).toBe(0);

    // User A storage is empty
    const userACart = JSON.parse(storage.getItem('astrology_cart_user_user_a_123')!);
    expect(userACart.length).toBe(0);

    // Guest storage is NOT cleared
    const guestCart = JSON.parse(storage.getItem('astrology_cart_guest')!);
    expect(guestCart.length).toBe(1);
    expect(guestCart[0].quantity).toBe(1);

    // Switch back to guest
    authService.logout();
    expect(cartService.getCartCount()).toBe(1);
  });
});
