import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ToastService } from '@guiders-frontend/shared/ui/toast';
import {
  LEAD_CAPTURE_FIELDS,
  LeadCaptureFlowService,
  LeadCaptureStep,
  LeadCaptureStepType,
  LeadCaptureValidation,
  MAX_LEAD_CAPTURE_OPTIONS,
  MAX_LEAD_CAPTURE_STEPS,
} from '@guiders-frontend/lead-capture-flow-service';
import {
  LeadCaptureFlowDraft,
  findUnreachableSteps,
  previewPath,
  validateLeadCaptureFlow,
} from './flow-validation';

const DEFAULT_INTRO = {
  title: 'Cuéntanos qué buscas y te lo preparamos',
  body: 'Son tres preguntas rápidas. Con tus respuestas, un asesor te prepara una propuesta a tu medida y te escribe el próximo día laborable.',
  ctaLabel: 'Empezar, son 30 segundos',
};

const FIELD_LABELS: Record<string, string> = {
  nombre: 'Nombre',
  apellidos: 'Apellidos',
  email: 'Email',
  telefono: 'Teléfono',
  poblacion: 'Población',
  interes: 'Interés',
  presupuesto: 'Presupuesto',
  comentario: 'Comentario',
};

const STEP_TYPES: {
  id: LeadCaptureStepType;
  label: string;
  hint: string;
}[] = [
  { id: 'message', label: 'Mensaje', hint: 'Solo informa, no pide respuesta' },
  { id: 'choice', label: 'Opciones', hint: 'El visitante elige un camino' },
  { id: 'text', label: 'Pregunta', hint: 'Escribe una respuesta libre' },
];

@Component({
  selector: 'lib-captacion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './captacion.html',
  styleUrl: './captacion.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Captacion implements OnInit {
  private readonly service = inject(LeadCaptureFlowService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly maxSteps = MAX_LEAD_CAPTURE_STEPS;
  readonly maxOptions = MAX_LEAD_CAPTURE_OPTIONS;
  readonly leadFields = LEAD_CAPTURE_FIELDS;
  /** Respuestas que no encajan en la ficha y acaban en los datos extra del lead. */
  readonly extraFields = ['interes', 'presupuesto', 'comentario'];
  readonly stepTypes = STEP_TYPES;

  readonly loading = signal(true);
  readonly saving = signal(false);
  /** La empresa ya tenía guion guardado. */
  readonly configured = signal(false);

  readonly enabled = signal(false);
  readonly name = signal('Captación sin agentes');
  readonly introTitle = signal(DEFAULT_INTRO.title);
  readonly introBody = signal(DEFAULT_INTRO.body);
  readonly introCtaLabel = signal(DEFAULT_INTRO.ctaLabel);
  readonly startStepId = signal('');
  readonly steps = signal<LeadCaptureStep[]>([]);
  readonly focusedStepId = signal<string | null>(null);
  /** -1 = tarjeta de inicio, luego índice del camino, al final datos de contacto. */
  readonly previewIndex = signal(-1);
  readonly previewChoices = signal<Record<string, string>>({});

  readonly draft = computed<LeadCaptureFlowDraft>(() => ({
    name: this.name(),
    intro: {
      title: this.introTitle(),
      body: this.introBody(),
      ctaLabel: this.introCtaLabel(),
    },
    startStepId: this.startStepId(),
    steps: this.steps(),
  }));

  readonly errors = computed(() => validateLeadCaptureFlow(this.draft()));
  readonly unreachableStepIds = computed(() =>
    findUnreachableSteps(this.draft()),
  );
  readonly preview = computed(() =>
    previewPath(this.draft(), this.previewChoices()),
  );
  readonly previewCurrent = computed(() => {
    const index = this.previewIndex();
    const path = this.preview();
    if (index < 0 || index >= path.length) return null;
    return path[index];
  });
  readonly previewRecap = computed(() => {
    const index = Math.max(this.previewIndex(), 0);
    return this.preview()
      .slice(0, index)
      .map((step) => ({
        step,
        answer: this.recapAnswer(step),
      }));
  });
  readonly previewAtContact = computed(
    () => this.previewIndex() >= this.preview().length && this.previewIndex() >= 0,
  );
  readonly previewProgress = computed(() => {
    const total = this.preview().length + 1;
    if (this.previewIndex() < 0) return { current: 0, total };
    return {
      current: Math.min(this.previewIndex() + 1, total),
      total,
    };
  });
  readonly canSave = computed(
    () => this.errors().length === 0 && !this.saving() && !this.loading(),
  );

  ngOnInit(): void {
    this.service
      .getFlow()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ flow }) => {
          if (!flow) {
            this.configured.set(false);
            return;
          }
          this.configured.set(true);
          this.enabled.set(flow.enabled);
          this.name.set(flow.name);
          this.introTitle.set(flow.intro.title);
          this.introBody.set(flow.intro.body);
          this.introCtaLabel.set(flow.intro.ctaLabel);
          this.startStepId.set(flow.startStepId);
          this.steps.set(flow.steps);
        },
        error: () => {
          this.toast.error('No se pudo cargar el guion de captación');
        },
      });
  }

  stepIndex(stepId: string): number {
    return this.steps().findIndex((step) => step.id === stepId);
  }

  stepLabel(stepId: string): string {
    const index = this.stepIndex(stepId);
    return index >= 0 ? `Paso ${index + 1}` : stepId;
  }

  isUnreachable(stepId: string): boolean {
    return this.unreachableStepIds().includes(stepId);
  }

  fieldLabel(field: string | undefined): string {
    if (!field) return 'dato';
    return FIELD_LABELS[field] ?? field;
  }

  typeLabel(type: LeadCaptureStepType): string {
    return STEP_TYPES.find((item) => item.id === type)?.label ?? type;
  }

  typeHint(type: LeadCaptureStepType): string {
    return STEP_TYPES.find((item) => item.id === type)?.hint ?? '';
  }

  selectedPreviewOption(step: LeadCaptureStep): string | undefined {
    return this.previewChoices()[step.id] ?? step.options?.[0]?.id;
  }

  focusStep(stepId: string): void {
    this.focusedStepId.set(stepId);
  }

  toggleEnabled(): void {
    this.enabled.update((value) => !value);
  }

  startPreview(): void {
    this.previewIndex.set(0);
  }

  continuePreview(): void {
    this.previewIndex.update((index) => index + 1);
  }

  choosePreviewOption(stepId: string, optionId: string): void {
    const choices = { ...this.previewChoices(), [stepId]: optionId };
    this.previewChoices.set(choices);
    const path = previewPath(this.draft(), choices);
    const index = path.findIndex((step) => step.id === stepId);
    this.previewIndex.set(index < 0 ? 0 : index + 1);
  }

  resetPreview(): void {
    this.previewIndex.set(-1);
    this.previewChoices.set({});
  }

  backPreview(): void {
    this.previewIndex.update((index) => Math.max(index - 1, -1));
  }

  addStep(type: LeadCaptureStepType): void {
    if (this.steps().length >= this.maxSteps) {
      this.toast.info(`El guion admite como máximo ${this.maxSteps} pasos`);
      return;
    }

    const id = this.nextId('paso');
    const step: LeadCaptureStep = {
      id,
      type,
      prompt: '',
      next: null,
      ...(type === 'choice'
        ? { options: [{ id: this.nextId('opcion'), label: '', next: null }] }
        : {}),
      ...(type === 'text'
        ? { field: 'nombre', validation: 'none' as LeadCaptureValidation, required: true }
        : {}),
    };

    // El último paso del guion encadena con el nuevo para no dejarlo huérfano.
    const current = this.steps();
    const previous = current[current.length - 1];
    const linked =
      previous && previous.type !== 'choice' && !previous.next
        ? current.map((candidate) =>
            candidate.id === previous.id ? { ...candidate, next: id } : candidate,
          )
        : current;

    this.steps.set([...linked, step]);
    if (!this.startStepId()) this.startStepId.set(id);
    this.focusedStepId.set(id);
    this.resetPreview();
  }

  removeStep(stepId: string): void {
    // Las referencias al paso borrado se limpian para que el guion siga siendo válido.
    const remaining = this.steps()
      .filter((step) => step.id !== stepId)
      .map((step) => ({
        ...step,
        next: step.next === stepId ? null : step.next,
        options: step.options?.map((option) => ({
          ...option,
          next: option.next === stepId ? null : option.next,
        })),
      }));

    this.steps.set(remaining);
    if (this.startStepId() === stepId) {
      this.startStepId.set(remaining[0]?.id ?? '');
    }
    if (this.focusedStepId() === stepId) {
      this.focusedStepId.set(remaining[0]?.id ?? null);
    }
    this.resetPreview();
  }

  moveStep(stepId: string, offset: number): void {
    const steps = [...this.steps()];
    const index = steps.findIndex((step) => step.id === stepId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= steps.length) return;
    const [moved] = steps.splice(index, 1);
    steps.splice(target, 0, moved);
    this.steps.set(steps);
    this.resetPreview();
  }

  updateStep(stepId: string, patch: Partial<LeadCaptureStep>): void {
    this.steps.set(
      this.steps().map((step) =>
        step.id === stepId ? { ...step, ...patch } : step,
      ),
    );
  }

  changeStepType(stepId: string, type: LeadCaptureStepType): void {
    const step = this.steps().find((candidate) => candidate.id === stepId);
    if (!step || step.type === type) return;

    this.updateStep(stepId, {
      type,
      options:
        type === 'choice'
          ? (step.options ?? [{ id: this.nextId('opcion'), label: '', next: null }])
          : undefined,
      field: type === 'text' ? (step.field ?? 'nombre') : undefined,
      validation: type === 'text' ? (step.validation ?? 'none') : undefined,
      required: type === 'text' ? (step.required ?? true) : undefined,
      next: type === 'choice' ? null : (step.next ?? null),
    });
    this.resetPreview();
  }

  addOption(stepId: string): void {
    const step = this.steps().find((candidate) => candidate.id === stepId);
    if (!step) return;
    const options = step.options ?? [];
    if (options.length >= this.maxOptions) {
      this.toast.info(`Cada paso admite como máximo ${this.maxOptions} opciones`);
      return;
    }
    this.updateStep(stepId, {
      options: [...options, { id: this.nextId('opcion'), label: '', next: null }],
    });
  }

  updateOption(
    stepId: string,
    optionId: string,
    patch: { label?: string; next?: string | null },
  ): void {
    const step = this.steps().find((candidate) => candidate.id === stepId);
    if (!step) return;
    this.updateStep(stepId, {
      options: (step.options ?? []).map((option) =>
        option.id === optionId ? { ...option, ...patch } : option,
      ),
    });
  }

  removeOption(stepId: string, optionId: string): void {
    const step = this.steps().find((candidate) => candidate.id === stepId);
    if (!step) return;
    this.updateStep(stepId, {
      options: (step.options ?? []).filter((option) => option.id !== optionId),
    });
  }

  /** `null` en el desplegable significa terminar el guion e ir a los datos. */
  parseTarget(value: string): string | null {
    return value === '' ? null : value;
  }

  save(): void {
    if (!this.canSave()) return;

    this.saving.set(true);
    this.service
      .saveFlow({
        name: this.name().trim(),
        enabled: this.enabled(),
        intro: {
          title: this.introTitle().trim(),
          body: this.introBody().trim(),
          ctaLabel: this.introCtaLabel().trim(),
        },
        startStepId: this.startStepId(),
        steps: this.steps(),
      })
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: ({ flow }) => {
          this.configured.set(true);
          if (flow) this.steps.set(flow.steps);
          this.toast.success('Guion guardado');
        },
        error: (error: { error?: { message?: string } }) => {
          this.toast.error(
            error?.error?.message ?? 'No se pudo guardar el guion',
          );
        },
      });
  }

  private recapAnswer(step: LeadCaptureStep): string {
    if (step.type === 'choice') {
      const optionId = this.previewChoices()[step.id];
      const option =
        step.options?.find((item) => item.id === optionId) ?? step.options?.[0];
      return option?.label?.trim() || 'Opción';
    }
    if (step.type === 'text') {
      return this.fieldLabel(step.field);
    }
    return 'Visto';
  }

  private nextId(prefix: string): string {
    const random = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${random}`;
  }
}
