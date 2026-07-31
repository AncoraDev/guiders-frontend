import { Injectable, NgZone, inject, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { WebSocketService } from '@guiders-frontend/chat/data-access/websocket-service';
import { SessionService } from '@guiders-frontend/auth/data-access/session';
import { ToastService } from '@guiders-frontend/shared/ui/toast';

export interface TransferReceivedEvent {
  chatId: string;
  fromName: string;
  previousCommercialId?: string;
}

/**
 * Notifica en toda la Console cuando un compañero te transfiere un chat.
 * El toast host vive en el shell (app.html), no solo en Atención.
 */
@Injectable({ providedIn: 'root' })
export class TransferNotificationService {
  private readonly ws = inject(WebSocketService);
  private readonly session = inject(SessionService);
  private readonly toast = inject(ToastService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  private readonly transferReceivedSubject = new Subject<TransferReceivedEvent>();
  readonly transferReceived$ = this.transferReceivedSubject.asObservable();

  /** Evita doble toast si el evento llega por chat: y commercial: */
  private readonly recentToastKeys = new Set<string>();
  private started = false;

  private readonly onCommercialAssigned = (data: unknown): void => {
    const payload = data as {
      chatId?: string;
      commercialId?: string;
      assignmentReason?: string;
      previousCommercial?: { name?: string } | null;
      previousCommercialId?: string;
    };

    if (!payload?.chatId || !payload.commercialId) return;
    if (payload.assignmentReason !== 'transfer') return;

    const selfId = this.session.getCurrentUser()?.sub;
    if (!selfId) return;

    // Solo el destinatario
    if (payload.commercialId !== selfId) return;

    const dedupeKey = `${payload.chatId}:${payload.previousCommercialId ?? ''}`;
    if (this.recentToastKeys.has(dedupeKey)) return;
    this.recentToastKeys.add(dedupeKey);
    setTimeout(() => this.recentToastKeys.delete(dedupeKey), 8000);

    const fromName =
      payload.previousCommercial?.name?.trim() || 'un compañero';

    this.ngZone.run(() => {
      this.toast.info(`${fromName} te ha transferido un chat`, 6000);
      this.transferReceivedSubject.next({
        chatId: payload.chatId!,
        fromName,
        previousCommercialId: payload.previousCommercialId,
      });
      this.showBrowserNotification(fromName);
    });
  };

  /** Registrar listener global (idempotente). Re-liga tras reconnect. */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.bindListener();

    this.ws.connectionState$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((state) => {
        if (state === 'connected') {
          this.bindListener();
        }
      });
  }

  private bindListener(): void {
    this.ws.off('chat:commercial-assigned', this.onCommercialAssigned);
    this.ws.on('chat:commercial-assigned', this.onCommercialAssigned);
  }

  private showBrowserNotification(fromName: string): void {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (typeof document !== 'undefined' && document.hasFocus()) return;

    try {
      new Notification('Chat transferido', {
        body: `${fromName} te ha transferido un chat`,
        tag: 'guiders-chat-transfer',
      });
    } catch {
      // ignore
    }
  }
}
