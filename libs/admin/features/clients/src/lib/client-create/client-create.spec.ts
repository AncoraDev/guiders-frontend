import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ClientCreate } from './client-create';
import { PlatformCompaniesService } from '@guiders-frontend/platform-companies-service';

describe('ClientCreate', () => {
  let fixture: ComponentFixture<ClientCreate>;
  let createCompany: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    createCompany = vi.fn().mockReturnValue(
      of({ companyId: 'company-1', adminUserId: 'user-1' }),
    );

    await TestBed.configureTestingModule({
      imports: [ClientCreate],
      providers: [
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: PlatformCompaniesService,
          useValue: { createCompany },
        },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ClientCreate);
    fixture.detectChanges();
  });

  it('debe enviar el alta al pulsar crear con datos válidos', () => {
    const component = fixture.componentInstance;
    component.companyName.set('Acme');
    component.canonicalDomain.set('acme.test');
    component.adminFirstName.set('Ada');
    component.adminLastName.set('Admin');
    component.adminEmail.set('ada@acme.test');
    component.adminPassword.set('TempPassw0rd!');

    component.submit();

    expect(createCompany).toHaveBeenCalledWith({
      companyName: 'Acme',
      sites: [
        {
          name: 'Sitio Principal',
          canonicalDomain: 'acme.test',
          domainAliases: [],
        },
      ],
      admin: {
        adminFirstName: 'Ada',
        adminLastName: 'Admin',
        adminEmail: 'ada@acme.test',
        adminTel: undefined,
        adminPassword: 'TempPassw0rd!',
      },
    });
  });

  it('no debe llamar al API si faltan campos', () => {
    fixture.componentInstance.submit();
    expect(createCompany).not.toHaveBeenCalled();
  });
});
