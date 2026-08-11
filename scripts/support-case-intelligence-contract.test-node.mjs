import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSupportCaseIntelligenceContract } from "./support-case-intelligence-contract.mjs";

const document = JSON.parse(
  await readFile(
    new URL("../openapi/retenive-backend.json", import.meta.url),
    "utf8",
  ),
);

function cloneDocument() {
  return JSON.parse(JSON.stringify(document));
}

test("pinned OpenAPI publishes the available Case Intelligence foundation", () => {
  assert.doesNotThrow(() => validateSupportCaseIntelligenceContract(document));
});

test("validator rejects an untyped Detection rule kind", () => {
  const broken = cloneDocument();
  delete broken.components.schemas.CaseIntelligenceDetectionRuleDto.properties
    .kind.enum;
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /must retain EXACT/,
  );
});

test("validator rejects publication without fresh strong authentication", () => {
  const broken = cloneDocument();
  const publish = Object.values(broken.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .find(
      (operation) =>
        operation.operationId === "CaseIntelligence_publishDetection",
    );
  delete publish["x-iam-fresh-strong-authentication"];
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /fresh strong authentication/,
  );
});

test("validator rejects the old compiler bounds and topic shape", () => {
  const broken = cloneDocument();
  broken.components.schemas.CaseIntelligenceRouterContextDto.properties.maxSignals.maximum =
    20;
  delete broken.components.schemas.CaseIntelligenceTopicDto.properties.label;
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /must publish label|maxSignals/,
  );
});

test("validator rejects untyped preview errors", () => {
  const broken = cloneDocument();
  const validate = Object.values(broken.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .find(
      (operation) =>
        operation.operationId === "CaseIntelligence_validateDetection",
    );
  delete validate.responses[503].content["application/json"].schema.properties
    .error.properties.code.enum;
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /validateDetection 503 must publish a typed error code/,
  );
});

test("validator rejects an incomplete Human Escalation simulator contract", () => {
  const broken = cloneDocument();
  broken.components.schemas.CaseIntelligenceEscalationSimulationStepDto.properties.kind.enum = [
    "EXPLICIT_HUMAN_REQUEST",
  ];
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /must retain AMBIGUOUS_HUMAN_TERM/,
  );
});

test("validator rejects mutable or incomplete Project Safety projection", () => {
  const broken = cloneDocument();
  delete broken.components.schemas.CaseIntelligenceProjectSafetyPolicyResponseDto.properties.projectOverrideAllowed;
  assert.throws(
    () => validateSupportCaseIntelligenceContract(broken),
    /must publish projectOverrideAllowed/,
  );
});
