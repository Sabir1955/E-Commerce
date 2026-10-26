import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Inventory } from './inventory';
import { InventoryService } from '../../core/services/inventory.service';
import { Product } from '../../core/services/product.service';

describe('Inventory Component', () => {
  let component: Inventory;
  let fixture: ComponentFixture<Inventory>;
  let inventoryService: InventoryService;

  const mockProducts: Product[] = [
    {
      id: 'p1',
      _id: 'p1',
      name: 'Vedic Rudraksha Mala',
      description: 'Sacred beads for meditation',
      price: 1500,
      image: '/uploads/rudraksha.jpg',
      category: 'Rudraksha',
      sku: 'RUD-001',
      stock: 25,
      available: true,
      active: true
    },
    {
      id: 'p2',
      _id: 'p2',
      name: 'Shree Yantra Gold Plated',
      description: 'Sacred geometric plate',
      price: 2100,
      image: '/uploads/yantra.jpg',
      category: 'Sacred Yantras',
      sku: 'YAN-002',
      stock: 0,
      available: false,
      active: true
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Inventory],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    inventoryService = TestBed.inject(InventoryService);
    vi.spyOn(inventoryService, 'getProducts').mockReturnValue(mockProducts);

    fixture = TestBed.createComponent(Inventory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and display inventory table without Quick Adjust column', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const table = compiled.querySelector('.inventory-table');
    expect(table).toBeTruthy();

    const headers = Array.from(compiled.querySelectorAll('.inventory-table thead th')).map(
      th => th.textContent?.trim()
    );
    expect(headers).toEqual([
      'Product',
      'Category',
      'Current Stock',
      'Status',
      'Set Stock',
      'Actions'
    ]);
    expect(headers).not.toContain('Quick Adjust');

    const rows = compiled.querySelectorAll('.inventory-table tbody tr');
    expect(rows.length).toBe(2);
    expect(compiled.textContent).toContain('Vedic Rudraksha Mala');
    expect(compiled.textContent).toContain('Shree Yantra Gold Plated');
  });

  it('should display correct stock numbers and status badges', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('25');
    expect(compiled.textContent).toContain('Available');
    expect(compiled.textContent).toContain('Out of stock');
  });

  it('should call addStock on inventory service when quick add is submitted', () => {
    const addSpy = vi.spyOn(inventoryService, 'addStock').mockReturnValue(true);
    component.rows[0].amountToAdd = 5;
    component.addStock(component.rows[0]);

    expect(addSpy).toHaveBeenCalledWith('p1', 5);
    expect(component.message).toContain('added 5 unit(s)');
  });
});
