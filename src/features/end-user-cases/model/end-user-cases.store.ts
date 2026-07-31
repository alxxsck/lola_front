import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  AssignEndUserCaseDto,
  ClassifyEndUserCaseDto,
  LinkEndUserCaseMessageDto,
  UnlinkEndUserCaseMessageDto,
} from "@/shared/api/generated/models";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";
import {
  endUserCasesRepository,
  type EndUserCaseDetailBundle,
} from "../api/end-user-cases-repository";
import {
  defaultEndUserCaseFilters,
  endUserCaseStatusesForPreset,
  isEndUserCaseRealtimeEvent,
  type EndUserCase,
  type EndUserCaseFilters,
  type EndUserCaseRealtimeEvent,
  type EndUserCaseStatus,
  type EndUserCaseSummary,
} from "./end-user-case";
import { activeEndUserCaseEscalation } from "./end-user-case-escalation";

type Unsubscribe = () => void;

export const useEndUserCasesStore = defineStore("end-user-cases", () => {
  const projectId = ref<string | null>(null);
  const itemsById = ref(new Map<string, EndUserCase>());
  const orderedIds = ref<string[]>([]);
  const selectedId = ref<string | null>(null);
  const selected = ref<EndUserCaseDetailBundle | null>(null);
  const summary = ref<EndUserCaseSummary | null>(null);
  const filters = ref<EndUserCaseFilters>(defaultEndUserCaseFilters());
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const detailLoading = ref(false);
  const messagesLoading = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const realtimeState = ref<CmsRealtimeState>("DISCONNECTED");
  const lastAppliedSequence = ref(0n);
  let listRequest = 0;
  let detailRequest = 0;
  let messagesRequest = 0;
  let detailIncludesProposals = true;
  let reconciliation: Promise<void> | null = null;
  let reconciliationRequested = false;
  let reconciliationGeneration = 0;
  let unsubscribers: Unsubscribe[] = [];

  const items = computed(() =>
    orderedIds.value.flatMap((id) => {
      const value = itemsById.value.get(id);
      return value ? [value] : [];
    }),
  );

  async function activateProject(nextProjectId: string): Promise<void> {
    if (projectId.value === nextProjectId && summary.value) return;
    releaseRealtime();
    clearState();
    projectId.value = nextProjectId;
    const generation = reconciliationGeneration;
    unsubscribers = [
      cmsRealtimeClient.subscribe(
        [
          "end_user_case.created",
          "end_user_case.updated",
          "end_user_case.summary",
        ],
        (value) => handleRealtimeValue(value, nextProjectId, generation),
      ),
      cmsRealtimeClient.onState((value) => {
        if (isCurrentRealtimeScope(nextProjectId, generation))
          realtimeState.value = value;
      }),
      cmsRealtimeClient.reconcile(() =>
        isCurrentRealtimeScope(nextProjectId, generation)
          ? reconcile()
          : Promise.resolve(),
      ),
    ];
    await Promise.all([
      loadPage({ replace: true }),
      refreshSummary(),
      cmsRealtimeClient.activateProject(nextProjectId),
    ]);
  }

  function deactivate(): void {
    releaseRealtime();
    projectId.value = null;
    realtimeState.value = "DISCONNECTED";
    clearState();
  }

  async function loadPage({
    replace = false,
  }: { replace?: boolean } = {}): Promise<void> {
    const activeProjectId = projectId.value;
    if (!activeProjectId || (!replace && !nextCursor.value)) return;
    const request = ++listRequest;
    if (replace) loading.value = true;
    else loadingMore.value = true;
    error.value = null;
    try {
      const page = await endUserCasesRepository.list(
        activeProjectId,
        filters.value,
        replace ? undefined : (nextCursor.value ?? undefined),
      );
      if (request !== listRequest || projectId.value !== activeProjectId)
        return;
      const nextItems = replace
        ? new Map<string, EndUserCase>()
        : new Map(itemsById.value);
      const nextOrder = replace ? [] : [...orderedIds.value];
      for (const value of page.items) {
        nextItems.set(value.id, value);
        if (!nextOrder.includes(value.id)) nextOrder.push(value.id);
      }
      itemsById.value = nextItems;
      orderedIds.value = nextOrder;
      nextCursor.value = page.nextCursor ?? null;
    } catch (cause) {
      if (request === listRequest) error.value = caseErrorMessage(cause);
    } finally {
      if (request === listRequest) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function refreshSummary(): Promise<void> {
    const activeProjectId = projectId.value;
    if (!activeProjectId) return;
    try {
      const value = await endUserCasesRepository.summary(activeProjectId);
      if (projectId.value === activeProjectId) applySummary(value);
    } catch {
      // The durable inbox remains usable while analytics are unavailable.
    }
  }

  async function open(id: string, includeProposals?: boolean): Promise<void> {
    const activeProjectId = projectId.value;
    if (!activeProjectId) return;
    if (includeProposals !== undefined)
      detailIncludesProposals = includeProposals;
    const request = ++detailRequest;
    messagesRequest += 1;
    selectedId.value = id;
    detailLoading.value = true;
    detailError.value = null;
    try {
      const value = await endUserCasesRepository.detail(activeProjectId, id, {
        includeProposals: detailIncludesProposals,
      });
      if (
        request !== detailRequest ||
        projectId.value !== activeProjectId ||
        selectedId.value !== id
      )
        return;
      selected.value = value;
      itemsById.value = new Map(itemsById.value).set(id, value.case);
    } catch (cause) {
      if (request === detailRequest)
        detailError.value = caseErrorMessage(cause);
    } finally {
      if (request === detailRequest) detailLoading.value = false;
    }
  }

  async function setProposalAccess(allowed: boolean): Promise<void> {
    detailIncludesProposals = allowed;
    detailRequest += 1;
    detailLoading.value = false;
    if (!allowed) {
      if (selected.value) {
        selected.value = {
          ...selected.value,
          proposals: { items: [] },
        };
      }
      return;
    }
    const id = selectedId.value;
    if (id) await open(id, true);
  }

  function close(): void {
    selectedId.value = null;
    selected.value = null;
    detailError.value = null;
    detailRequest += 1;
    messagesRequest += 1;
  }

  async function loadMoreMessages(): Promise<void> {
    const activeProjectId = projectId.value;
    const caseId = selectedId.value;
    const cursor = selected.value?.messages.nextCursor;
    if (!activeProjectId || !caseId || !cursor || messagesLoading.value) return;
    const request = ++messagesRequest;
    messagesLoading.value = true;
    detailError.value = null;
    try {
      const page = await endUserCasesRepository.messages(
        activeProjectId,
        caseId,
        cursor,
      );
      if (
        request !== messagesRequest ||
        projectId.value !== activeProjectId ||
        selectedId.value !== caseId ||
        !selected.value
      )
        return;
      const known = new Set(
        selected.value.messages.items.map((link) => link.message.id),
      );
      selected.value = {
        ...selected.value,
        messages: {
          items: [
            ...selected.value.messages.items,
            ...page.items.filter((link) => !known.has(link.message.id)),
          ],
          nextCursor: page.nextCursor,
        },
      };
    } catch (cause) {
      if (request === messagesRequest)
        detailError.value = caseErrorMessage(cause);
    } finally {
      if (request === messagesRequest) messagesLoading.value = false;
    }
  }

  async function transition(
    status: EndUserCaseStatus,
    reason: string,
  ): Promise<boolean> {
    const activeProjectId = projectId.value;
    const value = selected.value?.case;
    if (!activeProjectId || !value || !reason.trim()) return false;
    return mutate(async () => {
      await endUserCasesRepository.workflow(activeProjectId, value.id, {
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
        status,
        reason: reason.trim(),
      });
    });
  }

  async function assign(
    assignedCmsUserId: string | null,
    reason: string,
  ): Promise<boolean> {
    const value = selected.value?.case;
    if (!value) return false;
    return versionedMutation((project, caseId) =>
      endUserCasesRepository.assign(project, caseId, {
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
        assignedCmsUserId,
        reason: reason.trim(),
      } satisfies AssignEndUserCaseDto),
    );
  }

  async function requestEscalation(
    reasonCode: string,
    summary: string,
  ): Promise<boolean> {
    const value = selected.value?.case;
    if (!value || !reasonCode.trim() || !summary.trim()) return false;
    return versionedMutation((project, caseId) =>
      endUserCasesRepository.requestEscalation(
        project,
        caseId,
        {
          expectedCaseVersion: value.version,
          reasonCode: reasonCode.trim(),
          summary: summary.trim(),
        },
        crypto.randomUUID(),
      ),
    );
  }

  async function claimEscalation(reason: string): Promise<boolean> {
    return mutateActiveEscalation(
      reason,
      (project, caseId, caseVersion, escalation, key) =>
        endUserCasesRepository.claimEscalation(
          project,
          caseId,
          escalation.id,
          {
            expectedCaseVersion: caseVersion,
            expectedEscalationVersion: escalation.version,
            reason: reason.trim(),
          },
          key,
        ),
    );
  }

  async function releaseEscalation(reason: string): Promise<boolean> {
    return mutateActiveEscalation(
      reason,
      (project, caseId, caseVersion, escalation, key) =>
        endUserCasesRepository.releaseEscalation(
          project,
          caseId,
          escalation.id,
          {
            expectedCaseVersion: caseVersion,
            expectedEscalationVersion: escalation.version,
            reason: reason.trim(),
          },
          key,
        ),
    );
  }

  async function transferEscalation(
    cmsUserId: string,
    reason: string,
  ): Promise<boolean> {
    if (!cmsUserId.trim()) return false;
    return mutateActiveEscalation(
      reason,
      (project, caseId, caseVersion, escalation, key) =>
        endUserCasesRepository.transferEscalation(
          project,
          caseId,
          escalation.id,
          {
            expectedCaseVersion: caseVersion,
            expectedEscalationVersion: escalation.version,
            cmsUserId: cmsUserId.trim(),
            reason: reason.trim(),
          },
          key,
        ),
    );
  }

  async function closeEscalation(
    nextCaseStatus:
      | "OPEN"
      | "WAITING_END_USER"
      | "WAITING_SYSTEM"
      | "RESOLVED"
      | "UNRESOLVED",
    reason: string,
  ): Promise<boolean> {
    return mutateActiveEscalation(
      reason,
      (project, caseId, caseVersion, escalation, key) =>
        endUserCasesRepository.closeEscalation(
          project,
          caseId,
          escalation.id,
          {
            expectedCaseVersion: caseVersion,
            expectedEscalationVersion: escalation.version,
            nextCaseStatus,
            reason: reason.trim(),
          },
          key,
        ),
    );
  }

  async function cancelEscalation(
    nextCaseStatus: "OPEN" | "WAITING_END_USER" | "WAITING_SYSTEM",
    reason: string,
  ): Promise<boolean> {
    return mutateActiveEscalation(
      reason,
      (project, caseId, caseVersion, escalation, key) =>
        endUserCasesRepository.cancelEscalation(
          project,
          caseId,
          escalation.id,
          {
            expectedCaseVersion: caseVersion,
            expectedEscalationVersion: escalation.version,
            nextCaseStatus,
            reason: reason.trim(),
          },
          key,
        ),
    );
  }

  async function mutateActiveEscalation(
    reason: string,
    execute: (
      projectId: string,
      caseId: string,
      caseVersion: number,
      escalation: NonNullable<ReturnType<typeof activeEndUserCaseEscalation>>,
      idempotencyKey: string,
    ) => Promise<unknown>,
  ): Promise<boolean> {
    const caseVersion = selected.value?.case.version;
    const active = activeEndUserCaseEscalation(
      selected.value?.escalations.items ?? [],
    );
    if (!active || caseVersion === undefined || !reason.trim()) return false;
    return versionedMutation((project, caseId) =>
      execute(project, caseId, caseVersion, active, crypto.randomUUID()),
    );
  }

  async function classify(
    input: Omit<ClassifyEndUserCaseDto, "expectedVersion" | "idempotencyKey">,
  ): Promise<boolean> {
    const value = selected.value?.case;
    if (!value) return false;
    return versionedMutation((project, caseId) =>
      endUserCasesRepository.classify(project, caseId, {
        ...input,
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
  }

  async function linkMessage(
    input: Omit<
      LinkEndUserCaseMessageDto,
      "expectedVersion" | "idempotencyKey"
    >,
  ): Promise<boolean> {
    const value = selected.value?.case;
    if (!value) return false;
    return versionedMutation((project, caseId) =>
      endUserCasesRepository.linkMessage(project, caseId, {
        ...input,
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
      }),
    );
  }

  async function unlinkMessage(
    messageId: string,
    reason: string,
  ): Promise<boolean> {
    const value = selected.value?.case;
    if (!value) return false;
    return versionedMutation((project, caseId) =>
      endUserCasesRepository.unlinkMessage(project, caseId, messageId, {
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
        reason: reason.trim(),
      } satisfies UnlinkEndUserCaseMessageDto),
    );
  }

  async function merge(
    sources: Array<{ id: string; version: number }>,
    reason: string,
  ): Promise<boolean> {
    const activeProjectId = projectId.value;
    const value = selected.value?.case;
    if (!activeProjectId || !value || !sources.length || !reason.trim())
      return false;
    return mutate(() =>
      endUserCasesRepository.merge(activeProjectId, value.id, {
        expectedVersion: value.version,
        idempotencyKey: crypto.randomUUID(),
        sources: sources.map((source) => ({
          caseId: source.id,
          expectedVersion: source.version,
        })),
        reason: reason.trim(),
      }),
    );
  }

  async function split(
    messageIds: string[],
    title: string,
    reason: string,
    groupCode?: string,
    evidenceIds: string[] = [],
  ): Promise<string | null> {
    const activeProjectId = projectId.value;
    const value = selected.value?.case;
    if (
      !activeProjectId ||
      !value ||
      !messageIds.length ||
      !title.trim() ||
      !reason.trim()
    )
      return null;
    mutating.value = true;
    detailError.value = null;
    messagesLoading.value = false;
    try {
      const result = await endUserCasesRepository.split(
        activeProjectId,
        value.id,
        {
          expectedVersion: value.version,
          idempotencyKey: crypto.randomUUID(),
          messageIds,
          ...(evidenceIds.length ? { evidenceIds } : {}),
          title: title.trim(),
          ...(groupCode?.trim() ? { groupCode: groupCode.trim() } : {}),
          reason: reason.trim(),
        },
      );
      await Promise.all([loadPage({ replace: true }), refreshSummary()]);
      await open(result.newCaseId);
      return result.newCaseId;
    } catch (cause) {
      const mutationError = caseErrorMessage(cause);
      await open(value.id);
      detailError.value = mutationError;
      return null;
    } finally {
      mutating.value = false;
    }
  }

  async function versionedMutation(
    execute: (projectId: string, caseId: string) => Promise<unknown>,
  ): Promise<boolean> {
    const activeProjectId = projectId.value;
    const caseId = selectedId.value;
    if (!activeProjectId || !caseId) return false;
    return mutate(() => execute(activeProjectId, caseId));
  }

  async function mutate(execute: () => Promise<unknown>): Promise<boolean> {
    const id = selectedId.value;
    if (!id || mutating.value) return false;
    mutating.value = true;
    detailError.value = null;
    try {
      await execute();
      await Promise.all([
        open(id),
        loadPage({ replace: true }),
        refreshSummary(),
      ]);
      return true;
    } catch (cause) {
      const mutationError = caseErrorMessage(cause);
      await open(id);
      detailError.value = mutationError;
      return false;
    } finally {
      mutating.value = false;
    }
  }

  async function setFilters(value: EndUserCaseFilters): Promise<void> {
    filters.value = { ...value };
    nextCursor.value = null;
    await loadPage({ replace: true });
  }

  async function applyRealtimeEvent(
    event: EndUserCaseRealtimeEvent,
    expectedProjectId = projectId.value,
    expectedGeneration = reconciliationGeneration,
  ): Promise<void> {
    if (!isCurrentRealtimeScope(expectedProjectId, expectedGeneration)) return;
    const sequence = BigInt(event.projectSequence);
    const hasGap =
      sequence >
      (lastAppliedSequence.value === 0n ? 1n : lastAppliedSequence.value + 1n);
    if (event.type === "end_user_case.summary") {
      applySummary(event.data);
      if (hasGap) await reconcile();
    } else {
      const incoming = event.data.case;
      const current = itemsById.value.get(incoming.id);
      if (!current || incoming.version > current.version) {
        if (caseMatchesFilters(incoming, filters.value)) {
          itemsById.value = new Map(itemsById.value).set(incoming.id, incoming);
          if (!orderedIds.value.includes(incoming.id))
            orderedIds.value = [incoming.id, ...orderedIds.value];
        } else {
          itemsById.value = new Map(itemsById.value);
          itemsById.value.delete(incoming.id);
          orderedIds.value = orderedIds.value.filter(
            (id) => id !== incoming.id,
          );
        }
        if (selectedId.value === incoming.id) await open(incoming.id);
      }
      if (!isCurrentRealtimeScope(expectedProjectId, expectedGeneration))
        return;
      // The realtime DTO intentionally does not contain every relation used by
      // server filters (channels, capability outcomes and open Proposals).
      // Reconcile every Case event so a previously visible row cannot remain in
      // a filtered inbox after one of those relations changes.
      await reconcile();
    }
    if (!isCurrentRealtimeScope(expectedProjectId, expectedGeneration)) return;
    if (sequence > lastAppliedSequence.value)
      lastAppliedSequence.value = sequence;
  }

  async function handleRealtimeValue(
    value: unknown,
    expectedProjectId = projectId.value,
    expectedGeneration = reconciliationGeneration,
  ): Promise<void> {
    if (!isCurrentRealtimeScope(expectedProjectId, expectedGeneration)) return;
    if (!isEndUserCaseRealtimeEvent(value)) {
      await reconcile();
      return;
    }
    await applyRealtimeEvent(value, expectedProjectId, expectedGeneration);
  }

  function isCurrentRealtimeScope(
    expectedProjectId: string | null,
    expectedGeneration: number,
  ): boolean {
    return (
      expectedProjectId !== null &&
      projectId.value === expectedProjectId &&
      reconciliationGeneration === expectedGeneration
    );
  }

  async function reconcile(): Promise<void> {
    if (!projectId.value) return;
    if (reconciliation) {
      reconciliationRequested = true;
      return reconciliation;
    }
    const activeProjectId = projectId.value;
    const generation = reconciliationGeneration;
    const run = async () => {
      do {
        reconciliationRequested = false;
        await Promise.all([
          loadPage({ replace: true }),
          refreshSummary(),
          selectedId.value ? open(selectedId.value) : Promise.resolve(),
        ]);
      } while (
        reconciliationRequested &&
        projectId.value === activeProjectId &&
        reconciliationGeneration === generation
      );
    };
    const current = run().finally(() => {
      if (reconciliation === current) reconciliation = null;
    });
    reconciliation = current;
    return current;
  }

  function applySummary(value: EndUserCaseSummary): void {
    const current = summary.value
      ? BigInt(summary.value.lastProjectSequence)
      : -1n;
    const incoming = BigInt(value.lastProjectSequence);
    if (incoming < current) return;
    summary.value = value;
    if (incoming > lastAppliedSequence.value)
      lastAppliedSequence.value = incoming;
  }

  function clearState(): void {
    itemsById.value = new Map();
    orderedIds.value = [];
    selectedId.value = null;
    selected.value = null;
    summary.value = null;
    nextCursor.value = null;
    error.value = null;
    detailError.value = null;
    lastAppliedSequence.value = 0n;
    detailIncludesProposals = true;
    reconciliationGeneration += 1;
    reconciliation = null;
    reconciliationRequested = false;
    listRequest += 1;
    detailRequest += 1;
    messagesRequest += 1;
  }

  function releaseRealtime(): void {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
  }

  return {
    projectId,
    items,
    selectedId,
    selected,
    summary,
    filters,
    nextCursor,
    loading,
    loadingMore,
    detailLoading,
    messagesLoading,
    mutating,
    error,
    detailError,
    realtimeState,
    lastAppliedSequence,
    activateProject,
    deactivate,
    loadPage,
    refreshSummary,
    open,
    setProposalAccess,
    loadMoreMessages,
    close,
    transition,
    assign,
    requestEscalation,
    claimEscalation,
    releaseEscalation,
    transferEscalation,
    closeEscalation,
    cancelEscalation,
    classify,
    linkMessage,
    unlinkMessage,
    merge,
    split,
    setFilters,
    applyRealtimeEvent,
    reconcile,
  };
});

function caseMatchesFilters(
  value: EndUserCase,
  filters: EndUserCaseFilters,
): boolean {
  const statuses = endUserCaseStatusesForPreset(filters.preset);
  if (statuses && !statuses.includes(value.status)) return false;
  if (filters.priority?.length && !filters.priority.includes(value.priority))
    return false;
  if (filters.groupCode && value.groupCode !== filters.groupCode) return false;
  if (filters.assignment === "ASSIGNED" && !value.assignee) return false;
  if (filters.assignment === "UNASSIGNED" && value.assignee) return false;
  if (filters.preset === "ATTENTION")
    return (
      value.priority === "CRITICAL" ||
      Boolean(value.staleAt) ||
      value.status === "WAITING_ADMIN" ||
      value.proposalCount > 0
    );
  return true;
}

function caseErrorMessage(cause: unknown): string {
  if (cause && typeof cause === "object" && "response" in cause) {
    const response = (cause as { response?: { data?: { message?: unknown } } })
      .response;
    if (typeof response?.data?.message === "string")
      return response.data.message;
  }
  return cause instanceof Error
    ? cause.message
    : "Не удалось обновить обращение";
}
