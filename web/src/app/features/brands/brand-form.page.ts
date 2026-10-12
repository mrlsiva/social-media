import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BrandContextService } from '../../core/brand-context.service';
import { Brand, BrandMember } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { initials } from '../../shared/format';
import { Icon } from '../../shared/icon';

const LANGUAGES = [
  ['en', 'English'], ['hi', 'Hindi'], ['ta', 'Tamil'], ['te', 'Telugu'], ['kn', 'Kannada'], ['ml', 'Malayalam'], ['mr', 'Marathi'],
  ['bn', 'Bengali'], ['gu', 'Gujarati'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['ar', 'Arabic'],
];
const TONES = ['professional', 'friendly', 'casual', 'witty', 'inspirational', 'luxury', 'bold', 'educational'];

@Component({
  selector: 'app-brand-form-page',
  imports: [ReactiveFormsModule, FormsModule, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brand-form.page.html',
  styles: [`
    .layout { display: grid; grid-template-columns: 1.5fr 1fr; gap: 20px; align-items: start; }
    .logo-drop { display: flex; gap: 16px; align-items: center; }
    .logo-preview { width: 84px; height: 84px; border-radius: 20px; font-size: 26px; }
    .preview-card { overflow: hidden; position: sticky; top: 84px; }
    .preview-cover { height: 90px; }
    .preview-body { padding: 0 20px 20px; }
    .preview-logo { width: 72px; height: 72px; border-radius: 18px; border: 4px solid #fff; margin-top: -36px; font-size: 24px; }
    .swatches { display: flex; gap: 8px; margin-top: 12px; }
    .swatch { flex: 1; height: 36px; border-radius: 10px; display: grid; place-items: center; color: #fff; font-size: 11px; font-weight: 600; }
    .member { display: flex; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border); }
    .member:last-child { border-bottom: 0; }
    @media (max-width: 1000px) { .layout { grid-template-columns: 1fr; } .preview-card { position: static; } }
  `],
})
export class BrandFormPage implements OnInit {
  readonly id = input<string>();
  private readonly api = inject(ApiService);
  private readonly ctx = inject(BrandContextService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly welcome = inject(ActivatedRoute).snapshot.queryParamMap.has('welcome');

  protected readonly languages = LANGUAGES;
  protected readonly tones = TONES;
  protected readonly initials = initials;
  protected readonly saving = signal(false);
  protected readonly logoUrl = signal<string | null>(null);
  protected readonly logoFile = signal<File | null>(null);
  protected readonly members = signal<BrandMember[]>([]);
  protected readonly role = signal<string>('owner');
  protected inviteEmail = '';
  protected inviteRole = 'editor';

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    description: [''],
    website: ['', Validators.pattern(/^https?:\/\/.+/)],
    phone: [''],
    email: ['', Validators.email],
    address: [''],
    primaryColor: ['#0078B8'],
    secondaryColor: ['#F57AA8'],
    defaultLanguage: ['en'],
    defaultTone: ['professional'],
    defaultCta: [''],
    timezone: [Intl.DateTimeFormat().resolvedOptions().timeZone],
    defaultHashtags: [''],
    brandVoice: [''],
    keywords: [''],
    avoidWords: [''],
    emojiLevel: ['light' as 'none' | 'light' | 'heavy'],
    useBrandingInImages: [true],
  });

  ngOnInit(): void {
    const id = this.id();
    if (!id) return;
    this.api.get<Brand>(`/brands/${id}`).subscribe((b) => {
      this.role.set(b.role);
      this.logoUrl.set(b.logoUrl);
      const s = b.settings ?? {};
      this.form.patchValue({
        name: b.name,
        description: b.description ?? '',
        website: b.website ?? '',
        phone: b.phone ?? '',
        email: b.email ?? '',
        address: b.address ?? '',
        primaryColor: b.primaryColor,
        secondaryColor: b.secondaryColor,
        defaultLanguage: s.defaultLanguage ?? 'en',
        defaultTone: s.defaultTone ?? 'professional',
        defaultCta: s.defaultCta ?? '',
        timezone: s.timezone ?? 'UTC',
        defaultHashtags: (s.defaultHashtags ?? []).join(', '),
        brandVoice: s.aiSettings?.brandVoice ?? '',
        keywords: (s.aiSettings?.keywords ?? []).join(', '),
        avoidWords: (s.aiSettings?.avoidWords ?? []).join(', '),
        emojiLevel: s.aiSettings?.emojiLevel ?? 'light',
        useBrandingInImages: s.aiSettings?.useBrandingInImages ?? true,
      });
    });
    this.loadMembers();
  }

  onLogo(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.logoFile.set(file);
    this.logoUrl.set(URL.createObjectURL(file));
  }

  save() {
    if (this.form.invalid) return this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    const body = {
      name: v.name,
      description: v.description || undefined,
      website: v.website || undefined,
      phone: v.phone || undefined,
      email: v.email || undefined,
      address: v.address || undefined,
      primaryColor: v.primaryColor,
      secondaryColor: v.secondaryColor,
      settings: {
        defaultLanguage: v.defaultLanguage,
        defaultTone: v.defaultTone,
        defaultCta: v.defaultCta || undefined,
        timezone: v.timezone,
        defaultHashtags: list(v.defaultHashtags),
        aiSettings: {
          brandVoice: v.brandVoice || undefined,
          keywords: list(v.keywords),
          avoidWords: list(v.avoidWords),
          emojiLevel: v.emojiLevel,
          useBrandingInImages: v.useBrandingInImages,
        },
      },
    };
    this.saving.set(true);
    const id = this.id();
    const req = id ? this.api.patch<Brand>(`/brands/${id}`, body) : this.api.post<Brand>('/brands', body);
    req.subscribe({
      next: (brand) => {
        const finish = (b: Brand) => {
          this.ctx.upsert(b);
          this.ctx.select(b.id);
          this.toast.success(id ? 'Brand updated' : `${b.name} created`);
          void this.router.navigate(id ? ['/brands'] : ['/social-accounts']);
        };
        const file = this.logoFile();
        if (!file) return finish(brand);
        const form = new FormData();
        form.append('file', file);
        this.api.upload<Brand>(`/brands/${brand.id}/logo`, form).subscribe({
          next: finish,
          error: (e) => {
            this.toast.error(`Brand saved, but the logo upload failed: ${(e as Error).message}`);
            finish(brand);
          },
        });
      },
      error: (e) => {
        this.toast.error(e);
        this.saving.set(false);
      },
    });
  }

  loadMembers() {
    const id = this.id();
    if (id) this.api.get<BrandMember[]>(`/brands/${id}/members`).subscribe((m) => this.members.set(m));
  }

  invite() {
    const id = this.id();
    if (!id || !this.inviteEmail) return;
    this.api.post<BrandMember[]>(`/brands/${id}/members`, { email: this.inviteEmail, role: this.inviteRole }).subscribe({
      next: (m) => {
        this.members.set(m);
        this.inviteEmail = '';
        this.toast.success('Team member added');
      },
      error: (e) => this.toast.error(e),
    });
  }

  removeMember(m: BrandMember) {
    this.api.delete(`/brands/${this.id()}/members/${m.id}`).subscribe({
      next: () => this.loadMembers(),
      error: (e) => this.toast.error(e),
    });
  }
}
