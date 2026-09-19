import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { LeadContactData } from '@guiders-frontend/shared/types';
import { CaptacionLeads } from './captacion-leads';

const contact = (
  overrides: Partial<LeadContactData> & Pick<LeadContactData, 'id'>,
): LeadContactData => ({
  visitorId: `visitor-${overrides.id}`,
  companyId: 'company',
  extractedAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
  ...overrides,
});

const withAssistant = contact({
  id: '1',
  nombre: 'Ana',
  apellidos: 'Pérez',
  telefono: '+34600111222',
  extractedAt: '2026-01-02T10:00:00.000Z',
  extractedFromChatId: 'chat-1',
  additionalData: {
    leadCapture: {
      flowId: 'flow-1',
      capturedWithoutAgent: true,
      answers: [{ prompt: '¿Qué buscas?', answer: 'Coche nuevo' }],
    },
  },
});

const fromCommercial = contact({
  id: '2',
  nombre: 'Luis',
  email: 'luis@test.com',
});

function createComponent(contacts: LeadContactData[]) {
  TestBed.configureTestingModule({
    imports: [CaptacionLeads],
    providers: [
      provideRouter([]),
      {
        provide: LeadContactService,
        useValue: { listContactData: () => of(contacts) },
      },
    ],
  });

  const fixture = TestBed.createComponent(CaptacionLeads);
  fixture.detectChanges();
  return fixture.componentInstance;
}

describe('CaptacionLeads', () => {
  it('ordena por fecha de captación, lo más reciente primero', () => {
    const component = createComponent([fromCommercial, withAssistant]);

    expect(component.visibleRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
      'Luis',
    ]);
  });

  it('lee las respuestas del guion y el origen sin agente', () => {
    const component = createComponent([withAssistant, fromCommercial]);
    const [asistente, comercial] = component.visibleRows();

    expect(asistente.fromAssistant).toBe(true);
    expect(asistente.capture?.answers).toEqual([
      { prompt: '¿Qué buscas?', answer: 'Coche nuevo' },
    ]);
    expect(asistente.chatId).toBe('chat-1');
    expect(comercial.fromAssistant).toBe(false);
    expect(comercial.capture).toBeNull();
  });

  it('filtra por captados sin agente', () => {
    const component = createComponent([withAssistant, fromCommercial]);

    component.onlyAssistant.set(true);

    expect(component.assistantCount()).toBe(1);
    expect(component.visibleRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
    ]);
  });

  it('busca también dentro de las respuestas del guion', () => {
    const component = createComponent([withAssistant, fromCommercial]);

    component.search.set('coche');

    expect(component.visibleRows().map((row) => row.displayName)).toEqual([
      'Ana Pérez',
    ]);
  });
});
