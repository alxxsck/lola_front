import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSupportExternalWorkContract } from "./support-external-work-contract.mjs";

const document = JSON.parse(
  await readFile(
    new URL("../openapi/retenive-backend.json", import.meta.url),
    "utf8",
  ),
);

test("pinned OpenAPI publishes the complete Ticket 31–32 External Work contract", () => {
  assert.doesNotThrow(() => validateSupportExternalWorkContract(document));
});

test("validator rejects a Case command contract without async 202", () => {
  const broken = JSON.parse(JSON.stringify(document));
  const operation = Object.values(broken.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .find(
      (candidate) => candidate.operationId === "SupportExternalCommand_submit",
    );
  delete operation.responses["202"];
  assert.throws(() => validateSupportExternalWorkContract(broken), /async 202/);
});

test("validator rejects an audited mutation without exact replay headers", () => {
  const broken = JSON.parse(JSON.stringify(document));
  const operation = Object.values(broken.paths)
    .flatMap((pathItem) => Object.values(pathItem))
    .find(
      (candidate) =>
        candidate.operationId === "SupportExternalConnection_disable",
    );
  delete operation.responses["200"].headers["X-Idempotent-Replay"];
  assert.throws(
    () => validateSupportExternalWorkContract(broken),
    /X-Idempotent-Replay/,
  );
});
