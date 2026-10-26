import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute } from '@angular/router';
import { vi } from 'vitest';
import { ProductDetails } from './product-details';
import { ProductService, Product } from '../../core/services/product.service';
import { CartService } from '../../core/services/cart.service';

describe('ProductDetails Component', () => {
  let component: ProductDetails;
  let fixture: ComponentFixture<ProductDetails>;
  let productService: ProductService;
  let cartService: CartService;
  let router: Router;

  const mockProduct: Product = {
    id: 1,
    name: 'Navgraha Yantra',
    price: 999,
    description: 'Sacred consecrated 9-planet yantra for planetary peace.',
    image: 'https://example.com/yantra.jpg',
    category: 'Yantra',
    stock: 10,
    available: true
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductDetails],
      providers: [
        provideRouter([
          { path: 'checkout', children: [] }
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => (key === 'id' ? '1' : null)
              }
            }
          }
        }
      ]
    }).compileComponents();

    productService = TestBed.inject(ProductService);
    cartService = TestBed.inject(CartService);
    router = TestBed.inject(Router);

    vi.spyOn(productService, 'getProductById').mockReturnValue(mockProduct);

    fixture = TestBed.createComponent(ProductDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and render the product image, title, price, description and quantity', () => {
    expect(component).toBeTruthy();
    expect(component.product?.name).toBe('Navgraha Yantra');
    expect(component.quantity).toBe(1);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.product-name')?.textContent).toContain('Navgraha Yantra');
    expect(compiled.querySelector('.product-price')?.textContent).toContain('₹999');
    expect(compiled.querySelector('.description-text')?.textContent).toContain('Sacred consecrated');
    expect(compiled.querySelector('input#product-qty-input')).toBeTruthy();
  });

  it('should increase and decrease quantity within valid stock limits', () => {
    component.increaseQuantity();
    expect(component.quantity).toBe(2);

    component.decreaseQuantity();
    expect(component.quantity).toBe(1);

    // Should not decrease below 1
    component.decreaseQuantity();
    expect(component.quantity).toBe(1);
  });

  it('should call cartService.addToCart with the product and current quantity', () => {
    component.quantity = 3;
    const cartSpy = vi.spyOn(cartService, 'addToCart').mockReturnValue(true);

    component.addToCart();

    expect(cartSpy).toHaveBeenCalledWith(mockProduct, 3);
    expect(component.message).toContain('Added 3 item(s) to cart');
  });

  it('should call cartService.addToCart and navigate to checkout on Buy Now', () => {
    component.quantity = 2;
    vi.spyOn(cartService, 'addToCart').mockReturnValue(true);
    const navSpy = vi.spyOn(router, 'navigate');

    component.buyNow();

    expect(navSpy).toHaveBeenCalledWith(['/checkout']);
  });

  it('should not contain any wishlist button or reviews section', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.wishlist-button')).toBeNull();
    expect(compiled.querySelector('.wishlist-toggle')).toBeNull();
    expect(compiled.querySelector('.reviews-section')).toBeNull();
  });
});
