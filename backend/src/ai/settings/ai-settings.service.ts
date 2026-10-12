import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Like, Repository } from 'typeorm';
import { EncryptionService } from '../../common/crypto/encryption.service';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-codes';
import { AiConfig } from '../../config/configuration';
import {
  AI_CAPABILITIES,
  AI_PROVIDER_IDS,
  AI_PROVIDER_META,
  AiCapability,
  AiProviderId,
  AiProviderSettings,
  AiSettingsSnapshot,
  PROVIDER_FIELDS,
  ProviderField,
  SELECTION_KEYS,
  settingKey,
} from './ai-settings.constants';
import { AppSetting } from './app-setting.entity';

/** Admin edits: a string sets the value, '' removes it (back to the .env default), undefined leaves it. */
export interface AiSettingsUpdate {
  textProvider?: string;
  imageProvider?: string;
  videoProvider?: string;
  providers?: Partial<Record<AiProviderId, Partial<Record<ProviderField, string>>>>;
}

export interface AiProviderView {
  id: AiProviderId;
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

export interface AiSettingsView {
  textProvider: AiProviderId;
  imageProvider: AiProviderId;
  videoProvider: AiProviderId;
  capabilities: Record<AiCapability, readonly AiProviderId[]>;
  providers: AiProviderView[];
}

const REFRESH_MS = 30_000;

/**
 * Runtime AI provider configuration. Admin-saved values (app_settings) override
 * the .env defaults. A cached snapshot keeps provider calls synchronous; it is
 * refreshed on every save and periodically so other instances pick changes up.
 */
@Injectable()
export class AiSettingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiSettingsService.name);
  private stored = new Map<string, string>();
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>,
    private readonly config: ConfigService,
    private readonly encryption: EncryptionService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();
    this.timer = setInterval(() => void this.reload(), REFRESH_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async reload(): Promise<void> {
    try {
      const rows = await this.repo.find({ where: { key: Like('ai.%') } });
      const next = new Map<string, string>();
      for (const row of rows) {
        if (row.value === null) continue;
        try {
          next.set(row.key, row.encrypted ? this.encryption.decrypt(row.value) : row.value);
        } catch {
          this.logger.warn({ key: row.key }, 'Could not decrypt AI setting (was TOKEN_ENCRYPTION_KEY changed?) - ignoring it');
        }
      }
      this.stored = next;
    } catch (err) {
      // Table missing (migration not run) or DB down: keep the last snapshot / .env defaults.
      this.logger.warn({ err: (err as Error).message }, 'Could not load AI settings from the database');
    }
  }

  current(): AiSettingsSnapshot {
    const providers = {} as Record<AiProviderId, AiProviderSettings>;
    for (const id of AI_PROVIDER_IDS) {
      const defaults = this.envDefaults(id);
      const resolved = {} as AiProviderSettings;
      for (const field of PROVIDER_FIELDS) resolved[field] = this.stored.get(settingKey(id, field)) || defaults[field];
      if (AI_PROVIDER_META[id].fixedBaseUrl) resolved.baseUrl = AI_PROVIDER_META[id].fixedBaseUrl!;
      providers[id] = resolved;
    }
    return {
      textProvider: this.selection('text'),
      imageProvider: this.selection('image'),
      videoProvider: this.selection('video'),
      providers,
    };
  }

  /** Whether a provider has what it needs to make requests (custom endpoints may not need a key, e.g. Ollama). */
  isConfigured(id: AiProviderId): boolean {
    const p = this.current().providers[id];
    return id === 'custom' ? p.baseUrl.length > 0 : p.apiKey.length > 0;
  }

  view(): AiSettingsView {
    const snapshot = this.current();
    return {
      textProvider: snapshot.textProvider,
      imageProvider: snapshot.imageProvider,
      videoProvider: snapshot.videoProvider,
      capabilities: AI_CAPABILITIES,
      providers: AI_PROVIDER_IDS.map((id) => {
        const p = snapshot.providers[id];
        const source = this.stored.get(settingKey(id, 'apiKey')) ? 'database' : this.envDefaults(id).apiKey ? 'environment' : null;
        return {
          id,
          label: AI_PROVIDER_META[id].label,
          keyUrl: AI_PROVIDER_META[id].keyUrl,
          apiKey: { set: p.apiKey.length > 0, hint: p.apiKey ? maskKey(p.apiKey) : null, source },
          baseUrl: p.baseUrl,
          baseUrlEditable: AI_PROVIDER_META[id].fixedBaseUrl === null,
          textModel: p.textModel,
          imageModel: p.imageModel,
          videoModel: AI_CAPABILITIES.video.includes(id) ? p.videoModel : null,
          configured: this.isConfigured(id),
        };
      }),
    };
  }

  async update(changes: AiSettingsUpdate, userId: string): Promise<{ view: AiSettingsView; changedKeys: string[] }> {
    const writes: { key: string; value: string; secret: boolean }[] = [];

    for (const capability of Object.keys(SELECTION_KEYS) as AiCapability[]) {
      const value = changes[`${capability}Provider`];
      if (value === undefined) continue;
      if (value !== '' && !AI_CAPABILITIES[capability].includes(value as AiProviderId)) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, `"${value}" cannot be used for ${capability} generation`);
      }
      writes.push({ key: SELECTION_KEYS[capability], value, secret: false });
    }

    for (const id of AI_PROVIDER_IDS) {
      const fields = changes.providers?.[id];
      if (!fields) continue;
      for (const field of PROVIDER_FIELDS) {
        const raw = fields[field];
        if (raw === undefined) continue;
        const value = raw.trim();
        if (field === 'baseUrl') {
          if (AI_PROVIDER_META[id].fixedBaseUrl) continue;
          if (value && !isHttpUrl(value)) {
            throw new AppException(ErrorCode.VALIDATION_FAILED, 'Base URL must be an http(s) URL, e.g. https://openrouter.ai/api/v1');
          }
        }
        writes.push({ key: settingKey(id, field), value: field === 'baseUrl' ? value.replace(/\/+$/, '') : value, secret: field === 'apiKey' });
      }
    }

    const removals = writes.filter((w) => w.value === '').map((w) => w.key);
    const upserts = writes
      .filter((w) => w.value !== '')
      .map((w) => this.repo.create({ key: w.key, value: w.secret ? this.encryption.encrypt(w.value) : w.value, encrypted: w.secret, updatedBy: userId }));
    if (removals.length) await this.repo.delete({ key: In(removals) });
    if (upserts.length) await this.repo.save(upserts);

    await this.reload();
    return { view: this.view(), changedKeys: writes.map((w) => w.key) };
  }

  private selection(capability: AiCapability): AiProviderId {
    const allowed = AI_CAPABILITIES[capability];
    const fromEnv = this.config.get<string>(`ai.${capability}Provider`);
    const value = this.stored.get(SELECTION_KEYS[capability]) || fromEnv;
    return allowed.includes(value as AiProviderId) ? (value as AiProviderId) : allowed[0];
  }

  private envDefaults(id: AiProviderId): AiProviderSettings {
    const ai = this.config.get<AiConfig>('ai');
    const env: Partial<AiProviderSettings> = (ai?.[id] as Partial<AiProviderSettings> | undefined) ?? {};
    return {
      apiKey: env.apiKey ?? '',
      baseUrl: env.baseUrl ?? AI_PROVIDER_META[id].fixedBaseUrl ?? '',
      textModel: env.textModel ?? '',
      imageModel: env.imageModel ?? '',
      videoModel: env.videoModel ?? '',
    };
  }
}

/** Shows enough of a key to recognise it without revealing it: "nvapi-…x9Qz". */
export function maskKey(key: string): string {
  if (key.length <= 12) return '••••';
  const prefix = key.match(/^[a-z]+[-_](proj[-_])?/i)?.[0] ?? key.slice(0, 3);
  return `${prefix}…${key.slice(-4)}`;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
