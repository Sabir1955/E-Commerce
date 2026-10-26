import { Component, ChangeDetectorRef, effect } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  CartItem,
  CartService
} from '../../core/services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.css'
})
export class Cart {

  constructor(
    public cartService: CartService,
    private cdr: ChangeDetectorRef
  ) {
    effect(() => {
      this.cartService.cartItems();
      this.cdr.markForCheck();
    });
  }

  get items(): CartItem[] {
    return this.cartService.getItems();
  }

  get hasUnavailableItems(): boolean {
    return this.items.some(item =>
      !item.product.available || item.product.stock < item.quantity
    );
  }

  increase(id: number | string): void {
    if (!this.cartService.increaseQuantity(id)) {
      alert('No more stock is available for this product.');
    }
  }

  canIncrease(id: number | string): boolean {
    return this.cartService.canAddMore(id);
  }

  decrease(id: number | string): void {
    this.cartService.decreaseQuantity(id);
  }

  remove(id: number | string): void {
    this.cartService.removeFromCart(id);
  }
}