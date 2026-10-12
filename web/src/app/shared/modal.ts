import { ChangeDetectionStrategy, Component, HostListener, input, output } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-modal',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-backdrop" (mousedown)="onBackdrop($event)">
      <div class="modal" [class.lg]="size() === 'lg'" role="dialog" aria-modal="true" [attr.aria-label]="title()">
        <div class="modal-header">
          <h2>{{ title() }}</h2>
          <button class="btn btn-ghost btn-icon" type="button" (click)="closed.emit()" aria-label="Close"><app-icon name="x" /></button>
        </div>
        <div class="modal-body"><ng-content /></div>
        <ng-content select="[modal-footer]" />
      </div>
    </div>
  `,
})
export class Modal {
  readonly title = input('');
  readonly size = input<'md' | 'lg'>('md');
  readonly closed = output<void>();

  @HostListener('document:keydown.escape')
  onEscape() {
    this.closed.emit();
  }

  onBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) this.closed.emit();
  }
}
