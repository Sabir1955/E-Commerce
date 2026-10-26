import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PickupLocation {
  _id: string;
  name: string;
  contactName: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  active: boolean;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

@Component({
  selector: 'app-admin-pickup-locations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pickup-locations.html',
  styleUrl: './pickup-locations.css'
})
export class AdminPickupLocations implements OnInit {
  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);

  locations: PickupLocation[] = [];
  isLoading = false;
  isSubmitting = false;
  searchTerm = '';
  showForm = false;
  isEditing = false;
  editingLocationId: string | null = null;
  message = '';
  isError = false;

  formData = {
    name: '',
    contactName: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India',
    isDefault: false
  };

  ngOnInit(): void {
    this.loadLocations();
  }

  loadLocations(): void {
    this.isLoading = true;
    this.http.get<{ locations?: PickupLocation[]; data?: PickupLocation[] }>(
      `${environment.apiUrl}/pickup-locations`
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        const list = res?.locations || res?.data || (Array.isArray(res) ? res : []);
        this.locations = Array.isArray(list) ? list : [];
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.isLoading = false;
        this.isError = true;
        this.message = err?.error?.message || 'Failed to load pickup locations from database.';
        this.cdr.detectChanges();
      }
    });
  }

  get filteredLocations(): PickupLocation[] {
    const q = this.searchTerm.trim().toLowerCase();
    if (!q) return this.locations;
    return this.locations.filter((loc) =>
      (loc.name && loc.name.toLowerCase().includes(q)) ||
      (loc.contactName && loc.contactName.toLowerCase().includes(q)) ||
      (loc.city && loc.city.toLowerCase().includes(q)) ||
      (loc.state && loc.state.toLowerCase().includes(q)) ||
      (loc.postalCode && loc.postalCode.toLowerCase().includes(q)) ||
      (loc.address && loc.address.toLowerCase().includes(q)) ||
      (loc.phone && loc.phone.toLowerCase().includes(q))
    );
  }

  openAdd(): void {
    this.isEditing = false;
    this.editingLocationId = null;
    this.resetForm();
    this.showForm = true;
    this.message = '';
  }

  startEdit(loc: PickupLocation): void {
    this.isEditing = true;
    this.editingLocationId = loc._id;
    this.formData = {
      name: loc.name || '',
      contactName: loc.contactName || '',
      phone: loc.phone || '',
      address: loc.address || '',
      city: loc.city || '',
      state: loc.state || '',
      postalCode: loc.postalCode || '',
      country: loc.country || 'India',
      isDefault: !!loc.isDefault
    };
    this.showForm = true;
    this.message = '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelForm(): void {
    this.showForm = false;
    this.isEditing = false;
    this.editingLocationId = null;
    this.resetForm();
  }

  resetForm(): void {
    this.formData = {
      name: '',
      contactName: '',
      phone: '',
      address: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'India',
      isDefault: false
    };
  }

  saveLocation(): void {
    const { name, contactName, phone, address, city, state, postalCode } = this.formData;
    if (!name.trim() || !contactName.trim() || !phone.trim() || !address.trim() || !city.trim() || !state.trim() || !postalCode.trim()) {
      this.isError = true;
      this.message = 'All fields (Name, Contact Person, Phone, Address, City, State, Postal Code) are required.';
      return;
    }

    this.isSubmitting = true;
    this.message = '';
    this.isError = false;

    const payload = {
      name: name.trim(),
      contactName: contactName.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      postalCode: postalCode.trim(),
      country: (this.formData.country || 'India').trim(),
      isDefault: this.formData.isDefault
    };

    if (this.isEditing && this.editingLocationId) {
      this.http.patch<PickupLocation>(
        `${environment.apiUrl}/pickup-locations/${this.editingLocationId}`,
        payload
      ).subscribe({
        next: (updated) => {
          this.isSubmitting = false;
          this.isError = false;
          this.message = `Pickup location "${updated.name || payload.name}" updated successfully.`;
          this.cancelForm();
          this.loadLocations();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.isError = true;
          this.message = err?.error?.message || 'Failed to update pickup location.';
        }
      });
    } else {
      this.http.post<PickupLocation>(
        `${environment.apiUrl}/pickup-locations`,
        payload
      ).subscribe({
        next: (created) => {
          this.isSubmitting = false;
          this.isError = false;
          this.message = `Pickup location "${created.name || payload.name}" added successfully.`;
          this.cancelForm();
          this.loadLocations();
        },
        error: (err) => {
          this.isSubmitting = false;
          this.isError = true;
          this.message = err?.error?.message || 'Failed to add pickup location.';
        }
      });
    }
  }

  setDefault(loc: PickupLocation): void {
    this.message = '';
    this.isError = false;
    this.http.patch<PickupLocation>(
      `${environment.apiUrl}/pickup-locations/${loc._id}`,
      { isDefault: true }
    ).subscribe({
      next: () => {
        this.message = `"${loc.name}" is now set as the default return pickup location.`;
        this.loadLocations();
      },
      error: (err) => {
        this.isError = true;
        this.message = err?.error?.message || 'Failed to set default location.';
      }
    });
  }

  deleteLocation(loc: PickupLocation): void {
    if (!confirm(`Are you sure you want to delete pickup location "${loc.name}"?`)) {
      return;
    }

    this.message = '';
    this.isError = false;
    this.http.delete<{ message: string }>(
      `${environment.apiUrl}/pickup-locations/${loc._id}`
    ).subscribe({
      next: (res) => {
        this.isError = false;
        this.message = res?.message || `Pickup location "${loc.name}" deleted successfully.`;
        this.loadLocations();
      },
      error: (err) => {
        this.isError = true;
        this.message = err?.error?.message || 'Failed to delete pickup location.';
      }
    });
  }
}
