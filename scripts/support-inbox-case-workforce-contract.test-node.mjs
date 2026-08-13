import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function pinnedContract() {
  return JSON.parse(
    await readFile(path.join(repositoryRoot, 'openapi/retenive-backend.json'), 'utf8'),
  );
}

function operation(contract, operationId) {
  for (const pathItem of Object.values(contract.paths)) {
    for (const value of Object.values(pathItem)) {
      if (value?.operationId === operationId) return value;
    }
  }
  throw new Error(`Fixture is missing ${operationId}`);
}

function inlineError(contract, operationId, status) {
  const response = operation(contract, operationId).responses[status].content['application/json']
    .schema;
  return (
    response.properties?.error ??
    response.allOf?.find((entry) => entry.properties?.error)?.properties.error
  );
}

test('inbox and Case commands retain bounded server-owned query and mutation semantics', async () => {
  const { validateSupportInboxCaseWorkforceContract } =
    await import('./support-inbox-case-workforce-contract.mjs');

  const baseline = await pinnedContract();
  assert.doesNotThrow(() => validateSupportInboxCaseWorkforceContract(baseline));

  const mutations = [
    (contract) => {
      contract.components.schemas.SupportWorkspaceCasesPageResponseDto.required =
        contract.components.schemas.SupportWorkspaceCasesPageResponseDto.required.filter(
          (field) => field !== 'items',
        );
    },
    (contract) => {
      operation(contract, 'SupportWorkspace_read').parameters.find(
        (parameter) => parameter.name === 'limit',
      ).schema.maximum = 1_000;
    },
    (contract) => {
      operation(contract, 'SupportWorkspace_read').parameters.find(
        (parameter) => parameter.name === 'cursor',
      ).schema.maxLength = 20_000;
    },
    (contract) => {
      operation(contract, 'SupportWorkspace_read').parameters.find(
        (parameter) => parameter.name === 'mode',
      ).required = false;
    },
    (contract) => {
      delete operation(contract, 'AdminProjectConversations_list')['x-iam-permission'];
    },
    (contract) => {
      operation(contract, 'AdminProjectConversations_list').parameters.find(
        (parameter) => parameter.name === 'cursor',
      ).schema.maxLength = 2_048;
    },
    (contract) => {
      delete operation(contract, 'EndUserCases_list')['x-iam-permission'];
    },
    (contract) => {
      const sort = operation(contract, 'EndUserCases_list').parameters.find(
        (parameter) => parameter.name === 'sort',
      );
      sort.schema.enum = sort.schema.enum.filter((value) => value !== 'ATTENTION_FIRST');
    },
    (contract) => {
      const caseList = operation(contract, 'EndUserCases_list');
      caseList.parameters = caseList.parameters.filter(
        (parameter) => parameter.name !== 'priority',
      );
    },
    (contract) => {
      const target = contract.components.schemas.ClassifyEndUserCaseDto;
      target.required = target.required.filter((field) => field !== 'expectedVersion');
    },
    (contract) => {
      const target = contract.components.schemas.UpdateEndUserCaseWorkflowDto;
      target.required = target.required.filter((field) => field !== 'reason');
    },
    (contract) => {
      delete operation(contract, 'EndUserCases_detail')['x-iam-permission'];
    },
    (contract) => {
      const target = contract.components.schemas.EndUserCaseResponseDto;
      target.required = target.required.filter((field) => field !== 'availableStatuses');
    },
    (contract) => {
      delete contract.components.schemas.SupportWorkspaceCapabilitiesResponseDto.properties
        .claimAssignment;
    },
    (contract) => {
      const target = contract.components.schemas.SupportWorkspaceCaseRowResponseDto;
      target.required = target.required.filter((field) => field !== 'slaSignal');
    },
    (contract) => {
      const target = contract.components.schemas.SupportWorkspaceSelectionResponseDto;
      target.required = target.required.filter((field) => field !== 'routing');
    },
    (contract) => {
      const target = contract.components.schemas.SupportSlaCaseClockResponseDto;
      target.required = target.required.filter((field) => field !== 'remainingBusinessMs');
    },
    (contract) => {
      delete contract.components.schemas.SupportCaseRoutingExclusionCountsResponseDto.properties
        .SKILL_REQUIRED;
    },
    (contract) => {
      delete contract.components.schemas.ClassifyEndUserCaseDto.properties.priority;
    },
  ];

  for (const [index, mutate] of mutations.entries()) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(
      () => validateSupportInboxCaseWorkforceContract(contract),
      `inbox mutation ${index} must be rejected`,
    );
  }
});

test('assignment and offer commands retain authority, OCC and audited reasons', async () => {
  const { validateSupportInboxCaseWorkforceContract } =
    await import('./support-inbox-case-workforce-contract.mjs');

  const mutations = [
    (contract) => {
      delete operation(contract, 'SupportCaseAssignment_claim')['x-iam-permission'];
    },
    (contract) => {
      operation(contract, 'SupportCaseAssignment_transfer').parameters.find(
        (parameter) => parameter.name === 'If-Match',
      ).required = false;
    },
    (contract) => {
      operation(contract, 'SupportRoutingOffer_accept').parameters.find(
        (parameter) => parameter.name === 'Idempotency-Key',
      ).required = false;
    },
    (contract) => {
      const target = contract.components.schemas.AssignSupportCaseAssignmentDto;
      target.required = target.required.filter((field) => field !== 'reasonCode');
    },
    (contract) => {
      const target = contract.components.schemas.TransferSupportCaseAssignmentDto;
      target.required = target.required.filter((field) => field !== 'expectedAssignmentVersion');
    },
    (contract) => {
      const target = contract.components.schemas.SupportRoutingOwnOfferDto;
      target.required = target.required.filter((field) => field !== 'actionEtag');
    },
    (contract) => {
      const target = contract.components.schemas.SupportCaseAssignmentMutationResponseDto;
      target.required = target.required.filter((field) => field !== 'assignmentVersion');
    },
    (contract) => {
      const conflict = inlineError(contract, 'SupportCaseAssignment_assign', '409');
      conflict.properties.code.enum = conflict.properties.code.enum.filter(
        (value) => value !== 'CASE_VERSION_CONFLICT',
      );
    },
    (contract) => {
      delete inlineError(contract, 'SupportCaseAssignment_release', '409').properties.details
        .properties.currentActionEtag;
    },
    (contract) => {
      delete operation(contract, 'SupportCaseAssignment_transfer').responses['409'];
    },
    (contract) => {
      const conflict = inlineError(contract, 'SupportCaseAssignment_claim', '409');
      conflict.properties.code.enum = conflict.properties.code.enum.filter(
        (value) => value !== 'ASSIGNMENT_CAPACITY_EXCEEDED',
      );
    },
    (contract) => {
      operation(contract, 'SupportCaseAssignment_assignWithOverride')['x-iam-all-permissions'] =
        operation(contract, 'SupportCaseAssignment_assignWithOverride')[
          'x-iam-all-permissions'
        ].filter((entry) => entry.code !== 'project.support.assignments.force_assign');
    },
    (contract) => {
      const target = contract.components.schemas.ForceAssignSupportCaseAssignmentDto;
      target.required = target.required.filter((field) => field !== 'reasonNote');
    },
    (contract) => {
      const target = contract.components.schemas.SupportCaseAssignmentBatchResponseDto;
      target.required = target.required.filter((field) => field !== 'items');
    },
    (contract) => {
      delete contract.components.schemas.SupportCaseAssignmentCandidateOperatorResponseDto
        .properties.requiredOverrides;
    },
  ];

  for (const [index, mutate] of mutations.entries()) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(
      () => validateSupportInboxCaseWorkforceContract(contract),
      `assignment mutation ${index} must be rejected`,
    );
  }
});

test('availability, workforce, queue, routing and SLA projections retain authority and provenance', async () => {
  const { validateSupportInboxCaseWorkforceContract } =
    await import('./support-inbox-case-workforce-contract.mjs');

  const mutations = [
    (contract) => {
      const target = contract.components.schemas.SupportOperatorAvailabilityResponseDto;
      target.required = target.required.filter((field) => field !== 'effectiveState');
    },
    (contract) => {
      const reasonCode =
        contract.components.schemas.SupportOperatorAvailabilityResponseDto.properties.reasonCode;
      reasonCode.enum = reasonCode.enum.filter((value) => value !== 'BUSINESS_EXPIRY');
    },
    (contract) => {
      const source =
        contract.components.schemas.SupportOperatorAvailabilityResponseDto.properties.source;
      source.enum = source.enum.filter((value) => value !== 'BUSINESS_EXPIRY');
    },
    (contract) => {
      const reasonCode = contract.components.schemas.SupportLeadSafeFactDto.properties.reasonCode;
      reasonCode.enum = reasonCode.enum.filter((value) => value !== 'BUSINESS_EXPIRY');
    },
    (contract) => {
      const topic =
        contract.components.schemas.PersonalSupportNotificationPreferenceResponseDto.properties
          .topic;
      topic.enum = topic.enum.filter((value) => value !== 'SUPPORT_CASE_ASSIGNED_TO_ME');
    },
    (contract) => {
      operation(contract, 'SupportOperatorAvailability_overrideOperator').parameters.find(
        (parameter) => parameter.name === 'Idempotency-Key',
      ).required = false;
    },
    (contract) => {
      const target = contract.components.schemas.SupportWorkforceSettingsResponseDto;
      target.required = target.required.filter((field) => field !== 'actionEtag');
    },
    (contract) => {
      const target = contract.components.schemas.SupportWorkforceOperatorDto;
      target.required = target.required.filter((field) => field !== 'maxCapacityUnits');
    },
    (contract) => {
      const target = contract.components.schemas.SupportQueueFreshnessResponseDto;
      target.required = target.required.filter((field) => field !== 'state');
    },
    (contract) => {
      const target = contract.components.schemas.SupportRoutingDecisionDetailResponseDto;
      target.required = target.required.filter((field) => field !== 'inputManifest');
    },
    (contract) => {
      operation(contract, 'SupportSlaHumanCommand_correctClock').parameters.find(
        (parameter) => parameter.name === 'If-Match',
      ).required = false;
    },
    (contract) => {
      const state = contract.components.schemas.SupportQueueFreshnessResponseDto.properties.state;
      state.enum = state.enum.filter((value) => value !== 'DEGRADED');
    },
    (contract) => {
      const target = contract.components.schemas.SupportQueueEntryResponseDto;
      target.required = target.required.filter((field) => field !== 'slaDueAt');
    },
  ];

  for (const mutate of mutations) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(() => validateSupportInboxCaseWorkforceContract(contract));
  }
});

test('search and Saved View request contracts stay bounded and visibly response-unpublished', async () => {
  const { validateSupportInboxCaseWorkforceContract } =
    await import('./support-inbox-case-workforce-contract.mjs');

  const mutations = [
    (contract) => {
      delete operation(contract, 'SupportSearch_cases')['x-iam-permission'];
    },
    (contract) => {
      contract.components.schemas.SupportCaseSearchQueryDto.properties.limit.maximum = 1_000;
    },
    (contract) => {
      operation(contract, 'SavedSupportView_publish').parameters.find(
        (parameter) => parameter.name === 'If-Match',
      ).required = false;
    },
    (contract) => {
      const target = contract.components.schemas.CreateSavedSupportViewDto;
      target.required = target.required.filter((field) => field !== 'scope');
    },
    (contract) => {
      operation(contract, 'SavedSupportView_catalog').responses['200'].content = {
        'application/json': {
          schema: { type: 'object' },
        },
      };
    },
  ];

  for (const mutate of mutations) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(() => validateSupportInboxCaseWorkforceContract(contract));
  }
});
