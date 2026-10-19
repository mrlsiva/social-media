import { ContentType, SocialPlatform } from '../../common/enums';
import { ErrorCode } from '../../common/errors/error-codes';
import { PublishContext, PublishMedia } from '../interfaces/social-publisher.interface';
import { InstagramPublisher } from './instagram.publisher';

/** Instagram container flow against a mocked Graph API client (no network). */
function graphMock() {
  return {
    version: 'v25.0',
    isConfigured: () => true,
    post: jest.fn(async (path: string, _data?: Record<string, unknown>, _token?: string): Promise<Record<string, unknown>> => {
      if (path.endsWith('/media')) return { id: 'container-1' };
      if (path.endsWith('/media_publish')) return { id: 'ig-media-1' };
      return {};
    }),
    get: jest.fn(async (_path: string, params: Record<string, string>): Promise<Record<string, unknown>> => {
      if (params.fields?.includes('status_code')) return { status_code: 'FINISHED' };
      if (params.fields === 'permalink') return { permalink: 'https://www.instagram.com/p/abc/' };
      return {};
    }),
    ruploadBinary: jest.fn(),
  };
}

const media = (over: Partial<PublishMedia> = {}): PublishMedia => ({
  id: 'm1',
  kind: 'image',
  mimeType: 'image/png',
  url: 'https://cdn.example.com/a.png',
  sizeBytes: 1000,
  width: 1080,
  height: 1080,
  durationSeconds: null,
  aiGenerated: false,
  isPubliclyReachable: true,
  toBlob: async () => new Blob(['x']),
  jpegUrl: async () => 'https://cdn.example.com/a.publish.jpg',
  ...over,
});

const ctx = (over: Partial<PublishContext> = {}): PublishContext =>
  ({
    account: { platformAccountId: '17841400000000000', platform: SocialPlatform.INSTAGRAM },
    credentials: { accessToken: 'page-token' },
    post: { title: 'x' },
    postPlatform: {},
    contentType: ContentType.IMAGE,
    content: { text: 'Hello #diwali', hashtags: ['diwali'], title: null, description: null, linkUrl: null },
    media: [media()],
    thumbnail: null,
    options: {},
    log: jest.fn(),
    ...over,
  }) as PublishContext;

describe('InstagramPublisher', () => {
  it('publishes a single image: container (JPEG URL) -> wait FINISHED -> media_publish', async () => {
    const graph = graphMock();
    const publisher = new InstagramPublisher(graph as never, graphMock() as never);
    const result = await publisher.publishPost(ctx());

    expect(graph.post).toHaveBeenNthCalledWith(1, '/17841400000000000/media', { image_url: 'https://cdn.example.com/a.publish.jpg', caption: 'Hello #diwali' }, 'page-token');
    expect(graph.post).toHaveBeenLastCalledWith('/17841400000000000/media_publish', { creation_id: 'container-1' }, 'page-token');
    expect(result).toEqual({ platformPostId: 'ig-media-1', platformPostUrl: 'https://www.instagram.com/p/abc/' });
  });

  it('publishes a reel and uploads bytes via resumable upload when the URL is not public', async () => {
    const graph = graphMock();
    const publisher = new InstagramPublisher(graph as never, graphMock() as never);
    const video = media({ kind: 'video', mimeType: 'video/mp4', isPubliclyReachable: false, url: 'http://localhost:3000/uploads/v.mp4' });
    await publisher.publishVideo(ctx({ contentType: ContentType.REEL, media: [video] }));

    expect(graph.post.mock.calls[0][1]).toMatchObject({ media_type: 'REELS', upload_type: 'resumable', share_to_feed: true });
    expect(graph.ruploadBinary).toHaveBeenCalledTimes(1);
  });

  it('uses the Instagram Login client for accounts connected with the separate Instagram app', async () => {
    const graph = graphMock();
    const igGraph = graphMock();
    const publisher = new InstagramPublisher(graph as never, igGraph as never);
    await publisher.publishPost(
      ctx({ account: { platformAccountId: '17841400000000000', platform: SocialPlatform.INSTAGRAM, metadata: { loginType: 'instagram' } } as never }),
    );

    expect(igGraph.post).toHaveBeenLastCalledWith('/17841400000000000/media_publish', { creation_id: 'container-1' }, 'page-token');
    expect(graph.post).not.toHaveBeenCalled();
  });

  it('refreshes Instagram Login tokens and leaves Facebook Login page tokens alone', async () => {
    const expiresAt = new Date('2026-12-01T00:00:00Z');
    const igGraph = { ...graphMock(), refreshLongLivedToken: jest.fn(async () => ({ accessToken: 'new-token', expiresAt })) };
    const publisher = new InstagramPublisher(graphMock() as never, igGraph as never);
    const creds = { accessToken: 'old-token', scopes: 'instagram_business_basic' };

    await expect(publisher.refreshToken({ metadata: { loginType: 'instagram' } } as never, creds)).resolves.toEqual({
      accessToken: 'new-token',
      expiresAt,
      scopes: 'instagram_business_basic',
    });
    expect(igGraph.refreshLongLivedToken).toHaveBeenCalledWith('old-token');
    await expect(publisher.refreshToken({ metadata: { pageId: 'p1' } } as never, creds)).resolves.toBeNull();
  });

  it('fails when Instagram reports a container processing error', async () => {
    const graph = graphMock();
    graph.get.mockResolvedValueOnce({ status_code: 'ERROR', status: 'Unsupported format' });
    const publisher = new InstagramPublisher(graph as never, graphMock() as never);
    await expect(publisher.publishPost(ctx())).rejects.toMatchObject({ code: ErrorCode.PUBLISH_FAILED });
  });

  it('validation: requires public image URLs, max 30 hashtags, carousel 2-10 items, supported aspect ratios', () => {
    const publisher = new InstagramPublisher(graphMock() as never, graphMock() as never);
    const errors = publisher.validateContent(
      ctx({
        contentType: ContentType.CAROUSEL,
        media: [media({ isPubliclyReachable: false, width: 1080, height: 2400 })],
        content: { text: 'x', hashtags: Array.from({ length: 31 }, (_, i) => `t${i}`), title: null, description: null, linkUrl: null },
      }),
    );
    expect(errors.join(' ')).toMatch(/public HTTPS URL/);
    expect(errors.join(' ')).toMatch(/at most 30 hashtags/);
    expect(errors.join(' ')).toMatch(/2 to 10 items/);
    expect(errors.join(' ')).toMatch(/aspect ratio/);
  });
});
