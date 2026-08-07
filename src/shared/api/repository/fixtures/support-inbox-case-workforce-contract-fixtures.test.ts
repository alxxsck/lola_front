import Ajv from "ajv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { supportInboxCaseWorkforceContractFixtures } from "./support-inbox-case-workforce-contract-fixtures";

const publishedFixtureSchemas = {
  emptyCasesInbox: "SupportWorkspaceCasesPageResponseDto",
  emptyConversationsInbox: "SupportWorkspaceConversationsPageResponseDto",
  caseWorkflowSuccess: "EndUserCaseCommandResponseDto",
  assignmentConflict: {
    operationId: "SupportCaseAssignment_assign",
    status: "409",
  },
  degradedQueue: "SupportQueueCasesPageResponseDto",
  ownOffers: "SupportRoutingOwnOfferCatalogDto",
  availabilityLeaseExpired: "SupportOperatorAvailabilityResponseDto",
  emptyWorkforce: "SupportWorkforceSettingsResponseDto",
} as const;

describe("support inbox, Case and workforce contract fixtures", () => {
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
        validate(supportInboxCaseWorkforceContractFixtures[fixtureName]),
        `${fixtureName}: ${ajv.errorsText(validate.errors)}`,
      ).toBe(true);
    }
  });

  it("keeps unavailable error, partial and recovery scenarios visibly unpublished", () => {
    expect(
      supportInboxCaseWorkforceContractFixtures.forbiddenInbox,
    ).toMatchObject({ publication: "NOT_PUBLISHED", status: 403 });
    expect(
      supportInboxCaseWorkforceContractFixtures.staleCaseWorkflow,
    ).toMatchObject({ publication: "NOT_PUBLISHED", status: 409 });
    expect(
      supportInboxCaseWorkforceContractFixtures.expiredOfferConflict,
    ).toMatchObject({ publication: "NOT_PUBLISHED", status: 409 });
    expect(
      supportInboxCaseWorkforceContractFixtures.partialBulkOutcome,
    ).toMatchObject({ publication: "NOT_PUBLISHED" });
    expect(
      supportInboxCaseWorkforceContractFixtures.unknownOutcome,
    ).toMatchObject({ lookupOperation: "NOT_PUBLISHED" });
  });

  it("keeps an additive enum fixture outside the closed generated union", () => {
    expect(
      supportInboxCaseWorkforceContractFixtures.unknownQueueFreshness.state,
    ).toBe("STALE");
  });
});
