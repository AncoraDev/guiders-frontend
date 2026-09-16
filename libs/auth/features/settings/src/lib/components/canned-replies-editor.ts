import { ChangeDetectionStrategy, Component, computed, input, model, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface CannedReplyItem {
  id: string;
  title: string;
  body: string;
}

interface ReplyForm {
  id: string | null;
  title: string;
  body: string;
}

const TITLE_MAX = 40;
const BODY_MAX = 500;

@Component({
  selector: 'lib-canned-replies-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './canned-replies-editor.html',
  styleUrl: './canned-replies-editor.scss',
})
export class CannedRepliesEditorComponent {
  readonly items = model<CannedReplyItem[]>([]);
  readonly maxItems = input(15);
  readonly readonly = input(false);
  readonly saving = input(false);
  readonly commit = output<CannedReplyItem[]>();

  readonly titleMax = TITLE_MAX;
  readonly bodyMax = BODY_MAX;
  readonly form = signal<ReplyForm | null>(null);

  readonly canAdd = computed(
    () => !this.readonly() && this.items().length < this.maxItems(),
  );
  readonly canSubmit = computed(() => {
    const form = this.form();
    return !!form && !!form.title.trim() && !!form.body.trim();
  });
  readonly formTitle = computed(() =>
    this.form()?.id ? 'Editar frase' : 'Nueva frase',
  );
  readonly formCount = computed(() => this.form()?.body.length ?? 0);

  startCreate(): void {
    if (!this.canAdd() || this.saving()) return;
    this.form.set({ id: null, title: '', body: '' });
  }

  startEdit(item: CannedReplyItem): void {
    if (this.readonly() || this.saving()) return;
    this.form.set({ id: item.id, title: item.title, body: item.body });
  }

  cancelForm(): void {
    if (this.saving()) return;
    this.form.set(null);
  }

  patchForm(field: 'title' | 'body', value: string): void {
    const max = field === 'title' ? TITLE_MAX : BODY_MAX;
    this.form.update((form) =>
      form ? { ...form, [field]: value.slice(0, max) } : form,
    );
  }

  submitForm(): void {
    const form = this.form();
    if (!form || !this.canSubmit() || this.readonly() || this.saving()) return;

    const nextItem: CannedReplyItem = {
      id: form.id ?? crypto.randomUUID(),
      title: form.title.trim(),
      body: form.body.trim(),
    };
    const current = this.items();
    const next = form.id
      ? current.map((item) => (item.id === form.id ? nextItem : item))
      : [...current, nextItem];

    this.items.set(next);
    this.form.set(null);
    this.commit.emit(next);
  }

  remove(item: CannedReplyItem): void {
    if (this.readonly() || this.saving()) return;
    if (!window.confirm(`¿Eliminar «${item.title}»?`)) return;
    const next = this.items().filter((entry) => entry.id !== item.id);
    this.items.set(next);
    if (this.form()?.id === item.id) {
      this.form.set(null);
    }
    this.commit.emit(next);
  }

  preview(body: string): string {
    const text = body.replace(/\s+/g, ' ').trim();
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
}
