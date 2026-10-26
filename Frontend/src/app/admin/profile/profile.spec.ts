import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminProfile } from './profile';
import { environment } from '../../../environments/environment';

describe('AdminProfile Component', () => {
  let component: AdminProfile;
  let fixture: ComponentFixture<AdminProfile>;
  let httpTesting: HttpTestingController;

  const mockStoreData = {
    success: true,
    storeName: 'Jyotish Astro Store',
    contactName: 'Master Astrologer',
    phone: '+919876543210',
    addressLine: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
    city: 'Varanasi',
    state: 'Uttar Pradesh',
    pinCode: '221001',
    country: 'India',
    address: {
      _id: 'store-addr-1',
      fullName: 'Master Astrologer',
      contactName: 'Master Astrologer',
      mobile: '+919876543210',
      phone: '+919876543210',
      address: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
      addressLine: '108 Vedic Temple Marg, Near Ganga Ghat, Varanasi',
      city: 'Varanasi',
      state: 'Uttar Pradesh',
      postalCode: '221001',
      pinCode: '221001',
      country: 'India',
      isDefault: true
    }
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminProfile],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminProfile);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize and fetch store address from MongoDB API', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/orders/store-address`);
    expect(req.request.method).toBe('GET');
    req.flush(mockStoreData);

    fixture.detectChanges();

    expect(component.currentAddress).toBeTruthy();
    expect(component.addressForm.address).toBe('108 Vedic Temple Marg, Near Ganga Ghat, Varanasi');
    expect(component.addressForm.city).toBe('Varanasi');
    expect(component.addressForm.state).toBe('Uttar Pradesh');
    expect(component.addressForm.postalCode).toBe('221001');
    expect(component.addressForm.storeName).toBe('Jyotish Astro Store');
    expect(component.addressForm.contactName).toBe('Master Astrologer');
    expect(component.addressForm.phone).toBe('+919876543210');

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('108 Vedic Temple Marg');
    expect(compiled.textContent).toContain('Varanasi');
    expect(compiled.textContent).toContain('Uttar Pradesh');
    expect(compiled.textContent).toContain('Master Astrologer');
    expect(compiled.textContent).toContain('+919876543210');
  });

  it('should render Edit / Update button and Save button', () => {
    fixture.detectChanges();

    const initReq = httpTesting.expectOne(`${environment.apiUrl}/orders/store-address`);
    initReq.flush(mockStoreData);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const editBtn = compiled.querySelector('.edit-btn') as HTMLButtonElement;
    const saveBtn = compiled.querySelector('.submit-btn') as HTMLButtonElement;

    expect(editBtn).toBeTruthy();
    expect(editBtn.textContent).toContain('Edit / Update');
    expect(saveBtn).toBeTruthy();
    expect(saveBtn.textContent).toContain('Save');

    // Clicking Edit / Update enables editing
    editBtn.click();
    fixture.detectChanges();
    expect(component.isEditing).toBe(true);
  });

  it('should allow admin to update and save all 8 store address fields to MongoDB via POST', () => {
    fixture.detectChanges();

    const initReq = httpTesting.expectOne(`${environment.apiUrl}/orders/store-address`);
    initReq.flush(mockStoreData);
    fixture.detectChanges();

    component.addressForm.storeName = 'Jyotish Divine Store';
    component.addressForm.contactName = 'Chief Acharya';
    component.addressForm.phone = '+919876543299';
    component.addressForm.addressLine = '500 Temple Lane, Kashi Vishwanath Zone';
    component.addressForm.address = '500 Temple Lane, Kashi Vishwanath Zone';
    component.addressForm.city = 'Varanasi';
    component.addressForm.state = 'Uttar Pradesh';
    component.addressForm.pinCode = '221002';
    component.addressForm.postalCode = '221002';
    component.addressForm.country = 'India';

    component.saveStoreAddress();

    const postReq = httpTesting.expectOne(`${environment.apiUrl}/admin/store-address`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body.storeName).toBe('Jyotish Divine Store');
    expect(postReq.request.body.contactName).toBe('Chief Acharya');
    expect(postReq.request.body.phone).toBe('+919876543299');
    expect(postReq.request.body.address).toBe('500 Temple Lane, Kashi Vishwanath Zone');
    expect(postReq.request.body.addressLine).toBe('500 Temple Lane, Kashi Vishwanath Zone');
    expect(postReq.request.body.city).toBe('Varanasi');
    expect(postReq.request.body.state).toBe('Uttar Pradesh');
    expect(postReq.request.body.pinCode).toBe('221002');
    expect(postReq.request.body.postalCode).toBe('221002');
    expect(postReq.request.body.country).toBe('India');

    postReq.flush({
      success: true,
      data: {
        address: {
          _id: 'store-addr-1',
          fullName: 'Chief Acharya',
          contactName: 'Chief Acharya',
          mobile: '+919876543299',
          phone: '+919876543299',
          address: '500 Temple Lane, Kashi Vishwanath Zone',
          addressLine: '500 Temple Lane, Kashi Vishwanath Zone',
          city: 'Varanasi',
          state: 'Uttar Pradesh',
          postalCode: '221002',
          pinCode: '221002',
          country: 'India',
          isDefault: true
        }
      }
    });

    fixture.detectChanges();
    expect(component.message).toContain('saved successfully');
    expect(component.currentAddress?.address).toBe('500 Temple Lane, Kashi Vishwanath Zone');
    expect(component.isEditing).toBe(false);
  });
});
