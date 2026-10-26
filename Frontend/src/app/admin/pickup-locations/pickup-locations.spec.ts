import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AdminPickupLocations, PickupLocation } from './pickup-locations';
import { environment } from '../../../environments/environment';

describe('AdminPickupLocations Component', () => {
  let component: AdminPickupLocations;
  let fixture: ComponentFixture<AdminPickupLocations>;
  let httpTesting: HttpTestingController;

  const mockLocations: PickupLocation[] = [
    {
      _id: 'loc-1',
      name: 'Main Return Warehouse',
      contactName: 'Warehouse Manager',
      phone: '+919876543210',
      address: 'Plot 42, Sector 18',
      city: 'Gurugram',
      state: 'Haryana',
      postalCode: '122015',
      country: 'India',
      active: true,
      isDefault: true
    },
    {
      _id: 'loc-2',
      name: 'South Hub Return Center',
      contactName: 'Sunil Rao',
      phone: '+919811223344',
      address: '15, Electronic City Phase 1',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560100',
      country: 'India',
      active: true,
      isDefault: false
    }
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPickupLocations],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([])
      ]
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AdminPickupLocations);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should initialize and load pickup locations from API', () => {
    fixture.detectChanges();

    const req = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`);
    expect(req.request.method).toBe('GET');
    req.flush({ locations: mockLocations });

    fixture.detectChanges();

    expect(component.locations.length).toBe(2);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Main Return Warehouse');
    expect(compiled.textContent).toContain('South Hub Return Center');
    expect(compiled.textContent).toContain('Gurugram');
    expect(compiled.textContent).toContain('Bengaluru');
  });

  it('should allow admin to Add a new pickup location via POST', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({ locations: mockLocations });
    fixture.detectChanges();

    component.openAdd();
    expect(component.showForm).toBe(true);
    expect(component.isEditing).toBe(false);

    component.formData = {
      name: 'Mumbai Central Returns',
      contactName: 'Amit Shah',
      phone: '+919988776655',
      address: 'Shop 4, Andheri East',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400069',
      country: 'India',
      isDefault: false
    };

    component.saveLocation();

    const postReq = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body.name).toBe('Mumbai Central Returns');
    expect(postReq.request.body.city).toBe('Mumbai');

    const newLoc: PickupLocation = {
      _id: 'loc-3',
      ...component.formData,
      active: true
    };
    postReq.flush(newLoc);

    // Expect re-fetch of locations
    const reloadReq = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`);
    expect(reloadReq.request.method).toBe('GET');
    reloadReq.flush({ locations: [...mockLocations, newLoc] });
    fixture.detectChanges();

    expect(component.locations.length).toBe(3);
    expect(component.showForm).toBe(false);
  });

  it('should allow admin to Edit an existing pickup location via PATCH', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({ locations: mockLocations });
    fixture.detectChanges();

    component.startEdit(mockLocations[1]);
    expect(component.showForm).toBe(true);
    expect(component.isEditing).toBe(true);
    expect(component.editingLocationId).toBe('loc-2');
    expect(component.formData.name).toBe('South Hub Return Center');

    component.formData.name = 'South Hub Express Returns';
    component.formData.phone = '+919877766655';

    component.saveLocation();

    const patchReq = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations/loc-2`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body.name).toBe('South Hub Express Returns');
    expect(patchReq.request.body.phone).toBe('+919877766655');

    patchReq.flush({
      ...mockLocations[1],
      name: 'South Hub Express Returns',
      phone: '+919877766655'
    });

    // Expect re-fetch
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({
      locations: [
        mockLocations[0],
        { ...mockLocations[1], name: 'South Hub Express Returns', phone: '+919877766655' }
      ]
    });
    fixture.detectChanges();

    expect(component.locations[1].name).toBe('South Hub Express Returns');
    expect(component.showForm).toBe(false);
  });

  it('should allow admin to Delete a pickup location via DELETE', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({ locations: mockLocations });
    fixture.detectChanges();

    vi.spyOn(window, 'confirm').mockReturnValue(true);

    component.deleteLocation(mockLocations[1]);

    const delReq = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations/loc-2`);
    expect(delReq.request.method).toBe('DELETE');
    delReq.flush({ message: 'Pickup location deleted successfully' });

    // Expect re-fetch
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({
      locations: [mockLocations[0]]
    });
    fixture.detectChanges();

    expect(component.locations.length).toBe(1);
    expect(component.locations[0]._id).toBe('loc-1');
  });

  it('should allow admin to Set as Default location via PATCH', () => {
    fixture.detectChanges();
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({ locations: mockLocations });
    fixture.detectChanges();

    component.setDefault(mockLocations[1]);

    const patchReq = httpTesting.expectOne(`${environment.apiUrl}/pickup-locations/loc-2`);
    expect(patchReq.request.method).toBe('PATCH');
    expect(patchReq.request.body).toEqual({ isDefault: true });

    patchReq.flush({
      ...mockLocations[1],
      isDefault: true
    });

    // Expect re-fetch
    httpTesting.expectOne(`${environment.apiUrl}/pickup-locations`).flush({
      locations: [
        { ...mockLocations[1], isDefault: true },
        { ...mockLocations[0], isDefault: false }
      ]
    });
    fixture.detectChanges();

    expect(component.locations[0]._id).toBe('loc-2');
    expect(component.locations[0].isDefault).toBe(true);
  });
});
