import { EncryptionService } from '../../common/crypto/encryption.service';
import { AiSettingsService, maskKey } from './ai-settings.service';
import { AppSetting } from './app-setting.entity';

const ENV = {
  'ai.textProvider': 'nvidia',
  'ai.imageProvider': 'openai',
  'ai.videoProvider': 'openai',
  ai: {
    openai: { apiKey: 'sk-proj-envkey1234567890', textModel: 'gpt-4.1-mini', imageModel: 'gpt-image-1', videoModel: 'sora-2' },
    nvidia: { apiKey: '', textModel: 'nvidia/nemotron', imageModel: 'flux' },
    custom: { apiKey: '', baseUrl: '', textModel: '', imageModel: '' },
  },
} as Record<string, unknown>;

function setup() {
  const rows = new Map<string, AppSetting>();
  const repo = {
    find: jest.fn(async () => [...rows.values()]),
    create: jest.fn((x: AppSetting) => x),
    save: jest.fn(async (list: AppSetting[]) => list.forEach((r) => rows.set(r.key, r))),
    delete: jest.fn(async ({ key }: { key: { value: string[] } }) => key.value.forEach((k) => rows.delete(k))),
  };
  const config = { get: (k: string) => ENV[k], getOrThrow: () => Buffer.alloc(32, 7).toString('base64') };
  const encryption = new EncryptionService(config as never);
  const service = new AiSettingsService(repo as never, config as never, encryption);
  return { service, rows };
}

describe('AiSettingsService', () => {
  it('falls back to .env when nothing is saved', async () => {
    const { service } = setup();
    await service.reload();
    const s = service.current();
    expect(s.textProvider).toBe('nvidia');
    expect(s.providers.openai.apiKey).toBe('sk-proj-envkey1234567890');
    expect(s.providers.openai.baseUrl).toBe('https://api.openai.com/v1');
    expect(service.isConfigured('nvidia')).toBe(false);
  });

  it('saves keys encrypted, applies them immediately and only ever exposes a masked hint', async () => {
    const { service, rows } = setup();
    const { view } = await service.update({ textProvider: 'custom', providers: { nvidia: { apiKey: 'nvapi-secretvalue-ABCD' } } }, 'admin-1');

    expect(rows.get('ai.nvidia.apiKey')!.encrypted).toBe(true);
    expect(rows.get('ai.nvidia.apiKey')!.value).not.toContain('secretvalue');
    expect(service.current().providers.nvidia.apiKey).toBe('nvapi-secretvalue-ABCD');
    expect(service.current().textProvider).toBe('custom');

    const nvidia = view.providers.find((p) => p.id === 'nvidia')!;
    expect(nvidia.apiKey).toEqual({ set: true, hint: 'nvapi-…ABCD', source: 'database' });
    expect(JSON.stringify(view)).not.toContain('secretvalue');
    expect(view.providers.find((p) => p.id === 'openai')!.apiKey.source).toBe('environment');
  });

  it('treats an empty string as "remove", falling back to the .env value', async () => {
    const { service } = setup();
    await service.update({ providers: { openai: { apiKey: 'sk-proj-dbkey-000000000' } } }, 'a');
    await service.update({ providers: { openai: { apiKey: '' } } }, 'a');
    expect(service.current().providers.openai.apiKey).toBe('sk-proj-envkey1234567890');
  });

  it('configures a custom OpenAI-compatible endpoint (key optional, trailing slash trimmed)', async () => {
    const { service } = setup();
    await service.update({ providers: { custom: { baseUrl: 'http://localhost:11434/v1/', textModel: 'llama3.2' } } }, 'a');
    expect(service.current().providers.custom.baseUrl).toBe('http://localhost:11434/v1');
    expect(service.isConfigured('custom')).toBe(true);
  });

  it('rejects providers that cannot serve a capability and invalid base URLs', async () => {
    const { service } = setup();
    await expect(service.update({ videoProvider: 'nvidia' }, 'a')).rejects.toThrow('cannot be used for video');
    await expect(service.update({ providers: { custom: { baseUrl: 'ftp://x' } } }, 'a')).rejects.toThrow('Base URL');
  });

  it('ignores base URL changes for providers with a fixed endpoint', async () => {
    const { service } = setup();
    await service.update({ providers: { openai: { baseUrl: 'https://evil.example/v1' } } }, 'a');
    expect(service.current().providers.openai.baseUrl).toBe('https://api.openai.com/v1');
  });
});

describe('maskKey', () => {
  it('keeps a recognisable prefix and the last 4 characters', () => {
    expect(maskKey('sk-proj-abcdefghijklmnop1234')).toBe('sk-proj-…1234');
    expect(maskKey('short')).toBe('••••');
  });
});
