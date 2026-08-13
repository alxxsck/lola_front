<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type {
  IntegrationConnectionResponseDto,
  IntegrationRecoveryOperationDetailDto,
  IntegrationRecoveryOperationListItemDto,
} from '@/shared/api/generated/models';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { integrationRecoveryApi, type IntegrationDirection } from './integration-recovery.api';

const props = defineProps<{
  projectId: string;
  canReadActivity: boolean;
  canManage: boolean;
  canReadIntegrations: boolean;
}>();

const operations = ref<IntegrationRecoveryOperationListItemDto[]>([]);
const connections = ref<IntegrationConnectionResponseDto[]>([]);
const selected = ref<IntegrationRecoveryOperationDetailDto | null>(null);
const loading = ref(false);
const pendingKey = ref('');
const error = ref('');
const success = ref('');
let epoch = 0;

const canOperate = computed(() => props.canManage && props.canReadActivity);

function errorCopy(cause: unknown): string {
  const apiError = normalizeApiError(cause);
  if (apiError.status === 409)
    return 'Состояние изменилось. Данные обновлены — повторите действие после проверки.';
  if (apiError.status === 403) return 'Недостаточно прав для этого действия.';
  return 'Операцию выполнить не удалось. Обновите данные и попробуйте снова.';
}

function requestReason(action: string): string | null {
  const reason = window.prompt(`Укажите причину: ${action}`, '')?.trim();
  return reason ? reason.slice(0, 500) : null;
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('ru-RU') : '—';
}

function operationLabel(item: IntegrationRecoveryOperationListItemDto): string {
  if (item.operationKind === 'INGRESS') return 'Приём';
  if (item.operationKind === 'DISPATCH') return 'Отправка';
  return 'Подключение';
}

function canCancel(item: IntegrationRecoveryOperationListItemDto): boolean {
  return (
    item.operationKind === 'DISPATCH' && (item.status === 'PENDING' || item.status === 'RETRY_WAIT')
  );
}

function canReplay(item: IntegrationRecoveryOperationListItemDto): boolean {
  if (item.operationKind === 'DISPATCH')
    return item.status === 'FAILED_PERMANENT' || item.status === 'OUTCOME_UNKNOWN';
  if (item.operationKind !== 'INGRESS') return false;
  return (
    item.status === 'UNMAPPED' ||
    item.status === 'SCHEMA_INVALID' ||
    item.status === 'FAILED_PERMANENT' ||
    item.status === 'QUARANTINED'
  );
}

function canQuarantine(
  item: IntegrationRecoveryOperationListItemDto | IntegrationRecoveryOperationDetailDto,
): boolean {
  return (
    item.operationKind === 'INGRESS' && (item.status === 'RECEIVED' || item.status === 'RETRY_WAIT')
  );
}

function recoveryCommandLabel(
  commandType: string,
  direction: IntegrationRecoveryOperationDetailDto['direction'],
): string {
  if (commandType === 'PAUSE_DIRECTION')
    return direction === 'INBOUND' ? 'Пауза приёма' : 'Пауза отправки';
  if (commandType === 'RESUME_DIRECTION')
    return direction === 'INBOUND' ? 'Возобновление приёма' : 'Возобновление отправки';
  if (commandType === 'QUARANTINE_INGRESS') return 'Ручной карантин';
  return commandType;
}

async function load(): Promise<void> {
  const current = ++epoch;
  operations.value = [];
  connections.value = [];
  selected.value = null;
  error.value = '';
  success.value = '';
  if (!props.projectId || !props.canReadActivity) return;
  loading.value = true;
  try {
    const [operationsResponse, connectionsResponse] = await Promise.all([
      integrationRecoveryApi.list(props.projectId, { limit: 50 }),
      props.canReadIntegrations
        ? integrationRecoveryApi.listConnections(props.projectId)
        : Promise.resolve({ items: [] }),
    ]);
    if (current !== epoch) return;
    operations.value = operationsResponse.items;
    connections.value = connectionsResponse.items;
  } catch (cause) {
    if (current === epoch) error.value = errorCopy(cause);
  } finally {
    if (current === epoch) loading.value = false;
  }
}

async function showDetail(item: IntegrationRecoveryOperationListItemDto): Promise<void> {
  const key = `detail:${item.operationKind}:${item.id}`;
  if (pendingKey.value) return;
  const current = epoch;
  const projectId = props.projectId;
  pendingKey.value = key;
  error.value = '';
  try {
    const detail = await integrationRecoveryApi.detail(projectId, item.operationKind, item.id);
    if (current !== epoch || projectId !== props.projectId) return;
    selected.value = detail;
  } catch (cause) {
    if (current === epoch && projectId === props.projectId) error.value = errorCopy(cause);
  } finally {
    if (pendingKey.value === key) pendingKey.value = '';
  }
}

async function cancel(item: IntegrationRecoveryOperationListItemDto): Promise<void> {
  if (!canOperate.value || !canCancel(item) || pendingKey.value) return;
  const reason = requestReason('отменить отправку');
  if (!reason || !window.confirm('Отменить эту отправку? Действие будет записано в аудит.')) return;
  const current = epoch;
  const projectId = props.projectId;
  await runCommand(`cancel:${item.id}`, projectId, current, async () => {
    await integrationRecoveryApi.cancelDispatch(
      projectId,
      item.id,
      {
        expectedOperationsVersion: item.operationsVersion,
        expectedState: item.status as 'PENDING' | 'RETRY_WAIT',
        reason,
      },
      crypto.randomUUID(),
    );
    return 'Отправка отменена.';
  });
}

async function replay(item: IntegrationRecoveryOperationListItemDto): Promise<void> {
  if (!canOperate.value || !canReplay(item) || pendingKey.value) return;
  const reason = requestReason('повторить обработку');
  if (!reason) return;
  if (
    item.status === 'OUTCOME_UNKNOWN' &&
    !window.confirm(
      'Результат прошлой отправки неизвестен. Повтор может создать дубликат. Продолжить?',
    )
  )
    return;
  if (!window.confirm('Запустить повторную обработку? Действие будет записано в аудит.')) return;
  const current = epoch;
  const projectId = props.projectId;
  await runCommand(`replay:${item.id}`, projectId, current, async () => {
    if (item.operationKind === 'DISPATCH') {
      await integrationRecoveryApi.replayDispatch(
        projectId,
        item.id,
        {
          acknowledgeDuplicateRisk: item.status === 'OUTCOME_UNKNOWN',
          expectedOperationsVersion: item.operationsVersion,
          expectedState: item.status as 'FAILED_PERMANENT' | 'OUTCOME_UNKNOWN',
          reason,
        },
        crypto.randomUUID(),
      );
    } else {
      await integrationRecoveryApi.replayIngress(
        projectId,
        item.id,
        {
          expectedOperationsVersion: item.operationsVersion,
          expectedStatus: item.status as
            'UNMAPPED' | 'SCHEMA_INVALID' | 'FAILED_PERMANENT' | 'QUARANTINED',
          reason,
        },
        crypto.randomUUID(),
      );
    }
    return 'Повторная обработка поставлена в очередь.';
  });
}

async function quarantine(item: IntegrationRecoveryOperationDetailDto): Promise<void> {
  if (!canOperate.value || !canQuarantine(item) || pendingKey.value) return;
  const reason = requestReason('поместить входящее событие в карантин');
  if (
    !reason ||
    !window.confirm('Поместить входящее событие в карантин? Действие будет записано в аудит.')
  )
    return;
  const current = epoch;
  const projectId = props.projectId;
  await runCommand(`quarantine:${item.id}`, projectId, current, async () => {
    await integrationRecoveryApi.quarantineIngress(
      projectId,
      item.id,
      {
        expectedOperationsVersion: item.operationsVersion,
        expectedStatus: item.status as 'RECEIVED' | 'RETRY_WAIT',
        reason,
      },
      crypto.randomUUID(),
    );
    return 'Входящее событие помещено в карантин.';
  });
}

async function toggleDirection(
  connection: IntegrationConnectionResponseDto,
  direction: IntegrationDirection,
): Promise<void> {
  if (!canOperate.value || pendingKey.value) return;
  const paused = direction === 'INBOUND' ? connection.inboundPaused : connection.outboundPaused;
  const nextPaused = !paused;
  const action = nextPaused ? 'приостановить' : 'возобновить';
  const reason = requestReason(`${action} ${direction === 'INBOUND' ? 'приём' : 'отправку'}`);
  if (
    !reason ||
    !window.confirm(
      `${action === 'приостановить' ? 'Приостановить' : 'Возобновить'} направление для ${connection.displayName}?`,
    )
  )
    return;
  const current = epoch;
  const projectId = props.projectId;
  await runCommand(`direction:${connection.id}:${direction}`, projectId, current, async () => {
    await integrationRecoveryApi.changeDirectionPause(
      projectId,
      connection.id,
      direction,
      nextPaused,
      { expectedPaused: paused, expectedVersion: connection.version, reason },
      crypto.randomUUID(),
    );
    return nextPaused ? 'Направление приостановлено.' : 'Направление возобновлено.';
  });
}

async function runCommand(
  key: string,
  projectId: string,
  commandEpoch: number,
  command: () => Promise<string>,
): Promise<void> {
  pendingKey.value = key;
  error.value = '';
  success.value = '';
  try {
    const message = await command();
    if (commandEpoch !== epoch || projectId !== props.projectId) return;
    await load();
    if (projectId !== props.projectId) return;
    success.value = message;
  } catch (cause) {
    if (commandEpoch !== epoch || projectId !== props.projectId) return;
    const message = errorCopy(cause);
    await load();
    if (projectId !== props.projectId) return;
    error.value = message;
  } finally {
    pendingKey.value = '';
  }
}

watch(
  () => [props.projectId, props.canReadActivity, props.canReadIntegrations] as const,
  () => void load(),
);
onMounted(() => void load());
</script>

<template>
  <section v-if="canReadActivity" class="integration-card recovery-card">
    <div class="card-heading">
      <div class="card-title">
        <h2>Восстановление интеграций</h2>
        <p>
          Безопасные метаданные, ручной повтор и независимая пауза направлений. Payload и секреты не
          отображаются.
        </p>
      </div>
      <button type="button" class="secondary" :disabled="loading || !!pendingKey" @click="load">
        Обновить
      </button>
    </div>

    <p v-if="error" class="feedback error" role="alert">{{ error }}</p>
    <p v-if="success" class="feedback success" role="status">{{ success }}</p>
    <p v-if="!canOperate" class="read-only-note">
      Режим просмотра: команды доступны только с правами чтения активности и управления
      интеграциями.
    </p>

    <section v-if="connections.length" class="direction-section" aria-labelledby="direction-title">
      <h3 id="direction-title">Направления подключений</h3>
      <div class="connection-list">
        <article v-for="connection in connections" :key="connection.id" class="connection-row">
          <div>
            <strong>{{ connection.displayName }}</strong
            ><small>{{ connection.provider }}</small>
          </div>
          <button
            type="button"
            class="secondary"
            :disabled="!canOperate || !!pendingKey"
            @click="toggleDirection(connection, 'INBOUND')"
          >
            {{ connection.inboundPaused ? 'Возобновить приём' : 'Пауза приёма' }}
          </button>
          <button
            type="button"
            class="secondary"
            :disabled="!canOperate || !!pendingKey"
            @click="toggleDirection(connection, 'OUTBOUND')"
          >
            {{ connection.outboundPaused ? 'Возобновить отправку' : 'Пауза отправки' }}
          </button>
        </article>
      </div>
    </section>

    <p v-if="loading" class="empty-state">Загружаем операции…</p>
    <div v-else-if="operations.length" class="operation-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Тип</th>
            <th>Провайдер</th>
            <th>Статус</th>
            <th>Попытки</th>
            <th>Обновлено</th>
            <th><span class="visually-hidden">Действия</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in operations" :key="`${item.operationKind}:${item.id}`">
            <td>{{ operationLabel(item) }}</td>
            <td>{{ item.provider }}</td>
            <td>
              <span class="status" :data-status="item.status">{{ item.status }}</span
              ><small v-if="item.failureCode">{{ item.failureCode }}</small>
            </td>
            <td>{{ item.attemptCount }}</td>
            <td>{{ formatDate(item.updatedAt) }}</td>
            <td>
              <div class="row-actions">
                <button
                  type="button"
                  class="secondary"
                  :disabled="!!pendingKey"
                  @click="showDetail(item)"
                >
                  Детали
                </button>
                <button
                  v-if="canOperate && canCancel(item)"
                  type="button"
                  class="secondary"
                  :disabled="!!pendingKey"
                  @click="cancel(item)"
                >
                  Отменить
                </button>
                <button
                  v-if="canOperate && canReplay(item)"
                  type="button"
                  :class="{ danger: item.status === 'OUTCOME_UNKNOWN' }"
                  :disabled="!!pendingKey"
                  @click="replay(item)"
                >
                  Повторить
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="!loading" class="empty-state">Операций пока нет.</p>

    <section v-if="selected" class="operation-detail" aria-labelledby="operation-detail-title">
      <div class="detail-heading">
        <h3 id="operation-detail-title">Детали операции</h3>
        <div class="row-actions">
          <button
            v-if="canOperate && canQuarantine(selected)"
            type="button"
            class="danger"
            :disabled="!!pendingKey"
            @click="quarantine(selected)"
          >
            В карантин
          </button>
          <button type="button" class="secondary" @click="selected = null">Закрыть</button>
        </div>
      </div>
      <dl class="integration-facts">
        <div>
          <dt>Тип</dt>
          <dd>{{ operationLabel(selected) }}</dd>
        </div>
        <div>
          <dt>ID</dt>
          <dd>
            <code>{{ selected.id }}</code>
          </dd>
        </div>
        <div>
          <dt>Версия</dt>
          <dd>{{ selected.operationsVersion }}</dd>
        </div>
        <div v-if="selected.operationKind !== 'CONNECTION'">
          <dt>Маршрут</dt>
          <dd>
            <code>{{ selected.routeId || '—' }}</code>
          </dd>
        </div>
        <div>
          <dt>Направление</dt>
          <dd>{{ selected.direction }}</dd>
        </div>
        <div>
          <dt>Завершено</dt>
          <dd>{{ formatDate(selected.finishedAt) }}</dd>
        </div>
      </dl>
      <h4>Попытки</h4>
      <ul class="detail-list">
        <li v-for="attempt in selected.attempts" :key="attempt.attemptNumber">
          № {{ attempt.attemptNumber }} · {{ attempt.outcome || 'в процессе' }} ·
          {{ attempt.errorCode || 'без ошибки' }}
        </li>
        <li v-if="!selected.attempts.length">Попыток нет.</li>
      </ul>
      <h4>Команды восстановления</h4>
      <ul class="detail-list">
        <li v-for="command in selected.recoveryCommands" :key="command.id">
          {{ recoveryCommandLabel(command.commandType, selected.direction) }} ·
          {{ command.status }} ·
          {{ formatDate(command.completedAt) }}
        </li>
        <li v-if="!selected.recoveryCommands.length">Команд нет.</li>
      </ul>
    </section>
  </section>
</template>

<style scoped>
.recovery-card,
.direction-section,
.operation-detail {
  display: grid;
  gap: 14px;
}
.direction-section h3,
.operation-detail h3,
.operation-detail h4 {
  margin: 0;
}
.connection-list {
  display: grid;
  gap: 8px;
}
.connection-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}
.connection-row div {
  display: grid;
  gap: 3px;
}
.connection-row small,
td small {
  display: block;
  color: var(--text-secondary);
}
.operation-table-wrap {
  overflow: auto;
}
.operation-table-wrap table {
  width: 100%;
  border-collapse: collapse;
}
.operation-table-wrap th,
.operation-table-wrap td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}
.row-actions,
.detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.row-actions {
  justify-content: flex-end;
}
.detail-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-left: 20px;
}
.danger {
  border-color: var(--status-danger-text);
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
@media (max-width: 760px) {
  .connection-row {
    grid-template-columns: 1fr;
  }
  .operation-table-wrap {
    font-size: var(--font-size-body-small);
  }
}
</style>
