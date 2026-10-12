import { AiGenerationType, SocialPlatform } from '../common/enums';
import { AiTextService } from './ai-text.service';
import { AiTextProvider } from './providers/ai-provider.interfaces';

const brand = {
  id: 'b1',
  name: 'Sling Billings',
  description: 'Billing software',
  website: 'https://slingbillings.com',
  settings: { defaultLanguage: 'ta', defaultTone: 'friendly', defaultCta: 'Start free trial', aiSettings: { avoidWords: ['cheap'] } },
};

function setup(response: unknown) {
  const provider: AiTextProvider = {
    name: 'mock',
    model: 'mock-1',
    isConfigured: () => true,
    completeJson: jest.fn().mockResolvedValue({ data: response, tokensUsed: 42 }),
  };
  const generations = {
    prepare: jest.fn().mockResolvedValue({ brand, accountId: 'owner-1' }),
    // Execute the generation function directly (history/usage are tested elsewhere).
    runSync: jest.fn(async (_u, _c, _t, _p, _i, fn: () => Promise<{ data: unknown }>) => ({ generationId: 'g1', result: (await fn()).data })),
  };
  return { service: new AiTextService(provider, generations as never), provider, generations };
}

describe('AiTextService (mocked provider)', () => {
  it('grounds prompts in the brand: language, tone, CTA and avoided words', async () => {
    const { service, provider } = setup({ captions: [{ hook: 'h', text: 't' }] });
    await service.caption('u1', { brandId: 'b1', topic: 'Diwali offer' });

    const req = (provider.completeJson as jest.Mock).mock.calls[0][0];
    expect(req.system).toContain('Sling Billings');
    expect(req.system).toContain('Never use these words/phrases: cheap');
    expect(req.user).toContain('Language: ta');
    expect(req.user).toContain('Tone: friendly');
  });

  it('cleans hashtags (no #, no spaces, de-duplicated, limited)', async () => {
    const { service } = setup({ hashtags: ['#Diwali', 'diwali', 'small business', '#billing'], branded: [], niche: [], broad: [] });
    const res = await service.hashtags('u1', { brandId: 'b1', count: 3 });
    expect(res.result.hashtags).toEqual(['Diwali', 'diwali', 'smallbusiness']);
  });

  it('returns distinct content per requested platform only', async () => {
    const { service } = setup({
      instagram: { caption: 'IG copy', hashtags: ['#a'] },
      linkedin: { caption: 'LinkedIn copy', hashtags: ['b'] },
      facebook: { caption: 'should be dropped', hashtags: [] },
    });
    const res = await service.platformContent('u1', { brandId: 'b1', platforms: [SocialPlatform.INSTAGRAM, SocialPlatform.LINKEDIN] });
    expect(Object.keys(res.result)).toEqual(['instagram', 'linkedin']);
    expect(res.result.instagram?.caption).not.toEqual(res.result.linkedin?.caption);
  });

  it('records generations with the right type for quota tracking', async () => {
    const { service, generations } = setup({ ideas: [{ title: 'x' }] });
    await service.reelIdeas('u1', { brandId: 'b1' });
    expect(generations.prepare).toHaveBeenCalledWith('u1', 'b1', AiGenerationType.REEL_IDEAS, expect.anything());
  });

  it('rejects malformed AI output', async () => {
    const { service } = setup({ nope: true });
    await expect(service.caption('u1', { brandId: 'b1' })).rejects.toThrow(/missing "captions"/);
  });
});
