import { beforeEach, describe, expect, it, vi } from 'vitest';

const generated = vi.hoisted(() => ({
  amplitude: vi.fn(),
  customerIo: vi.fn(),
}));
vi.mock('@/shared/api/generated/retenive-backend', () => ({
  integrationEventRouteCreateAmplitudeInbound: generated.amplitude,
  integrationEventRouteCreateCustomerIoInbound: generated.customerIo,
}));

describe('integrationInboundRoutesApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates provider-specific inbound routes with an idempotency key', async () => {
    const { integrationInboundRoutesApi: api } = await import('./integration-inbound-routes.api');
    const input = {
      connectionId: 'connection-1',
      name: 'Deposit inbound',
      eventDefinitionKeyId: 'event-1',
      eventDefinitionRevisionId: 'revision-1',
      providerEventName: 'deposit',
      propertyBindings: [
        {
          sourcePath: ['properties', 'amount'],
          targetKey: 'amount',
          required: true,
        },
      ],
    };

    await api.create('CUSTOMER_IO', 'project-1', input, 'route-key');

    expect(generated.customerIo).toHaveBeenCalledWith('project-1', input, {
      headers: { 'Idempotency-Key': 'route-key' },
    });
  });
});
