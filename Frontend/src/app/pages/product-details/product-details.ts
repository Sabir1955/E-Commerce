import { Component, ChangeDetectorRef, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  Product,
  ProductService
} from '../../core/services/product.service';
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-product-details',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css'
})
export class ProductDetails implements OnInit {
  product?: Product;
  quantity: number = 1;
  message = '';
  errorMessage = '';

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    const paramId = this.route.snapshot.paramMap.get('id') ?? '';
    const id = /^\d+$/.test(paramId) ? Number(paramId) : paramId;
    this.product = this.productService.getProductById(id);
    this.quantity = 1;

    this.productService.fetchProductById(id).subscribe(p => {
      if (p) {
        this.product = p;
        this.cdr.markForCheck();
      }
    });
  }

  increaseQuantity(): void {
    if (!this.product) return;
    const maxStock = this.product.stock !== undefined ? this.product.stock : 99;
    if (this.quantity < maxStock) {
      this.quantity++;
      this.cdr.markForCheck();
    }
  }

  decreaseQuantity(): void {
    if (this.quantity > 1) {
      this.quantity--;
      this.cdr.markForCheck();
    }
  }

  onQuantityChange(): void {
    if (!this.product) return;
    const maxStock = this.product.stock !== undefined ? this.product.stock : 99;
    if (!this.quantity || this.quantity < 1) {
      this.quantity = 1;
    } else if (this.quantity > maxStock) {
      this.quantity = maxStock;
    }
    this.cdr.markForCheck();
  }

  addToCart(): void {
    if (!this.product) return;
    this.message = '';
    this.errorMessage = '';

    const added = this.cartService.addToCart(this.product, this.quantity);
    this.cdr.markForCheck();

    if (added) {
      this.message = `Added ${this.quantity} item(s) to cart!`;
      setTimeout(() => {
        this.message = '';
        this.cdr.markForCheck();
      }, 3000);
    } else {
      this.errorMessage = 'Unable to add to cart. Available stock reached.';
      setTimeout(() => {
        this.errorMessage = '';
        this.cdr.markForCheck();
      }, 3000);
    }
  }

  buyNow(): void {
    if (!this.product) return;
    const added = this.cartService.addToCart(this.product, this.quantity);
    this.cdr.markForCheck();
    if (added) {
      this.router.navigate(['/checkout']);
    } else {
      this.errorMessage = 'Unable to proceed with purchase. Stock unavailable.';
      this.cdr.markForCheck();
    }
  }
}