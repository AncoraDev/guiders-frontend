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
import {
  switchMap,
  forkJoin,
  EMPTY,
  combineLatest,
  debounceTime,
  distinctUntilChanged,
  filter,
  startWith,
  tap,
} from 'rxjs';
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
} from '@guiders-frontend/shared/types';

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
  readonly testResult = signal<{ success: boolean; message: string } | null>(
    null
  );

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

  ngOnInit(): void {
    this.loadConfig();
    this.subscribeToObservables();
    this.setupConcesionarioChangeListener();
    this.setupAutoLoadLeadCarsData();
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
        }
      });

    // Suscribirse a datos de LeadCars
    this.leadsService.concesionarios$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.concesionarios.set(data));

    this.leadsService.sedes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.sedes.set(data));

    this.leadsService.campanas$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.campanas.set(data));

    this.leadsService.tiposLead$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.tiposLead.set(data));
  }

  /**
   * Escucha cambios en clienteToken y useSandbox para cargar automáticamente
   * concesionarios y tipos de lead. Usa debounce para evitar peticiones
   * mientras el usuario está escribiendo el token.
   */
  private setupAutoLoadLeadCarsData(): void {
    const tokenCtrl = this.form.get('clienteToken');
    const sandboxCtrl = this.form.get('useSandbox');
    if (!tokenCtrl || !sandboxCtrl) return;

    const tokenChanges$ = tokenCtrl.valueChanges.pipe(
      startWith(tokenCtrl.value),
    );
    const sandboxChanges$ = sandboxCtrl.valueChanges.pipe(
      startWith(sandboxCtrl.value),
    );

    combineLatest([tokenChanges$, sandboxChanges$])
      .pipe(
        debounceTime(400),
        distinctUntilChanged((a, b) => a[0] === b[0] && a[1] === b[1]),
        filter(([token]) => !!token && String(token).trim().length > 0),
        tap(() => this.leadsService.clearSedesYCampanas()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(([token, sandbox]) => {
        const concesionarioId = this.form.get('concesionarioId')?.value as
          | number
          | null;
        this.fetchLeadCarsData(String(token), !!sandbox, concesionarioId);
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

          if (!concesionarioId) return EMPTY;

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

    // Disparar carga manualmente porque patchValue con emitEvent:false no
    // activa el listener de valueChanges en setupAutoLoadLeadCarsData().
    const clienteToken = leadCarsConfig.clienteToken || '';
    const useSandbox =
      leadCarsConfig.useSandbox ?? LEADCARS_CONFIG_DEFAULTS.useSandbox;

    if (clienteToken) {
      this.fetchLeadCarsData(
        clienteToken,
        !!useSandbox,
        leadCarsConfig.concesionarioId ?? null,
      );
    }

    // Tras cargar las listas, restaurar los valores guardados para que los
    // <select> encuentren la opción correcta y muestren el nombre.
    if (leadCarsConfig.concesionarioId) {
      combineLatest([this.leadsService.sedes$, this.leadsService.campanas$])
        .pipe(
          filter(
            ([sedes, campanas]) => sedes.length > 0 || campanas.length > 0,
          ),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          this.form.patchValue(
            {
              sedeId: savedSedeId,
              campanaId: this.resolveCampanaId(
                leadCarsConfig.campanaId,
                savedCampanaCode,
              ),
            },
            { emitEvent: false },
          );
        });
    }
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
  private fetchLeadCarsData(
    clienteToken: string,
    useSandbox: boolean,
    concesionarioId: number | null,
  ): void {
    this.loadingLeadCarsData.set(true);
    this.leadCarsDataError.set(null);

    let pending = 2 + (concesionarioId ? 2 : 0);
    let firstError: { status?: number; message?: string } | null = null;
    const done = (error: { status?: number; message?: string } | null) => {
      if (error && !firstError) firstError = error;
      pending -= 1;
      if (pending === 0) {
        this.loadingLeadCarsData.set(false);
        if (firstError) {
          const status = firstError.status;
          if (status === 401) {
            this.leadCarsDataError.set(
              'Token de LeadCars inválido o sin permisos (401). Verifica el clienteToken y el entorno (sandbox/producción).',
            );
          } else {
            this.leadCarsDataError.set(
              'No se pudieron cargar los datos de LeadCars. Revisa el token y el entorno (sandbox/producción).',
            );
          }
        }
      }
    };

    this.leadsService
      .getConcesionarios(clienteToken, useSandbox)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => done(null),
        error: (err) => done({ status: err?.status }),
        complete: () => {
          /* siguiente emisión ya marcó done */
        },
      });

    this.leadsService
      .getTiposLead(clienteToken, useSandbox)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => done(null),
        error: (err) => done({ status: err?.status }),
      });

    if (concesionarioId) {
      this.leadsService
        .getSedes(Number(concesionarioId), clienteToken, useSandbox)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => done(null),
          error: (err) => done({ status: err?.status }),
        });

      this.leadsService
        .getCampanas(Number(concesionarioId), clienteToken, useSandbox)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => done(null),
          error: (err) => done({ status: err?.status }),
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

    this.leadsService
      .saveConfig(request, this.config()?.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          // Error ya manejado por el servicio
        },
      });
  }

  onTestConnection(): void {
    const configId = this.config()?.id;
    if (!configId) {
      this.error.set('Guarda la configuración primero para probar la conexión');
      return;
    }

    this.testing.set(true);
    this.testResult.set(null);
    this.error.set(null);

    this.leadsService
      .testConnection(configId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.testResult.set(result);
          this.testing.set(false);
        },
        error: () => {
          this.testing.set(false);
        },
      });
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

  getTriggerEventLabel(event: string): string {
    const labels: Record<string, string> = {
      lifecycle_to_lead: 'Cuando el visitante se convierte en lead',
      chat_closed: 'Cuando se cierra una conversación',
      contact_data_updated: 'Cuando se actualizan datos de contacto',
    };
    return labels[event] || event;
  }
}
