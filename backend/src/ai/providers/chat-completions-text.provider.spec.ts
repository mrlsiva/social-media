import { extractJsonObject } from './chat-completions-text.provider';

describe('extractJsonObject', () => {
  it('returns bare JSON unchanged', () => {
    expect(extractJsonObject('{"a":1}')).toBe('{"a":1}');
  });

  it('strips markdown fences and surrounding prose', () => {
    const content = 'Here you go:\n```json\n{"caption":"Hi {name}","tags":["x"]}\n```\nEnjoy!';
    expect(JSON.parse(extractJsonObject(content))).toEqual({ caption: 'Hi {name}', tags: ['x'] });
  });

  it('leaves content without an object as-is so parsing fails loudly', () => {
    expect(extractJsonObject('no json here')).toBe('no json here');
  });
});
