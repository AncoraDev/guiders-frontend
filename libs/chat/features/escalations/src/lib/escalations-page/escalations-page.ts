import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EscalationService } from '@guiders-frontend/escalation-service';
import { EscalationEvent, ESCALATION_REASON_LABELS } from '@guiders-frontend/shared/types';
import { Badge } from '@guiders-frontend/badge';

@Component({
  selector: 'lib-escalations-page',
  standalone: true,
  imports: [CommonModule, Badge],
  templateUrl: './escalations-page.html',
  styleUrl: './escalations-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EscalationsPage {
  private readonly escalationService = inject(EscalationService);
  private readonly router = inject(Router);

  // State from service
  readonly escalations = this.escalationService.escalations;
  readonly escalationCount = this.escalationService.escalationCount;

  /**
   * Get label for escalation reason
   */
  getReasonLabel(reason: string): string {
    return ESCALATION_REASON_LABELS[reason as keyof typeof ESCALATION_REASON_LABELS] || 'Asistencia requerida';
  }

  /**
   * Get time elapsed since escalation
   */
  getTimeElapsed(timestamp: string): string {
    const now = new Date();
    const eventTime = new Date(timestamp);
    const diffMs = now.getTime() - eventTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Hace menos de 1 minuto';
    if (diffMins === 1) return 'Hace 1 minuto';
    if (diffMins < 60) return `Hace ${diffMins} minutos`;

    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return 'Hace 1 hora';
    return `Hace ${diffHours} horas`;
  }

  /**
   * Handle "Atender" button click
   */
  onAttend(escalation: EscalationEvent): void {
    // Navigate to inbox with chat selected
    this.router.navigate(['/atencion'], {
      queryParams: { cola: 'mios', chat: escalation.chatId }
    });

    // Remove from escalations list
    this.escalationService.removeEscalation(escalation.chatId);
  }

  /**
   * Dismiss escalation without attending
   */
  onDismiss(escalation: EscalationEvent): void {
    this.escalationService.removeEscalation(escalation.chatId);
  }

  /**
   * Clear all escalations
   */
  onClearAll(): void {
    if (confirm('¿Estás seguro de que quieres eliminar todas las escalaciones?')) {
      this.escalationService.clearAll();
    }
  }
}
