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
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { LeadContactService } from '@guiders-frontend/lead-contact-service';
import { getContactDisplayName } from '@guiders-frontend/visitor-display-name';
import {
  LeadCaptureTrace,
  LeadContactData,
  readLeadCaptureTrace,
} from '@guiders-frontend/shared/types';

/** Un lead con lo que hace falta para trabajarlo, ya resuelto para la plantilla. */
export interface CaptacionLeadRow {
  contact: LeadContactData;
  displayName: string;
  capture: LeadCaptureTrace | null;
  /** Vino del asistente sin ningún comercial conectado. */
  fromAssistant: boolean;
  chatId: string | null;
  /** Todo lo buscable de la fila, ya en minúsculas. */
  haystack: string;
}

/**
 * Leads que dejaron sus datos, con lo que contestaron en el guion. Es la
 * pantalla desde la que el comercial les llama, así que el teléfono y las
 * respuestas van por delante del resto.
 */
@Component({
  selector: 'lib-captacion-leads',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './captacion-leads.html',
  styleUrl: './captacion-leads.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CaptacionLeads implements OnInit {
  private readonly leadContactService = inject(LeadContactService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly search = signal('');
  /** Deja fuera los contactos que rellenó un comercial a mano. */
  readonly onlyAssistant = signal(false);
  readonly expandedId = signal<string | null>(null);

  private readonly rows = signal<CaptacionLeadRow[]>([]);

  readonly assistantCount = computed(
    () => this.rows().filter((row) => row.fromAssistant).length,
  );

  readonly visibleRows = computed(() => {
    const term = this.search().trim().toLowerCase();
    const onlyAssistant = this.onlyAssistant();

    return this.rows().filter((row) => {
      if (onlyAssistant && !row.fromAssistant) return false;
      return !term || row.haystack.includes(term);
    });
  });

  ngOnInit(): void {
    this.leadContactService
      .listContactData()
      .pipe(
        finalize(() => this.loading.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (contacts) => this.rows.set(this.toRows(contacts)),
        error: () => this.error.set('No se pudieron cargar los leads'),
      });
  }

  toggleRow(row: CaptacionLeadRow): void {
    this.expandedId.update((id) => (id === row.contact.id ? null : row.contact.id));
  }

  private toRows(contacts: LeadContactData[]): CaptacionLeadRow[] {
    return contacts
      .map((contact) => {
        const capture = readLeadCaptureTrace(contact);
        const displayName = getContactDisplayName(contact) ?? 'Sin nombre';
        return {
          contact,
          displayName,
          capture,
          fromAssistant: capture?.capturedWithoutAgent === true,
          chatId: contact.extractedFromChatId ?? null,
          haystack: [
            displayName,
            contact.email,
            contact.telefono,
            contact.poblacion,
            ...(capture?.answers.map((answer) => answer.answer) ?? []),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase(),
        };
      })
      .sort(
        (a, b) =>
          new Date(b.contact.extractedAt).getTime() -
          new Date(a.contact.extractedAt).getTime(),
      );
  }
}
