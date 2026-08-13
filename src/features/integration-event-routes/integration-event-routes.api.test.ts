import { beforeEach, describe, expect, it, vi } from 'vitest';
import { integrationEventRoutesApi } from './integration-event-routes.api';

const generated = vi.hoisted(() => ({
  createCustomerIo: vi.fn(),
  editDraft: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  eventCatalogList: vi.fn(),
  integrationEventRouteActivityList: vi.fn(),
  integrationEventRouteCreateAmplitude: vi.fn(),
  integrationEventRouteCreateCustomerIo: generated.createCustomerIo,
  integrationEventRouteDisable: vi.fn(),
  integrationEventRouteEditDraft: generated.editDraft,
  integrationEventRouteEnable: vi.fn(),
  integrationEventRouteList: vi.fn(),
  integrationEventRoutePublish: vi.fn(),
}));

describe('integrationEventRoutesApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates Customer.io routes through the provider-specific endpoint', async () => {
    const input = {
      connectionId: 'connection-1',
      name: 'Deposit',
      eventDefinitionKeyId: 'event-key-1',
      eventDefinitionRevisionId: 'event-revision-1',
      providerEventName: 'deposit_completed',
      propertyBindings: [],
    };

    await integrationEventRoutesApi.createCustomerIo('project-1', input, 'create-cio-route-key');

    expect(generated.createCustomerIo).toHaveBeenCalledWith('project-1', input, {
      headers: { 'Idempotency-Key': 'create-cio-route-key' },
    });
  });

  it('edits an existing route through a new draft revision', async () => {
    const input = {
      expectedVersion: 4,
      reason: 'Обновление события Customer.io',
      name: 'Deposit',
      eventDefinitionKeyId: 'event-key-1',
      eventDefinitionRevisionId: 'event-revision-2',
      providerEventName: 'deposit_completed_v2',
      propertyBindings: [],
    };

    await integrationEventRoutesApi.editDraft('project-1', 'route-1', input, 'edit-cio-route-key');

    expect(generated.editDraft).toHaveBeenCalledWith('project-1', 'route-1', input, {
      headers: { 'Idempotency-Key': 'edit-cio-route-key' },
    });
  });
});
