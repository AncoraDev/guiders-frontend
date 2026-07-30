import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
  computed,
  inject,
  effect,
  OnInit,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  LeadContactData,
  SaveContactDataRequest,
} from '@guiders-frontend/shared/types';

export interface ContactDataFormValue {
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  poblacion: string;
}

@Component({
  selector: 'guiders-contact-data-form',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './contact-data-form.html',
  styleUrl: './contact-data-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ContactDataForm implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly visitorId = input.required<string>();
  readonly contactData = input<LeadContactData | null>(null);
  readonly readonly = input<boolean>(false);
  readonly saving = input<boolean>(false);
  readonly chatId = input<string | undefined>(undefined);

  readonly save = output<SaveContactDataRequest>();
  readonly cancelEdit = output<void>();

  readonly form = this.fb.group({
    nombre: ['', [Validators.maxLength(100)]],
    apellidos: ['', [Validators.maxLength(100)]],
    email: ['', [Validators.email, Validators.maxLength(255)]],
    telefono: [
      '',
      [Validators.pattern(/^[+]?[\d\s\-()]{6,20}$/), Validators.maxLength(20)],
    ],
    poblacion: ['', [Validators.maxLength(100)]],
  });

  private readonly _isFormValid = signal<boolean>(false);
  readonly isFormValid = this._isFormValid.asReadonly();

  readonly canSubmit = computed(() => {
    return this.isFormValid() && !this.saving() && !this.readonly();
  });

  readonly hasChanges = computed(() => {
    const current = this.contactData();
    const formValue = this.form.value;

    if (!current) {
      return this.isFormValid();
    }

    return (
      (formValue.nombre?.trim() || '') !== (current.nombre || '') ||
      (formValue.apellidos?.trim() || '') !== (current.apellidos || '') ||
      (formValue.email?.trim() || '') !== (current.email || '') ||
      (formValue.telefono?.trim() || '') !== (current.telefono || '') ||
      (formValue.poblacion?.trim() || '') !== (current.poblacion || '')
    );
  });

  constructor() {
    effect(() => {
      const data = this.contactData();
      if (data) {
        this.form.patchValue(
          {
            nombre: data.nombre || '',
            apellidos: data.apellidos || '',
            email: data.email || '',
            telefono: data.telefono || '',
            poblacion: data.poblacion || '',
          },
          { emitEvent: true }
        );
      }
    });

    effect(() => {
      if (this.readonly()) {
        this.form.disable();
      } else {
        this.form.enable();
      }
    });

    this.form.valueChanges.subscribe(() => {
      this.updateFormValiditySignal();
    });
  }

  private updateFormValiditySignal(): void {
    const formValue = this.form.value;
    const isValid = !!(
      formValue.nombre?.trim() ||
      formValue.apellidos?.trim() ||
      formValue.email?.trim() ||
      formValue.telefono?.trim() ||
      formValue.poblacion?.trim()
    );
    this._isFormValid.set(isValid);
  }

  ngOnInit(): void {
    const data = this.contactData();
    if (data) {
      this.form.patchValue({
        nombre: data.nombre || '',
        apellidos: data.apellidos || '',
        email: data.email || '',
        telefono: data.telefono || '',
        poblacion: data.poblacion || '',
      });
    }

    this.updateFormValiditySignal();
  }

  onSubmit(): void {
    if (!this.canSubmit()) return;

    const formValue = this.form.value;

    const request: SaveContactDataRequest = {
      ...(formValue.nombre?.trim() && { nombre: formValue.nombre.trim() }),
      ...(formValue.apellidos?.trim() && {
        apellidos: formValue.apellidos.trim(),
      }),
      ...(formValue.email?.trim() && { email: formValue.email.trim() }),
      ...(formValue.telefono?.trim() && {
        telefono: formValue.telefono.trim(),
      }),
      ...(formValue.poblacion?.trim() && {
        poblacion: formValue.poblacion.trim(),
      }),
    };

    this.save.emit(request);
  }

  onCancel(): void {
    const data = this.contactData();
    if (data) {
      this.form.patchValue({
        nombre: data.nombre || '',
        apellidos: data.apellidos || '',
        email: data.email || '',
        telefono: data.telefono || '',
        poblacion: data.poblacion || '',
      });
    } else {
      this.form.reset();
    }
    this.cancelEdit.emit();
  }

  getError(fieldName: string): string | null {
    const control = this.form.get(fieldName);
    if (!control?.touched || !control.errors) return null;

    if (control.errors['email']) return 'Email invalido';
    if (control.errors['maxlength']) {
      return `Maximo ${control.errors['maxlength'].requiredLength} caracteres`;
    }
    if (control.errors['pattern']) {
      if (fieldName === 'telefono') return 'Formato de telefono invalido';
      return 'Formato invalido';
    }

    return null;
  }
}
