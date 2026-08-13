import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AttributePublicationHistory from './AttributePublicationHistory.vue';
import ContractRevisionHistory from './ContractRevisionHistory.vue';

describe('Attribute history', () => {
  it('shows publications separately with immutable actor and migrated unknown flags', async () => {
    const wrapper = mount(AttributePublicationHistory, {
      props: {
        items: [
          {
            canonicalHash: 'publication-hash',
            changes: {
              contractChanged: false,
              contractCompatibility: 'UNCHANGED',
              lifecycleChanged: null,
              metadataChanged: null,
              policyChanged: null,
            },
            contractRevisionId: 'revision-8',
            contractVersion: 8,
            fieldCount: 4,
            id: 'publication-42',
            projectId: 'project-1',
            publishedActorId: 'attribute-contract-migration',
            publishedActorType: 'SYSTEM',
            publishedAt: '2026-07-28T10:00:00.000Z',
            publishedById: null,
            publishReason: 'Historical backfill',
            sequence: 42,
          },
        ],
        selected: null,
      },
    });

    expect(wrapper.text()).toContain('Публикация #42');
    expect(wrapper.text()).toContain('Контракт v8');
    expect(wrapper.text()).toContain('Система · attribute-contract-migration');
    expect(wrapper.text()).toContain('Состав изменений неизвестен (миграция)');

    await wrapper.get('button[data-publication-id="publication-42"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['publication-42']);
  });

  it('shows producer contract revisions as a different history', async () => {
    const wrapper = mount(ContractRevisionHistory, {
      props: {
        items: [
          {
            canonicalHash: 'contract-hash',
            compatibilityReport: {
              authorization: {
                breakingChangePlan: null,
                compatibilityGraceDays: 7,
                readinessEvidenceId: null,
                securityConfirmations: [],
              },
              issues: [],
              lifecycleImpacts: [],
              valid: true,
            },
            fieldCount: 4,
            id: 'revision-8',
            projectId: 'project-1',
            publishedAt: '2026-07-28T10:00:00.000Z',
            publishedById: null,
            publishReason: 'Added optional loyalty field',
            validationHash: 'validation-hash',
            version: 8,
          },
        ],
        selected: null,
      },
    });

    expect(wrapper.text()).toContain('Контракт v8');
    expect(wrapper.text()).toContain('Producer-интеграция');
    expect(wrapper.text()).not.toContain('Публикация #8');

    await wrapper.get('button[data-revision-id="revision-8"]').trigger('click');
    expect(wrapper.emitted('select')?.[0]).toEqual(['revision-8']);
  });
});
