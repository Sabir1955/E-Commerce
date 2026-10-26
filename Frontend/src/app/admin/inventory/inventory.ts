import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { Product } from '../../core/services/product.service';

interface InventoryRow {
  product: Product;
  amountToAdd: number;
  amountToReduce: number;
  targetStock: number;
}

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './inventory.html',
  styleUrl: './inventory.css'
})
export class Inventory {
  rows: InventoryRow[] = [];
  message = '';
  isError = false;

  constructor(private inventoryService: InventoryService) {
    this.loadInventory();
  }

  loadInventory(): void {
    this.rows = this.inventoryService.getProducts().map(product => ({
      product,
      amountToAdd: 1,
      amountToReduce: 1,
      targetStock: product.stock
    }));
  }

  addStock(row: InventoryRow): void {
    this.runInventoryChange(
      () => this.inventoryService.addStock(row.product.id, row.amountToAdd),
      `${row.product.name}: added ${row.amountToAdd} unit(s).`,
      'Enter a valid stock quantity that does not exceed the inventory limit.'
    );
  }

  updateStock(row: InventoryRow): void {
    this.runInventoryChange(
      () => this.inventoryService.updateStock(row.product.id, row.targetStock),
      `${row.product.name}: stock updated to ${row.targetStock}.`,
      'Stock must be a whole number between 0 and 1,000,000.'
    );
  }

  reduceStock(row: InventoryRow): void {
    this.runInventoryChange(
      () => this.inventoryService.reduceStock(row.product.id, row.amountToReduce),
      `${row.product.name}: reduced by ${row.amountToReduce} unit(s).`,
      'Enter a valid reduction that does not exceed the current stock.'
    );
  }

  markOutOfStock(row: InventoryRow): void {
    this.runInventoryChange(
      () => this.inventoryService.markOutOfStock(row.product.id),
      `${row.product.name} is now marked out of stock.`,
      'Could not update this product inventory.'
    );
  }

  toggleAvailability(row: InventoryRow): void {
    const available = !row.product.available;
    this.runInventoryChange(
      () => this.inventoryService.setAvailability(row.product.id, available),
      `${row.product.name} is now ${available ? 'available' : 'unavailable'}.`,
      'Add stock before making this product available.'
    );
  }

  private runInventoryChange(
    action: () => boolean,
    successMessage: string,
    invalidMessage: string
  ): void {
    try {
      if (!action()) {
        this.showMessage(invalidMessage, true);
        return;
      }
      this.showMessage(successMessage);
      this.loadInventory();
    } catch (error) {
      console.error('Could not save inventory changes.', error);
      this.showMessage('Could not save inventory changes. Check available browser storage and retry.', true);
    }
  }

  private showMessage(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
  }
}
