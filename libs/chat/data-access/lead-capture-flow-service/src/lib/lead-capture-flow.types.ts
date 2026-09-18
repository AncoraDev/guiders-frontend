export type LeadCaptureStepType = 'message' | 'choice' | 'text';

export type LeadCaptureValidation = 'email' | 'phone' | 'none';

/** Campos del lead a los que puede apuntar un paso de texto. */
export const LEAD_CAPTURE_FIELDS = [
  'nombre',
  'apellidos',
  'email',
  'telefono',
  'poblacion',
] as const;

export type LeadCaptureField = (typeof LEAD_CAPTURE_FIELDS)[number];

/** Mismos límites que valida el dominio en backend. */
export const MAX_LEAD_CAPTURE_STEPS = 20;
export const MAX_LEAD_CAPTURE_OPTIONS = 5;

export interface LeadCaptureOption {
  id: string;
  label: string;
  next: string | null;
}

export interface LeadCaptureStep {
  id: string;
  type: LeadCaptureStepType;
  prompt: string;
  options?: LeadCaptureOption[];
  field?: string;
  validation?: LeadCaptureValidation;
  required?: boolean;
  next?: string | null;
}

export interface LeadCaptureIntro {
  title: string;
  body: string;
  ctaLabel: string;
}

export interface LeadCaptureFlow {
  id: string;
  name: string;
  enabled: boolean;
  intro: LeadCaptureIntro;
  startStepId: string;
  steps: LeadCaptureStep[];
  updatedAt: string;
  updatedBy: string;
}

/** `flow` es null cuando la empresa no ha configurado nada. */
export interface LeadCaptureFlowEnvelope {
  flow: LeadCaptureFlow | null;
}

export interface SaveLeadCaptureFlowRequest {
  name: string;
  enabled: boolean;
  intro: LeadCaptureIntro;
  startStepId: string;
  steps: LeadCaptureStep[];
}
