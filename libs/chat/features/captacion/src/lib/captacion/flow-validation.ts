import {
  LeadCaptureStep,
  MAX_LEAD_CAPTURE_OPTIONS,
  MAX_LEAD_CAPTURE_STEPS,
  isLeadCaptureStepRef,
} from '@guiders-frontend/lead-capture-flow-service';

export interface LeadCaptureFlowDraft {
  name: string;
  intro: { title: string; body: string; ctaLabel: string };
  startStepId: string;
  steps: LeadCaptureStep[];
}

/**
 * Mismas reglas que valida el dominio en backend, para avisar al admin mientras
 * edita en vez de dejar que el guardado falle.
 */
export function validateLeadCaptureFlow(draft: LeadCaptureFlowDraft): string[] {
  const errors: string[] = [];

  if (!draft.name.trim()) {
    errors.push('El guion necesita un nombre.');
  }
  if (!draft.intro.title.trim() || !draft.intro.body.trim()) {
    errors.push('La tarjeta de inicio necesita título y texto.');
  }
  if (!draft.intro.ctaLabel.trim()) {
    errors.push('La tarjeta de inicio necesita el texto del botón.');
  }
  if (draft.steps.length === 0) {
    errors.push('Añade al menos un paso.');
    return errors;
  }
  if (draft.steps.length > MAX_LEAD_CAPTURE_STEPS) {
    errors.push(`El guion no puede tener más de ${MAX_LEAD_CAPTURE_STEPS} pasos.`);
  }

  const ids = new Set<string>();
  for (const step of draft.steps) {
    if (ids.has(step.id)) {
      errors.push(`El paso ${step.id} está repetido.`);
    }
    ids.add(step.id);

    const label = stepLabel(draft, step);
    if (!step.prompt.trim()) {
      errors.push(`${label}: falta el texto de la pregunta.`);
    }

    if (step.type === 'choice') {
      const options = step.options ?? [];
      if (options.length === 0) {
        errors.push(`${label}: añade al menos una opción.`);
      }
      if (options.length > MAX_LEAD_CAPTURE_OPTIONS) {
        errors.push(
          `${label}: como máximo ${MAX_LEAD_CAPTURE_OPTIONS} opciones.`,
        );
      }
      if (options.some((option) => !option.label.trim())) {
        errors.push(`${label}: hay una opción sin texto.`);
      }
    }

    if (step.type === 'text' && !step.field?.trim()) {
      errors.push(`${label}: indica dónde se guarda la respuesta.`);
    }
  }

  if (!ids.has(draft.startStepId)) {
    errors.push('Elige por qué paso empieza el guion.');
    return errors;
  }

  for (const step of draft.steps) {
    for (const target of targetsOf(step)) {
      if (isLeadCaptureStepRef(target) && !ids.has(target)) {
        errors.push(
          `${stepLabel(draft, step)}: apunta a un paso que ya no existe.`,
        );
      }
    }
  }

  const cycleAt = findCycle(draft);
  if (cycleAt) {
    const step = draft.steps.find((candidate) => candidate.id === cycleAt);
    errors.push(
      `El guion tiene un bucle que vuelve a ${
        step ? stepLabel(draft, step) : cycleAt
      }.`,
    );
  }

  return errors;
}

/** Pasos que no se alcanzan desde el inicio: no rompen el guion pero sobran. */
export function findUnreachableSteps(draft: LeadCaptureFlowDraft): string[] {
  const byId = new Map(draft.steps.map((step) => [step.id, step]));
  const reachable = new Set<string>();
  const queue: string[] = byId.has(draft.startStepId) ? [draft.startStepId] : [];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (reachable.has(current)) continue;
    reachable.add(current);
    const step = byId.get(current);
    if (!step) continue;
    for (const target of targetsOf(step)) {
      if (isLeadCaptureStepRef(target) && !reachable.has(target)) {
        queue.push(target);
      }
    }
  }

  return draft.steps
    .filter((step) => !reachable.has(step.id))
    .map((step) => step.id);
}

/**
 * Camino que vería el visitante. Sin `choices`, toma la primera opción de
 * cada pregunta; con `choices`, respeta la opción pulsada en la vista previa.
 */
export function previewPath(
  draft: LeadCaptureFlowDraft,
  choices: Record<string, string> = {},
): LeadCaptureStep[] {
  const byId = new Map(draft.steps.map((step) => [step.id, step]));
  const path: LeadCaptureStep[] = [];
  const seen = new Set<string>();
  let current: string | null = draft.startStepId;

  while (current && byId.has(current) && !seen.has(current)) {
    seen.add(current);
    const step = byId.get(current) as LeadCaptureStep;
    path.push(step);
    if (step.type === 'choice') {
      const picked =
        step.options?.find((option) => option.id === choices[step.id]) ??
        step.options?.[0];
      current = isLeadCaptureStepRef(picked?.next) ? picked.next : null;
    } else {
      current = isLeadCaptureStepRef(step.next) ? step.next : null;
    }
  }

  return path;
}

function targetsOf(step: LeadCaptureStep): (string | null)[] {
  if (step.type === 'choice') {
    return (step.options ?? []).map((option) => option.next ?? null);
  }
  return [step.next ?? null];
}

function findCycle(draft: LeadCaptureFlowDraft): string | null {
  const byId = new Map(draft.steps.map((step) => [step.id, step]));
  const visiting = new Set<string>();
  const done = new Set<string>();

  const walk = (stepId: string): string | null => {
    if (visiting.has(stepId)) return stepId;
    if (done.has(stepId)) return null;

    visiting.add(stepId);
    const step = byId.get(stepId);
    for (const target of step ? targetsOf(step) : []) {
      if (!isLeadCaptureStepRef(target)) continue;
      const cycleAt = walk(target);
      if (cycleAt) return cycleAt;
    }
    visiting.delete(stepId);
    done.add(stepId);
    return null;
  };

  return walk(draft.startStepId);
}

function stepLabel(draft: LeadCaptureFlowDraft, step: LeadCaptureStep): string {
  const index = draft.steps.findIndex((candidate) => candidate.id === step.id);
  return `Paso ${index + 1}`;
}
