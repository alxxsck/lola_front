import Ajv from "ajv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { supportContentLeadNotificationContractFixtures } from "./support-content-lead-notification-contract-fixtures";

const publishedFixtureSchemas = {
  tombstonedNote: "SupportInternalNoteResponseDto",
  purgedNote: "SupportInternalNoteResponseDto",
  macroReplyDraft: "SupportMacroReplyDraftResponseDto",
  emptyKnowledgeSearch: "SupportKnowledgeSearchPageResponseDto",
  partialContentPanel: "SupportContentPanelResponseDto",
  staleLeadSummary: "SupportLeadSummaryResponseDto",
  degradedAlerts: "SupportOperationalAlertListResponseDto",
  alertCommandReceipt: "SupportOperationalAlertCommandReceiptDto",
  deniedLeadControl: {
    operationId: "SupportLead_summary",
    status: "403",
  },
  alertCommandTimeout: {
    operationId: "SupportOperationalAlertCommand_acknowledge",
    status: "503",
  },
} as const;

describe("support content, Lead Control and notification contract fixtures", () => {
  it("validates every published fixture against the pinned OpenAPI schema", async () => {
    const contract = JSON.parse(
      await readFile(
        path.join(process.cwd(), "openapi/retenive-backend.json"),
        "utf8",
      ),
    ) as {
      components: { schemas: Record<string, unknown> };
      paths: Record<
        string,
        Record<
          string,
          {
            operationId?: string;
            responses?: Record<
              string,
              { content?: { "application/json"?: { schema?: object } } }
            >;
          }
        >
      >;
    };
    const ajv = new Ajv({ strict: false, validateFormats: false });

    for (const fixtureName of Object.keys(publishedFixtureSchemas) as Array<
      keyof typeof publishedFixtureSchemas
    >) {
      const schemaTarget = publishedFixtureSchemas[fixtureName];
      const inlineOperation =
        typeof schemaTarget === "string"
          ? undefined
          : Object.values(contract.paths)
              .flatMap((pathItem) => Object.values(pathItem))
              .find(
                (operation) =>
                  operation.operationId === schemaTarget.operationId,
              );
      const targetSchema =
        typeof schemaTarget === "string"
          ? { $ref: `#/components/schemas/${schemaTarget}` }
          : inlineOperation?.responses?.[schemaTarget.status]?.content?.[
              "application/json"
            ]?.schema;
      const validate = ajv.compile({
        components: contract.components,
        ...targetSchema,
      });
      expect(
        validate(supportContentLeadNotificationContractFixtures[fixtureName]),
        `${fixtureName}: ${ajv.errorsText(validate.errors)}`,
      ).toBe(true);
    }
  });

  it("keeps missing content errors, browser devices and recovery contracts visibly unpublished", () => {
    expect(
      supportContentLeadNotificationContractFixtures.deniedContent,
    ).toMatchObject({ publication: "NOT_PUBLISHED", status: 403 });
    expect(
      supportContentLeadNotificationContractFixtures.revokedBrowserSubscription,
    ).toMatchObject({ publication: "NOT_PUBLISHED", state: "REVOKED" });
    expect(
      supportContentLeadNotificationContractFixtures.partialLeadAction,
    ).toMatchObject({ publication: "NOT_PUBLISHED" });
    expect(
      supportContentLeadNotificationContractFixtures.unknownOutcomeLookup,
    ).toMatchObject({ publication: "NOT_PUBLISHED" });
  });

  it("keeps an additive alert projection state outside the closed generated union", () => {
    expect(
      supportContentLeadNotificationContractFixtures.unknownAlertState.state,
    ).toBe("STALE");
  });
});
