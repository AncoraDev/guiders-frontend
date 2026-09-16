import {
  Component,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  AfterViewInit,
  signal,
  computed,
  effect,
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
import { Avatar } from '@guiders-frontend/avatar';

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

/** Comercial sugerido en el autocomplete @ */
export interface MessageMentionCandidate {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

/** Payload de envío (incluye transferencia opcional vía @mention). */
export interface MessageSendPayload {
  content: string;
  transferToCommercialId?: string;
  transferToDisplayName?: string;
}

/** Acción o frase del menú `/` (Atención). */
export type SlashCommandKind = 'action' | 'snippet';
export type SlashCommandGroup = 'action' | 'team' | 'mine';

export interface SlashCommand {
  id: string;
  label: string;
  hint: string;
  kind?: SlashCommandKind;
  group?: SlashCommandGroup;
  body?: string;
}

const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'request-contact',
    label: 'Solicitar datos',
    hint: 'Pide nombre, email y teléfono',
    kind: 'action',
    group: 'action',
  },
];

const SLASH_GROUP_LABEL: Record<SlashCommandGroup, string> = {
  action: 'Acciones',
  team: 'Equipo',
  mine: 'Mías',
};

const OPEN_PHRASES_COMMAND: SlashCommand = {
  id: 'open-phrases',
  label: 'Frase rápida',
  hint: 'Elige una del equipo o tuya',
  kind: 'action',
  group: 'action',
};

type SlashView = 'actions' | 'phrases';

@Component({
  selector: 'guiders-message-input',
  imports: [FormsModule, CommonModule, Avatar],
  templateUrl: './message-input.html',
  styleUrl: './message-input.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MessageInput implements AfterViewInit, OnDestroy {
  @Output() messageSent = new EventEmitter<MessageSendPayload>();
  @Output() slashCommand = new EventEmitter<SlashCommand>();

  @ViewChild('textarea') textareaRef?: ElementRef<HTMLTextAreaElement>;

  readonly chatId = input<string | null>(null);
  readonly mode = input<'inbox' | 'widget'>('inbox');
  /** Si es true, exige presencia Conectado para escribir/enviar. */
  readonly requireOnline = input(true);
  /** Comerciales online para @mention / transferencia. */
  readonly mentionCandidates = input<MessageMentionCandidate[]>([]);
  /** Activa el autocomplete @ (Atención). */
  readonly enableMentions = input(false);
  /** Activa el menú `/` de acciones (Atención). */
  readonly enableSlashCommands = input(false);

  readonly messageText = signal('');
  readonly isSending = signal(false);
  readonly showEmojiPicker = signal(false);
  readonly isCommercialOnline = signal(false);
  readonly mentionQuery = signal<string | null>(null);
  readonly mentionHighlightIndex = signal(0);
  readonly slashQuery = signal<string | null>(null);
  readonly slashHighlightIndex = signal(0);
  readonly slashView = signal<SlashView>('actions');
  readonly pendingTransfer = signal<MessageMentionCandidate | null>(null);
  readonly emojis = QUICK_EMOJIS;
  readonly slashCommands = input<SlashCommand[] | undefined>(undefined);

  readonly isComposerLocked = computed(
    () => this.requireOnline() && !this.isCommercialOnline(),
  );

  readonly filteredMentions = computed(() => {
    const query = this.mentionQuery();
    if (query === null) return [];
    const all = this.mentionCandidates();
    const q = query.trim().toLowerCase();
    if (!q) return all;
    const filtered = all.filter((c) => {
      const name = c.name.toLowerCase();
      const tokens = name.split(/[\s@.]+/).filter(Boolean);
      return name.includes(q) || tokens.some((t) => t.startsWith(q));
    });
    // Si el filtro no pega (p.ej. nombre aún no resuelto), mostrar todos los online
    return filtered.length > 0 ? filtered : all;
  });

  readonly showMentionPicker = computed(
    () =>
      this.enableMentions() &&
      this.mentionQuery() !== null &&
      !this.isComposerLocked(),
  );

  readonly filteredSlashCommands = computed(() => {
    const query = this.slashQuery();
    if (query === null) return [];
    const q = query.trim().toLowerCase();
    const all = this.slashCommands() ?? DEFAULT_SLASH_COMMANDS;
    const snippets = all.filter((cmd) => cmd.kind === 'snippet');
    const actions = all.filter((cmd) => cmd.kind !== 'snippet');

    if (this.slashView() === 'phrases') {
      if (!q) return snippets;
      return snippets.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.hint.toLowerCase().includes(q) ||
          (cmd.body ?? '').toLowerCase().includes(q),
      );
    }

    const root = snippets.length ? [...actions, OPEN_PHRASES_COMMAND] : actions;
    if (!q) return root;
    return root.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.id.toLowerCase().includes(q) ||
        cmd.hint.toLowerCase().includes(q),
    );
  });

  slashGroupLabel(index: number): string | null {
    const items = this.filteredSlashCommands();
    const current = items[index];
    if (!current) return null;
    if (current.id === 'open-phrases') {
      return null;
    }
    const group = current.group ?? 'action';
    const prev = items[index - 1];
    if (prev && (prev.group ?? 'action') === group) return null;
    return SLASH_GROUP_LABEL[group];
  }

  slashItemIcon(command: SlashCommand): string {
    if (command.id === 'open-phrases') return '“';
    return '/';
  }

  readonly showSlashPicker = computed(
    () =>
      this.enableSlashCommands() &&
      this.slashQuery() !== null &&
      !this.isComposerLocked(),
  );

  private sendingTimestamp = 0;
  private readonly SEND_DEBOUNCE_MS = 500;
  private caretPosition = 0;
  /** Índice del `@` activo en el texto. */
  private mentionStartIndex = -1;

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
          this.closeMentionPicker();
          this.closeSlashPicker();
          const chatId = this.chatId();
          if (chatId) {
            this.presenceService.stopTyping(chatId);
          }
        }
      });

    effect(() => {
      if (!this.showSlashPicker()) return;
      this.slashHighlightIndex();
      this.filteredSlashCommands();
      this.scrollActiveSlashIntoView();
    });
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (
      !this.showEmojiPicker() &&
      !this.showMentionPicker() &&
      !this.showSlashPicker()
    ) {
      return;
    }

    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.showEmojiPicker.set(false);
      this.closeMentionPicker();
      this.closeSlashPicker();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.showEmojiPicker.set(false);
    this.closeMentionPicker();
    if (this.slashView() === 'phrases' && this.showSlashPicker()) {
      this.goBackToActions();
      return;
    }
    this.closeSlashPicker();
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
    this.closeMentionPicker();
    this.closeSlashPicker();
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
    this.updateMentionState();
    this.updateSlashState();

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
    this.updateMentionState();
    this.updateSlashState();
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

    if (this.showSlashPicker()) {
      const items = this.filteredSlashCommands();
      if (
        event.key === 'Backspace' &&
        this.slashView() === 'phrases' &&
        !(this.slashQuery() ?? '').length
      ) {
        event.preventDefault();
        this.goBackToActions();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.slashHighlightIndex.update((i) =>
          Math.min(i + 1, items.length - 1),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.slashHighlightIndex.update((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = items[this.slashHighlightIndex()];
        if (selected) this.selectSlashCommand(selected);
        return;
      }
    }

    if (this.showMentionPicker()) {
      const items = this.filteredMentions();
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.mentionHighlightIndex.update((i) =>
          Math.min(i + 1, items.length - 1),
        );
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.mentionHighlightIndex.update((i) => Math.max(i - 1, 0));
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const selected = items[this.mentionHighlightIndex()];
        if (selected) this.selectMention(selected);
        return;
      }
    }

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onMentionPointerDown(event: Event, candidate: MessageMentionCandidate): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectMention(candidate);
  }

  onSlashPointerDown(event: Event, command: SlashCommand): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectSlashCommand(command);
  }

  onSlashBackPointerDown(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.goBackToActions();
  }

  selectSlashCommand(command: SlashCommand): void {
    if (command.id === 'open-phrases') {
      this.openPhrasesView();
      return;
    }

    this.closeSlashPicker();
    this.closeMentionPicker();
    this.showEmojiPicker.set(false);

    if (command.kind === 'snippet' && command.body) {
      this.insertSnippet(command.body);
      return;
    }

    this.messageText.set('');
    this.caretPosition = 0;
    this.adjustTextareaHeight();
    this.slashCommand.emit(command);
    setTimeout(() => this.textareaRef?.nativeElement.focus(), 0);
  }

  private insertSnippet(body: string): void {
    const text = this.messageText();
    const caret = this.caretPosition;
    const beforeCaret = text.slice(0, caret);
    const slashIndex = beforeCaret.lastIndexOf('/');
    const next =
      slashIndex >= 0
        ? `${text.slice(0, slashIndex)}${body}${text.slice(caret)}`
        : body;
    this.messageText.set(next);
    this.caretPosition = slashIndex >= 0 ? slashIndex + body.length : body.length;
    this.syncTyping();
    this.adjustTextareaHeight();
    setTimeout(() => {
      const el = this.textareaRef?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(this.caretPosition, this.caretPosition);
    }, 0);
  }

  selectMention(candidate: MessageMentionCandidate): void {
    if (this.mentionStartIndex < 0) return;

    const text = this.messageText();
    const caret = this.caretPosition;
    const before = text.slice(0, this.mentionStartIndex);
    const after = text.slice(caret);
    const insertion = `@${candidate.name} `;
    const next = `${before}${insertion}${after}`;
    this.messageText.set(next);
    this.caretPosition = before.length + insertion.length;
    this.pendingTransfer.set(candidate);
    this.closeMentionPicker();
    this.closeSlashPicker();
    this.syncTyping();
    this.adjustTextareaHeight();

    setTimeout(() => {
      const el = this.textareaRef?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(this.caretPosition, this.caretPosition);
    }, 0);
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
    this.closeMentionPicker();
    this.closeSlashPicker();

    const chatId = this.chatId();
    if (chatId) {
      this.presenceService.stopTyping(chatId);
    }

    const transfer = this.pendingTransfer();
    const stillMentionsTransfer =
      !!transfer && text.toLowerCase().includes(`@${transfer.name.toLowerCase()}`);

    this.messageSent.emit({
      content: text,
      ...(stillMentionsTransfer
        ? {
            transferToCommercialId: transfer.id,
            transferToDisplayName: transfer.name,
          }
        : {}),
    });
    this.messageText.set('');
    this.caretPosition = 0;
    this.pendingTransfer.set(null);
    this.adjustTextareaHeight();

    setTimeout(() => {
      this.textareaRef?.nativeElement.focus();
      this.isSending.set(false);
    }, 50);
  }

  private updateMentionState(): void {
    if (!this.enableMentions()) {
      this.closeMentionPicker();
      return;
    }

    const text = this.messageText();
    const caret = this.caretPosition;
    const beforeCaret = text.slice(0, caret);
    // Cualquier token tras @ hasta espacio (más tolerante que \w)
    const match = beforeCaret.match(/(?:^|[\s([{])@([^\s@]*)$/);

    if (!match) {
      this.closeMentionPicker();
      return;
    }

    this.mentionStartIndex = beforeCaret.length - (match[1].length + 1);
    this.mentionQuery.set(match[1]);
    this.mentionHighlightIndex.set(0);
    this.closeSlashPicker();
  }

  private updateSlashState(): void {
    if (!this.enableSlashCommands()) {
      this.closeSlashPicker();
      return;
    }

    const text = this.messageText();
    const caret = this.caretPosition;
    const beforeCaret = text.slice(0, caret);
    const match = beforeCaret.match(/(?:^|[\s])\/([^\s]*)$/);

    if (!match) {
      this.closeSlashPicker();
      return;
    }

    const nextQuery = match[1];
    if (this.slashQuery() !== nextQuery) {
      this.slashHighlightIndex.set(0);
    }
    this.slashQuery.set(nextQuery);
    this.closeMentionPicker();
  }

  private closeMentionPicker(): void {
    this.mentionQuery.set(null);
    this.mentionStartIndex = -1;
    this.mentionHighlightIndex.set(0);
  }

  private closeSlashPicker(): void {
    this.slashQuery.set(null);
    this.slashHighlightIndex.set(0);
    this.slashView.set('actions');
  }

  private openPhrasesView(): void {
    this.slashView.set('phrases');
    this.clearSlashFilter();
    this.slashHighlightIndex.set(0);
  }

  private goBackToActions(): void {
    this.slashView.set('actions');
    this.clearSlashFilter();
    this.slashHighlightIndex.set(0);
  }

  private scrollActiveSlashIntoView(): void {
    requestAnimationFrame(() => {
      const active = this.hostRef.nativeElement.querySelector(
        '.message-input__slash-list .message-input__mention-option--active',
      );
      active?.scrollIntoView({ block: 'nearest' });
    });
  }

  /** Deja solo `/` para que el listado no quede filtrado al cambiar de vista. */
  private clearSlashFilter(): void {
    const text = this.messageText();
    const caret = this.caretPosition;
    const beforeCaret = text.slice(0, caret);
    const slashIndex = beforeCaret.lastIndexOf('/');
    if (slashIndex < 0) {
      this.slashQuery.set('');
      return;
    }
    const next = `${text.slice(0, slashIndex + 1)}${text.slice(caret)}`;
    this.messageText.set(next);
    this.caretPosition = slashIndex + 1;
    this.slashQuery.set('');
    this.adjustTextareaHeight();
    setTimeout(() => {
      const el = this.textareaRef?.nativeElement;
      if (!el) return;
      el.focus();
      el.setSelectionRange(this.caretPosition, this.caretPosition);
    }, 0);
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
