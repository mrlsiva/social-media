import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  const service = new EncryptionService(new ConfigService({ auth: { tokenEncryptionKey: randomBytes(32).toString('base64') } }));

  it('round-trips secrets with AES-256-GCM and random IVs', () => {
    const a = service.encrypt('EAAG-page-token');
    const b = service.encrypt('EAAG-page-token');
    expect(a).not.toEqual(b);
    expect(a).not.toContain('EAAG');
    expect(service.decrypt(a)).toBe('EAAG-page-token');
  });

  it('detects tampering via the GCM auth tag', () => {
    const [v, iv, tag, data] = service.encrypt('secret').split(':');
    const flipped = Buffer.from(data, 'base64');
    flipped[0] ^= 0xff;
    expect(() => service.decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow();
  });

  it('rejects keys that are not 32 bytes', () => {
    expect(() => new EncryptionService(new ConfigService({ auth: { tokenEncryptionKey: Buffer.alloc(16).toString('base64') } }))).toThrow();
  });
});
