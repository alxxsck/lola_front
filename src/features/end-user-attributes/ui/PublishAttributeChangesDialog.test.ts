import { shallowMount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type {
  AttributeContractIssueResponseDto,
  AttributePublicationChangesResponseDto,
} from '@/shared/api/generated/models';
import PublishAttributeChangesDialog from './PublishAttributeChangesDialog.vue';

const policyOnly: AttributePublicationChangesResponseDto = {
  contractChanged: false,
  contractCompatibility: 'UNCHANGED',
  lifecycleChanged: false,
  metadataChanged: false,
  policyChanged: true,
};

const securityIssue: AttributeContractIssueResponseDto = {
  code: 'ATTRIBUTE_EXPOSURE_BROADENED',
  compatibility: 'SECURITY',
  definitionId: 'definition-ai',
  message: 'AI access broadened',
  severity: 'WARNING',
};

describe('PublishAttributeChangesDialog', () => {
  const dialogStub = {
    template: '<section><slot /><slot name="footer" /></section>',
  };
  const global = {
    stubs: {
      Dialog: dialogStub,
      Message: { template: '<div><slot /></div>' },
      PublicationImpactSummary: false,
    },
  };

  it('publishes policy-only changes without contract rollout controls', async () => {
    const wrapper = shallowMount(PublishAttributeChangesDialog, {
      props: {
        canConfirmSecurity: true,
        changes: policyOnly,
        issues: [securityIssue],
        publishing: false,
        visible: true,
      },
      global,
    });
    const vm = wrapper.vm as unknown as {
      form: { reason: string; confirmSecurity: boolean };
      submit: () => void;
    };

    expect(wrapper.text()).toContain('Интеграция продукта не изменится');
    expect(wrapper.text()).toContain('Разрешение ИИ начнёт действовать сразу после публикации');
    expect(wrapper.find('[data-testid="compatibility-grace"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="breaking-plan"]').exists()).toBe(false);

    vm.form.reason = 'Разрешить AI использовать отображаемое имя';
    vm.form.confirmSecurity = true;
    vm.submit();

    expect(wrapper.emitted('publish')?.[0]).toEqual([
      {
        breakingChangePlan: null,
        compatibilityGraceDays: undefined,
        readinessEvidenceId: null,
        reason: 'Разрешить AI использовать отображаемое имя',
        securityConfirmations: ['definition-ai'],
      },
    ]);
  });

  it('requires a migration plan only for a breaking contract change', () => {
    const wrapper = shallowMount(PublishAttributeChangesDialog, {
      props: {
        canConfirmSecurity: true,
        changes: {
          ...policyOnly,
          contractChanged: true,
          contractCompatibility: 'BREAKING',
          policyChanged: false,
        },
        issues: [],
        publishing: false,
        visible: true,
      },
      global,
    });
    const vm = wrapper.vm as unknown as {
      canSubmit: boolean;
      form: { breakingChangePlan: string; reason: string };
    };

    expect(wrapper.find('[data-testid="compatibility-grace"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="breaking-plan"]').exists()).toBe(true);
    vm.form.reason = 'Ужесточить допустимые значения';
    expect(vm.canSubmit).toBe(false);
    vm.form.breakingChangePlan = 'Сначала обновить producer, затем профили';
    expect(vm.canSubmit).toBe(true);
  });
});
