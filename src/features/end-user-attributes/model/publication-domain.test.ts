import { describe, expect, it } from "vitest";
import type { AttributePublicationChangesResponseDto } from "@/shared/api/generated/models";
import {
  actorLabel,
  publicationChangeLabels,
  publicationImpact,
} from "./publication-domain";

function changes(
  value: Partial<AttributePublicationChangesResponseDto>,
): AttributePublicationChangesResponseDto {
  return {
    contractChanged: false,
    contractCompatibility: "UNCHANGED",
    lifecycleChanged: false,
    metadataChanged: false,
    policyChanged: false,
    ...value,
  };
}

describe("Attribute Publication presentation", () => {
  it("explains that a policy-only publication does not change product integration", () => {
    expect(publicationImpact(changes({ policyChanged: true }))).toEqual({
      contractChanged: false,
      severity: "success",
      title: "Интеграция продукта не изменится",
      description:
        "Настройки Lola применятся после публикации. Версия контракта и сохранённые профили останутся прежними.",
    });
  });

  it("separates a backward-compatible contract revision from a breaking one", () => {
    expect(
      publicationImpact(
        changes({
          contractChanged: true,
          contractCompatibility: "BACKWARD_COMPATIBLE",
        }),
      ),
    ).toMatchObject({
      contractChanged: true,
      severity: "warn",
      title: "Появится новая версия контракта",
    });
    expect(
      publicationImpact(
        changes({
          contractChanged: true,
          contractCompatibility: "BREAKING",
        }),
      ),
    ).toMatchObject({
      contractChanged: true,
      severity: "error",
      title: "Интеграцию продукта нужно обновить",
    });
  });

  it("keeps unknown migrated change flags distinct from false", () => {
    expect(
      publicationChangeLabels(
        changes({
          lifecycleChanged: null,
          metadataChanged: null,
          policyChanged: null,
        }),
      ),
    ).toEqual(["Состав изменений неизвестен (миграция)"]);
  });

  it("uses immutable actor snapshots for system and break-glass publications", () => {
    expect(actorLabel("SYSTEM", "attribute-contract-migration")).toBe(
      "Система · attribute-contract-migration",
    );
    expect(actorLabel("BREAK_GLASS", "incident-42")).toBe(
      "Аварийный доступ · incident-42",
    );
  });
});
