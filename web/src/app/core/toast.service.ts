import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  success(message: string) { this.push('success', message); }
  error(message: string | unknown) { this.push('error', typeof message === 'string' ? message : (message as Error)?.message ?? 'Something went wrong'); }
  info(message: string) { this.push('info', message); }
  warning(message: string) { this.push('warning', message); }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  private push(kind: Toast['kind'], message: string) {
    const id = ++this.seq;
    this.toasts.update((list) => [...list.slice(-4), { id, kind, message }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 7000 : 4000);
  }
}
