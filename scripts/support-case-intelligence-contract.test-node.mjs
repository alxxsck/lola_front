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
