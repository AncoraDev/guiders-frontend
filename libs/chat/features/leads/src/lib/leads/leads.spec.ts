import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { LeadContactData } from '@guiders-frontend/shared/types';
import { Leads } from './leads';

const contact = (
  overrides: Partial<LeadContactData> & Pick<LeadContactData, 'id'>,
): LeadContactData => ({
  visitorId: `visitor-${overrides.id}`,
  companyId: 'company',
  extractedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

const withAssistant = contact({
  id: '1',
  nombre: 'Ana',
  apellidos: 'Pérez',
  telefono: '+34600111222',
  extractedAt: '2026-09-19T09:00:00.000Z',
  extractedFromChatId: 'chat-1',
  followUpStatus: 'pending',
  additionalData: {
    leadCapture: {
      flowId: 'flow-1',
      capturedWithoutAgent: true,
      answers: [{ prompt: '¿Qué buscas?', answer: 'Coche nuevo' }],
    },
  },
});

const manualLead = contact({
  id: '2',
  nombre: 'Luis',
  email: 'luis@test.com',
  extractedAt: '2026-09-19T08:00:00.000Z',
  followUpStatus: 'pending',
});

const oldAssistant = contact({
  id: '3',
  nombre: 'Marta',
  extractedAt: '2024-01-02T10:00:00.000Z',
  followUpStatus: 'pending',
  additionalData: {
    leadCapture: {
      capturedWithoutAgent: true,
      answers: [{ prompt: '¿Cuándo?', answer: 'Ya' }],
    },
  },
});

function createComponent(
  contacts: LeadContactData[],
  extras?: { updateFollowUp?: ReturnType<typeof vi.fn> },
) {
  const updateFollowUp =
    extras?.updateFollowUp ?? vi.fn(() => of(withAssistant));
  const listContactData = vi.fn(() => of(contacts));

  TestBed.configureTestingModule({
    imports: [Leads],
    providers: [
      provideRouter([]),
      {
        provide: LeadContactService,
        useValue: {
          listContactData,
          updateFollowUp,
          pendingCount: signal(contacts.length),
          refreshPendingCount: () => undefined,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(Leads);
  fixture.detectChanges();
  return { component: fixture.componentInstance, listContactData, updateFollowUp };
}

describe('Leads', () => {
  it('pide a la API todos los leads captados', () => {
    const { listContactData } = createComponent([withAssistant, manualLead]);

    expect(listContactData).toHaveBeenCalledWith();
  });

  it('agrupa automáticos y manuales en la misma cola', () => {
    const { component } = createComponent([withAssistant, manualLead]);

    expect(component.filteredRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
      'Luis',
    ]);
    expect(component.filteredRows().map((row) => row.fromAssistant)).toEqual([
      true,
      false,
    ]);
  });

  it('filtra por origen automático', () => {
    const { component } = createComponent([withAssistant, manualLead]);
    component.selectOrigin('assistant');

    expect(component.filteredRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
    ]);
  });

  it('en últimos 7 días esconde captaciones antiguas', () => {
    const { component } = createComponent([withAssistant, oldAssistant]);

    component.selectDateRange('7d');

    expect(component.filteredRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
    ]);
  });

  it('busca también dentro de las respuestas del guion', () => {
    const { component } = createComponent([withAssistant, manualLead]);
    component.onSearch('coche');

    expect(component.filteredRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
    ]);
  });

  it('marca un lead como contactado y recarga la cola', () => {
    const done = new Subject<LeadContactData>();
    const updateFollowUp = vi.fn(() => done.asObservable());
    const { component, listContactData } = createComponent([withAssistant], {
      updateFollowUp,
    });

    component.markFollowUp(component.filteredRows()[0], 'contacted');
    expect(updateFollowUp).toHaveBeenCalledWith('visitor-1', 'contacted');

    listContactData.mockClear();
    done.next(withAssistant);
    done.complete();

    expect(listContactData).toHaveBeenCalledWith();
  });
});
