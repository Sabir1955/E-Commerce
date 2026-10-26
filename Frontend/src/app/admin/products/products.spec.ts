import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminProducts } from './products';
import { environment } from '../../../environments/environment';

describe('AdminProducts Component', () => {
  let component: AdminProducts;
  let fixture: ComponentFixture<AdminProducts>;
  let httpTesting: HttpTestingController;

  const mockProducts = [
    {
      _id: 'prod-1',
      name: 'Navgraha Yantra',
      sku: 'ASTRO-YNT-001',
      price: 2500,
      stock: 15,
      category: 'Yantra',
      description: 'Sacred Vedic geometry for 9 planetary energies',
      active: true,
      createdAt: '2026-10-01T10:00:00.000Z'
    },
    {
      _id: 'prod-2',
      name: '5 Mukhi Rudraksha',
      sku: 'ASTRO-RUD-005',
      price: 1200,
      stock: 0,
      category: 'Rudraksha',
      description: 'Authentic 5 Mukhi bead from Nepal',
      active: false,
      createdAt: '2026-10-02T10:00:00.000Z'
    }
  ];

  const mockCategories = [
    { _id: 'cat-1', name: 'Yantra', active: true },
    { _id: 'cat-2', name: 'Rudraksha', active: true }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProducts],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminProducts);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize, show prominent Add Product button at top, and display products in clean table format', () => {
    fixture.detectChanges();

    // Respond to categories and products requests
    const catReq = httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`);
    expect(catReq.request.method).toBe('GET');
    catReq.flush({ categories: mockCategories });

    const prodReq = httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`);
    expect(prodReq.request.method).toBe('GET');
    prodReq.flush({ products: mockProducts });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // 1. Prominent Add Product button at top
    const topAddBtn = compiled.querySelector('.top-add-btn') as HTMLButtonElement;
    expect(topAddBtn).toBeTruthy();
    expect(topAddBtn.textContent).toContain('Add Product');

    // 2. Clean table format
    const table = compiled.querySelector('.product-admin-table');
    expect(table).toBeTruthy();

    const rows = compiled.querySelectorAll('.product-admin-table tbody tr');
    expect(rows.length).toBe(2);

    expect(compiled.textContent).toContain('Navgraha Yantra');
    expect(compiled.textContent).toContain('5 Mukhi Rudraksha');
    expect(compiled.textContent).toContain('ASTRO-YNT-001');
    expect(compiled.textContent).toContain('₹2,500.00');
  });

  it('clicking Add Product should toggle form open, without any URL field, and Cancel should close it', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`).flush({ products: mockProducts });

    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    // Form should initially be hidden
    expect(compiled.querySelector('.product-form-card')).toBeNull();

    // Click prominent Add Product button
    const topAddBtn = compiled.querySelector('.top-add-btn') as HTMLButtonElement;
    topAddBtn.click();
    fixture.detectChanges();

    // Form should now be open
    const formCard = compiled.querySelector('.product-form-card');
    expect(formCard).toBeTruthy();
    expect(formCard?.textContent).toContain('Create New Product');

    // Verify fields: Name, SKU, Price, Stock, Category, File input, Description, Attributes are present
    expect(compiled.querySelector('input[name="productName"]')).toBeTruthy();
    expect(compiled.querySelector('input[name="productSku"]')).toBeTruthy();
    expect(compiled.querySelector('input[name="productPrice"]')).toBeTruthy();
    expect(compiled.querySelector('input[name="productStock"]')).toBeTruthy();
    expect(compiled.querySelector('[name="productCategory"]')).toBeTruthy();
    expect(compiled.querySelector('input[type="file"]')).toBeTruthy();
    expect(compiled.querySelector('.rich-editor-content')).toBeTruthy();
    expect(compiled.querySelector('textarea[name="productAttributes"]')).toBeTruthy();

    // Verify URL field is NOT present
    expect(compiled.querySelector('.image-url')).toBeNull();
    expect(compiled.querySelector('input[name="productImage"]')).toBeNull();

    // Click Cancel button
    const cancelBtn = compiled.querySelector('.cancel-button') as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();
    fixture.detectChanges();

    // Form should now be closed
    expect(compiled.querySelector('.product-form-card')).toBeNull();
  });

  it('should immediately show image preview when a file is selected without requiring description interaction', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`).flush({ products: mockProducts });

    component.openAddProduct();
    fixture.detectChanges();

    const mockFn = vi.fn().mockReturnValue('blob:http://localhost:5000/mock-preview');
    if (typeof window !== 'undefined') {
      window.URL.createObjectURL = mockFn;
    }
    if (typeof URL !== 'undefined') {
      URL.createObjectURL = mockFn;
    }

    const mockFile = new File(['dummy-bytes'], 'rudraksha.png', { type: 'image/png' });
    const mockEvent = {
      target: {
        files: [mockFile]
      }
    } as unknown as Event;

    component.onImageSelected(mockEvent);
    expect(component.imagePreview).toBeTruthy();
    expect(component.selectedImageFile).toBe(mockFile);

    fixture.detectChanges();
    const previewImg = (fixture.nativeElement as HTMLElement).querySelector('.image-preview');
    expect(previewImg).toBeTruthy();
  });

  it('should upload image first then submit product with uploaded image URL', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`).flush({ products: mockProducts });

    component.openAddProduct();
    fixture.detectChanges();

    component.form.name = 'New Divine Mala';
    component.form.description = '<p>Blessed and energized mala</p>';
    component.form.price = 999;
    component.form.stock = 10;
    component.form.category = 'Rudraksha';
    component.selectedImageFile = new File(['bytes'], 'mala.jpg', { type: 'image/jpeg' });

    component.saveProduct();

    // 1. Upload image first
    const uploadReq = httpTesting.expectOne(`${environment.apiUrl}/products/upload-image`);
    expect(uploadReq.request.method).toBe('POST');
    uploadReq.flush({
      success: true,
      url: '/uploads/1728312000-mala.jpg'
    });

    // 2. Product submission happens after upload completes
    const createReq = httpTesting.expectOne(`${environment.apiUrl}/products`);
    expect(createReq.request.method).toBe('POST');
    expect(createReq.request.body.imageUrl).toBe('/uploads/1728312000-mala.jpg');
    expect(createReq.request.body.images).toEqual(['/uploads/1728312000-mala.jpg']);
    createReq.flush({
      success: true,
      data: {
        _id: 'prod-new',
        name: 'New Divine Mala',
        imageUrl: '/uploads/1728312000-mala.jpg'
      }
    });

    // After success, it reloads products
    httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`).flush({ products: mockProducts });
    expect(component.message).toContain('was added successfully');
  });

  it('should not create product if image upload fails and display the upload error', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    httpTesting.expectOne(`${environment.apiUrl}/products?all=true&limit=100`).flush({ products: mockProducts });

    component.openAddProduct();
    fixture.detectChanges();

    component.form.name = 'Failed Upload Item';
    component.form.description = '<p>Test description</p>';
    component.form.price = 500;
    component.form.stock = 5;
    component.form.category = 'Yantra';
    component.selectedImageFile = new File(['bytes'], 'corrupt.jpg', { type: 'image/jpeg' });

    component.saveProduct();

    // Upload request fails
    const uploadReq = httpTesting.expectOne(`${environment.apiUrl}/products/upload-image`);
    uploadReq.flush(
      { message: 'File format not accepted by server' },
      { status: 400, statusText: 'Bad Request' }
    );

    // Product creation must NOT be called
    httpTesting.expectNone(`${environment.apiUrl}/products`);
    expect(component.isSaving).toBe(false);
    expect(component.imageUploadPending).toBe(false);
    expect(component.message).toContain('Failed to upload image');
    expect(component.isError).toBe(true);
  });
});
