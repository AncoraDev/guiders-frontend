import { describe, expect, it } from 'vitest';
import { LeadCaptureStep } from '@guiders-frontend/lead-capture-flow-service';
import {
  LeadCaptureFlowDraft,
  findUnreachableSteps,
  previewPath,
  validateLeadCaptureFlow,
} from './flow-validation';

const draftWith = (
  steps: LeadCaptureStep[],
  startStepId = steps[0]?.id ?? '',
): LeadCaptureFlowDraft => ({
  name: 'Captación sin agentes',
  intro: {
    title: 'Ahora no hay nadie',
    body: 'Te hago unas preguntas',
    ctaLabel: 'Empezar',
  },
  startStepId,
  steps,
});

const choiceStep = (
  id: string,
  options: { id: string; label: string; next: string | null }[],
): LeadCaptureStep => ({
  id,
  type: 'choice',
  prompt: '¿Qué te interesa?',
  options,
});

const messageStep = (id: string, next: string | null): LeadCaptureStep => ({
  id,
  type: 'message',
  prompt: 'Un momento',
  next,
});

describe('validateLeadCaptureFlow', () => {
  it('no se queja de un guion completo', () => {
    const draft = draftWith([
      choiceStep('interes', [{ id: 'nuevo', label: 'Coche nuevo', next: 'cierre' }]),
      messageStep('cierre', null),
    ]);

    expect(validateLeadCaptureFlow(draft)).toEqual([]);
  });

  it('pide al menos un paso', () => {
    expect(validateLeadCaptureFlow(draftWith([]))).toContain(
      'Añade al menos un paso.',
    );
  });

  it('avisa si falta el nombre o los textos de la tarjeta de inicio', () => {
    const draft = draftWith([messageStep('uno', null)]);
    const errors = validateLeadCaptureFlow({
      ...draft,
      name: '  ',
      intro: { title: '', body: '', ctaLabel: '' },
    });

    expect(errors).toContain('El guion necesita un nombre.');
    expect(errors).toContain('La tarjeta de inicio necesita título y texto.');
    expect(errors).toContain('La tarjeta de inicio necesita el texto del botón.');
  });

  it('avisa si el paso inicial no está entre los pasos', () => {
    const draft = draftWith([messageStep('uno', null)], 'fantasma');

    expect(validateLeadCaptureFlow(draft)).toContain(
      'Elige por qué paso empieza el guion.',
    );
  });

  it('avisa de referencias a pasos borrados', () => {
    const draft = draftWith([messageStep('uno', 'fantasma')]);

    expect(validateLeadCaptureFlow(draft)).toContain(
      'Paso 1: apunta a un paso que ya no existe.',
    );
  });

  it('detecta bucles', () => {
    const draft = draftWith([messageStep('uno', 'dos'), messageStep('dos', 'uno')]);

    expect(
      validateLeadCaptureFlow(draft).some((error) => error.includes('bucle')),
    ).toBe(true);
  });

  it('exige opciones con texto en los pasos de elección', () => {
    const sinOpciones = draftWith([choiceStep('uno', [])]);
    expect(validateLeadCaptureFlow(sinOpciones)).toContain(
      'Paso 1: añade al menos una opción.',
    );

    const opcionVacia = draftWith([
      choiceStep('uno', [{ id: 'a', label: '  ', next: null }]),
    ]);
    expect(validateLeadCaptureFlow(opcionVacia)).toContain(
      'Paso 1: hay una opción sin texto.',
    );
  });

  it('exige campo de destino en los pasos de texto', () => {
    const draft = draftWith([
      { id: 'uno', type: 'text', prompt: '¿Tu nombre?', next: null },
    ]);

    expect(validateLeadCaptureFlow(draft)).toContain(
      'Paso 1: indica dónde se guarda la respuesta.',
    );
  });

  it('exige texto en la pregunta', () => {
    const draft = draftWith([{ ...messageStep('uno', null), prompt: '   ' }]);

    expect(validateLeadCaptureFlow(draft)).toContain(
      'Paso 1: falta el texto de la pregunta.',
    );
  });
});

describe('findUnreachableSteps', () => {
  it('encuentra los pasos a los que no llega nadie', () => {
    const draft = draftWith([
      messageStep('uno', null),
      messageStep('huerfano', null),
    ]);

    expect(findUnreachableSteps(draft)).toEqual(['huerfano']);
  });

  it('no marca nada si todos se alcanzan', () => {
    const draft = draftWith([messageStep('uno', 'dos'), messageStep('dos', null)]);

    expect(findUnreachableSteps(draft)).toEqual([]);
  });
});

describe('previewPath', () => {
  it('recorre el guion eligiendo siempre la primera opción', () => {
    const draft = draftWith([
      choiceStep('interes', [
        { id: 'nuevo', label: 'Coche nuevo', next: 'modelo' },
        { id: 'km0', label: 'Km 0', next: null },
      ]),
      messageStep('modelo', null),
    ]);

    expect(previewPath(draft).map((step) => step.id)).toEqual([
      'interes',
      'modelo',
    ]);
  });

  it('no se cuelga si el guion tiene un bucle', () => {
    const draft = draftWith([messageStep('uno', 'dos'), messageStep('dos', 'uno')]);

    expect(previewPath(draft).map((step) => step.id)).toEqual(['uno', 'dos']);
  });

  it('respeta la opción elegida en la vista previa', () => {
    const draft = draftWith([
      choiceStep('interes', [
        { id: 'nuevo', label: 'Coche nuevo', next: 'modelo' },
        { id: 'km0', label: 'Km 0', next: null },
      ]),
      messageStep('modelo', null),
    ]);

    expect(
      previewPath(draft, { interes: 'km0' }).map((step) => step.id),
    ).toEqual(['interes']);
  });
});
