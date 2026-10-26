import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminCategories } from './categories';
import { environment } from '../../../environments/environment';

describe('AdminCategories Component', () => {
  let component: AdminCategories;
  let fixture: ComponentFixture<AdminCategories>;
  let httpTesting: HttpTestingController;

  const mockCategories = [
    {
      _id: 'cat-1',
      name: 'Yantra',
      slug: 'yantra',
      description: 'Sacred geometries',
      active: true,
      productCount: 4
    },
    {
      _id: 'cat-2',
      name: 'Rudraksha',
      slug: 'rudraksha',
      description: 'Sacred beads',
      active: false,
      productCount: 0
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminCategories],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminCategories);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize, show prominent Add Category button at top, and display categories table immediately below', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`);
    expect(req.request.method).toBe('GET');
    req.flush({ categories: mockCategories });

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // 1. Prominent Add Category button at top
    const topAddBtn = compiled.querySelector('.top-add-btn') as HTMLButtonElement;
    expect(topAddBtn).toBeTruthy();
    expect(topAddBtn.textContent).toContain('Add Category');

    // 2. Clean table/list format immediately below
    const table = compiled.querySelector('.category-admin-table');
    expect(table).toBeTruthy();

    const rows = compiled.querySelectorAll('.category-admin-table tbody tr');
    expect(rows.length).toBe(2);

    expect(compiled.textContent).toContain('Yantra');
    expect(compiled.textContent).toContain('Rudraksha');
    expect(compiled.textContent).toContain('4 products');
  });

  it('clicking Add Category should open the category creation form, and Cancel should close it', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;

    // Form should initially be hidden
    expect(compiled.querySelector('.add-category-card')).toBeNull();

    // Click prominent Add Category button
    const topAddBtn = compiled.querySelector('.top-add-btn') as HTMLButtonElement;
    topAddBtn.click();
    fixture.detectChanges();

    // Form should now be open
    const formCard = compiled.querySelector('.add-category-card');
    expect(formCard).toBeTruthy();
    expect(formCard?.textContent).toContain('Create New Category');

    expect(compiled.querySelector('input[name="newCategory"]')).toBeTruthy();

    // Click Cancel button
    const cancelBtn = compiled.querySelector('.cancel-button') as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();
    fixture.detectChanges();

    // Form should now be closed
    expect(compiled.querySelector('.add-category-card')).toBeNull();
  });

  it('every category must have Edit and Delete options and neither should be disabled even with assigned products', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('.category-admin-table tbody tr');
    expect(rows.length).toBe(2);

    rows.forEach((row) => {
      const editBtn = row.querySelector('.btn-edit') as HTMLButtonElement;
      const deleteBtn = row.querySelector('.btn-delete') as HTMLButtonElement;

      expect(editBtn).toBeTruthy();
      expect(editBtn.textContent?.trim()).toBe('Edit');
      expect(editBtn.disabled).toBe(false);

      expect(deleteBtn).toBeTruthy();
      expect(deleteBtn.textContent?.trim()).toBe('Delete');
      expect(deleteBtn.disabled).toBe(false);
    });
  });

  it('clicking Delete calls DELETE /api/categories/:id?hard=true and reloads categories', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    const compiled = fixture.nativeElement as HTMLElement;
    const firstRowDeleteBtn = compiled.querySelector('.category-admin-table tbody tr .btn-delete') as HTMLButtonElement;
    firstRowDeleteBtn.click();
    fixture.detectChanges();

    // Expect DELETE request for first row (Rudraksha, cat-2 because of alphabetical sorting)
    const delReq = httpTesting.expectOne(`${environment.apiUrl}/categories/cat-2?hard=true`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ message: 'Category permanently deleted', deleted: true });

    // Expect reload
    const reloadReq = httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`);
    expect(reloadReq.request.method).toBe('GET');
    reloadReq.flush({ categories: [mockCategories[0]] });
    fixture.detectChanges();

    const remainingRows = compiled.querySelectorAll('.category-admin-table tbody tr');
    expect(remainingRows.length).toBe(1);
    expect(compiled.textContent).toContain('Yantra');
  });

  it('clicking Edit allows modifying category and saves via PATCH', () => {
    fixture.detectChanges();

    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({ categories: mockCategories });
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const firstRowEditBtn = compiled.querySelector('.category-admin-table tbody tr .btn-edit') as HTMLButtonElement;
    firstRowEditBtn.click();
    fixture.detectChanges();

    // Inline edit form should appear in first row (Rudraksha, cat-2)
    const editInput = compiled.querySelector('input[name="editingName"]') as HTMLInputElement;
    expect(editInput).toBeTruthy();
    expect(component.categories[0].isEditing).toBe(true);

    component.categories[0].editingName = 'Sacred Rudraksha';
    component.categories[0].editingDescription = 'Authentic holy beads';

    component.saveCategoryEdit(component.categories[0]);

    const patchReq = httpTesting.expectOne(`${environment.apiUrl}/categories/cat-2`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({
      name: 'Sacred Rudraksha',
      description: 'Authentic holy beads'
    });
    patchReq.flush({
      category: {
        _id: 'cat-2',
        name: 'Sacred Rudraksha',
        slug: 'sacred-rudraksha',
        description: 'Authentic holy beads',
        active: false
      }
    });

    // Expect reload
    httpTesting.expectOne(`${environment.apiUrl}/categories?all=true`).flush({
      categories: [
        mockCategories[0],
        {
          _id: 'cat-2',
          name: 'Sacred Rudraksha',
          slug: 'sacred-rudraksha',
          description: 'Authentic holy beads',
          active: false,
          productCount: 0
        }
      ]
    });
    fixture.detectChanges();

    expect(component.categories.some(c => c.name === 'Sacred Rudraksha')).toBe(true);
  });
});
