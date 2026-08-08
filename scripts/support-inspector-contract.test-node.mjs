import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(
  await readFile(
    new URL("../openapi/retenive-backend.json", import.meta.url),
    "utf8",
  ),
);

const eventPath =
  "/api/v1/admin/projects/{projectId}/support/cases/{caseId}/events";

test("pins the permission-safe Support Inspector Events recipe", () => {
  const operation = contract.paths?.[eventPath]?.get;
  assert.ok(operation, "Support Inspector Events endpoint must be pinned");
  assert.deepEqual(operation["x-iam-all-permissions"], [
    { code: "project.cases.read", scope: "PROJECT" },
    { code: "project.support.inspector_events.read", scope: "PROJECT" },
  ]);
  const parameters = Object.fromEntries(
    operation.parameters.map((parameter) => [parameter.name, parameter]),
  );
  assert.equal(parameters.from.required, true);
  assert.equal(parameters.to.required, true);
  assert.equal(parameters.limit.schema.minimum, 1);
  assert.equal(parameters.limit.schema.maximum, 100);
  assert.ok(operation.responses["429"]);
  assert.ok(operation.responses["503"]);
});

test("does not republish product external identifiers in Inspector projections", () => {
  for (const schemaName of [
    "SupportWorkspaceEndUserResponseDto",
    "EndUserCaseEndUserResponseDto",
    "CmsProfileSummaryResponseDto",
    "ProfileProjectionResponseDto",
  ]) {
    const properties =
      contract.components.schemas[schemaName]?.properties ?? {};
    assert.equal("externalId" in properties, false, schemaName);
    assert.equal("externalUserId" in properties, false, schemaName);
  }
  const listParameters =
    contract.paths?.["/api/v1/admin/projects/{projectId}/end-user-profiles"]
      ?.get?.parameters ?? [];
  assert.equal(
    listParameters.some((parameter) => parameter.name === "externalUserId"),
    false,
  );
});

test("pins CMS field visibility as an explicit base or restricted policy", () => {
  const cmsRead =
    contract.components.schemas.AttributeConsumerPoliciesDto.properties.cmsRead;
  const serialized = JSON.stringify(cmsRead);
  assert.match(serialized, /HIDDEN/);
  assert.match(serialized, /VISIBLE/);
  assert.match(serialized, /BASE/);
  assert.match(serialized, /RESTRICTED/);
});
