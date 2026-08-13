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

test('workspace contract rejects removal of recovery-critical selection fields', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const requiredFields = ['checkpoint', 'capabilitiesRevision', 'actionRevisions', 'messages'];

  for (const field of requiredFields) {
    const contract = await pinnedContract();
    const required = contract.components.schemas.SupportWorkspaceSelectionResponseDto.required;
    contract.components.schemas.SupportWorkspaceSelectionResponseDto.required = required.filter(
      (value) => value !== field,
    );

    assert.throws(
      () => validateSupportWorkspaceMessagingContract(contract),
      new RegExp(`SupportWorkspaceSelectionResponseDto.*${field}`, 'u'),
    );
  }
});

test('workspace contract rejects removal of required selection and capability fields', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const requiredFields = {
    SupportWorkspaceSelectionResponseDto: [
      'mode',
      'endUser',
      'case',
      'conversation',
      'messages',
      'relatedCases',
      'relatedConversations',
      'relatedCasesTruncated',
      'relatedConversationsTruncated',
      'classificationOptions',
      'capabilities',
      'capabilitiesRevision',
      'actionRevisions',
      'checkpoint',
    ],
    SupportWorkspaceCapabilitiesResponseDto: [
      'reply',
      'replyWithoutTranslation',
      'suspendAi',
      'manageCase',
      'assignCase',
      'claimAssignment',
      'releaseAssignment',
      'transferAssignment',
      'escalateCase',
    ],
  };

  for (const [schemaName, fields] of Object.entries(requiredFields)) {
    for (const field of fields) {
      const contract = await pinnedContract();
      const target = contract.components.schemas[schemaName];
      target.required = target.required.filter((value) => value !== field);

      assert.throws(
        () => validateSupportWorkspaceMessagingContract(contract),
        new RegExp(`${schemaName}.*${field}`, 'u'),
      );
    }
  }
});

test('workspace messaging contract requires the published read and send operations', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const operationIds = [
    'SupportWorkspace_read',
    'AdminConversations_listMessages',
    'AdminMessaging_send',
    'AdminMessaging_lookupOutcome',
    'AdminConversationCollaboration_get',
    'AdminConversationCollaboration_mark',
  ];

  for (const operationId of operationIds) {
    const contract = await pinnedContract();
    for (const pathItem of Object.values(contract.paths)) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (operation?.operationId === operationId) delete pathItem[method];
      }
    }

    assert.throws(
      () => validateSupportWorkspaceMessagingContract(contract),
      new RegExp(operationId, 'u'),
    );
  }
});

test('workspace read state remains server-owned and directionally pageable', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const requiredFields = {
    CmsConversationReadPositionResponseDto: [
      'conversationId',
      'lastReadOrdinal',
      'highestOrdinal',
      'firstUnreadOrdinal',
      'unreadMessageCount',
      'unreadCustomerMessageCount',
    ],
    SupportWorkspaceConversationRowResponseDto: ['readState'],
    SupportWorkspaceSelectionConversationResponseDto: ['readState'],
    SupportWorkspaceMessagePageResponseDto: ['anchorOrdinal'],
  };

  for (const [schemaName, fields] of Object.entries(requiredFields)) {
    for (const field of fields) {
      const contract = await pinnedContract();
      const target = contract.components.schemas[schemaName];
      target.required = target.required.filter((value) => value !== field);
      assert.throws(
        () => validateSupportWorkspaceMessagingContract(contract),
        new RegExp(`${schemaName}.*${field}`, 'u'),
      );
    }
  }

  for (const field of ['nextCursor', 'newerCursor']) {
    const contract = await pinnedContract();
    delete contract.components.schemas.SupportWorkspaceMessagePageResponseDto.properties[field];
    assert.throws(
      () => validateSupportWorkspaceMessagingContract(contract),
      new RegExp(`SupportWorkspaceMessagePageResponseDto.*${field}`, 'u'),
    );
  }

  const missingNewerCursor = await pinnedContract();
  operation(missingNewerCursor, 'SupportWorkspace_read').parameters = operation(
    missingNewerCursor,
    'SupportWorkspace_read',
  ).parameters.filter((value) => value.name !== 'messageNewerCursor');
  assert.throws(
    () => validateSupportWorkspaceMessagingContract(missingNewerCursor),
    /SupportWorkspace_read.*messageNewerCursor/u,
  );
});

test('read position GET and ACK retain IAM authority and monotonic request shape', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const mutations = [
    (contract) => {
      delete operation(contract, 'AdminConversationCollaboration_get')['x-iam-permission'];
    },
    (contract) => {
      delete operation(contract, 'AdminConversationCollaboration_mark')['x-iam-permission'];
    },
    (contract) => {
      const target = contract.components.schemas.MarkCmsConversationReadPositionDto;
      target.required = target.required.filter((value) => value !== 'lastReadOrdinal');
    },
  ];

  for (const mutate of mutations) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(() => validateSupportWorkspaceMessagingContract(contract));
  }
});

test('workspace operations retain authority, pagination bounds and send idempotency', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const mutations = [
    (contract) => {
      delete operation(contract, 'SupportWorkspace_read')['x-iam-any-permission'];
    },
    (contract) => {
      delete operation(contract, 'AdminConversations_listMessages')['x-iam-permission'];
    },
    (contract) => {
      operation(contract, 'SupportWorkspace_read').parameters.find(
        (parameter) => parameter.name === 'messageLimit',
      ).schema.maximum = 1_000;
    },
    (contract) => {
      operation(contract, 'AdminMessaging_send').parameters.find(
        (parameter) => parameter.name === 'Idempotency-Key',
      ).required = false;
    },
    (contract) => {
      operation(contract, 'AdminMessaging_lookupOutcome').parameters.find(
        (parameter) => parameter.name === 'Idempotency-Key',
      ).required = false;
    },
  ];

  for (const mutate of mutations) {
    const contract = await pinnedContract();
    mutate(contract);
    assert.throws(() => validateSupportWorkspaceMessagingContract(contract));
  }
});

test('workspace shell cutover keeps retired rollout contracts absent', async () => {
  const contract = await pinnedContract();

  for (const operationId of ['SupportWorkspace_readAdmission', 'SupportWorkspace_updateRollout']) {
    assert.throws(() => operation(contract, operationId), /Fixture is missing/u);
  }

  for (const schemaName of [
    'SupportWorkspaceAdmissionResponseDto',
    'SupportWorkspaceRolloutResponseDto',
    'UpdateSupportWorkspaceRolloutDto',
    'SupportWorkspaceErrorBodyDto',
  ]) {
    assert.equal(contract.components.schemas[schemaName], undefined);
  }
});

test('message history keeps ordinal, immutable author and delivery receipt semantics', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const mutations = [
    ['AdminConversationMessageResponseDto', 'ordinal'],
    ['AdminConversationMessageResponseDto', 'author'],
    ['AdminMessageAuthorResponseDto', 'displayName'],
    ['AdminMessageDeliveryResponseDto', 'status'],
    ['AdminMessageDeliveryResponseDto', 'commandIds'],
  ];

  for (const [schemaName, field] of mutations) {
    const contract = await pinnedContract();
    const target = contract.components.schemas[schemaName];
    target.required = target.required.filter((value) => value !== field);
    assert.throws(
      () => validateSupportWorkspaceMessagingContract(contract),
      new RegExp(`${schemaName}.*${field}`, 'u'),
    );
  }

  const contract = await pinnedContract();
  contract.components.schemas.AdminMessageDeliveryResponseDto.properties.status.enum =
    contract.components.schemas.AdminMessageDeliveryResponseDto.properties.status.enum.filter(
      (value) => value !== 'READ',
    );
  assert.throws(
    () => validateSupportWorkspaceMessagingContract(contract),
    /AdminMessageDeliveryResponseDto.*READ/u,
  );
});

test('workspace modes are stable while additive delivery states remain forward compatible', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const missingMode = await pinnedContract();
  missingMode.components.schemas.SupportWorkspaceMode.enum =
    missingMode.components.schemas.SupportWorkspaceMode.enum.filter(
      (value) => value !== 'SELECTION',
    );
  assert.throws(
    () => validateSupportWorkspaceMessagingContract(missingMode),
    /SupportWorkspaceMode.*SELECTION/u,
  );

  const additiveDelivery = await pinnedContract();
  additiveDelivery.components.schemas.AdminMessageDeliveryResponseDto.properties.status.enum.push(
    'PROVIDER_ACCEPTED',
  );
  assert.doesNotThrow(() => validateSupportWorkspaceMessagingContract(additiveDelivery));
});

test('message and immutable author enums retain every published value', async () => {
  const { validateSupportWorkspaceMessagingContract } =
    await import('./support-workspace-contract.mjs');
  const enumFields = [
    ['MessageRole', null, 'ADMIN'],
    ['MessageStatus', null, 'COMPLETED'],
    ['AdminMessageAuthorResponseDto', 'type', 'CMS_USER'],
  ];

  for (const [schemaName, propertyName, value] of enumFields) {
    const contract = await pinnedContract();
    const enumValues = propertyName
      ? contract.components.schemas[schemaName].properties[propertyName].enum
      : contract.components.schemas[schemaName].enum;
    const filtered = enumValues.filter((candidate) => candidate !== value);
    if (propertyName) {
      contract.components.schemas[schemaName].properties[propertyName].enum = filtered;
    } else {
      contract.components.schemas[schemaName].enum = filtered;
    }

    assert.throws(
      () => validateSupportWorkspaceMessagingContract(contract),
      new RegExp(`${schemaName}.*${value}`, 'u'),
    );
  }
});
