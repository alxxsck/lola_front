import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function pinnedContract() {
  return JSON.parse(
    await readFile(
      path.join(repositoryRoot, "openapi/retenive-backend.json"),
      "utf8",
    ),
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

function assertMutationRejected(validate, baseline, mutate) {
  const contract = JSON.parse(JSON.stringify(baseline));
  mutate(contract);
  assert.throws(() => validate(contract));
}

test("Support content contracts retain separate authority, revisions and safe lifecycle", async () => {
  const { validateSupportContentLeadNotificationContract } =
    await import("./support-content-lead-notification-contract.mjs");
  const baseline = await pinnedContract();
  assert.doesNotThrow(() =>
    validateSupportContentLeadNotificationContract(baseline),
  );

  const mutations = [
    (contract) => {
      delete operation(contract, "SupportInternalNote_list")[
        "x-iam-permission"
      ];
    },
    (contract) => {
      operation(contract, "SupportInternalNote_revisions")[
        "x-iam-all-permissions"
      ] = [];
    },
    (contract) => {
      operation(contract, "SupportInternalNote_create").parameters.find(
        (parameter) => parameter.name === "Idempotency-Key",
      ).required = false;
    },
    (contract) => {
      operation(contract, "SupportInternalNote_correction").parameters.find(
        (parameter) => parameter.name === "If-Match",
      ).required = false;
    },
    (contract) => {
      const target = contract.components.schemas.SupportInternalNoteResponseDto;
      target.required = target.required.filter(
        (field) => field !== "hasUnavailableReferences",
      );
    },
    (contract) => {
      contract.components.schemas.SupportContentRolloutResponseDto.properties.enabledCapabilities.items.enum =
        contract.components.schemas.SupportContentRolloutResponseDto.properties.enabledCapabilities.items.enum.filter(
          (value) => value !== "INTERNAL_NOTES",
        );
    },
    (contract) => {
      delete operation(contract, "SupportMacro_catalog")["x-iam-permission"];
    },
    (contract) => {
      operation(contract, "SupportMacro_publish").parameters.find(
        (parameter) => parameter.name === "If-Match",
      ).required = false;
    },
    (contract) => {
      operation(contract, "SupportMacroReplyDraft_create")[
        "x-iam-all-permissions"
      ] = [];
    },
    (contract) => {
      const target =
        contract.components.schemas.SupportMacroReplyDraftResponseDto;
      target.required = target.required.filter(
        (field) => field !== "macroRevisionId",
      );
    },
    (contract) => {
      delete operation(contract, "SupportInternalKnowledge_search")[
        "x-iam-permission"
      ];
    },
    (contract) => {
      operation(contract, "SupportInternalKnowledge_search").parameters.find(
        (parameter) => parameter.name === "caseId",
      ).required = false;
    },
    (contract) => {
      const target =
        contract.components.schemas.SupportKnowledgeSearchItemResponseDto;
      target.required = target.required.filter(
        (field) => field !== "revisionId",
      );
    },
  ];

  for (const mutate of mutations) {
    assertMutationRejected(
      validateSupportContentLeadNotificationContract,
      baseline,
      mutate,
    );
  }
});

test("Lead Control contracts retain freshness, drill-down and audited command evidence", async () => {
  const { validateSupportContentLeadNotificationContract } =
    await import("./support-content-lead-notification-contract.mjs");
  const baseline = await pinnedContract();

  const mutations = [
    (contract) => {
      delete operation(contract, "SupportLead_summary")["x-iam-permission"];
    },
    (contract) => {
      contract.components.schemas.SupportLeadSummaryResponseDto.properties.freshnessState.enum =
        contract.components.schemas.SupportLeadSummaryResponseDto.properties.freshnessState.enum.filter(
          (value) => value !== "STALE",
        );
    },
    (contract) => {
      const target =
        contract.components.schemas.SupportLeadInvestigationDataDto;
      target.required = target.required.filter(
        (field) => field !== "actionTokens",
      );
    },
    (contract) => {
      const target = contract.components.schemas.SupportLeadCaseRiskItemDto;
      target.required = target.required.filter(
        (field) => field !== "deliveryVersion",
      );
    },
    (contract) => {
      delete operation(contract, "SupportLead_activity")["x-iam-permission"];
    },
    (contract) => {
      delete operation(contract, "SupportOperationalAlert_list")[
        "x-iam-permission"
      ];
    },
    (contract) => {
      operation(
        contract,
        "SupportOperationalAlertCommand_acknowledge",
      ).parameters.find(
        (parameter) => parameter.name === "Idempotency-Key",
      ).required = false;
    },
    (contract) => {
      operation(
        contract,
        "SupportOperationalAlertCommand_resolve",
      ).parameters.find((parameter) => parameter.name === "If-Match").required =
        false;
    },
    (contract) => {
      const conflict = operation(
        contract,
        "SupportOperationalAlertCommand_changeOwner",
      ).responses["409"].content["application/json"].schema.properties.error
        .properties.code;
      conflict.enum = conflict.enum.filter(
        (value) => value !== "SUPPORT_OPERATIONAL_ALERT_VERSION_CONFLICT",
      );
    },
    (contract) => {
      const target =
        contract.components.schemas.SupportOperationalAlertCommandReceiptDto;
      target.required = target.required.filter((field) => field !== "replayed");
    },
    (contract) => {
      contract.components.schemas.SupportOperationalAlertItemDto.properties.state.enum =
        contract.components.schemas.SupportOperationalAlertItemDto.properties.state.enum.filter(
          (value) => value !== "RESOLVED",
        );
    },
    (contract) => {
      contract.components.schemas.SupportOperationalAlertCommandReceiptDto.properties.state.enum =
        contract.components.schemas.SupportOperationalAlertCommandReceiptDto.properties.state.enum.filter(
          (value) => value !== "NEW",
        );
    },
    (contract) => {
      contract.components.schemas.SupportOperationalAlertMaterializationDto.properties.state.enum =
        contract.components.schemas.SupportOperationalAlertMaterializationDto.properties.state.enum.filter(
          (value) => value !== "DEGRADED",
        );
    },
  ];

  for (const mutate of mutations) {
    assertMutationRejected(
      validateSupportContentLeadNotificationContract,
      baseline,
      mutate,
    );
  }
});

test("retention and notification boundaries stay explicit and fail closed", async () => {
  const { validateSupportContentLeadNotificationContract } =
    await import("./support-content-lead-notification-contract.mjs");
  const baseline = await pinnedContract();

  const mutations = [
    (contract) => {
      delete operation(contract, "SupportContentGovernance_retention")[
        "x-iam-permission"
      ];
    },
    (contract) => {
      operation(
        contract,
        "SupportContentGovernance_replaceRetentionDraft",
      ).parameters.find((parameter) => parameter.name === "If-Match").required =
        false;
    },
    (contract) => {
      const target =
        contract.components.schemas.SupportContentLegalHoldResponseDto;
      target.required = target.required.filter(
        (field) => field !== "actionEtag",
      );
    },
    (contract) => {
      contract.paths[
        "/api/v1/admin/projects/{projectId}/support/notification-preferences"
      ] = {
        get: { operationId: "SupportNotificationPreferences_read" },
      };
    },
    (contract) => {
      contract.paths["/api/v1/auth/me/browser-push-subscriptions"] = {
        post: { operationId: "BrowserPushSubscription_register" },
      };
    },
    (contract) => {
      contract.paths[
        "/api/v1/auth/me/browser-push-notifications/{capability}"
      ] = {
        get: { operationId: "PersonalSupportNotificationDeepLink_resolve" },
      };
    },
  ];

  for (const mutate of mutations) {
    assertMutationRejected(
      validateSupportContentLeadNotificationContract,
      baseline,
      mutate,
    );
  }
});
