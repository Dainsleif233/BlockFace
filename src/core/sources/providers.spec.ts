import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadFirstAvailable,
  resolveAccountSkin,
  type SkinCandidate,
  SkinLookupError,
  validateAccountName,
} from './providers';

describe('validateAccountName', () => {
  it('接受 3-16 位的字母、数字与下划线', () => {
    expect(validateAccountName('Notch')).toBe('Notch');
    expect(validateAccountName('  jeb_  ')).toBe('jeb_');
    expect(validateAccountName('Player_12345')).toBe('Player_12345');
    expect(validateAccountName('abc')).toBe('abc');
    expect(validateAccountName('1234567890123456')).toBe('1234567890123456');
  });

  it('拒绝空输入或全空格', () => {
    expect(() => validateAccountName('')).toThrow(SkinLookupError);
    expect(() => validateAccountName('   ')).toThrow(SkinLookupError);
  });

  it('拒绝过短或过长的名字', () => {
    expect(() => validateAccountName('ab')).toThrow(SkinLookupError);
    expect(() => validateAccountName('12345678901234567')).toThrow(SkinLookupError);
  });

  it('拒绝包含特殊字符或中文的名字', () => {
    expect(() => validateAccountName('Player-One')).toThrow(SkinLookupError);
    expect(() => validateAccountName('史蒂夫')).toThrow(SkinLookupError);
    expect(() => validateAccountName('Notch!')).toThrow(SkinLookupError);
    expect(() => validateAccountName('hello world')).toThrow(SkinLookupError);
  });
});

describe('loadFirstAvailable', () => {
  it('第一个候选地址成功时立即返回该结果与提供商', () => {
    const candidates: SkinCandidate[] = [
      { url: 'https://cdn.example.com/skin1', provider: 'Primary' },
      { url: 'https://cdn.example.com/skin2', provider: 'Secondary' },
    ];
    const loader = vi.fn(async (cand: SkinCandidate) => ({ loadedUrl: cand.url }));

    return expect(loadFirstAvailable(candidates, loader)).resolves.toEqual({
      result: { loadedUrl: 'https://cdn.example.com/skin1' },
      provider: 'Primary',
    });
  });

  it('前置候选地址失败时自动按优先级降级到后续地址', async () => {
    const candidates: SkinCandidate[] = [
      { url: 'https://cdn.example.com/bad1', provider: 'ProviderA' },
      { url: 'https://cdn.example.com/bad2', provider: 'ProviderB' },
      { url: 'https://cdn.example.com/good', provider: 'ProviderC' },
    ];
    const loader = vi.fn(async (cand: SkinCandidate) => {
      if (cand.provider !== 'ProviderC') {
        throw new Error('404 Not Found');
      }
      return { ok: true };
    });

    const result = await loadFirstAvailable(candidates, loader);
    expect(result).toEqual({
      result: { ok: true },
      provider: 'ProviderC',
    });
    expect(loader).toHaveBeenCalledTimes(3);
  });

  it('所有来源均失败时抛出 SkinLookupError 并汇总各源错误', async () => {
    const candidates: SkinCandidate[] = [
      { url: 'https://cdn.example.com/bad1', provider: 'ProviderA' },
      { url: 'https://cdn.example.com/bad2', provider: 'ProviderB' },
    ];
    const loader = vi.fn(async () => {
      throw new Error('网络连接超时');
    });

    await expect(loadFirstAvailable(candidates, loader)).rejects.toThrow(SkinLookupError);
  });
});

describe('resolveAccountSkin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('playerdb 返回正版皮肤时标记 resolved=true 并提供 textures 官方源', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        data: {
          player: {
            username: 'Notch',
            skin_texture: 'http://textures.minecraft.net/texture/292009a4925b58f02c77ada41065095870d21f37e600d8caa4db1476db8b090',
          },
        },
      }),
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockResponse as unknown as Response);

    const resolution = await resolveAccountSkin('notch');
    expect(resolution.resolved).toBe(true);
    expect(resolution.displayName).toBe('Notch');
    expect(resolution.candidates[0].provider).toBe('textures.minecraft.net');
    expect(resolution.candidates[0].url).toContain('https://textures.minecraft.net');
  });

  it('playerdb 异常或超时时走离线降级方案并标记 resolved=false', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('Network error'));

    const resolution = await resolveAccountSkin('Steve');
    expect(resolution.resolved).toBe(false);
    expect(resolution.displayName).toBe('Steve');
    expect(resolution.candidates.length).toBeGreaterThanOrEqual(2);
    expect(resolution.candidates.map((c) => c.provider)).toEqual(['mc-heads.net', 'minotar.net']);
  });
});
