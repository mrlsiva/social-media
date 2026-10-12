import { Test } from '@nestjs/testing';
import { PublishingController } from './publishing.controller';
import { PublishingService } from './publishing.service';

describe('PublishingController', () => {
  const service = {
    publishAll: jest.fn().mockResolvedValue({ batchId: 'b', postId: 'p', jobs: [], skipped: [] }),
    publishNow: jest.fn().mockResolvedValue({ batchId: 'b', postId: 'p', jobs: [], skipped: [] }),
    retryJob: jest.fn().mockResolvedValue({ batchId: 'b2', postId: 'p', jobs: [], skipped: [] }),
    retryFailed: jest.fn(),
    platformStatus: jest.fn(),
    listJobs: jest.fn(),
    getJob: jest.fn(),
  };
  let controller: PublishingController;
  const user = { id: 'u1', email: 'a@b.c', sessionId: 's', roles: [], permissions: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PublishingController],
      providers: [{ provide: PublishingService, useValue: service }],
    }).compile();
    controller = moduleRef.get(PublishingController);
  });

  it('delegates Publish to All with the authenticated user', async () => {
    await controller.publishAll(user, 'post-1');
    expect(service.publishAll).toHaveBeenCalledWith('u1', 'post-1');
  });

  it('passes selected targets for Publish Now', async () => {
    await controller.publish(user, 'post-1', { targets: ['pp-1'] });
    expect(service.publishNow).toHaveBeenCalledWith('u1', 'post-1', { targets: ['pp-1'] });
  });

  it('retries a single job', async () => {
    const res = await controller.retry(user, 'job-1');
    expect(service.retryJob).toHaveBeenCalledWith('u1', 'job-1');
    expect(res.batchId).toBe('b2');
  });
});
