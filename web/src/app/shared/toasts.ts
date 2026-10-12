import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';

@Component({
  selector: 'app-toasts',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast {{ t.kind }}">
          <app-icon [name]="t.kind === 'success' ? 'check' : t.kind === 'error' ? 'alert' : 'info'" />
          <span>{{ t.message }}</span>
          <button type="button" (click)="toast.dismiss(t.id)" aria-label="Dismiss"><app-icon name="x" [size]="14" /></button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toasts { position: fixed; right: 20px; bottom: 20px; display: flex; flex-direction: column; gap: 8px; z-index: 200; max-width: min(420px, calc(100vw - 40px)); }
    .toast { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 12px; background: #0f1b2d; color: #fff; box-shadow: var(--shadow-lg); font-size: 13.5px; animation: up .2s ease-out; }
    .toast.success app-icon { color: #4ade80; } .toast.error app-icon { color: #fb7185; } .toast.info app-icon, .toast.warning app-icon { color: #fbbf24; }
    .toast span { flex: 1; }
    .toast button { background: none; border: 0; color: #9fb0c8; cursor: pointer; padding: 0; }
    @keyframes up { from { transform: translateY(8px); opacity: 0; } }
  `],
})
export class Toasts {
  protected readonly toast = inject(ToastService);
}
