import { Component, OnInit, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface AdminCategory {
  _id: string;
  name: string;
  slug?: string;
  description?: string;
  active: boolean;
  productCount: number;
  editingName: string;
  editingDescription: string;
  isEditing: boolean;
}

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categories.html',
  styleUrl: './categories.css'
})
export class AdminCategories implements OnInit, AfterViewInit {
  categories: AdminCategory[] = [];
  newCategory = '';
  newDescription = '';
  showAddForm = false;
  message = '';
  isError = false;
  isLoading = false;
  isSubmitting = false;
  searchTerm = '';

  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.categories.length === 0 && !this.isLoading) {
      this.loadCategories();
    }
  }

  get filteredCategories(): AdminCategory[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.categories;
    return this.categories.filter(c =>
      c.name && c.name.toLowerCase().includes(term)
    );
  }

  loadCategories(): void {
    this.isLoading = true;
    this.http.get<any>(`${environment.apiUrl}/categories?all=true`).subscribe({
      next: (res) => {
        this.isLoading = false;
        const list = res?.categories || res?.data?.categories || (Array.isArray(res) ? res : []);
        this.categories = list.map((cat: any) => ({
          _id: cat._id || cat.id,
          name: cat.name || '',
          slug: cat.slug || '',
          description: cat.description || '',
          active: cat.active !== false,
          productCount: cat.productCount || 0,
          editingName: cat.name || '',
          editingDescription: cat.description || '',
          isEditing: false
        })).sort((a: AdminCategory, b: AdminCategory) => (a.name || '').localeCompare(b.name || ''));
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to load categories from MongoDB:', err);
        this.showMessage('Could not load categories from the server.', true);
        this.cdr.detectChanges();
      }
    });
  }

  openAddCategory(): void {
    this.showAddForm = true;
    this.newCategory = '';
    this.newDescription = '';
    this.message = '';
  }

  closeAddCategory(): void {
    this.showAddForm = false;
    this.newCategory = '';
    this.newDescription = '';
  }

  addCategory(): void {
    const trimmed = this.newCategory.trim();
    if (!trimmed || trimmed.length > 60) {
      this.showMessage('Enter a valid category name (up to 60 characters).', true);
      return;
    }

    if (this.categories.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
      this.showMessage(`Category "${trimmed}" already exists.`, true);
      return;
    }

    this.isSubmitting = true;
    const payload: any = {
      name: trimmed
    };
    if (this.newDescription.trim()) {
      payload.description = this.newDescription.trim();
    }

    this.http.post<any>(`${environment.apiUrl}/categories`, payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.showMessage(`Category "${trimmed}" added successfully!`);
        this.closeAddCategory();
        this.loadCategories();
      },
      error: (err) => {
        this.isSubmitting = false;
        console.error('Error adding category:', err);
        const errorMsg = err?.error?.message || 'Could not add category. Please retry.';
        this.showMessage(errorMsg, true);
      }
    });
  }

  startEdit(category: AdminCategory): void {
    category.isEditing = true;
    category.editingName = category.name;
    category.editingDescription = category.description || '';
  }

  cancelEdit(category: AdminCategory): void {
    category.isEditing = false;
    category.editingName = category.name;
    category.editingDescription = category.description || '';
  }

  saveCategoryEdit(category: AdminCategory): void {
    const trimmed = category.editingName.trim();
    if (!trimmed || trimmed.length > 60) {
      this.showMessage('Enter a valid category name (up to 60 characters).', true);
      return;
    }

    if (this.categories.some(c => c._id !== category._id && c.name.toLowerCase() === trimmed.toLowerCase())) {
      this.showMessage(`A category named "${trimmed}" already exists.`, true);
      return;
    }

    const payload: any = {
      name: trimmed,
      description: (category.editingDescription || '').trim()
    };

    this.http.patch<any>(`${environment.apiUrl}/categories/${category._id}`, payload).subscribe({
      next: () => {
        category.isEditing = false;
        category.name = trimmed;
        category.description = payload.description;
        this.showMessage(`Category "${trimmed}" updated successfully.`);
        this.loadCategories();
      },
      error: (err) => {
        console.error('Error updating category:', err);
        const errorMsg = err?.error?.message || 'Could not update category.';
        this.showMessage(errorMsg, true);
      }
    });
  }

  // Aliases for compatibility
  startRename(category: AdminCategory): void {
    this.startEdit(category);
  }

  cancelRename(category: AdminCategory): void {
    this.cancelEdit(category);
  }

  renameCategory(category: AdminCategory): void {
    this.saveCategoryEdit(category);
  }

  toggleCategory(category: AdminCategory): void {
    const nextActive = !category.active;

    this.http.patch<any>(`${environment.apiUrl}/categories/${category._id}`, { active: nextActive }).subscribe({
      next: () => {
        this.showMessage(`Category "${category.name}" ${nextActive ? 'activated' : 'deactivated'}.`);
        this.loadCategories();
      },
      error: (err) => {
        console.error('Error toggling category status:', err);
        const errorMsg = err?.error?.message || 'Could not update category status.';
        this.showMessage(errorMsg, true);
      }
    });
  }

  deleteCategory(category: AdminCategory): void {
    const confirmMsg = category.productCount > 0
      ? `Are you sure you want to delete category "${category.name}"? Note: ${category.productCount} product(s) currently belong to this category.`
      : `Are you sure you want to delete category "${category.name}"?`;
    const confirmed = confirm(confirmMsg);
    if (!confirmed) return;

    this.http.delete<any>(`${environment.apiUrl}/categories/${category._id}?hard=true`).subscribe({
      next: () => {
        this.showMessage(`Category "${category.name}" was deleted.`);
        this.loadCategories();
      },
      error: (err) => {
        console.error('Error deleting category:', err);
        const errorMsg = err?.error?.message || 'Could not delete this category from database.';
        this.showMessage(errorMsg, true);
      }
    });
  }

  private showMessage(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
    if (!isError) {
      setTimeout(() => {
        if (this.message === message) {
          this.message = '';
        }
      }, 5000);
    }
  }
}
