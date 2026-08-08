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
  assignmentCandidates: "SupportCaseAssignmentCandidatesResponseDto",
  degradedQueue: "SupportQueueCasesPageResponseDto",
  ownOffers: "SupportRoutingOwnOfferCatalogDto",
  expiredOfferConflict: {
    operationId: "SupportRoutingOffer_accept",
    status: "409",
  },
  availabilityLeaseExpired: "SupportOperatorAvailabilityResponseDto",
  emptyWorkforce: "SupportWorkforceSettingsResponseDto",
} as const;

function normalizeNullableUnions(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeNullableUnions);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  if (source.nullable === true && Array.isArray(source.oneOf)) {
    const oneOf = source.oneOf;
    const rest = Object.fromEntries(
      Object.entries(source).filter(
        ([key]) =>
          ![
            "nullable",
            "oneOf",
            "discriminator",
            "additionalProperties",
          ].includes(key),
      ),
    );
    return {
      ...(normalizeNullableUnions(rest) as Record<string, unknown>),
      anyOf: [
        ...oneOf.map(normalizeNullableUnions),
        { type: "null" },
      ],
    };
  }
  return Object.fromEntries(
    Object.entries(source).map(([key, entry]) => [
      key,
      normalizeNullableUnions(entry),
    ]),
  );
}

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
    const normalizedComponents = normalizeNullableUnions(
      contract.components,
    );
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
        components: normalizedComponents,
        ...(normalizeNullableUnions(targetSchema) as object),
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
