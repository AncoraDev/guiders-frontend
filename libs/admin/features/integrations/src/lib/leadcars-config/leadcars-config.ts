import {
  Component,
  OnInit,
  inject,
  signal,
  computed,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { switchMap, forkJoin, EMPTY, distinctUntilChanged } from 'rxjs';
import { LeadsService } from '@guiders-frontend/leads-service';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import {
  LeadCarsCompanyConfig,
  CreateLeadCarsConfigRequest,
  LeadCarsConfig,
  AVAILABLE_TRIGGER_EVENTS,
  LEADCARS_CONFIG_DEFAULTS,
  LeadCarsConcesionario,
  LeadCarsSede,
  LeadCarsCampana,
  LeadCarsTipoLead,
  TestConnectionResponse,
  SendTestLeadResponse,
} from '@guiders-frontend/shared/types';

const MASKED_TOKEN = '***OCULTO***';

function isUsableToken(token: unknown): token is string {
  return (
    typeof token === 'string' &&
    token.trim().length > 0 &&
    token !== MASKED_TOKEN
  );
}

@Component({
  selector: 'lib-leadcars-config',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './leadcars-config.html',
  styleUrl: './leadcars-config.scss',
})
export class LeadCarsConfigComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly leadsService = inject(LeadsService);
  private readonly sessionService = inject(SessionService);
  private readonly destroyRef = inject(DestroyRef);

  // Estado reactivo
  readonly config = signal<LeadCarsCompanyConfig | null>(null);
  readonly loading = signal<boolean>(false);
  readonly saving = signal<boolean>(false);
  readonly testing = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly testResult = signal<TestConnectionResponse | null>(null);
  readonly testErrorCopied = signal(false);
  readonly sendingTestLead = signal(false);
  readonly testLeadResult = signal<SendTestLeadResponse | null>(null);
  readonly testLeadErrorCopied = signal(false);

  // Computed
  readonly hasConfig = computed(() => this.config() !== null);

  // Estado para mostrar el formulario de setup cuando no hay config
  readonly showSetupForm = signal<boolean>(false);

  // Estado para mostrar/ocultar el token
  readonly showToken = signal<boolean>(false);

  // Indica si se debe mostrar el panel de onboarding (sin config y sin formulario abierto)
  readonly showOnboarding = computed(
    () =>
      !this.hasConfig() &&
      !this.loading() &&
      !this.error() &&
      !this.showSetupForm()
  );

  // Estado para datos de LeadCars (selectores dinámicos)
  readonly concesionarios = signal<LeadCarsConcesionario[]>([]);
  readonly sedes = signal<LeadCarsSede[]>([]);
  readonly campanas = signal<LeadCarsCampana[]>([]);
  readonly tiposLead = signal<LeadCarsTipoLead[]>([]);
  readonly loadingLeadCarsData = signal<boolean>(false);
  readonly leadCarsDataError = signal<string | null>(null);
  readonly savedLabels = signal<{
    concesionarioNombre?: string;
    sedeNombre?: string;
    campanaNombre?: string;
    tipoLeadNombre?: string;
  }>({});

  readonly concesionarioOptions = computed(() =>
    this.mergeLabeledOption(
      this.concesionarios(),
      this.form.get('concesionarioId')?.value,
      this.savedLabels().concesionarioNombre,
      'Concesionario',
    ),
  );
  readonly sedeOptions = computed(() =>
    this.mergeLabeledOption(
      this.sedes(),
      this.form.get('sedeId')?.value,
      this.savedLabels().sedeNombre,
      'Sede',
    ),
  );
  readonly campanaOptions = computed(() =>
    this.mergeLabeledOption(
      this.campanas(),
      this.form.get('campanaId')?.value,
      this.savedLabels().campanaNombre,
      'Campaña',
    ),
  );
  readonly tipoLeadOptions = computed(() =>
    this.mergeLabeledOption(
      this.tiposLead(),
      this.form.get('tipoLeadDefault')?.value,
      this.savedLabels().tipoLeadNombre,
      'Tipo',
    ),
  );

  // Eventos de trigger disponibles
  readonly availableTriggerEvents = AVAILABLE_TRIGGER_EVENTS;

  // Formulario
  form: FormGroup = this.fb.group({
    enabled: [true],
    syncChatConversations: [false],
    triggerEvents: this.fb.group({
      lifecycle_to_lead: [true],
      chat_closed: [false],
      contact_data_updated: [false],
    }),
    // Configuración específica de LeadCars
    clienteToken: ['', Validators.required],
    useSandbox: [LEADCARS_CONFIG_DEFAULTS.useSandbox],
    concesionarioId: [null, [Validators.required, Validators.min(1)]],
    sedeId: [null],
    campanaId: [null],
    tipoLeadDefault: [null],
  });

  testLeadForm: FormGroup = this.fb.group({
    nombre: ['Prueba Guiders', Validators.required],
    apellidos: [''],
    email: ['', Validators.email],
    telefono: [''],
    provincia: [''],
    comentario: ['Lead de prueba Guiders. Podéis ignorarlo.'],
  });

  ngOnInit(): void {
    this.loadConfig();
    this.subscribeToObservables();
    this.setupConcesionarioChangeListener();
  }

  private subscribeToObservables(): void {
    this.leadsService.loading$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((loading) => this.loading.set(loading));

    this.leadsService.saving$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((saving) => this.saving.set(saving));

    this.leadsService.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((error) => this.error.set(error));

    this.leadsService.config$
      .pipe(
        distinctUntilChanged(
          (a, b) => (a?.id ?? null) === (b?.id ?? null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((config) => {
        this.config.set(config);
        if (config) {
          this.populateForm(config);
          const leadCarsConfig = config.config as LeadCarsConfig;
          this.fetchLeadCarsData(
            leadCarsConfig.clienteToken ||
              this.form.get('clienteToken')?.value ||
              '',
            leadCarsConfig.useSandbox ??
              LEADCARS_CONFIG_DEFAULTS.useSandbox ??
              false,
            leadCarsConfig.concesionarioId || null,
          );
        }
      });

    // Suscribirse a datos de LeadCars
    this.leadsService.concesionarios$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.concesionarios.set(data);
        this.snapshotLabel('concesionarioNombre', data, this.form.get('concesionarioId')?.value);
      });

    this.leadsService.sedes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.sedes.set(data);
        this.snapshotLabel('sedeNombre', data, this.form.get('sedeId')?.value);
      });

    this.leadsService.campanas$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.campanas.set(data);
        this.snapshotLabel('campanaNombre', data, this.form.get('campanaId')?.value);
      });

    this.leadsService.tiposLead$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => {
        this.tiposLead.set(data);
        this.snapshotLabel('tipoLeadNombre', data, this.form.get('tipoLeadDefault')?.value);
      });
  }

  /**
   * Escucha cambios en el concesionario seleccionado para cargar sedes y campañas.
   * Usa switchMap para cancelar peticiones anteriores si el usuario cambia
   * el concesionario antes de que respondan (evita race condition).
   */
  private setupConcesionarioChangeListener(): void {
    this.form
      .get('concesionarioId')
      ?.valueChanges.pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((concesionarioId: number | null) => {
          // Limpiar sedes y campañas previas
          this.form.patchValue({ sedeId: null, campanaId: null });
          this.leadsService.clearSedesYCampanas();

          if (!concesionarioId || !this.canFetchLeadCarsCatalogs()) {
            return EMPTY;
          }

          const clienteToken =
            this.form.get('clienteToken')?.value as string | undefined;
          const useSandbox =
            this.form.get('useSandbox')?.value as boolean | undefined;

          return forkJoin([
            this.leadsService.getSedes(
              concesionarioId,
              clienteToken || undefined,
              useSandbox,
            ),
            this.leadsService.getCampanas(
              concesionarioId,
              clienteToken || undefined,
              useSandbox,
            ),
          ]);
        }),
      )
      .subscribe();
  }

  private loadConfig(): void {
    this.leadsService
      .getConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  private populateForm(config: LeadCarsCompanyConfig): void {
    const leadCarsConfig = config.config as LeadCarsConfig;

    const savedSedeId = leadCarsConfig.sedeId || null;
    const savedCampanaCode = leadCarsConfig.campanaCode || null;
    const savedCampanaId = this.resolveCampanaId(
      leadCarsConfig.campanaId,
      savedCampanaCode,
    );

    // Usamos emitEvent: false en el concesionarioId para evitar que el listener
    // de valueChanges resetee sedeId y campanaId durante la carga inicial
    this.form.patchValue(
      {
        enabled: config.enabled,
        syncChatConversations: config.syncChatConversations,
        triggerEvents: {
          lifecycle_to_lead: config.triggerEvents.includes('lifecycle_to_lead'),
          chat_closed: config.triggerEvents.includes('chat_closed'),
          contact_data_updated: config.triggerEvents.includes(
            'contact_data_updated'
          ),
        },
        clienteToken: leadCarsConfig.clienteToken || '',
        useSandbox:
          leadCarsConfig.useSandbox ?? LEADCARS_CONFIG_DEFAULTS.useSandbox,
        concesionarioId: leadCarsConfig.concesionarioId || null,
        sedeId: savedSedeId,
        campanaId: savedCampanaId,
        tipoLeadDefault: leadCarsConfig.tipoLeadDefault
          ? Number(leadCarsConfig.tipoLeadDefault)
          : null,
      },
      { emitEvent: false }
    );

    this.savedLabels.set({
      concesionarioNombre: leadCarsConfig.concesionarioNombre,
      sedeNombre: leadCarsConfig.sedeNombre,
      campanaNombre: leadCarsConfig.campanaNombre,
      tipoLeadNombre: leadCarsConfig.tipoLeadNombre,
    });
  }

  /**
   * Lanza la carga de concesionarios, tipos de lead y, si corresponde,
   * sedes y campañas del concesionario indicado. Centraliza la lógica
   * usada tanto por el listener automático como por populateForm.
   *
   * Cada llamada se observa por separado para que un fallo en una
   * (p.ej. 500 del backend por token inválido) no cancele las demás,
   * y para poder informar al usuario sin spam de errores en consola.
   */
  private canFetchLeadCarsCatalogs(): boolean {
    return (
      isUsableToken(this.form.get('clienteToken')?.value) || !!this.config()?.id
    );
  }

  private fetchLeadCarsData(
    clienteToken: string,
    useSandbox: boolean,
    concesionarioId: number | null,
  ): void {
    this.loadingLeadCarsData.set(true);
    this.leadCarsDataError.set(null);

    let pending = 2 + (concesionarioId ? 2 : 0);
    let firstError: { raw?: unknown } | null = null;
    const done = (error: { raw?: unknown } | null) => {
      if (error && !firstError) firstError = error;
      pending -= 1;
      if (pending === 0) {
        this.loadingLeadCarsData.set(false);
        if (firstError) {
          this.leadCarsDataError.set(this.formatHttpError(firstError.raw));
        }
      }
    };

    const tokenForRequest = isUsableToken(clienteToken)
      ? clienteToken
      : undefined;

    this.leadsService
      .getConcesionarios(tokenForRequest, useSandbox)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => done(null),
        error: (err) => done({ raw: err }),
        complete: () => {
          /* siguiente emisión ya marcó done */
        },
      });

    this.leadsService
      .getTiposLead(tokenForRequest, useSandbox)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => done(null),
        error: (err) => done({ raw: err }),
      });

    if (concesionarioId) {
      this.leadsService
        .getSedes(
          Number(concesionarioId),
          tokenForRequest,
          useSandbox,
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => done(null),
          error: (err) => done({ raw: err }),
        });

      this.leadsService
        .getCampanas(
          Number(concesionarioId),
          tokenForRequest,
          useSandbox,
        )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => done(null),
          error: (err) => done({ raw: err }),
        });
    }
  }

  private buildRequest(): CreateLeadCarsConfigRequest {
    const formValue = this.form.value;
    const companyId = this.sessionService.getCurrentUser()?.companyId ?? '';

    // Construir array de trigger events
    const triggerEvents: string[] = [];
    if (formValue.triggerEvents.lifecycle_to_lead) {
      triggerEvents.push('lifecycle_to_lead');
    }
    if (formValue.triggerEvents.chat_closed) {
      triggerEvents.push('chat_closed');
    }
    if (formValue.triggerEvents.contact_data_updated) {
      triggerEvents.push('contact_data_updated');
    }

    const campanaId =
      formValue.campanaId != null ? Number(formValue.campanaId) : undefined;
    const campanaCode = this.resolveCampanaCode(campanaId);

    // Construir configuración específica de LeadCars
    // Solo incluir campos que el backend acepta
    const concesionarioNombre =
      this.resolveItemNombre(this.concesionarios(), formValue.concesionarioId) ??
      this.savedLabels().concesionarioNombre;
    const sedeNombre =
      this.resolveItemNombre(this.sedes(), formValue.sedeId) ??
      this.savedLabels().sedeNombre;
    const campanaNombre =
      this.resolveItemNombre(this.campanas(), campanaId) ??
      this.savedLabels().campanaNombre;
    const tipoLeadNombre =
      this.resolveItemNombre(this.tiposLead(), formValue.tipoLeadDefault) ??
      this.savedLabels().tipoLeadNombre;

    const leadCarsConfig: LeadCarsConfig = {
      clienteToken: formValue.clienteToken,
      concesionarioId: Number(formValue.concesionarioId),
      useSandbox: formValue.useSandbox,
      tipoLeadDefault: formValue.tipoLeadDefault
        ? Number(formValue.tipoLeadDefault)
        : undefined,
      ...(formValue.sedeId != null && { sedeId: Number(formValue.sedeId) }),
      ...(campanaId != null && { campanaId }),
      ...(campanaCode && { campanaCode }),
      ...(concesionarioNombre && { concesionarioNombre }),
      ...(sedeNombre && { sedeNombre }),
      ...(campanaNombre && { campanaNombre }),
      ...(tipoLeadNombre && { tipoLeadNombre }),
    };

    return {
      companyId,
      crmType: 'leadcars',
      enabled: formValue.enabled,
      syncChatConversations: formValue.syncChatConversations,
      triggerEvents,
      config: leadCarsConfig as unknown as Record<string, unknown>,
    };
  }

  onSave(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.error.set(null);
    this.testResult.set(null);

    const request = this.buildRequest();
    const outgoingLabels = this.labelsFromConfig(request.config);
    this.savedLabels.set(outgoingLabels);

    this.leadsService
      .saveConfig(request, this.config()?.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (saved) => {
          const persisted = this.labelsFromConfig(saved.config);
          this.savedLabels.set({
            concesionarioNombre:
              persisted.concesionarioNombre ?? outgoingLabels.concesionarioNombre,
            sedeNombre: persisted.sedeNombre ?? outgoingLabels.sedeNombre,
            campanaNombre:
              persisted.campanaNombre ?? outgoingLabels.campanaNombre,
            tipoLeadNombre:
              persisted.tipoLeadNombre ?? outgoingLabels.tipoLeadNombre,
          });
        },
        error: () => {
          // Error ya manejado por el servicio
        },
      });
  }

  onTestConnection(): void {
    const configId = this.config()?.id;
    const formToken = this.form.get('clienteToken')?.value;
    const useSandbox = !!this.form.get('useSandbox')?.value;

    if (!configId && !isUsableToken(formToken)) {
      this.testResult.set({
        success: false,
        message:
          'Introduce un token de LeadCars para probar la conexión, o guarda la configuración primero.',
      });
      this.scrollToTestResult();
      return;
    }

    this.testing.set(true);
    this.testResult.set(null);
    this.testErrorCopied.set(false);
    this.error.set(null);
    this.leadCarsDataError.set(null);
    this.scrollToTestResult();

    const request$ = configId
      ? this.leadsService.testConnection(configId)
      : this.leadsService.testConnectionWithCredentials({
          clienteToken: formToken,
          useSandbox,
        });

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (result) => {
        this.testResult.set({
          success: result.success,
          message:
            result.message ||
            (result.success
              ? 'Conexión con LeadCars establecida correctamente'
              : 'No se pudo establecer conexión con LeadCars'),
          details: result.details,
        });
        this.testing.set(false);
        this.scrollToTestResult();
        if (result.success) {
          const concesionarioId = this.form.get('concesionarioId')
            ?.value as number | null;
          this.fetchLeadCarsData(formToken || '', useSandbox, concesionarioId);
        }
      },
      error: (err) => {
        this.testing.set(false);
        this.testResult.set({
          success: false,
          message: this.formatHttpError(err),
        });
        this.scrollToTestResult();
      },
    });
  }

  private scrollToTestResult(): void {
    queueMicrotask(() => {
      document
        .getElementById('leadcars-connection-result')
        ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }

  onSendTestLead(): void {
    this.testLeadForm.markAllAsTouched();
    const value = this.testLeadForm.value as {
      nombre: string;
      apellidos?: string;
      email?: string;
      telefono?: string;
      provincia?: string;
      comentario?: string;
    };
    const nombre = value.nombre?.trim();
    const email = value.email?.trim();
    const telefono = value.telefono?.trim();
    if (!nombre) {
      return;
    }
    if (!email && !telefono) {
      this.testLeadResult.set({
        success: false,
        message:
          'Indica al menos un email o un teléfono para que el concesionario pueda identificar el lead.',
      });
      return;
    }
    if (this.testLeadForm.get('email')?.invalid && email) {
      return;
    }

    const concesionarioId = Number(this.form.get('concesionarioId')?.value);
    const tipoLeadDefault = Number(this.form.get('tipoLeadDefault')?.value);
    if (!concesionarioId || !tipoLeadDefault) {
      this.testLeadResult.set({
        success: false,
        message:
          'Selecciona concesionario y tipo de lead en la configuración de arriba antes de enviar.',
      });
      return;
    }

    const formToken = this.form.get('clienteToken')?.value;
    const sedeId = this.form.get('sedeId')?.value;
    const campanaId = this.form.get('campanaId')?.value;
    const campanaCode = this.resolveCampanaCode(
      campanaId != null ? Number(campanaId) : undefined,
    );

    this.sendingTestLead.set(true);
    this.testLeadResult.set(null);
    this.testLeadErrorCopied.set(false);

    this.leadsService
      .sendTestLead({
        nombre,
        ...(value.apellidos?.trim() && { apellidos: value.apellidos.trim() }),
        ...(email && { email }),
        ...(telefono && { telefono }),
        ...(value.provincia?.trim() && { provincia: value.provincia.trim() }),
        ...(value.comentario?.trim() && { comentario: value.comentario.trim() }),
        ...(isUsableToken(formToken) && { clienteToken: formToken }),
        useSandbox: !!this.form.get('useSandbox')?.value,
        concesionarioId,
        tipoLeadDefault,
        ...(sedeId != null && { sedeId: Number(sedeId) }),
        ...(campanaCode && { campanaCode }),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.sendingTestLead.set(false);
          this.testLeadResult.set(result);
        },
        error: (err) => {
          this.sendingTestLead.set(false);
          this.testLeadResult.set({
            success: false,
            message: this.formatHttpError(err),
            environment: this.form.get('useSandbox')?.value
              ? 'sandbox'
              : 'production',
          });
        },
      });
  }

  async copyTestLeadResult(): Promise<void> {
    const result = this.testLeadResult();
    if (!result?.message) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.message);
      this.testLeadErrorCopied.set(true);
      window.setTimeout(() => this.testLeadErrorCopied.set(false), 2000);
    } catch {
      this.testLeadErrorCopied.set(false);
    }
  }

  async copyTestError(): Promise<void> {
    const result = this.testResult();
    if (!result || result.success) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.message);
      this.testErrorCopied.set(true);
      window.setTimeout(() => this.testErrorCopied.set(false), 2000);
    } catch {
      this.testErrorCopied.set(false);
    }
  }

  onDelete(): void {
    const configId = this.config()?.id;
    if (!configId) return;

    if (
      !confirm(
        '¿Estás seguro de que deseas eliminar la configuración de LeadCars?'
      )
    ) {
      return;
    }

    this.leadsService
      .deleteConfig(configId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.showSetupForm.set(false);
          this.form.reset({
            enabled: true,
            syncChatConversations: false,
            triggerEvents: {
              lifecycle_to_lead: true,
              chat_closed: false,
              contact_data_updated: false,
            },
            useSandbox: LEADCARS_CONFIG_DEFAULTS.useSandbox,
            tipoLeadDefault: null,
          });
        },
      });
  }

  private mergeLabeledOption<T extends { id: number; nombre?: string }>(
    items: T[],
    selectedId: number | string | null | undefined,
    savedNombre: string | undefined,
    fallbackPrefix: string,
  ): T[] {
    if (items.length > 0) {
      return items;
    }
    const id = selectedId != null ? Number(selectedId) : NaN;
    if (!Number.isFinite(id) || id <= 0) {
      return [];
    }
    return [
      {
        id,
        nombre: savedNombre || `${fallbackPrefix} #${id}`,
      } as T,
    ];
  }

  private labelsFromConfig(config: Record<string, unknown> | LeadCarsConfig): {
    concesionarioNombre?: string;
    sedeNombre?: string;
    campanaNombre?: string;
    tipoLeadNombre?: string;
  } {
    const record = config as Record<string, unknown>;
    const asName = (value: unknown): string | undefined =>
      typeof value === 'string' && value.trim() ? value : undefined;
    return {
      concesionarioNombre: asName(record['concesionarioNombre']),
      sedeNombre: asName(record['sedeNombre']),
      campanaNombre: asName(record['campanaNombre']),
      tipoLeadNombre: asName(record['tipoLeadNombre']),
    };
  }

  private resolveItemNombre(
    items: { id: number; nombre?: string }[],
    selectedId: number | string | null | undefined,
  ): string | undefined {
    if (selectedId == null || items.length === 0) {
      return undefined;
    }
    return items.find((item) => item.id === Number(selectedId))?.nombre;
  }

  private snapshotLabel(
    key: 'concesionarioNombre' | 'sedeNombre' | 'campanaNombre' | 'tipoLeadNombre',
    items: { id: number; nombre?: string }[],
    selectedId: number | string | null | undefined,
  ): void {
    const nombre = this.resolveItemNombre(items, selectedId);
    if (!nombre) {
      return;
    }
    this.savedLabels.update((current) => ({ ...current, [key]: nombre }));
  }

  private resolveCampanaId(
    campanaId?: number,
    campanaCode?: string | null,
  ): number | null {
    if (campanaId) {
      return campanaId;
    }
    if (!campanaCode) {
      return null;
    }
    const match = this.campanas().find(
      (camp) => camp.codigo === campanaCode || camp.nombre === campanaCode,
    );
    return match?.id ?? null;
  }

  private resolveCampanaCode(campanaId?: number): string | undefined {
    if (campanaId == null) {
      return undefined;
    }
    const match = this.campanas().find((camp) => camp.id === campanaId);
    return match?.codigo || match?.nombre || undefined;
  }

  private formatHttpError(error: unknown): string {
    const err = error as {
      status?: number;
      message?: string;
      error?:
        | string
        | {
            message?: string | string[];
            providerMessage?: string;
            providerBody?: string;
            endpoint?: string;
            httpStatus?: number;
          };
    };
    const body = err?.error;
    if (typeof body === 'string' && body.trim()) {
      return body;
    }
    if (body && typeof body === 'object') {
      const lines: string[] = [];
      const message = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message;
      if (message) {
        lines.push(message);
      }
      if (body.httpStatus) {
        lines.push(`HTTP: ${body.httpStatus}`);
      }
      if (body.endpoint) {
        lines.push(`Endpoint: ${body.endpoint}`);
      }
      if (body.providerMessage && body.providerMessage !== message) {
        lines.push(`Mensaje: ${body.providerMessage}`);
      }
      if (body.providerBody) {
        lines.push(`Respuesta: ${body.providerBody}`);
      }
      if (lines.length > 0) {
        return lines.join('\n');
      }
    }
    if (err?.status) {
      return `Error HTTP ${err.status}${err.message ? `: ${err.message}` : ''}`;
    }
    return err?.message || 'Error desconocido al contactar con LeadCars';
  }

  getTriggerEventLabel(event: string): string {
    const labels: Record<string, string> = {
      lifecycle_to_lead: 'Cuando el visitante se convierte en lead',
      chat_closed: 'Cuando se cierra una conversación',
      contact_data_updated: 'Cuando se actualizan datos de contacto',
    };
    return labels[event] || event;
  }
}
