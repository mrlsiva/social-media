import { ChangeDetectionStrategy, Component, OnDestroy, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../core/api.service';
import { AiJobStatus, Media } from '../core/models';
import { ToastService } from '../core/toast.service';
import { Icon } from './icon';
import { Modal } from './modal';

/** Generate -> poll -> pick -> save to library. Used by the post editor and AI Studio. */
@Component({
  selector: 'app-ai-image-dialog',
  imports: [Modal, Icon, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="AI image generator" size="lg" (closed)="closed.emit()">
      <div class="layout">
        <div class="stack">
          <div class="field"><label>Topic *</label><input class="input" [(ngModel)]="form.topic" placeholder="Diwali offer on billing software" /></div>
          <div class="field"><label>Describe the scene</label><textarea class="textarea" [(ngModel)]="form.description" placeholder="Shop owner smiling at a tablet with invoices, festive lights"></textarea></div>
          <div class="grid grid-2">
            <div class="field"><label>Style</label>
              <select class="select" [(ngModel)]="form.style">
                <option value="">Modern commercial</option><option>photo-realistic</option><option>flat illustration</option><option>3D render</option><option>minimal</option><option>festive</option><option>bold typography poster</option>
              </select></div>
            <div class="field"><label>Size</label>
              <select class="select" [(ngModel)]="form.size"><option value="square">Square 1:1 (feed)</option><option value="portrait">Portrait (stories/reels)</option><option value="landscape">Landscape (LinkedIn/YouTube)</option></select></div>
          </div>
          <div class="grid grid-2">
            <div class="field"><label>Offer text</label><input class="input" [(ngModel)]="form.offer" placeholder="30% OFF" /></div>
            <div class="field"><label>CTA</label><input class="input" [(ngModel)]="form.cta" placeholder="Book a demo" /></div>
          </div>
          <div class="field"><label>Text language</label><input class="input" [(ngModel)]="form.language" placeholder="English" /></div>
          <div class="row-wrap">
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.useLogo" /> Brand logo</label>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.useBrandColors" /> Brand colours</label>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.includeBrandName" /> Brand name</label>
            <label class="checkbox"><input type="checkbox" [(ngModel)]="form.includeWebsite" /> Website</label>
          </div>
          <button class="btn btn-gradient" type="button" [disabled]="!form.topic || busy()" (click)="generate()">
            @if (busy()) { <span class="spinner"></span> Generating... } @else { <app-icon name="sparkles" /> {{ job() ? 'Regenerate' : 'Generate' }} }
          </button>
        </div>
        <div class="result">
          @if (job()?.status === 'completed') {
            <div class="images">
              @for (img of job()!.images ?? []; track img.index) {
                <div class="img-card" [class.picked]="picked() === img.index" (click)="picked.set(img.index)">
                  <img [src]="img.url" alt="Generated image" />
                </div>
              }
            </div>
          } @else if (busy()) {
            <div class="placeholder"><span class="spinner lg"></span><p>Creating your image… this usually takes 10-40 seconds.</p></div>
          } @else if (job()?.status === 'failed') {
            <div class="alert alert-danger"><app-icon name="alert" /> {{ job()?.error }}</div>
          } @else {
            <div class="placeholder"><app-icon name="image" [size]="36" /><p>Your generated image appears here.</p></div>
          }
        </div>
      </div>
      <div modal-footer class="modal-footer">
        @if (job()?.status === 'completed') {
          <a class="btn" [href]="job()!.images![picked()].url" target="_blank" rel="noopener" download><app-icon name="download" [size]="15" /> Download</a>
          <button class="btn" type="button" [disabled]="saving()" (click)="save(false)"><app-icon name="folder" [size]="15" /> Save to library</button>
          <button class="btn btn-primary" type="button" [disabled]="saving()" (click)="save(true)"><app-icon name="check" [size]="15" /> Use in post</button>
        } @else {
          <button class="btn" type="button" (click)="closed.emit()">Close</button>
        }
      </div>
    </app-modal>
  `,
  styles: [`
    .layout { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .result { background: var(--surface-2); border-radius: 14px; min-height: 360px; display: grid; place-items: center; padding: 12px; }
    .placeholder { text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 24px; }
    .images { display: grid; gap: 10px; width: 100%; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); }
    .img-card { border-radius: 12px; overflow: hidden; border: 3px solid transparent; cursor: pointer; }
    .img-card.picked { border-color: var(--primary); }
    @media (max-width: 800px) { .layout { grid-template-columns: 1fr; } }
  `],
})
export class AiImageDialog implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  readonly brandId = input.required<string>();
  readonly topic = input('');
  readonly used = output<Media>();
  readonly closed = output<void>();

  protected readonly job = signal<AiJobStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly saving = signal(false);
  protected readonly picked = signal(0);
  protected form = { topic: '', description: '', style: '', size: 'square', offer: '', cta: '', language: '', useLogo: true, useBrandColors: true, includeBrandName: true, includeWebsite: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.form.topic = this.topic();
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  generate() {
    this.busy.set(true);
    this.job.set(null);
    const body = { brandId: this.brandId(), ...this.form, style: this.form.style || undefined, offer: this.form.offer || undefined, cta: this.form.cta || undefined, language: this.form.language || undefined, description: this.form.description || undefined };
    this.api.post<{ jobId: string }>('/ai/image', body).subscribe({
      next: (r) => this.poll(r.jobId),
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  private poll(jobId: string) {
    this.api.get<AiJobStatus>(`/ai/images/${jobId}`).subscribe({
      next: (s) => {
        if (s.status === 'completed' || s.status === 'failed') {
          this.job.set(s);
          this.busy.set(false);
          this.picked.set(0);
        } else this.timer = setTimeout(() => this.poll(jobId), 3000);
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error(e);
      },
    });
  }

  save(use: boolean) {
    const job = this.job();
    if (!job) return;
    this.saving.set(true);
    this.api.post<Media[]>(`/ai/images/${job.jobId}/save`, { index: this.picked() }).subscribe({
      next: ([media]) => {
        this.saving.set(false);
        this.toast.success('Saved to media library');
        if (use) this.used.emit(media);
      },
      error: (e) => {
        this.saving.set(false);
        this.toast.error(e);
      },
    });
  }
}
