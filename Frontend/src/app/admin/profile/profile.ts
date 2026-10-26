import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService, AuthUser } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

export interface StoreAddressModel {
  storeName: string;
  contactName: string;
  phone: string;
  addressLine: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  // Compatibility aliases
  fullName?: string;
  mobile?: string;
  address?: string;
  postalCode?: string;
  formattedAddress?: string;
  _id?: string;
}

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class AdminProfile implements OnInit {
  currentAdmin: AuthUser | null = null;
  loading = false;
  saving = false;
  message = '';
  isError = false;
  isEditing = false;

  addressForm: StoreAddressModel = {
    storeName: 'Jyotish Astro Store',
    contactName: 'Master Astrologer',
    phone: '+919876543210',
    addressLine: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pinCode: '221001',
    country: 'India',
    fullName: 'Master Astrologer',
    mobile: '+919876543210',
    address: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
    postalCode: '221001'
  };

  currentAddress: StoreAddressModel | null = null;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: object
  ) {}

  ngOnInit(): void {
    this.currentAdmin = this.authService.getCurrentUser();
    if (this.currentAdmin) {
      if (this.currentAdmin.name) this.addressForm.contactName = this.currentAdmin.name;
      if (this.currentAdmin.name) this.addressForm.fullName = this.currentAdmin.name;
      if (this.currentAdmin.mobile) this.addressForm.phone = this.currentAdmin.mobile;
      if (this.currentAdmin.mobile) this.addressForm.mobile = this.currentAdmin.mobile;
    }

    if (isPlatformBrowser(this.platformId)) {
      this.fetchStoreAddress();
    }
  }

  enableEdit(): void {
    this.isEditing = true;
    this.setMessage('You can now edit the Store Address fields below.', false);
    this.cdr.detectChanges();
  }

  fetchStoreAddress(): void {
    this.loading = true;
    this.http.get<any>(`${environment.apiUrl}/orders/store-address`).subscribe({
      next: (res) => {
        this.loading = false;
        const data = res?.data || res;
        const addr = data?.address || data;
        if (addr) {
          const storeName = data.storeName || addr.storeName || 'Jyotish Astro Store';
          const contactName = data.contactName || addr.contactName || addr.fullName || this.currentAdmin?.name || 'Master Astrologer';
          const phone = data.phone || addr.phone || addr.mobile || this.currentAdmin?.mobile || '+919876543210';
          const addressLine = addr.addressLine || addr.address || '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi';
          const city = addr.city || 'Varanasi';
          const state = addr.state || 'Uttar Pradesh';
          const pinCode = addr.pinCode || addr.postalCode || '221001';
          const country = addr.country || 'India';

          this.currentAddress = {
            storeName,
            contactName,
            fullName: contactName,
            phone,
            mobile: phone,
            addressLine,
            address: addressLine,
            city,
            state,
            pinCode,
            postalCode: pinCode,
            country,
            formattedAddress: data.formattedAddress || addr.formattedAddress,
            _id: addr._id
          };

          this.addressForm = { ...this.currentAddress };
        } else if (data?.storeName) {
          this.addressForm.storeName = data.storeName;
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to load store address from MongoDB:', err);
        this.cdr.detectChanges();
      }
    });
  }

  saveStoreAddress(): void {
    const addressLine = (this.addressForm.addressLine || this.addressForm.address || '').trim();
    const city = (this.addressForm.city || '').trim();
    const state = (this.addressForm.state || '').trim();
    const pinCode = (this.addressForm.pinCode || this.addressForm.postalCode || '').trim();

    if (!addressLine) {
      this.setMessage('Address Line is required.', true);
      return;
    }
    if (!city) {
      this.setMessage('City is required.', true);
      return;
    }
    if (!state) {
      this.setMessage('State is required.', true);
      return;
    }
    if (!pinCode) {
      this.setMessage('PIN Code is required.', true);
      return;
    }

    this.saving = true;
    this.setMessage('', false);

    const storeName = (this.addressForm.storeName || 'Jyotish Astro Store').trim();
    const contactName = (this.addressForm.contactName || this.addressForm.fullName || 'Master Astrologer').trim();
    const phone = (this.addressForm.phone || this.addressForm.mobile || '+919876543210').trim();
    const country = (this.addressForm.country || 'India').trim();

    // Synchronize both sets of property names
    this.addressForm.storeName = storeName;
    this.addressForm.contactName = contactName;
    this.addressForm.fullName = contactName;
    this.addressForm.phone = phone;
    this.addressForm.mobile = phone;
    this.addressForm.addressLine = addressLine;
    this.addressForm.address = addressLine;
    this.addressForm.city = city;
    this.addressForm.state = state;
    this.addressForm.pinCode = pinCode;
    this.addressForm.postalCode = pinCode;
    this.addressForm.country = country;

    const payload = {
      storeName,
      contactName,
      fullName: contactName,
      managerName: contactName,
      phone,
      mobile: phone,
      storePhone: phone,
      addressLine,
      address: addressLine,
      city,
      state,
      pinCode,
      postalCode: pinCode,
      country
    };

    this.http.post<any>(`${environment.apiUrl}/admin/store-address`, payload).subscribe({
      next: (res) => {
        this.saving = false;
        const saved = res?.data?.address || res?.data || res?.address || res;
        if (saved) {
          this.currentAddress = {
            ...this.addressForm,
            _id: saved._id || this.addressForm._id,
            formattedAddress: res?.formattedAddress || res?.data?.formattedAddress
          };
          this.addressForm._id = this.currentAddress._id;
        }
        this.isEditing = false;
        this.setMessage('Store address saved successfully to MongoDB!', false);
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.saving = false;
        const errorMsg = err?.error?.message || 'Failed to save store address to MongoDB.';
        this.setMessage(errorMsg, true);
        this.cdr.detectChanges();
      }
    });
  }

  private setMessage(msg: string, isError: boolean): void {
    this.message = msg;
    this.isError = isError;
  }
}
