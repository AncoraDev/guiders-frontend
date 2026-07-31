import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  signal,
  computed,
  ChangeDetectionStrategy,
  input,
  inject,
  OnDestroy,
  HostListener,
  DestroyRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PresenceService } from '@guiders-frontend/presence-service';
import { CommercialPresenceService } from '@guiders-frontend/commercial-presence';

/** Emojis frecuentes para chat comercial — panel ligero, sin categorías. */
const QUICK_EMOJIS = [
  '😀',
  '😁',
  '😂',
  '🤣',
  '😊',
  '😍',
  '🥰',
  '😘',
  '😉',
  '🤩',
  '😎',
  '🤔',
  '😅',
  '😢',
  '😭',
  '😤',
  '😡',
  '😱',
  '😴',
  '🤯',
  '🥳',
  '🥺',
  '😇',
  '🙃',
  '👍',
  '👎',
  '👏',
  '🙌',
  '👋',
  '🤝',
  '🙏',
  '💪',
  '✌️',
  '🤞',
  '👌',
  '❤️',
  '🧡',
  '💛',
  '💚',
  '💙',
  '💜',
  '🖤',
  '💔',
  '💯',
  '✨',
  '🔥',
  '⭐',
  '🎉',
  '✅',
  '❌',
  '⚠️',
  '💬',
  '👀',
  '🫡',
  '🤷',
  '🤦',
  '💤',
  '⏰',
  '📌',
] as const;

@Component({
  selector: 'guiders-message-input',
  imports: [FormsModule, CommonModule],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageInput implements AfterViewInit, OnDestroy {
  @Output() messageSent = new EventEmitter<string>();

  @ViewChild('textarea') textareaRef?: ElementRef<HTMLTextAreaElement>;

  readonly chatId = input<string | null>(null);
  readonly mode = input<'inbox' | 'widget'>('inbox');
  /** Si es true, exige presencia Conectado para escribir/enviar. */
  readonly requireOnline = input(true);

  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly showEmojiPicker = signal(false);
  readonly isCommercialOnline = signal(false);
  readonly emojis = QUICK_EMOJIS;

  readonly isComposerLocked = computed(
    () => this.requireOnline() && !this.isCommercialOnline(),
  );

  private sendingTimestamp = 0;
  private readonly SEND_DEBOUNCE_MS = 500;
  private caretPosition = 0;

  private readonly presenceService = inject(PresenceService);
  private readonly commercialPresence = inject(CommercialPresenceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly hostRef = inject(ElementRef<HTMLElement>);

  constructor() {
    const initial = this.commercialPresence.getCurrentStatus();
    this.isCommercialOnline.set(initial.isConnected);

    this.commercialPresence.isConnected$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((connected) => {
        this.isCommercialOnline.set(connected);
        if (!connected) {
          this.showEmojiPicker.set(false);
          const chatId = this.chatId();
          if (chatId) {
            this.presenceService.stopTyping(chatId);
          }
        }
      });
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.showEmojiPicker()) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.showEmojiPicker.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.showEmojiPicker.set(false);
  }

  ngAfterViewInit(): void {
    this.adjustTextareaHeight();
    if (!this.isComposerLocked()) {
      setTimeout(() => this.textareaRef?.nativeElement.focus(), 100);
    }
  }

  ngOnDestroy(): void {
    const chatId = this.chatId();
    if (chatId) {
      this.presenceService.stopTyping(chatId);
    }
  }

  toggleEmojiPicker(event: Event): void {
    if (this.isComposerLocked()) return;
    event.preventDefault();
    event.stopPropagation();
    this.rememberCaret();
    this.showEmojiPicker.update((open) => !open);
  }

  /** mousedown: inserta sin perder el foco del textarea. */
  onEmojiPointerDown(event: Event, emoji: string): void {
    if (this.isComposerLocked()) return;
    event.preventDefault();
    event.stopPropagation();
    this.insertEmoji(emoji);
  }

  insertEmoji(emoji: string): void {
    if (this.isComposerLocked()) return;

    const textarea = this.textareaRef?.nativeElement;
    const text = this.messageText();
    const start = textarea
      ? (textarea.selectionStart ?? this.caretPosition)
      : this.caretPosition;
    const end = textarea
      ? (textarea.selectionEnd ?? this.caretPosition)
      : this.caretPosition;

    const next = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    this.messageText.set(next);
    this.caretPosition = start + emoji.length;
    this.syncTyping();
    this.adjustTextareaHeight();

    setTimeout(() => {
      const el = this.textareaRef?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(this.caretPosition, this.caretPosition);
    }, 0);
  }

  onInput(): void {
    if (this.isComposerLocked()) return;
    this.rememberCaret();
    this.adjustTextareaHeight();
    this.syncTyping();
  }

  onBlur(): void {
    this.rememberCaret();
    const chatId = this.chatId();
    if (chatId) {
      this.presenceService.stopTyping(chatId);
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.isComposerLocked()) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    if (this.isComposerLocked()) {
      return;
    }

    const text = this.messageText().trim();
    if (!text || this.isSending()) {
      return;
    }

    const now = Date.now();
    if (now - this.sendingTimestamp < this.SEND_DEBOUNCE_MS) {
      return;
    }

    this.sendingTimestamp = now;
    this.isSending.set(true);
    this.showEmojiPicker.set(false);

    const chatId = this.chatId();
    if (chatId) {
      this.presenceService.stopTyping(chatId);
    }

    this.messageSent.emit(text);
    this.messageText.set('');
    this.caretPosition = 0;
    this.adjustTextareaHeight();

    setTimeout(() => {
      this.textareaRef?.nativeElement.focus();
      this.isSending.set(false);
    }, 50);
  }

  private rememberCaret(): void {
    const textarea = this.textareaRef?.nativeElement;
    if (textarea) {
      this.caretPosition = textarea.selectionStart ?? this.messageText().length;
    }
  }

  private syncTyping(): void {
    const chatId = this.chatId();
    if (!chatId || this.isComposerLocked()) return;

    if (this.messageText().trim().length > 0) {
      this.presenceService.startTyping(chatId);
    } else {
      this.presenceService.stopTyping(chatId);
    }
  }

  private adjustTextareaHeight(): void {
    const textarea = this.textareaRef?.nativeElement;
    if (!textarea) return;

    requestAnimationFrame(() => {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    });
  }
}
