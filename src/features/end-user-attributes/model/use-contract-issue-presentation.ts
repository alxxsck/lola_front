import {
  computed,
  toValue,
  type MaybeRefOrGetter,
} from "vue";
import type { AttributeContractDraftFieldDto } from "@/shared/api/generated/models";
import {
  presentContractIssues,
  type ContractIssueInput,
} from "./contract-issue-presentation";

export function useContractIssuePresentation(
  issues: MaybeRefOrGetter<ContractIssueInput[]>,
  fields: MaybeRefOrGetter<AttributeContractDraftFieldDto[]>,
) {
  const presentedIssues = computed(() =>
    presentContractIssues(toValue(issues), toValue(fields)),
  );
  const errors = computed(() =>
    presentedIssues.value.filter((issue) => issue.severity === "error"),
  );
  const warnings = computed(() =>
    presentedIssues.value.filter((issue) => issue.severity === "warning"),
  );

  return { errors, warnings };
}
