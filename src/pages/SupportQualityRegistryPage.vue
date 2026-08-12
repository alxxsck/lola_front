<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportQualitySource } from "@/features/support-quality/api/support-quality-source";
import type {
  SupportQualityCalibrationDetailResponseDto,
  SupportQualityCalibrationResponseDto,
  SupportQualityDisputeResponseDto,
  SupportQualityScorecardResponseDto,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref("");
const actionNotice = ref("");
const acting = ref(false);
const participantId = ref("");
const baselineReviewId = ref("");
const consensusScore = ref<number | null>(null);
const resolutionNote = ref("");
const disputesCursor = ref<string | null>(null);
const calibrationCursor = ref<string | null>(null);
const scorecards = ref<SupportQualityScorecardResponseDto[]>([]);
const calibrations = ref<SupportQualityCalibrationResponseDto[]>([]);
const calibrationDetail = ref<SupportQualityCalibrationDetailResponseDto | null>(null);
const disputes = ref<
  Array<SupportQualityDisputeResponseDto & { operatorCmsUserId: string }>
>([]);
let controller: AbortController | null = null;
let loadGeneration = 0;
const mode = computed(() =>
  route.name === "support-quality-scorecards"
    ? "scorecards"
    : route.name === "support-quality-calibrations"
      ? "calibrations"
      : "disputes",
);
const title = computed(() =>
  mode.value === "scorecards"
    ? "Карты оценки"
    : mode.value === "calibrations"
      ? "Калибровки"
      : "Апелляции",
);
const description = computed(() =>
  mode.value === "scorecards"
    ? "Версионированные критерии без изменения опубликованной истории."
    : mode.value === "calibrations"
      ? "Согласованность оценок без раскрытия работ коллег до отправки."
      : "Прозрачное рассмотрение разногласий по оценкам.",
);
const canManage = computed(() =>
  (auth.project?.effectivePermissionCodes ?? []).includes("project.support.quality.manage"),
);
async function perform(action: () => Promise<unknown>, notice: string): Promise<void> {
  acting.value = true;
  error.value = "";
  try {
    await action();
    actionNotice.value = notice;
    await load();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Действие не выполнено";
  } finally {
    acting.value = false;
  }
}
async function appendDisputePage(projectId: string, signal: AbortSignal): Promise<void> {
  const generation = loadGeneration;
  const actorId = auth.user?.id ?? "";
  const permissionSignature = auth.project?.effectivePermissionCodes?.join(",") ?? "";
  const page = await supportQualitySource.listReviews(
    projectId,
    undefined,
    disputesCursor.value ?? undefined,
    signal,
  );
  const rows: Array<
    SupportQualityDisputeResponseDto & { operatorCmsUserId: string }
  > = [];
  for (let offset = 0; offset < page.items.length; offset += 4) {
    const chunk = page.items.slice(offset, offset + 4);
    const details = await Promise.all(
      chunk.map((review) => supportQualitySource.readReview(projectId, review.id, signal)),
    );
    rows.push(
      ...details.flatMap((detail) =>
        detail.disputes.map((dispute) => ({
          ...dispute,
          operatorCmsUserId: detail.operatorCmsUserId,
        })),
      ),
    );
  }
  if (signal.aborted || generation !== loadGeneration || auth.project?.id !== projectId ||
      (auth.user?.id ?? "") !== actorId || (auth.project?.effectivePermissionCodes?.join(",") ?? "") !== permissionSignature) return;
  disputes.value.push(...rows);
  disputesCursor.value = page.nextCursor ?? null;
}
async function loadMoreDisputes(): Promise<void> {
  if (!auth.project?.id || !controller) return;
  loading.value = true;
  try {
    await appendDisputePage(auth.project.id, controller.signal);
  } finally {
    loading.value = false;
  }
}
async function loadMoreCalibrations(): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || !calibrationCursor.value) return;
  const generation = loadGeneration;
  const page = await supportQualitySource.listCalibrations(projectId, calibrationCursor.value);
  if (generation !== loadGeneration || auth.project?.id !== projectId) return;
  calibrations.value.push(...page.items);
  calibrationCursor.value = page.nextCursor ?? null;
}
async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++loadGeneration;
  const projectId = auth.project?.id;
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  if (
    !projectId ||
    !permissions.some((code) =>
      [
        "project.support.quality.read",
        "project.support.quality.manage",
        "project.support.quality.dispute",
      ].includes(code),
    )
  ) {
    scorecards.value = [];
    calibrations.value = [];
    calibrationDetail.value = null;
    disputes.value = [];
    return;
  }
  scorecards.value = [];
  calibrations.value = [];
  calibrationDetail.value = null;
  disputes.value = [];
  disputesCursor.value = null;
  calibrationCursor.value = null;
  loading.value = true;
  error.value = "";
  try {
    if (mode.value === "scorecards") {
      const nextScorecards = await supportQualitySource.listScorecards(
        projectId,
        signal,
      );
      if (signal.aborted || generation !== loadGeneration) return;
      scorecards.value = nextScorecards;
    }
    else if (mode.value === "calibrations") {
      const page = await supportQualitySource.listCalibrations(projectId, undefined, signal);
      if (signal.aborted || generation !== loadGeneration) return;
      calibrations.value = page.items;
      calibrationCursor.value = page.nextCursor ?? null;
      calibrationDetail.value =
        typeof route.query.calibration === "string"
          ? await supportQualitySource.readCalibration(
              projectId,
              route.query.calibration,
              signal,
            )
          : null;
    } else {
      await appendDisputePage(projectId, signal);
    }
  } catch (cause) {
    if (!signal.aborted && generation === loadGeneration)
      error.value = cause instanceof Error ? cause.message : "Раздел недоступен";
  } finally {
    if (!signal.aborted && generation === loadGeneration) loading.value = false;
  }
}
watch(
  [
    () => auth.project?.id,
    () => auth.user?.id,
    () => auth.project?.effectivePermissionCodes?.join(",") ?? "",
    mode,
    () => route.query.calibration,
  ],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="registry-page" aria-labelledby="registry-title">
    <header>
      <div>
        <span class="eyebrow">Support Quality</span>
        <h1 id="registry-title">{{ title }}</h1>
        <p>{{ description }}</p>
      </div>
      <nav aria-label="Разделы контроля качества">
        <RouterLink to="/support/quality">Очередь</RouterLink
        ><RouterLink
          to="/support/quality/scorecards"
          :aria-current="mode === 'scorecards' ? 'page' : undefined"
          >Карты оценки</RouterLink
        ><RouterLink
          to="/support/quality/calibrations"
          :aria-current="mode === 'calibrations' ? 'page' : undefined"
          >Калибровки</RouterLink
        ><RouterLink
          to="/support/quality/disputes"
          :aria-current="mode === 'disputes' ? 'page' : undefined"
          >Апелляции</RouterLink
        >
      </nav>
    </header>
    <div v-if="error" class="alert" role="alert">{{ error }}</div>
    <div v-if="actionNotice" class="action-notice" role="status">{{ actionNotice }}</div>
    <div v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner" /> Загружаем…
    </div>
    <section v-else-if="mode === 'scorecards'" class="surface">
      <div class="table-head">
        <span>Карта и код</span><span>Ревизия</span><span>Структура</span
        ><span>Состояние</span>
      </div>
      <article v-for="card in scorecards" :key="card.id">
        <div>
          <strong>{{ card.name }}</strong
          ><small>{{ card.code }}</small>
        </div>
        <strong>v{{ card.currentRevisionNumber }}</strong
        ><span
          >{{ card.sections.length }} раздела ·
          {{
            card.sections.reduce(
              (sum, section) => sum + section.items.length,
              0,
            )
          }}
          критерия</span
        ><Tag :value="card.state" severity="success" />
      </article>
      <div class="registry-note">
        <i class="pi pi-lock" />
        <div>
          <strong>Опубликованные ревизии неизменяемы</strong>
          <p>
            Новая версия создаёт отдельный снимок; завершённые оценки продолжают
            ссылаться на прежнюю ревизию.
          </p>
        </div>
      </div>
      <div v-if="canManage" class="management-row">
        <span>Новая ревизия копирует структуру и создаёт отдельный immutable snapshot.</span>
        <Button
          label="Создать новую ревизию"
          icon="pi pi-copy"
          :loading="acting"
          @click="perform(() => supportQualitySource.createScorecardRevision(auth.project!.id, scorecards[0]!), 'Новая ревизия карты создана')"
        />
      </div>
    </section>
    <section
      v-else-if="mode === 'calibrations' && calibrationDetail"
      class="surface calibration-detail"
      aria-labelledby="calibration-detail-title"
    >
      <div class="calibration-heading">
        <div>
          <span class="eyebrow">Сессия {{ calibrationDetail.id }}</span>
          <h2 id="calibration-detail-title">Согласованность оценок</h2>
          <p>
            Результаты коллег скрыты до собственной отправки. Обычный quality
            score не меняется.
          </p>
        </div>
        <Button
          label="К списку"
          icon="pi pi-times"
          text
          severity="secondary"
          @click="router.replace('/support/quality/calibrations')"
        />
      </div>
      <div class="calibration-spine">
        <div><span>Участники</span><strong>{{ calibrationDetail.participants.length }}</strong></div>
        <div><span>Минимум</span><strong>{{ calibrationDetail.minimumReviews }}</strong></div>
        <div>
          <span>Согласие</span>
          <strong>{{ calibrationDetail.agreementBasisPoints == null ? '—' : `${calibrationDetail.agreementBasisPoints / 100}%` }}</strong>
        </div>
      </div>
      <ul class="participant-list">
        <li v-for="participant in calibrationDetail.participants" :key="participant.reviewerCmsUserId">
          <span><strong>{{ participant.reviewerCmsUserId }}</strong><small>{{ participant.state }}</small></span>
          <Tag
            :value="
              calibrationDetail.peerReviewsVisible || participant.reviewerCmsUserId === auth.user?.id
                ? participant.reviewId ?? 'Ожидает оценку'
                : 'Результат скрыт'
            "
            :severity="participant.state === 'SUBMITTED' ? 'success' : 'secondary'"
          />
        </li>
      </ul>
      <div v-if="canManage" class="calibration-actions">
        <label>Участник<InputText v-model="participantId" placeholder="CMS User ID" /></label>
        <Button
          label="Добавить"
          :disabled="!participantId.trim()"
          :loading="acting"
          @click="perform(() => supportQualitySource.addCalibrationParticipant(auth.project!.id, calibrationDetail!.id, calibrationDetail!.version, participantId.trim()), 'Участник добавлен')"
        />
        <label>Baseline review<InputText v-model="baselineReviewId" placeholder="Review ID" /></label>
        <Button
          label="Закрепить baseline"
          severity="secondary"
          :disabled="!baselineReviewId.trim()"
          :loading="acting"
          @click="perform(() => supportQualitySource.setCalibrationBaseline(auth.project!.id, calibrationDetail!.id, calibrationDetail!.version, baselineReviewId.trim()), 'Baseline закреплён')"
        />
        <label>Consensus<InputNumber v-model="consensusScore" :min="0" :max="10000" /></label>
        <Button
          label="Закрыть сессию"
          severity="secondary"
          outlined
          :disabled="consensusScore === null"
          :loading="acting"
          @click="perform(() => supportQualitySource.closeCalibration(auth.project!.id, calibrationDetail!.id, calibrationDetail!.version, consensusScore!), 'Калибровка закрыта')"
        />
      </div>
    </section>
    <section
      v-else-if="mode === 'calibrations' && !calibrations.length"
      class="surface calibration-empty"
      aria-labelledby="calibrations-empty-title"
    >
      <div class="calibration-empty__content">
        <span class="calibration-empty__icon" aria-hidden="true">
          <i class="pi pi-check-circle" />
        </span>
        <div>
          <h2 id="calibrations-empty-title">Калибровок пока нет</h2>
          <p>
            Контроль качества работает. Калибровочные сессии появятся здесь,
            когда команда начнёт сверять оценки по одной работе.
          </p>
        </div>
        <RouterLink class="calibration-empty__link" to="/support/quality">
          Открыть очередь проверок
          <i class="pi pi-arrow-right" aria-hidden="true" />
        </RouterLink>
      </div>
    </section>
    <section v-else-if="mode === 'calibrations'" class="cards">
      <article v-for="item in calibrations" :key="item.id" class="surface card">
        <div class="card-top">
          <Tag
            :value="item.state"
            :severity="item.state === 'OPEN' ? 'info' : 'secondary'"
          /><span>v{{ item.version }}</span>
        </div>
        <h2>Калибровка {{ item.id }}</h2>
        <dl>
          <div>
            <dt>Оператор</dt>
            <dd>{{ item.operatorCmsUserId }}</dd>
          </div>
          <div>
            <dt>Минимум оценок</dt>
            <dd>{{ item.minimumReviews }}</dd>
          </div>
          <div>
            <dt>Видимость коллег</dt>
            <dd>{{ item.peerVisibility }}</dd>
          </div>
        </dl>
        <Button
          label="Открыть сессию"
          severity="secondary"
          outlined
          @click="
            router.push({
              path: '/support/quality/calibrations',
              query: { calibration: item.id },
            })
          "
        />
      </article>
      <Button v-if="calibrationCursor" label="Загрузить ещё" severity="secondary" text @click="loadMoreCalibrations" />
    </section>
    <section v-else class="surface">
      <div v-if="!disputes.length" class="empty">
        <i class="pi pi-check-circle" />
        <h2>Открытых апелляций нет</h2>
        <p>Новые обращения появятся здесь после ответа оператора.</p>
      </div>
      <article v-for="item in disputes" v-else :key="item.id" class="dispute">
        <div>
          <Tag
            :value="item.state"
            :severity="item.state === 'OPEN' ? 'warn' : 'success'"
          />
          <h2>{{ item.operatorCmsUserId }}</h2>
          <p>{{ item.reason }}</p>
        </div>
        <div class="dispute-actions">
          <InputText
            v-if="canManage && item.state === 'OPEN'"
            v-model="resolutionNote"
            placeholder="Решение и обоснование"
          />
          <Button
            v-if="canManage && item.state === 'OPEN'"
            label="Разрешить"
            :disabled="!resolutionNote.trim()"
            :loading="acting"
            @click="perform(() => supportQualitySource.resolveDispute(auth.project!.id, item, resolutionNote.trim()), 'Апелляция разрешена')"
          />
          <Button
            label="Открыть оценку"
            severity="secondary"
            outlined
            @click="router.push(`/support/quality/reviews/${item.reviewId}`)"
          />
        </div>
      </article>
      <Button
        v-if="disputesCursor"
        label="Загрузить ещё"
        text
        :loading="loading"
        @click="loadMoreDisputes"
      />
    </section>
  </main>
</template>

<style scoped>
.registry-page {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  display: grid;
  gap: 24px;
}
.registry-page header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 24px;
}
.eyebrow {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--p-primary-color);
  font-weight: 700;
}
h1 {
  margin: 4px 0;
  font-size: clamp(1.75rem, 3vw, 2.4rem);
  letter-spacing: -0.04em;
}
header p {
  margin: 0;
  color: var(--p-text-muted-color);
}
nav {
  box-sizing: border-box;
  max-width: 100%;
  min-width: 0;
  display: flex;
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--p-content-hover-background);
  overflow: auto;
}
nav a {
  padding: 8px 12px;
  border-radius: 7px;
  text-decoration: none;
  white-space: nowrap;
  color: var(--p-text-muted-color);
  font-size: 0.84rem;
  font-weight: 600;
}
nav a[aria-current="page"],
nav a:hover {
  background: var(--p-content-background);
  color: var(--p-text-color);
}
.surface {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.action-notice {
  padding: 10px 12px;
  border: 1px solid var(--p-green-200);
  border-radius: 8px;
  color: var(--p-green-800);
  background: var(--p-green-50);
}
.management-row,
.calibration-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 18px;
  border-top: 1px solid var(--p-content-border-color);
}
.management-row > span {
  margin-right: auto;
  color: var(--p-text-muted-color);
}
.calibration-actions {
  flex-wrap: wrap;
}
.calibration-actions label {
  display: grid;
  gap: 4px;
  color: var(--p-text-muted-color);
  font-size: 0.72rem;
}
.dispute-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.calibration-detail {
  display: grid;
}
.calibration-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 18px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.calibration-heading h2 {
  margin: 3px 0;
}
.calibration-heading p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.calibration-spine {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border-bottom: 1px solid var(--p-content-border-color);
}
.calibration-spine > div {
  display: grid;
  gap: 2px;
  padding: 14px 18px;
  border-right: 1px solid var(--p-content-border-color);
}
.calibration-spine > div:last-child {
  border: 0;
}
.calibration-spine span,
.participant-list small {
  color: var(--p-text-muted-color);
}
.calibration-spine strong {
  font-size: 1.4rem;
}
.participant-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.participant-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.participant-list li:last-child {
  border: 0;
}
.participant-list li > span {
  display: grid;
  gap: 2px;
}
.table-head,
.surface > article {
  display: grid;
  grid-template-columns: 2fr 0.6fr 1.2fr 0.7fr;
  gap: 16px;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.table-head {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
  background: var(--p-content-hover-background);
}
.surface > article > div:first-child {
  display: grid;
  gap: 2px;
}
.surface small,
.surface span {
  color: var(--p-text-muted-color);
}
.registry-note {
  display: flex;
  gap: 12px;
  padding: 18px;
  background: color-mix(
    in srgb,
    var(--p-primary-color) 6%,
    var(--p-content-background)
  );
}
.registry-note i {
  color: var(--p-primary-color);
}
.registry-note p {
  margin: 4px 0 0;
  color: var(--p-text-muted-color);
}
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.card {
  padding: 16px;
}
.card-top {
  display: flex;
  justify-content: space-between;
}
.card h2 {
  font-size: 1rem;
}
.card dl {
  display: grid;
  gap: 10px;
}
.card dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.card dt {
  color: var(--p-text-muted-color);
}
.card dd {
  margin: 0;
}
.dispute {
  grid-template-columns: 1fr auto !important;
}
.dispute h2 {
  font-size: 0.95rem;
  margin: 8px 0 0;
}
.dispute p {
  margin: 4px 0;
}
.empty {
  text-align: center;
  padding: 64px 24px !important;
  display: block !important;
}
.empty i {
  font-size: 2rem;
  color: var(--p-green-500);
}
.calibration-empty {
  min-height: 320px;
  display: grid;
  place-items: center;
  padding: 48px 24px;
}
.calibration-empty__content {
  max-width: 520px;
  display: grid;
  justify-items: center;
  gap: 18px;
  text-align: center;
}
.calibration-empty__icon {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: var(--status-success-soft, var(--p-green-50));
  color: var(--status-success-text, var(--p-green-700));
  font-size: 1.35rem;
}
.calibration-empty h2 {
  margin: 0 0 6px;
  font-size: 1.1rem;
}
.calibration-empty p {
  margin: 0;
  color: var(--p-text-muted-color);
  line-height: 1.5;
  text-wrap: pretty;
}
.calibration-empty__link {
  min-height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--p-primary-color);
  font-size: 0.84rem;
  font-weight: 650;
  text-decoration: none;
}
.calibration-empty__link:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.calibration-empty__link:focus-visible {
  outline: 2px solid var(--p-primary-color);
  outline-offset: 4px;
  border-radius: 6px;
}
.alert {
  padding: 10px;
  border: 1px solid var(--p-red-200);
  background: var(--p-red-50);
  color: var(--p-red-700);
  border-radius: 8px;
}
.loading {
  padding: 64px;
  text-align: center;
  color: var(--p-text-muted-color);
}
@media (max-width: 900px) {
  .registry-page header {
    align-items: flex-start;
    flex-direction: column;
  }
  .cards {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 600px) {
  .registry-page {
    padding: 16px 12px;
  }
  .registry-page nav {
    width: calc(100vw - 24px);
    max-width: calc(100vw - 24px);
  }
  .cards {
    grid-template-columns: 1fr;
  }
  .table-head {
    display: none;
  }
  .surface > article {
    grid-template-columns: 1fr auto;
  }
  .surface > article > span {
    grid-column: 1/-1;
  }
  .dispute {
    grid-template-columns: 1fr !important;
  }
  .dispute :deep(.p-button) {
    width: 100%;
  }
  .calibration-heading {
    align-items: flex-start;
  }
  .calibration-spine {
    grid-template-columns: 1fr;
  }
  .calibration-spine > div {
    border-right: 0;
    border-bottom: 1px solid var(--p-content-border-color);
  }
  .management-row,
  .calibration-actions,
  .dispute-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
