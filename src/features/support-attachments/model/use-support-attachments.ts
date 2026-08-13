import { computed, ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportAttachmentScope,
  SupportAttachmentServerState,
  SupportAttachmentStatus,
  SupportAttachmentsSource,
} from '../api/support-attachments-source';

export interface SupportAttachmentCapabilities {
  state: 'AVAILABLE' | 'UNAVAILABLE';
  upload: boolean;
  download: boolean;
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  contentTypes: string[];
}

export interface SupportAttachmentItem extends Omit<SupportAttachmentStatus, 'state'> {
  localId: string;
  state: SupportAttachmentServerState | 'QUEUED';
  canRetry: boolean;
}

interface SupportAttachmentsContext {
  scope(): SupportAttachmentScope | null;
  capabilities(): SupportAttachmentCapabilities;
  sha256?(file: File): Promise<string>;
  pollDelayMs?: number;
  onForbidden?(status: 403 | 404): void | Promise<void>;
}

const terminal = new Set<SupportAttachmentItem['state']>([
  'READY',
  'REJECTED',
  'FAILED',
  'EXPIRED',
  'REVOKED',
]);
const quotaStates = new Set<SupportAttachmentItem['state']>([
  'QUEUED',
  'UPLOADING',
  'SCANNING',
  'READY',
]);

function scopeKey(scope: SupportAttachmentScope): string {
  return scope.visibility === 'PUBLIC_REPLY'
    ? `${scope.projectId}:${scope.actorId}:${scope.conversationId}:PUBLIC_REPLY`
    : `${scope.projectId}:${scope.actorId}:${scope.caseId}:INTERNAL_NOTE`;
}

function storageKey(scope: SupportAttachmentScope): string {
  return `support-attachment-draft:v1:${scopeKey(scope)}`;
}

function authorityKey(scope: SupportAttachmentScope): string {
  return `${scope.projectId}:${scope.actorId}`;
}

function uploadScopeKey(scope: SupportAttachmentScope, draftKey: string): string {
  return `${scopeKey(scope)}:${draftKey}`;
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

async function sha256(file: File): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

function restored(item: SupportAttachmentStatus): SupportAttachmentItem {
  return { ...item, localId: item.id, canRetry: false };
}

export function createSupportAttachmentsController(
  source: SupportAttachmentsSource,
  context: SupportAttachmentsContext,
) {
  const items = ref<SupportAttachmentItem[]>([]);
  const draftKey = ref('');
  const loading = ref(false);
  const error = ref('');
  let generation = 0;
  let abort: AbortController | null = null;
  let pollTimer: number | null = null;
  let selectedScopeKey = '';
  let selectedAuthorityKey = '';
  const localFiles = new Map<string, File>();
  const uploadAborts = new Map<string, AbortController>();
  const cancelledUploads = new Set<string>();
  const activeUploads = new Set<string>();
  const activeUploadScopes = new Map<string, string>();

  const readyIds = computed(() =>
    items.value.filter((item) => item.state === 'READY' && item.canAttach).map((item) => item.id),
  );
  const busy = computed(() =>
    items.value.some(
      (item) => item.state === 'QUEUED' || item.state === 'UPLOADING' || item.state === 'SCANNING',
    ),
  );
  const canSend = computed(() => readyIds.value.length > 0 && !busy.value);
  const totalBytes = computed(() =>
    items.value.reduce(
      (total, item) => total + (quotaStates.has(item.state) ? item.sizeBytes : 0),
      0,
    ),
  );

  function abortUploads(targetScope?: string): void {
    activeUploads.forEach((localId) => {
      if (targetScope && activeUploadScopes.get(localId) !== targetScope) return;
      cancelledUploads.add(localId);
      uploadAborts.get(localId)?.abort();
      uploadAborts.delete(localId);
    });
  }

  function clearTimer(): void {
    if (pollTimer !== null) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function replace(next: SupportAttachmentStatus): void {
    const index = items.value.findIndex((item) => item.id === next.id || item.localId === next.id);
    const value = restored(next);
    if (index < 0) items.value = [...items.value, value];
    else items.value = items.value.map((item, itemIndex) => (itemIndex === index ? value : item));
  }

  function schedulePoll(requestGeneration: number): void {
    clearTimer();
    if (!items.value.some((item) => item.state === 'SCANNING' || item.state === 'UPLOADING'))
      return;
    pollTimer = window.setTimeout(() => void poll(requestGeneration), context.pollDelayMs ?? 1_500);
  }

  async function poll(requestGeneration = generation): Promise<void> {
    const scope = context.scope();
    if (!scope || requestGeneration !== generation || scopeKey(scope) !== selectedScopeKey) return;
    const pending = items.value.filter(
      (item) => !terminal.has(item.state) && item.state !== 'QUEUED',
    );
    await Promise.all(
      pending.map(async (item) => {
        try {
          const next = await source.status(scope, item.id, abort?.signal);
          if (requestGeneration === generation && scopeKey(scope) === selectedScopeKey)
            replace(next);
        } catch (cause) {
          if (
            requestGeneration === generation &&
            cause instanceof ApiError &&
            (cause.status === 403 || cause.status === 404)
          ) {
            purge();
            await context.onForbidden?.(cause.status as 403 | 404);
          }
          // A transient status read keeps the recoverable server draft intact.
        }
      }),
    );
    if (requestGeneration === generation) schedulePoll(requestGeneration);
  }

  function ensureDraft(scope: SupportAttachmentScope): string {
    const key = storageKey(scope);
    const stored = sessionStorage.getItem(key);
    if (stored) return stored;
    const next = uuid();
    sessionStorage.setItem(key, next);
    return next;
  }

  async function select(): Promise<void> {
    const scope = context.scope();
    const capability = context.capabilities();
    const requestGeneration = ++generation;
    abort?.abort();
    if (!scope || (selectedAuthorityKey && authorityKey(scope) !== selectedAuthorityKey))
      abortUploads();
    abort = new AbortController();
    clearTimer();
    error.value = '';
    items.value = [];
    localFiles.clear();
    draftKey.value = '';
    selectedScopeKey = '';
    selectedAuthorityKey = '';
    if (!scope || capability.state !== 'AVAILABLE' || !capability.upload) return;
    selectedScopeKey = scopeKey(scope);
    selectedAuthorityKey = authorityKey(scope);
    draftKey.value = ensureDraft(scope);
    loading.value = true;
    try {
      const restoredItems = await source.listDraft(scope, draftKey.value, abort.signal);
      if (requestGeneration !== generation || scopeKey(scope) !== selectedScopeKey) return;
      items.value = restoredItems.map(restored);
      schedulePoll(requestGeneration);
    } catch (cause) {
      if (requestGeneration !== generation) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        purge();
        await context.onForbidden?.(cause.status as 403 | 404);
        return;
      }
      error.value = 'Не удалось восстановить вложения. Повторите попытку.';
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  function rejected(file: File, reason: string): SupportAttachmentItem {
    return {
      localId: uuid(),
      id: '',
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      state: 'REJECTED',
      canAttach: false,
      failureCode: reason,
      canRetry: false,
    };
  }

  async function upload(
    file: File,
    scope: SupportAttachmentScope,
    requestGeneration: number,
  ): Promise<void> {
    const localId = uuid();
    let serverAttachmentId = '';
    const capturedDraftKey = draftKey.value;
    activeUploads.add(localId);
    activeUploadScopes.set(localId, uploadScopeKey(scope, capturedDraftKey));
    localFiles.set(localId, file);
    items.value = [
      ...items.value,
      {
        localId,
        id: '',
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
        state: 'QUEUED',
        canAttach: false,
        failureCode: null,
        canRetry: false,
      },
    ];
    try {
      const checksumSha256 = await (context.sha256 ?? sha256)(file);
      if (requestGeneration !== generation || cancelledUploads.has(localId)) return;
      const intent = await source.startUpload(
        scope,
        {
          draftKey: capturedDraftKey,
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
          checksumSha256,
        },
        uuid(),
      );
      serverAttachmentId = intent.id;
      if (cancelledUploads.has(localId)) {
        await source.revoke(scope, intent.id).catch(() => undefined);
        return;
      }
      if (requestGeneration === generation && scopeKey(scope) === selectedScopeKey)
        items.value = items.value.map((item) =>
          item.localId === localId ? { ...item, id: intent.id, state: 'UPLOADING' } : item,
        );
      const uploadAbort = new AbortController();
      uploadAborts.set(localId, uploadAbort);
      await source.uploadBinary(intent.uploadUrl, file, intent.requiredHeaders, uploadAbort.signal);
      uploadAborts.delete(localId);
      if (cancelledUploads.has(localId)) {
        await source.revoke(scope, intent.id).catch(() => undefined);
        return;
      }
      const completed = await source.completeUpload(scope, intent.id);
      if (cancelledUploads.has(localId)) {
        await source.revoke(scope, intent.id).catch(() => undefined);
        return;
      }
      const currentScope = requestGeneration === generation && scopeKey(scope) === selectedScopeKey;
      if (!currentScope || completed.state !== 'FAILED') localFiles.delete(localId);
      if (!currentScope) return;
      items.value = items.value.map((item) =>
        item.localId === localId
          ? { ...restored(completed), localId, canRetry: completed.state === 'FAILED' }
          : item,
      );
      schedulePoll(requestGeneration);
    } catch (cause) {
      uploadAborts.delete(localId);
      if (cancelledUploads.has(localId) && serverAttachmentId)
        await source.revoke(scope, serverAttachmentId).catch(() => undefined);
      if (requestGeneration !== generation) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        purge();
        await context.onForbidden?.(cause.status as 403 | 404);
        return;
      }
      items.value = items.value.map((item) =>
        item.localId === localId
          ? {
              ...item,
              state: 'FAILED',
              canAttach: false,
              failureCode: 'UPLOAD_FAILED',
              canRetry: true,
            }
          : item,
      );
    } finally {
      cancelledUploads.delete(localId);
      activeUploads.delete(localId);
      activeUploadScopes.delete(localId);
    }
  }

  async function addFiles(files: readonly File[]): Promise<void> {
    const scope = context.scope();
    const capability = context.capabilities();
    if (!scope || capability.state !== 'AVAILABLE' || !capability.upload || !draftKey.value) return;
    error.value = '';
    const quotaCount = items.value.filter((item) => quotaStates.has(item.state)).length;
    const availableSlots = Math.max(0, capability.maxFiles - quotaCount);
    let projectedBytes = totalBytes.value;
    const accepted: File[] = [];
    const rejectedItems: SupportAttachmentItem[] = [];
    for (const file of files) {
      if (accepted.length >= availableSlots) rejectedItems.push(rejected(file, 'TOO_MANY_FILES'));
      else if (!capability.contentTypes.includes(file.type))
        rejectedItems.push(rejected(file, 'UNSUPPORTED_TYPE'));
      else if (!file.size || file.size > capability.maxFileBytes)
        rejectedItems.push(rejected(file, 'FILE_TOO_LARGE'));
      else if (projectedBytes + file.size > capability.maxTotalBytes)
        rejectedItems.push(rejected(file, 'TOTAL_TOO_LARGE'));
      else {
        accepted.push(file);
        projectedBytes += file.size;
      }
    }
    if (rejectedItems.length) items.value = [...items.value, ...rejectedItems];
    await Promise.all(accepted.map((file) => upload(file, scope, generation)));
  }

  async function remove(localId: string): Promise<void> {
    const scope = context.scope();
    const item = items.value.find((candidate) => candidate.localId === localId);
    if (!scope || !item) return;
    if (item.state === 'QUEUED' || item.state === 'UPLOADING') cancelledUploads.add(localId);
    uploadAborts.get(localId)?.abort();
    uploadAborts.delete(localId);
    items.value = items.value.filter((candidate) => candidate.localId !== localId);
    localFiles.delete(localId);
    if (item.id && item.state !== 'REVOKED') {
      try {
        await source.revoke(scope, item.id);
      } catch (cause) {
        if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
          purge();
          await context.onForbidden?.(cause.status as 403 | 404);
          return;
        }
        error.value = 'Файл убран из ответа, но сервер не подтвердил отзыв. Обновите список.';
      }
    }
  }

  async function retry(localId: string): Promise<void> {
    const scope = context.scope();
    const item = items.value.find((candidate) => candidate.localId === localId);
    const file = localFiles.get(localId);
    if (!scope || !item || !file || item.state !== 'FAILED') return;
    items.value = items.value.filter((candidate) => candidate.localId !== localId);
    localFiles.delete(localId);
    if (item.id) await source.revoke(scope, item.id).catch(() => undefined);
    await upload(file, scope, generation);
  }

  async function download(attachmentId: string): Promise<void> {
    const scope = context.scope();
    if (!scope || !context.capabilities().download) return;
    try {
      const grant = await source.grantDownload(scope, attachmentId);
      const url = new URL(grant.url, window.location.origin);
      if (url.protocol !== 'https:' && url.protocol !== 'about:')
        throw new Error('Unsafe attachment grant URL');
      const link = document.createElement('a');
      link.href = url.toString();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } catch (cause) {
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        purge();
        await context.onForbidden?.(cause.status as 403 | 404);
        return;
      }
      error.value = 'Ссылка на файл недоступна. Попробуйте ещё раз.';
    }
  }

  function consumeDraft(): void {
    const scope = context.scope();
    if (scope && draftKey.value) abortUploads(uploadScopeKey(scope, draftKey.value));
    if (scope) sessionStorage.removeItem(storageKey(scope));
    ++generation;
    clearTimer();
    items.value = [];
    localFiles.clear();
    draftKey.value = scope ? ensureDraft(scope) : '';
  }

  function purge(): void {
    const scope = context.scope();
    if (scope && draftKey.value) abortUploads(uploadScopeKey(scope, draftKey.value));
    else if (!scope) abortUploads();
    if (scope) sessionStorage.removeItem(storageKey(scope));
    ++generation;
    abort?.abort();
    abort = null;
    clearTimer();
    selectedScopeKey = '';
    selectedAuthorityKey = '';
    items.value = [];
    localFiles.clear();
    draftKey.value = '';
    loading.value = false;
    error.value = '';
  }

  function dispose(): void {
    abortUploads();
    purge();
  }

  return {
    items,
    draftKey,
    readyIds,
    busy,
    canSend,
    totalBytes,
    loading,
    error,
    select,
    addFiles,
    remove,
    retry,
    download,
    consumeDraft,
    purge,
    dispose,
  };
}
