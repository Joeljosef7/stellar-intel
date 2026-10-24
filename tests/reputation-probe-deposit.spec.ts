import { describe, it, expect, vi } from 'vitest';
import { probeAllAnchors } from '@/lib/reputation/probe';
import { ANCHORS } from '@/constants/anchors';

type Sample = {
  domain: string;
  kind: string;
  corridor?: string;
  reachable: boolean;
  failureType?: string;
  error?: string;
  probedAt?: Date;
};

function makeStore() {
  const samples: Sample[] = [];
  return {
    samples,
    recordProbeSample: vi.fn(async (s: Sample) => {
      samples.push(s);
    }),
  };
}

const anchor = ANCHORS[0];

const tomlWithSep24 = {
  serviceDomain: 'anchor.example',
  transferServerSep0024: 'https://anchor.example/sep24',
};

const infoOk = {
  deposit: {
    USDC: { enabled: true },
    EURC: { enabled: false },
  },
};

describe('deposit-availability probe samples', () => {
  it('records a reachable sample for an enabled deposit asset', async () => {
    const store = makeStore();
    const fetchInfo = vi.fn(async () => infoOk);
    const now = () => new Date('2025-01-01T00:00:00Z');

    const samples = await probeAllAnchors([anchor], store as never, {
      fetchInfo,
      now,
      resolveToml: async () => tomlWithSep24,
      assets: () => [{ code: 'USDC' }],
    } as never);

    const usdc = (samples as Sample[]).find((s) => s.corridor === 'deposit:USDC');
    expect(usdc).toBeDefined();
    expect(usdc!.reachable).toBe(true);
    expect(usdc!.error).toBeUndefined();
  });

  it('records an unreachable sample with error text for a disabled asset', async () => {
    const store = makeStore();
    const fetchInfo = vi.fn(async () => infoOk);

    const samples = await probeAllAnchors([anchor], store as never, {
      fetchInfo,
      now: () => new Date('2025-01-01T00:00:00Z'),
      resolveToml: async () => tomlWithSep24,
      assets: () => [{ code: 'EURC' }],
    } as never);

    const eurc = (samples as Sample[]).find((s) => s.corridor === 'deposit:EURC');
    expect(eurc).toBeDefined();
    expect(eurc!.reachable).toBe(false);
    expect(eurc!.failureType).toBe('unknown');
    expect(eurc!.error).toBe('deposit disabled for EURC');
  });

  it('classifies an /info failure', async () => {
    const store = makeStore();
    const fetchInfo = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    const samples = (await probeAllAnchors([anchor], store as never, {
      fetchInfo,
      now: () => new Date('2025-01-01T00:00:00Z'),
      resolveToml: async () => tomlWithSep24,
      assets: () => [{ code: 'USDC' }],
    } as never)) as Sample[];

    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.reachable === false)).toBe(true);
    expect(samples.every((s) => typeof s.failureType === 'string')).toBe(true);
  });

  it('records one unreachable sample for an anchor without SEP-24', async () => {
    const store = makeStore();
    const fetchInfo = vi.fn(async () => infoOk);

    const samples = (await probeAllAnchors([anchor], store as never, {
      fetchInfo,
      now: () => new Date('2025-01-01T00:00:00Z'),
      resolveToml: async () => ({ serviceDomain: 'anchor.example' }),
      assets: () => [{ code: 'USDC' }],
    } as never)) as Sample[];

    expect(samples).toHaveLength(1);
    expect(samples[0].reachable).toBe(false);
    expect(fetchInfo).not.toHaveBeenCalled();
  });

  it('does not abort the fleet run when one anchor fails', async () => {
    const store = makeStore();
    const fetchInfo = vi.fn(async (url: string) => {
      if (url.includes('bad')) throw new Error('boom');
      return infoOk;
    });

    await expect(
      probeAllAnchors(
        [anchor, { ...anchor, domain: 'bad.example' } as typeof anchor],
        store as never,
        {
          fetchInfo,
          now: () => new Date('2025-01-01T00:00:00Z'),
          resolveToml: async (domain: string) => {
            if (domain.includes('bad')) throw new Error('toml failure');
            return tomlWithSep24;
          },
          assets: () => [{ code: 'USDC' }],
        } as never
      )
    ).resolves.not.toThrow();
  });
});
