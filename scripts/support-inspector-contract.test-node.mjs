import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = JSON.parse(
  await readFile(new URL('../openapi/retenive-backend.json', import.meta.url), 'utf8'),
);

const eventPath = '/api/v1/admin/projects/{projectId}/support/cases/{caseId}/events';

test('pins the permission-safe Support Inspector Events recipe', () => {
  const operation = contract.paths?.[eventPath]?.get;
  assert.ok(operation, 'Support Inspector Events endpoint must be pinned');
  assert.deepEqual(operation['x-iam-all-permissions'], [
    { code: 'project.cases.read', scope: 'PROJECT' },
    { code: 'project.support.inspector_events.read', scope: 'PROJECT' },
  ]);
  const parameters = Object.fromEntries(
    operation.parameters.map((parameter) => [parameter.name, parameter]),
  );
  assert.equal(parameters.from.required, true);
  assert.equal(parameters.to.required, true);
  assert.equal(parameters.limit.schema.minimum, 1);
  assert.equal(parameters.limit.schema.maximum, 100);
  assert.ok(operation.responses['429']);
  assert.ok(operation.responses['503']);
});

test('keeps product external identity explicit in profiles and absent from workspace selection', () => {
  for (const schemaName of [
    'SupportWorkspaceEndUserResponseDto',
    'EndUserCaseEndUserResponseDto',
  ]) {
    const properties = contract.components.schemas[schemaName]?.properties ?? {};
    assert.equal('externalId' in properties, false, schemaName);
    assert.equal('externalUserId' in properties, false, schemaName);
  }

  for (const schemaName of ['CmsProfileSummaryResponseDto', 'ProfileProjectionResponseDto']) {
    const externalUserId = contract.components.schemas[schemaName]?.properties?.externalUserId;
    assert.equal(externalUserId?.type, 'string', schemaName);
  }

  const listParameters =
    contract.paths?.['/api/v1/admin/projects/{projectId}/end-users']?.get?.parameters ?? [];
  const externalUserIdFilter = listParameters.find(
    (parameter) => parameter.name === 'externalUserId',
  );
  assert.equal(externalUserIdFilter?.schema?.minLength, 1);
  assert.equal(externalUserIdFilter?.schema?.maxLength, 200);
});

test('pins CMS field visibility as an explicit base or restricted policy', () => {
  const cmsRead = contract.components.schemas.AttributeConsumerPoliciesDto.properties.cmsRead;
  const serialized = JSON.stringify(cmsRead);
  assert.match(serialized, /HIDDEN/);
  assert.match(serialized, /VISIBLE/);
  assert.match(serialized, /BASE/);
  assert.match(serialized, /RESTRICTED/);
});
