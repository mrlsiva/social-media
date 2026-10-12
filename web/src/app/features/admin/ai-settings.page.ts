import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable, of, switchMap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';

type ProviderId = 'openai' | 'nvidia' | 'custom';
type Capability = 'text' | 'image' | 'video';

interface ProviderView {
  id: ProviderId;
  label: string;
  keyUrl: string | null;
  apiKey: { set: boolean; hint: string | null; source: 'database' | 'environment' | null };
  baseUrl: string;
  baseUrlEditable: boolean;
  textModel: string;
  imageModel: string;
  videoModel: string | null;
  configured: boolean;
}

interface AiSettings {
  textProvider: ProviderId;
  imageProvider: ProviderId;
  videoProvider: ProviderId;
  capabilities: Record<Capability, ProviderId[]>;
  providers: ProviderView[];
}

interface Draft {
  apiKey: string;
  baseUrl: string;
  textModel: string;
  imageModel: string;
  videoModel: string;
}

interface TestResult {
  ok: boolean;
  model: string;
  latencyMs: number;
  message: string;
}

const MODEL_FIELDS = ['baseUrl', 'textModel', 'imageModel', 'videoModel'] as const;

/** OpenAI-compatible services that work with the Custom provider. */
const PRESETS = [
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', textModel: 'openai/gpt-4.1-mini' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', textModel: 'llama-3.3-70b-versatile' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', textModel: 'deepseek-chat' },
  { name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', textModel: 'gemini-2.5-flash' },
  { name: 'Together AI', baseUrl: 'https://api.together.xyz/v1', textModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', textModel: 'llama3.2' },
];

@Component({
  selector: 'app-ai-settings-page',
  imports: [FormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page" style="max-width:960px">
      <div class="page-header"><div><h1>AI providers</h1>
        <p>Choose which AI service powers captions, images and reels. Changes apply immediately for everyone.</p></div></div>

      @if (settings(); as s) {
        <div class="card">
          <div class="card-header"><h2>Active providers</h2></div>
          <div class="card-body grid grid-3">
            @for (cap of capabilityList; track cap.id) {
              <div class="field">
                <label>{{ cap.label }}</label>
                <select class="select" [(ngModel)]="selection[cap.id]">
                  @for (id of s.capabilities[cap.id]; track id) {
                    <option [value]="id">{{ provider(id)?.label }}{{ provider(id)?.configured ? '' : ' (not set up)' }}</option>
                  }
                </select>
                <span class="hint">{{ cap.hint }}</span>
              </div>
            }
          </div>
        </div>

        @for (p of s.providers; track p.id) {
          <div class="card mt-16">
            <div class="card-header">
              <h2>{{ p.label }}</h2>
              @if (p.configured) { <span class="badge badge-success">Set up</span> } @else { <span class="badge">Not set up</span> }
              @if (inUse(p.id); as uses) { <span class="badge badge-info">Used for {{ uses }}</span> }
            </div>
            <div class="card-body grid grid-2">
              @if (p.id === 'custom') {
                <div class="field" style="grid-column:1/-1">
                  <label>Quick fill</label>
                  <div class="row-wrap">
                    @for (preset of presets; track preset.name) {
                      <button class="btn btn-sm" type="button" (click)="applyPreset(preset)">{{ preset.name }}</button>
                    }
                  </div>
                  <span class="hint">Works with any service that offers an OpenAI-compatible API. Check the service's docs for model names.</span>
                </div>
              }
              <div class="field" style="grid-column:1/-1">
                <label>API key</label>
                <div class="row">
                  <input class="input" style="flex:1" type="password" autocomplete="off" [(ngModel)]="drafts[p.id].apiKey"
                    [placeholder]="p.apiKey.set ? 'Saved (' + p.apiKey.hint + ') - type a new key to replace it' : (p.id === 'custom' ? 'Optional for local servers such as Ollama' : 'Paste your API key')" />
                  @if (p.apiKey.source === 'database') {
                    <button class="btn btn-danger" type="button" (click)="removeKey(p)">Remove</button>
                  }
                </div>
                <span class="hint">
                  @if (p.apiKey.source === 'environment') { Currently using the key from the server .env file. Saving a key here overrides it. }
                  @else { Stored encrypted. It is never shown again after saving. }
                  @if (p.keyUrl) { <a [href]="p.keyUrl" target="_blank" rel="noopener">Get a key</a> }
                </span>
              </div>
              @if (p.baseUrlEditable) {
                <div class="field" style="grid-column:1/-1">
                  <label>Base URL</label>
                  <input class="input" [(ngModel)]="drafts[p.id].baseUrl" placeholder="https://openrouter.ai/api/v1" />
                </div>
              }
              <div class="field"><label>Text model</label><input class="input" [(ngModel)]="drafts[p.id].textModel" /><span class="hint">Captions, hashtags, ideas, scripts</span></div>
              <div class="field"><label>Image model</label><input class="input" [(ngModel)]="drafts[p.id].imageModel" [placeholder]="p.id === 'custom' ? 'Leave blank if the service has no image API' : ''" /></div>
              @if (p.videoModel !== null) {
                <div class="field"><label>Video model</label><input class="input" [(ngModel)]="drafts[p.id].videoModel" /><span class="hint">Reels</span></div>
              }
            </div>
            <div class="card-footer" style="justify-content:space-between;align-items:center">
              <span class="small" [class.muted]="!tests()[p.id]">
                @if (tests()[p.id]; as t) {
                  @if (t.ok) { <span class="badge badge-success">Works</span> {{ t.model }} replied in {{ t.latencyMs }} ms }
                  @else { <span class="badge badge-danger">Failed</span> {{ t.message }} }
                } @else { Sends a tiny text request using the saved settings. }
              </span>
              <button class="btn" type="button" [disabled]="testing() === p.id || (!p.configured && !drafts[p.id].apiKey && !drafts[p.id].baseUrl)" (click)="test(p.id)">
                <app-icon name="zap" [size]="16" /> {{ testing() === p.id ? 'Testing...' : 'Test connection' }}
              </button>
            </div>
          </div>
        }

        <div class="row mt-16" style="justify-content:flex-end">
          <button class="btn" type="button" [disabled]="saving()" (click)="load()">Discard changes</button>
          <button class="btn btn-primary" type="button" [disabled]="saving()" (click)="save().subscribe()">{{ saving() ? 'Saving...' : 'Save changes' }}</button>
        </div>
      } @else {
        <div class="card"><div class="card-body muted">Loading...</div></div>
      }
    </div>
  `,
})
export class AiSettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  protected readonly settings = signal<AiSettings | null>(null);
  protected readonly saving = signal(false);
  protected readonly testing = signal<ProviderId | null>(null);
  protected readonly tests = signal<Partial<Record<ProviderId, TestResult>>>({});
  protected readonly presets = PRESETS;
  protected readonly capabilityList: { id: Capability; label: string; hint: string }[] = [
    { id: 'text', label: 'Text & captions', hint: 'Captions, hashtags, post ideas, scripts' },
    { id: 'image', label: 'Images', hint: 'AI image generation' },
    { id: 'video', label: 'Reels (video)', hint: 'Only OpenAI Sora supports video today' },
  ];

  protected selection: Record<Capability, ProviderId> = { text: 'openai', image: 'openai', video: 'openai' };
  protected drafts = {} as Record<ProviderId, Draft>;

  private readonly byId = computed(() => new Map((this.settings()?.providers ?? []).map((p) => [p.id, p])));

  ngOnInit(): void {
    this.load();
  }

  protected provider(id: ProviderId): ProviderView | undefined {
    return this.byId().get(id);
  }

  protected inUse(id: ProviderId): string {
    const s = this.settings();
    if (!s) return '';
    const uses = [s.textProvider === id && 'text', s.imageProvider === id && 'images', s.videoProvider === id && 'reels'].filter(Boolean);
    return uses.join(', ');
  }

  load() {
    this.api.get<AiSettings>('/admin/ai-settings').subscribe({ next: (s) => this.apply(s), error: (e) => this.toast.error(e) });
  }

  protected applyPreset(preset: (typeof PRESETS)[number]) {
    this.drafts.custom = { ...this.drafts.custom, baseUrl: preset.baseUrl, textModel: preset.textModel };
    this.toast.info(`${preset.name} filled in. Add its API key, then save.`);
  }

  /** Sends only what changed; an untouched key field keeps the saved key. */
  save(): Observable<AiSettings | null> {
    const s = this.settings();
    if (!s) return of(null);
    const body: Record<string, unknown> = {};
    for (const cap of this.capabilityList) {
      if (this.selection[cap.id] !== s[`${cap.id}Provider`]) body[`${cap.id}Provider`] = this.selection[cap.id];
    }
    for (const p of s.providers) {
      const d = this.drafts[p.id];
      const changes: Record<string, string> = {};
      if (d.apiKey.trim()) changes['apiKey'] = d.apiKey.trim();
      for (const f of MODEL_FIELDS) if ((d[f] ?? '') !== (p[f] ?? '')) changes[f] = d[f];
      if (Object.keys(changes).length) body[p.id] = changes;
    }
    if (Object.keys(body).length === 0) {
      this.toast.info('Nothing to save');
      return of(s);
    }
    this.saving.set(true);
    return new Observable<AiSettings | null>((sub) => {
      this.api.put<AiSettings>('/admin/ai-settings', body).subscribe({
        next: (saved) => {
          this.saving.set(false);
          this.apply(saved);
          this.toast.success('AI settings saved');
          sub.next(saved);
          sub.complete();
        },
        error: (e) => {
          this.saving.set(false);
          this.toast.error(e);
          sub.error(e);
        },
      });
    });
  }

  /** Saves pending edits first so the test runs against what is on screen. */
  protected test(id: ProviderId) {
    this.testing.set(id);
    const pending = this.hasChanges() ? this.save() : of(null);
    pending.pipe(switchMap(() => this.api.post<TestResult>('/admin/ai-settings/test', { provider: id }))).subscribe({
      next: (r) => {
        this.testing.set(null);
        this.tests.update((t) => ({ ...t, [id]: r }));
      },
      error: () => this.testing.set(null),
    });
  }

  protected removeKey(p: ProviderView) {
    if (!confirm(`Remove the saved ${p.label} API key?`)) return;
    this.api.put<AiSettings>('/admin/ai-settings', { [p.id]: { apiKey: '' } }).subscribe({
      next: (saved) => {
        this.apply(saved);
        this.toast.success('API key removed');
      },
      error: (e) => this.toast.error(e),
    });
  }

  private hasChanges(): boolean {
    const s = this.settings();
    if (!s) return false;
    if (this.capabilityList.some((c) => this.selection[c.id] !== s[`${c.id}Provider`])) return true;
    return s.providers.some((p) => !!this.drafts[p.id].apiKey.trim() || MODEL_FIELDS.some((f) => (this.drafts[p.id][f] ?? '') !== (p[f] ?? '')));
  }

  private apply(s: AiSettings) {
    this.settings.set(s);
    this.selection = { text: s.textProvider, image: s.imageProvider, video: s.videoProvider };
    this.drafts = Object.fromEntries(
      s.providers.map((p) => [p.id, { apiKey: '', baseUrl: p.baseUrl, textModel: p.textModel, imageModel: p.imageModel, videoModel: p.videoModel ?? '' }]),
    ) as Record<ProviderId, Draft>;
  }
}
