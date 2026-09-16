import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  effect,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ContactRequestPayload,
  SaveContactDataRequest,
} from '@guiders-frontend/shared/types';

export interface ContactRequestCardConfirm {
  requestId: string;
  data: SaveContactDataRequest;
}

@Component({
  selector: 'guiders-contact-request-card',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-request-card.html',
  styleUrl: './contact-request-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactRequestCard {
  private readonly fb = inject(FormBuilder);

  readonly variant = input.required<'request' | 'submission'>();
  readonly requestId = input.required<string>();
  readonly status = input<'pending' | 'submitted' | 'confirmed'>('pending');
  readonly data = input<ContactRequestPayload | undefined>(undefined);
  readonly saving = input(false);
  readonly confirmed = input(false);

  readonly confirm = output<ContactRequestCardConfirm>();
  readonly cancel = output<void>();

  readonly form = this.fb.group({
    nombre: ['', [Validators.required, Validators.maxLength(100)]],
    apellidos: ['', [Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    telefono: [
      '',
      [
        Validators.required,
        Validators.pattern(/^[+]?[\d\s\-()]{6,20}$/),
        Validators.maxLength(20),
      ],
    ],
    poblacion: ['', [Validators.maxLength(100)]],
  });

  private readonly _isFormValid = signal(false);
  readonly isFormValid = this._isFormValid.asReadonly();

  readonly isRequest = computed(() => this.variant() === 'request');
  readonly isSubmitted = computed(
    () => this.status() === 'submitted' || this.status() === 'confirmed'
  );
  readonly showEditor = computed(
    () => this.variant() === 'submission' && !this.confirmed()
  );
  readonly canSubmit = computed(
    () => this.isFormValid() && !this.saving() && this.showEditor()
  );

  constructor() {
    this.form.statusChanges.subscribe(() => {
      this._isFormValid.set(this.form.valid);
    });

    effect(() => {
      const payload = this.data();
      this.form.patchValue({
        nombre: payload?.nombre ?? '',
        apellidos: payload?.apellidos ?? '',
        email: payload?.email ?? '',
        telefono: payload?.telefono ?? '',
        poblacion: payload?.poblacion ?? '',
      });
      this._isFormValid.set(this.form.valid);
    });
  }

  fieldId(name: string): string {
    return `crc-${this.requestId()}-${name}`;
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;
    const value = this.form.getRawValue();
    this.confirm.emit({
      requestId: this.requestId(),
      data: {
        nombre: value.nombre?.trim() || undefined,
        apellidos: value.apellidos?.trim() || undefined,
        email: value.email?.trim() || undefined,
        telefono: value.telefono?.trim() || undefined,
        poblacion: value.poblacion?.trim() || undefined,
      },
    });
  }

  onCancel(): void {
    const payload = this.data();
    this.form.patchValue({
      nombre: payload?.nombre ?? '',
      apellidos: payload?.apellidos ?? '',
      email: payload?.email ?? '',
      telefono: payload?.telefono ?? '',
      poblacion: payload?.poblacion ?? '',
    });
    this.cancel.emit();
  }

  getError(fieldName: string): string | null {
    const control = this.form.get(fieldName);
    if (!control?.touched || !control.errors) return null;
    if (control.errors['required']) return 'Obligatorio';
    if (control.errors['email']) return 'Email inválido';
    if (control.errors['pattern']) return 'Teléfono inválido';
    if (control.errors['maxlength']) return 'Demasiado largo';
    return null;
  }
}
