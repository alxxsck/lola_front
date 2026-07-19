import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { aiProposalsRepository } from "../api/ai-proposals-repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import type { CmsRealtimeState } from "@/shared/realtime/cms-realtime-contract";
import {
  defaultAIProposalFilters,
  isTerminalProposal,
  type AIProposalDetail,
  type AIProposalFilters,
  type AIProposalListItem,
  type AIProposalSummary,
} from "./ai-proposal";
import {
  isAIProposalRealtimeEvent,
  type AIProposalRealtimeEvent,
} from "./ai-proposal-events";
import {
  aiProposalErrorKind,
  aiProposalErrorMessage,
} from "./ai-proposal-error";

export const useAIProposalsStore = defineStore("ai-proposals", () => {
  const projectId = ref<string | null>(null);
  const itemsById = ref(new Map<string, AIProposalListItem>());
  const detailsById = ref(new Map<string, AIProposalDetail>());
  const orderedIds = ref<string[]>([]);
  const selectedId = ref<string | null>(null);
  const summary = ref<AIProposalSummary | null>(null);
  const filters = ref<AIProposalFilters>(defaultAIProposalFilters());
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const loadingMore = ref(false);
  const detailLoading = ref(false);
  const deciding = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const realtimeState = ref<CmsRealtimeState>("DISCONNECTED");
  const lastAppliedSequence = ref(0n);
  const seenEventIds = new Set<string>();
  let listRequestSequence = 0;
  let detailRequestSequence = 0;
  let reconciliation: Promise<void> | null = null;

  const items = computed(() =>
    orderedIds.value.flatMap((id) => {
      const item = itemsById.value.get(id);
      return item ? [item] : [];
    }),
  );
  const selectedDetail = computed(() =>
    selectedId.value ? (detailsById.value.get(selectedId.value) ?? null) : null,
  );
  const unreadCount = computed(() => summary.value?.unreadCount ?? 0);

  function applySummary(value: AIProposalSummary): void {
    const sequence = BigInt(value.lastSequence);
    const currentSequence = summary.value
      ? BigInt(summary.value.lastSequence)
      : -1n;
    if (sequence < currentSequence) return;
    summary.value = value;
    if (sequence > lastAppliedSequence.value)
      lastAppliedSequence.value = sequence;
  }

  function clearProjectState(): void {
    itemsById.value = new Map();
    detailsById.value = new Map();
    orderedIds.value = [];
    selectedId.value = null;
    summary.value = null;
    nextCursor.value = null;
    error.value = null;
    detailError.value = null;
    loading.value = false;
    loadingMore.value = false;
    detailLoading.value = false;
    deciding.value = false;
    lastAppliedSequence.value = 0n;
    seenEventIds.clear();
    listRequestSequence += 1;
    detailRequestSequence += 1;
  }

  async function activateProject(nextProjectId: string): Promise<void> {
    if (projectId.value === nextProjectId && summary.value) return;
    cmsRealtimeClient.disconnect();
    clearProjectState();
    projectId.value = nextProjectId;
    await Promise.all([loadPage({ replace: true }), refreshSummary()]);
    if (projectId.value !== nextProjectId) return;
    await cmsRealtimeClient.connect(nextProjectId, {
      subscriptions: Object.fromEntries(
        [
          "ai_proposal.created",
          "ai_proposal.updated",
          "ai_proposal.summary",
        ].map((eventName) => [eventName, handleRealtimeValue]),
      ),
      acknowledgement: {
        socketEvent: "ai_proposal.received",
        rest: (activeProjectId, eventId) =>
          aiProposalsRepository.acknowledge(activeProjectId, eventId),
      },
      onConnect: reconcile,
      onStateChange: (state) => {
        realtimeState.value = state;
      },
    });
  }

  function deactivate(): void {
    cmsRealtimeClient.disconnect();
    projectId.value = null;
    realtimeState.value = "DISCONNECTED";
    clearProjectState();
  }

  async function loadPage({
    replace = false,
  }: { replace?: boolean } = {}): Promise<void> {
    const activeProjectId = projectId.value;
    if (!activeProjectId || (!replace && !nextCursor.value)) return;
    const request = ++listRequestSequence;
    if (replace) loading.value = true;
    else loadingMore.value = true;
    error.value = null;
    try {
      const page = await aiProposalsRepository.list(
        activeProjectId,
        filters.value,
        replace ? undefined : (nextCursor.value ?? undefined),
      );
      if (
        request !== listRequestSequence ||
        projectId.value !== activeProjectId
      )
        return;
      const nextItems = replace
        ? new Map<string, AIProposalListItem>()
        : new Map(itemsById.value);
      const nextOrder = replace ? [] : [...orderedIds.value];
      for (const item of page.items) {
        nextItems.set(item.id, item);
        if (!nextOrder.includes(item.id)) nextOrder.push(item.id);
      }
      itemsById.value = nextItems;
      orderedIds.value = nextOrder;
      nextCursor.value = page.nextCursor;
      applySummary(page.summary);
    } catch (cause) {
      if (request === listRequestSequence) {
        const message = aiProposalErrorMessage(cause);
        if (aiProposalErrorKind(cause) === "FORBIDDEN") {
          deactivate();
          error.value = message;
        } else error.value = message;
      }
    } finally {
      if (request === listRequestSequence) {
        loading.value = false;
        loadingMore.value = false;
      }
    }
  }

  async function refreshSummary(): Promise<void> {
    const activeProjectId = projectId.value;
    if (!activeProjectId) return;
    try {
      const value = await aiProposalsRepository.summary(activeProjectId);
      if (projectId.value === activeProjectId) applySummary(value);
    } catch {
      // The durable list remains usable while the badge snapshot is unavailable.
    }
  }

  async function loadDetail(id: string): Promise<AIProposalDetail | null> {
    const activeProjectId = projectId.value;
    if (!activeProjectId) return null;
    const request = ++detailRequestSequence;
    detailLoading.value = true;
    detailError.value = null;
    try {
      const detail = await aiProposalsRepository.detail(activeProjectId, id);
      if (
        request !== detailRequestSequence ||
        projectId.value !== activeProjectId ||
        selectedId.value !== id
      )
        return null;
      detailsById.value = new Map(detailsById.value).set(id, detail);
      itemsById.value = new Map(itemsById.value).set(id, detail);
      return detail;
    } catch (cause) {
      if (request === detailRequestSequence)
        detailError.value = aiProposalErrorMessage(cause);
      return null;
    } finally {
      if (request === detailRequestSequence) detailLoading.value = false;
    }
  }

  async function open(id: string): Promise<void> {
    selectedId.value = id;
    await loadDetail(id);
  }

  async function markSelectedRead(): Promise<void> {
    const id = selectedId.value;
    const detail = selectedDetail.value;
    if (!id || !detail || detail.isRead || !projectId.value) return;
    const activeProjectId = projectId.value;
    try {
      const result = await aiProposalsRepository.markRead(activeProjectId, id);
      if (selectedId.value !== id || projectId.value !== activeProjectId)
        return;
      detailsById.value = new Map(detailsById.value).set(id, result.proposal);
      itemsById.value = new Map(itemsById.value).set(id, result.proposal);
      applySummary(result.summary);
    } catch {
      // Read is idempotent and non-blocking; the next reconciliation restores truth.
      await refreshSummary();
    }
  }

  function close(): void {
    selectedId.value = null;
    detailError.value = null;
    detailRequestSequence += 1;
  }

  async function resolveProposal(
    id: string,
    expectedVersion: number,
    reason?: string,
  ): Promise<boolean> {
    const activeProjectId = projectId.value;
    if (!activeProjectId) return false;
    deciding.value = true;
    detailError.value = null;
    try {
      const detail = await aiProposalsRepository.decide(activeProjectId, id, {
        action: "RESOLVE",
        expectedVersion,
        ...(reason?.trim() ? { reason: reason.trim() } : {}),
      });
      detailsById.value = new Map(detailsById.value).set(id, detail);
      itemsById.value = new Map(itemsById.value).set(id, detail);
      if (
        filters.value.preset !== "COMPLETED" &&
        isTerminalProposal(detail.workflowStatus)
      )
        orderedIds.value = orderedIds.value.filter((itemId) => itemId !== id);
      await refreshSummary();
      return true;
    } catch (cause) {
      detailError.value = aiProposalErrorMessage(cause);
      if (aiProposalErrorKind(cause) === "CONFLICT") await loadDetail(id);
      return false;
    } finally {
      deciding.value = false;
    }
  }

  async function setFilters(value: AIProposalFilters): Promise<void> {
    filters.value = { ...value };
    nextCursor.value = null;
    await loadPage({ replace: true });
  }

  async function applyRealtimeEvent(
    event: AIProposalRealtimeEvent,
  ): Promise<void> {
    const dedupeKey = `${event.type}:${event.eventId}`;
    if (seenEventIds.has(dedupeKey)) return;
    seenEventIds.add(dedupeKey);
    if (seenEventIds.size > 1_000)
      seenEventIds.delete(seenEventIds.values().next().value!);

    const sequence = BigInt(event.projectSequence);
    const hasGap =
      lastAppliedSequence.value > 0n &&
      sequence > lastAppliedSequence.value + 1n;
    if (event.type === "ai_proposal.summary") {
      applySummary(event.data);
    } else {
      const incoming = event.data.proposal;
      const current = itemsById.value.get(incoming.id);
      if (current && incoming.version > current.version) {
        const updated = { ...current, ...incoming } as AIProposalListItem;
        itemsById.value = new Map(itemsById.value).set(updated.id, updated);
        const detail = detailsById.value.get(updated.id);
        if (detail)
          detailsById.value = new Map(detailsById.value).set(updated.id, {
            ...detail,
            ...incoming,
          });
        if (
          filters.value.preset !== "COMPLETED" &&
          isTerminalProposal(updated.workflowStatus)
        )
          orderedIds.value = orderedIds.value.filter((id) => id !== updated.id);
      }
      if (sequence > lastAppliedSequence.value)
        lastAppliedSequence.value = sequence;
    }
    if (
      hasGap ||
      (event.type !== "ai_proposal.summary" &&
        !itemsById.value.has(event.data.proposal.id))
    )
      await reconcile();
  }

  async function handleRealtimeValue(value: unknown): Promise<string | null> {
    if (!isAIProposalRealtimeEvent(value) || value.contractVersion !== 1) {
      await reconcile();
      return null;
    }
    await applyRealtimeEvent(value);
    return value.eventId;
  }

  async function reconcile(): Promise<void> {
    if (!projectId.value) return;
    if (!reconciliation) {
      reconciliation = Promise.all([
        loadPage({ replace: true }),
        refreshSummary(),
      ])
        .then(() => undefined)
        .finally(() => {
          reconciliation = null;
        });
    }
    return reconciliation;
  }

  return {
    projectId,
    itemsById,
    orderedIds,
    selectedId,
    summary,
    filters,
    nextCursor,
    loading,
    loadingMore,
    detailLoading,
    deciding,
    error,
    detailError,
    realtimeState,
    lastAppliedSequence,
    items,
    selectedDetail,
    unreadCount,
    activateProject,
    deactivate,
    loadPage,
    loadDetail,
    refreshSummary,
    open,
    markSelectedRead,
    close,
    resolveProposal,
    setFilters,
    applyRealtimeEvent,
    reconcile,
  };
});
