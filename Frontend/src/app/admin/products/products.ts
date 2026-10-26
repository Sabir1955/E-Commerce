import { Component, OnInit, AfterViewInit, Inject, PLATFORM_ID, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { resolveImageUrl, getApiBaseUrl, toRelativeImageUrl } from '../../core/utils/image-url.util';

export interface AdminProduct {
  _id: string;
  name: string;
  description: string;
  sku?: string;
  price: number;
  category: string;
  categoryId?: string;
  category_id?: string;
  imageUrl?: string;
  images?: string[];
  image_file_id?: string;
  imageFileId?: string;
  imageFileIds?: string[];
  stock: number;
  rating?: number;
  reviewCount?: number;
  featured?: boolean;
  active?: boolean;
  attributes?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}

interface ProductForm {
  name: string;
  description: string;
  price: number | null;
  category: string;
  categoryId: string;
  sku: string;
  stock: number | null;
  attributes: string;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  description: '',
  price: null,
  category: '',
  categoryId: '',
  sku: '',
  stock: null,
  attributes: ''
};

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class AdminProducts implements OnInit, AfterViewInit {
  products: AdminProduct[] = [];
  categories: CategoryOption[] = [];
  form: ProductForm = { ...EMPTY_FORM };
  editingProductId: string | null = null;
  showForm = false;
  @ViewChild('richEditor') richEditorRef?: ElementRef<HTMLDivElement>;

  message = '';
  isError = false;
  isLoading = false;
  isSaving = false;
  searchTerm = '';
  selectedImageFile: File | null = null;
  imagePreview = '';
  imageUploadPending = false;

  get apiUrl(): string {
    return getApiBaseUrl();
  }

  private isBrowser: boolean;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  execEditorCmd(cmd: string, val: string = ''): void {
    if (this.isBrowser) {
      document.execCommand(cmd, false, val);
      this.onEditorInput();
    }
  }

  execEditorFormat(tag: string): void {
    if (this.isBrowser) {
      document.execCommand('formatBlock', false, tag);
      this.onEditorInput();
    }
  }

  onEditorInput(): void {
    if (this.richEditorRef?.nativeElement) {
      this.form.description = this.richEditorRef.nativeElement.innerHTML;
    }
  }

  onEditorBlur(): void {
    this.onEditorInput();
  }

  private setEditorContent(content: string): void {
    setTimeout(() => {
      if (this.richEditorRef?.nativeElement) {
        this.richEditorRef.nativeElement.innerHTML = content || '';
      }
    }, 0);
  }

  ngOnInit(): void {
    this.loadCategories();
    this.loadProducts();
  }

  ngAfterViewInit(): void {
    if (this.isBrowser && this.products.length === 0 && !this.isLoading) {
      this.loadCategories();
      this.loadProducts();
    }
  }

  get filteredProducts(): AdminProduct[] {
    const term = this.searchTerm.trim().toLowerCase();
    if (!term) return this.products;
    return this.products.filter(p =>
      (p.name && p.name.toLowerCase().includes(term)) ||
      (p.sku && p.sku.toLowerCase().includes(term)) ||
      (p.category && p.category.toLowerCase().includes(term)) ||
      (p.description && p.description.toLowerCase().includes(term))
    );
  }

  loadProducts(): void {
    this.isLoading = true;
    this.http.get<any>(`${this.apiUrl}/products?all=true&limit=100`).subscribe({
      next: (res) => {
        this.isLoading = false;
        const list = res?.products || res?.data?.products || (Array.isArray(res) ? res : []);
        this.products = list.map((p: any) => ({
          ...p,
          _id: p._id || p.id,
          price: Number(p.price || 0),
          stock: Number(p.stock || 0)
        })).sort((a: AdminProduct, b: AdminProduct) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        console.error('Failed to load products from server:', err);
        this.showMessage('Could not load products from the server. Please check your connection.', true);
        this.cdr.detectChanges();
      }
    });
  }

  loadCategories(): void {
    this.http.get<any>(`${this.apiUrl}/categories?all=true`).subscribe({
      next: (res) => {
        const list = res?.categories || res?.data?.categories || (Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []));
        this.categories = list
          .filter((c: any) => c && c.active !== false && c.name)
          .map((c: any) => ({
            id: c._id || c.id,
            name: c.name
          }))
          .sort((a: CategoryOption, b: CategoryOption) => a.name.localeCompare(b.name));

        if (!this.form.categoryId && this.categories.length > 0) {
          this.form.categoryId = this.categories[0].id;
          this.form.category = this.categories[0].name;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.warn('Failed to load categories:', err);
        this.cdr.detectChanges();
      }
    });
  }

  onCategoryChange(catId: string): void {
    const found = this.categories.find(c => c.id === catId);
    if (found) {
      this.form.categoryId = found.id;
      this.form.category = found.name;
    }
  }

  openAddProduct(): void {
    this.editingProductId = null;
    this.form = {
      ...EMPTY_FORM,
      categoryId: this.categories[0]?.id || '',
      category: this.categories[0]?.name || ''
    };
    this.selectedImageFile = null;
    this.imagePreview = '';
    this.showForm = true;
    this.message = '';
    this.setEditorContent('');

    if (this.isBrowser) {
      setTimeout(() => {
        const formEl = document.getElementById('product-form-section') || document.querySelector('.product-form-card');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
    }
  }

  closeForm(): void {
    this.showForm = false;
    this.editingProductId = null;
    this.form = { ...EMPTY_FORM };
    this.selectedImageFile = null;
    this.imagePreview = '';
    this.setEditorContent('');
  }

  editProduct(product: AdminProduct): void {
    this.editingProductId = product._id;
    let attrStr = '';
    if (product.attributes && typeof product.attributes === 'object') {
      attrStr = Object.entries(product.attributes)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n');
    }

    const matching = this.categories.find(c =>
      (product.categoryId && c.id === product.categoryId) ||
      (product.category_id && c.id === product.category_id) ||
      (product.category && c.name.toLowerCase() === product.category.toLowerCase())
    );
    const resolvedCatId = matching ? matching.id : (this.categories[0]?.id || '');
    const resolvedCatName = matching ? matching.name : (product.category || this.categories[0]?.name || '');

    this.form = {
      name: product.name,
      description: product.description,
      price: product.price,
      categoryId: resolvedCatId,
      category: resolvedCatName,
      sku: product.sku || '',
      stock: product.stock,
      attributes: attrStr
    };
    this.imagePreview = product.imageUrl || (product.images && product.images[0]) || '';
    this.selectedImageFile = null;
    this.showForm = true;
    this.message = '';
    this.setEditorContent(product.description || '');

    // Auto-scroll to the top of the edit form so that when clicking Edit from the footer or table bottom,
    // the edit form is immediately visible without manual scrolling
    if (this.isBrowser) {
      setTimeout(() => {
        const formEl = document.getElementById('product-form-section') || document.querySelector('.product-form-card');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 50);
    }
  }

  saveProduct(): void {
    if (this.isSaving || this.imageUploadPending) return;

    this.message = '';
    this.isError = false;

    // 1. Sync rich editor content to form.description before validation
    if (this.richEditorRef?.nativeElement) {
      const html = this.richEditorRef.nativeElement.innerHTML.trim();
      const text = this.richEditorRef.nativeElement.textContent?.trim();
      if (!text && !html.includes('<img')) {
        this.showMessage('Please enter a product description.', true);
        return;
      }
      this.form.description = html;
    }

    if (!this.form.name?.trim()) {
      this.showMessage('Please enter a product name.', true);
      return;
    }

    if (!this.form.description?.trim()) {
      this.showMessage('Please enter a product description.', true);
      return;
    }

    if (this.form.price === null || this.form.price === undefined || this.form.price <= 0) {
      this.showMessage('Please enter a valid price greater than ₹0.', true);
      return;
    }

    if (this.form.stock === null || this.form.stock === undefined || this.form.stock < 0) {
      this.showMessage('Please enter a valid stock quantity (0 or more).', true);
      return;
    }

    let catId = this.form.categoryId;
    let catName = this.form.category?.trim();
    if (catId) {
      const found = this.categories.find(c => c.id === catId);
      if (found) {
        catName = found.name;
      }
    } else if (catName) {
      const found = this.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
      if (found) {
        catId = found.id;
      }
    }
    if (!catId && this.categories.length > 0) {
      catId = this.categories[0].id;
      catName = this.categories[0].name;
    }

    let sku = this.form.sku?.trim() || '';
    if (!sku) {
      sku = `ASTRO-${Date.now().toString(36).toUpperCase()}`;
      this.form.sku = sku;
    }

    const payload: any = {
      name: this.form.name.trim(),
      description: this.form.description.trim(),
      price: Number(this.form.price),
      stock: Math.floor(Number(this.form.stock)),
      category: catName,
      categoryId: catId,
      sku: sku.toUpperCase(),
      attributes: this.parseAttributes(this.form.attributes)
    };

    // Keep existing clean relative URL if editing and no new file selected
    if (this.imagePreview && !this.selectedImageFile && !this.imagePreview.startsWith('data:') && !this.imagePreview.startsWith('blob:')) {
      const cleanUrl = toRelativeImageUrl(this.imagePreview);
      payload.imageUrl = cleanUrl;
      payload.images = [cleanUrl];
    }

    // When an image file was selected, upload the image FIRST before creating the product
    if (this.selectedImageFile) {
      this.isSaving = true;
      this.imageUploadPending = true;
      this.cdr.detectChanges();

      const formData = new FormData();
      formData.append('images', this.selectedImageFile);

      this.http.post<any>(`${this.apiUrl}/products/upload-image`, formData).subscribe({
        next: (uploadRes) => {
          this.imageUploadPending = false;
          const uploadedUrl = uploadRes?.url || uploadRes?.imageUrl || uploadRes?.data?.url || (Array.isArray(uploadRes?.urls) && uploadRes.urls[0]) || '';
          const uploadedFileId = uploadRes?.fileId || uploadRes?.data?.fileId || '';
          if (uploadedUrl) {
            const cleanUrl = toRelativeImageUrl(uploadedUrl);
            payload.imageUrl = cleanUrl;
            payload.images = [cleanUrl];
            if (uploadedFileId) {
              payload.imageFileId = uploadedFileId;
              payload.imageFileIds = [uploadedFileId];
            }
            this.imagePreview = uploadedUrl;
          }
          this.persistProduct(payload);
        },
        error: (err) => {
          this.isSaving = false;
          this.imageUploadPending = false;
          console.error('Image upload failed:', err);
          const errorMsg = err?.error?.message || err?.message || 'Image upload failed. Please verify the image file and retry.';
          this.showMessage(`Failed to upload image: ${errorMsg}`, true);
          this.cdr.detectChanges();
        }
      });
    } else {
      this.isSaving = true;
      this.cdr.detectChanges();
      this.persistProduct(payload);
    }
  }

  private persistProduct(payload: any): void {
    if (this.editingProductId === null) {
      // Create new product
      this.http.post<any>(`${this.apiUrl}/products`, payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.selectedImageFile = null;
          this.showMessage(`"${payload.name}" was added successfully!`);
          this.closeForm();
          this.loadProducts();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Error creating product:', err);
          const errorMsg = err?.error?.message || err?.message || 'Could not create product. Please verify fields and retry.';
          this.showMessage(errorMsg, true);
          this.cdr.detectChanges();
        }
      });
    } else {
      // Update existing product
      this.http.patch<any>(`${this.apiUrl}/products/${this.editingProductId}`, payload).subscribe({
        next: () => {
          this.isSaving = false;
          this.selectedImageFile = null;
          this.showMessage(`"${payload.name}" was updated successfully!`);
          this.closeForm();
          this.loadProducts();
          this.cdr.detectChanges();
        },
        error: (err) => {
          this.isSaving = false;
          console.error('Error updating product:', err);
          const errorMsg = err?.error?.message || err?.message || 'Could not update product. Please verify details.';
          this.showMessage(errorMsg, true);
          this.cdr.detectChanges();
        }
      });
    }
  }

  deactivateProduct(product: AdminProduct): void {
    this.http.patch<any>(`${this.apiUrl}/products/${product._id}`, { active: false }).subscribe({
      next: () => {
        this.showMessage(`"${product.name}" was deactivated and hidden from store.`);
        this.loadProducts();
      },
      error: (err) => {
        console.error('Error deactivating product:', err);
        this.showMessage('Could not deactivate this product.', true);
      }
    });
  }

  reactivateProduct(product: AdminProduct): void {
    this.http.patch<any>(`${this.apiUrl}/products/${product._id}`, { active: true }).subscribe({
      next: () => {
        this.showMessage(`"${product.name}" is visible in the storefront again.`);
        this.loadProducts();
      },
      error: (err) => {
        console.error('Error reactivating product:', err);
        this.showMessage('Could not reactivate this product.', true);
      }
    });
  }

  deleteProduct(product: AdminProduct): void {
    const confirmed = confirm(`Are you sure you want to permanently delete "${product.name}"?`);
    if (!confirmed) return;

    this.http.delete<any>(`${this.apiUrl}/products/${product._id}?hard=true`).subscribe({
      next: () => {
        this.showMessage(`"${product.name}" was permanently deleted.`);
        this.loadProducts();
      },
      error: (err) => {
        console.error('Error deleting product:', err);
        this.showMessage('Could not delete this product from the database.', true);
      }
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showMessage('Please select an image file (PNG, JPG, SVG, WebP).', true);
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.showMessage('Image file size must be under 5 MB.', true);
      input.value = '';
      return;
    }

    this.selectedImageFile = file;

    // Immediately display preview using object URL and trigger change detection
    const winUrl = (typeof window !== 'undefined' && (window.URL || (window as any).webkitURL)) || (typeof URL !== 'undefined' ? URL : null);
    if (winUrl && typeof winUrl.createObjectURL === 'function') {
      try {
        this.imagePreview = winUrl.createObjectURL(file);
        this.cdr.detectChanges();
      } catch {
        // fallback to FileReader
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.imagePreview = reader.result as string;
      this.cdr.detectChanges();
    };
    reader.onerror = () => {
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }



  getProductImage(product: AdminProduct): string {
    const rawImage = (product.imageUrl && product.imageUrl.trim() && !product.imageUrl.includes('placeholder'))
      ? product.imageUrl.trim()
      : (Array.isArray(product.images) && product.images.find(img => img && !img.includes('placeholder')))
        || product.imageUrl
        || (product.image_file_id || (product as any).imageFileId ? `/api/products/images/${product.image_file_id || (product as any).imageFileId}` : '')
        || (product._id ? `/api/products/${product._id}/image` : '')
        || '/api/products/placeholder';

    return this.resolveImageUrl(rawImage);
  }

  resolveImageUrl(url?: string): string {
    return resolveImageUrl(url);
  }

  private parseAttributes(value: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    if (!value) return attributes;

    for (const line of value.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let name = '';
      let attrVal = '';
      const colonIdx = trimmed.indexOf(':');
      const equalIdx = trimmed.indexOf('=');

      if (colonIdx > 0) {
        name = trimmed.slice(0, colonIdx).trim();
        attrVal = trimmed.slice(colonIdx + 1).trim();
      } else if (equalIdx > 0) {
        name = trimmed.slice(0, equalIdx).trim();
        attrVal = trimmed.slice(equalIdx + 1).trim();
      } else {
        name = trimmed;
        attrVal = 'Yes';
      }

      if (name && attrVal) {
        attributes[name] = attrVal;
      }
    }
    return attributes;
  }

  private showMessage(message: string, isError = false): void {
    this.message = message;
    this.isError = isError;
    if (!isError) {
      setTimeout(() => {
        if (this.message === message) {
          this.message = '';
        }
      }, 6000);
    }
  }
}
