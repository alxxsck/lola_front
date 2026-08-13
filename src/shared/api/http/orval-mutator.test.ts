import type { InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { axiosInstance } from './axios-instance';
import { request } from './orval-mutator';

describe('generated request transport', () => {
  it('exposes allowlisted response metadata without changing the generated body result', async () => {
    axiosInstance.defaults.adapter = async (config) => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {
        'x-support-external-settings-mutation-receipt-id': 'receipt-1',
        'x-idempotent-replay': 'true',
      },
      config: config as InternalAxiosRequestConfig,
    });
    const onResponse = vi.fn();

    await expect(
      request<{ ok: boolean }>({ url: '/test', method: 'POST' }, { onResponse }),
    ).resolves.toEqual({ ok: true });

    expect(onResponse).toHaveBeenCalledWith({
      headers: expect.objectContaining({
        'x-support-external-settings-mutation-receipt-id': 'receipt-1',
        'x-idempotent-replay': 'true',
      }),
      status: 200,
    });
  });
});
