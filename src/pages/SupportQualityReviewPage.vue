<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Textarea from "primevue/textarea";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportQualitySource } from "@/features/support-quality/api/support-quality-source";
import type { SupportQualityReviewDetailResponseDto } from "@/shared/api/generated/models";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const review = ref<SupportQualityReviewDetailResponseDto | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const success = ref("");
const dialog = ref<"reply" | "dispute" | null>(null);
const dialogText = ref("");
let controller: AbortController | null = null;
let scopeGeneration = 0;
function mutationScope() {
  return {
    projectId: projectId.value,
    actorId: auth.user?.id ?? "",
    permissions: permissions.value.join(","),
    generation: scopeGeneration,
    reviewId: review.value?.id ?? "",
  };
}
function scopeIsCurrent(scope: ReturnType<typeof mutationScope>): boolean {
  return scope.projectId === projectId.value && scope.actorId === (auth.user?.id ?? "") &&
    scope.permissions === permissions.value.join(",") && scope.generation === scopeGeneration &&
    scope.reviewId === (review.value?.id ?? "") && canAccess.value;
}

const draft = reactive({
  summary: "",
  scores: [] as Array<{
    itemCode: string;
    applicable: boolean;
    score: number | null;
    maximumScore: number;
    feedback: string;
    coachingTheme: string;
    rootCause: string;
  }>,
  evidence: [] as Array<{ messageId: string; rationale: string }>,
});
const projectId = computed(() => auth.project?.id ?? "");
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const canReview = computed(() =>
  permissions.value.includes("project.support.quality.review"),
);
const canSelfRead = computed(() =>
  permissions.value.includes("project.support.quality.self_read"),
);
const canReadAll = computed(() =>
  permissions.value.includes("project.support.quality.read"),
);
const canDispute = computed(() =>
  permissions.value.includes("project.support.quality.dispute"),
);
const canAccess = computed(
  () => canReview.value || canSelfRead.value || canReadAll.value,
);
const isDraft = computed(() => review.value?.state === "DRAFT");
const total = computed(() =>
  draft.scores.reduce(
    (sum, score) => sum + (score.applicable ? (score.score ?? 0) : 0),
    0,
  ),
);
const maximum = computed(() =>
  draft.scores.reduce(
    (sum, score) => sum + (score.applicable ? score.maximumScore : 0),
    0,
  ),
);
const percent = computed(() =>
  maximum.value ? Math.round((total.value / maximum.value) * 100) : 0,
);
const canSubmit = computed(
  () =>
    isDraft.value &&
    draft.scores.every((item) => !item.applicable || item.score !== null) &&
    draft.evidence.length > 0,
);

function apply(value: SupportQualityReviewDetailResponseDto): void {
  review.value = value;
  draft.summary = value.summary ?? "";
  draft.scores = value.scores.map((item) => ({
    itemCode: item.itemCode,
    applicable: item.applicable,
    score: item.score ?? null,
    maximumScore: item.maximumScore,
    feedback: item.feedback ?? "",
    coachingTheme: item.coachingTheme ?? "",
    rootCause: item.rootCause ?? "",
  }));
  draft.evidence = value.evidence.map((item) => ({
    messageId: item.messageId,
    rationale: item.rationale ?? "",
  }));
}

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const signal = controller.signal;
  const generation = ++scopeGeneration;
  const id = String(route.params.reviewId ?? "");
  const scopeProjectId = projectId.value;
  const scopePermissions = permissions.value.join(",");
  review.value = null;
  if (!scopeProjectId || !id || !canAccess.value) {
    review.value = null;
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const next = await supportQualitySource.readReview(scopeProjectId, id, signal);
    if (signal.aborted || generation !== scopeGeneration || projectId.value !== scopeProjectId || permissions.value.join(",") !== scopePermissions || !canAccess.value) return;
    apply(next);
  } catch (cause) {
    if (!signal.aborted && generation === scopeGeneration)
      error.value =
        cause instanceof Error ? cause.message : "Оценка не найдена";
  } finally {
    if (!signal.aborted && generation === scopeGeneration) loading.value = false;
  }
}

async function save(): Promise<boolean> {
  if (!review.value) return false;
  const scope = mutationScope();
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const updated = await supportQualitySource.saveDraft(
      scope.projectId,
      review.value.id,
      review.value.version,
      {
        summary: draft.summary || undefined,
        scores: draft.scores.map((item) => ({
          itemCode: item.itemCode,
          applicable: item.applicable,
          score: item.score ?? undefined,
          feedback: item.feedback || undefined,
          coachingTheme: item.coachingTheme || undefined,
          rootCause: item.rootCause || undefined,
        })),
        evidence: draft.evidence.map((item) => ({
          messageId: item.messageId,
          rationale: item.rationale || undefined,
        })),
      },
    );
    if (!scopeIsCurrent(scope)) return false;
    review.value = { ...review.value, ...updated };
    success.value = "Черновик сохранён";
    return true;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось сохранить";
    return false;
  } finally {
    saving.value = false;
  }
}

async function submit(): Promise<void> {
  if (!review.value || !canSubmit.value) return;
  if (!(await save())) return;
  if (!review.value) return;
  const scope = mutationScope();
  saving.value = true;
  try {
    const updated = await supportQualitySource.submit(
      scope.projectId,
      review.value.id,
      review.value.version,
    );
    if (!scopeIsCurrent(scope)) return;
    review.value = {
      ...review.value,
      ...updated,
    };
    success.value = "Оценка отправлена оператору";
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось отправить оценку";
  } finally {
    saving.value = false;
  }
}

async function acknowledge(): Promise<void> {
  if (!review.value) return;
  const scope = mutationScope();
  try {
    const updated = await supportQualitySource.acknowledge(
      scope.projectId,
      review.value.id,
      review.value.version,
    );
    if (!scopeIsCurrent(scope)) return;
    review.value = {
      ...review.value,
      ...updated,
    };
    success.value = "Обратная связь подтверждена";
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Действие не выполнено";
  }
}

async function sendDialog(): Promise<void> {
  if (!review.value || !dialogText.value.trim()) return;
  const scope = mutationScope();
  saving.value = true;
  try {
    if (dialog.value === "reply") {
      const updated = await supportQualitySource.reply(
        scope.projectId,
        review.value.id,
        review.value.version,
        dialogText.value.trim(),
      );
      if (!scopeIsCurrent(scope)) return;
      review.value = {
        ...review.value,
        ...updated,
      };
    } else {
      const dispute = await supportQualitySource.dispute(
        scope.projectId,
        review.value.id,
        review.value.version,
        dialogText.value.trim(),
      );
      if (!scopeIsCurrent(scope)) return;
      review.value.disputes.push(dispute);
    }
    dialog.value = null;
    dialogText.value = "";
    success.value = "Ответ сохранён";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Ответ не сохранён";
  } finally {
    saving.value = false;
  }
}
async function withdrawDispute(dispute: SupportQualityReviewDetailResponseDto["disputes"][number]): Promise<void> {
  if (!review.value) return;
  const scope = mutationScope();
  saving.value = true;
  try {
    const next = await supportQualitySource.withdrawDispute(scope.projectId, dispute);
    if (!scopeIsCurrent(scope)) return;
    review.value.disputes = review.value.disputes.map((item) =>
      item.id === next.id ? next : item,
    );
    success.value = "Апелляция отозвана";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Апелляция не отозвана";
  } finally {
    saving.value = false;
  }
}

function addEvidence(): void {
  draft.evidence.push({ messageId: "", rationale: "" });
}
function removeEvidence(index: number): void {
  draft.evidence.splice(index, 1);
}

watch(
  [projectId, () => auth.user?.id, () => route.params.reviewId, () => permissions.value.join(",")],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>

<template>
  <main class="review-page" aria-labelledby="review-title">
    <header class="review-header">
      <Button
        label="К очереди"
        icon="pi pi-arrow-left"
        text
        severity="secondary"
        @click="router.push('/support/quality')"
      />
      <div v-if="review" class="review-heading">
        <div>
          <span class="eyebrow">Оценка {{ review.id }}</span>
          <h1 id="review-title">Кейс {{ review.caseId }}</h1>
          <p>
            Оператор {{ review.operatorCmsUserId }} ·
            {{ review.selectionReasonCode }}
          </p>
        </div>
        <Tag
          :value="
            review.state === 'DRAFT'
              ? 'Черновик'
              : review.state === 'SUBMITTED'
                ? 'Отправлена'
                : 'Аннулирована'
          "
          :severity="
            review.state === 'DRAFT'
              ? 'secondary'
              : review.state === 'SUBMITTED'
                ? 'success'
                : 'danger'
          "
        />
      </div>
    </header>
    <div v-if="error" class="notice error" role="alert">{{ error }}</div>
    <div v-if="success" class="notice success" role="status">{{ success }}</div>
    <div v-if="loading" class="loading-state">
      <i class="pi pi-spin pi-spinner" /> Загружаем оценку…
    </div>
    <template v-else-if="review">
      <section class="review-spine" aria-label="Итог оценки">
        <div>
          <span>Результат</span><strong>{{ percent }}%</strong
          ><small>{{ total }} из {{ maximum }}</small>
        </div>
        <div>
          <span>Критический итог</span
          ><strong class="compact">{{
            review.criticalFailureOutcome === "NONE"
              ? "Нет"
              : review.criticalFailureOutcome
          }}</strong
          ><small>согласно ревизии карты</small>
        </div>
        <div>
          <span>Доказательства</span><strong>{{ draft.evidence.length }}</strong
          ><small>закреплённых сообщений</small>
        </div>
        <div>
          <span>Версия</span><strong>{{ review.version }}</strong
          ><small>optimistic lock</small>
        </div>
      </section>
      <div class="review-layout">
        <section class="surface score-editor" aria-labelledby="criteria-title">
          <div class="surface-title">
            <div>
              <h2 id="criteria-title">Критерии оценки</h2>
              <p>Неприменимые пункты исключаются из знаменателя.</p>
            </div>
          </div>
          <article
            v-for="(item, index) in draft.scores"
            :key="item.itemCode"
            class="criterion"
            :class="{ disabled: !item.applicable }"
          >
            <div class="criterion-heading">
              <div>
                <span>{{ String(index + 1).padStart(2, "0") }}</span>
                <div>
                  <h3>{{ review.scores[index]?.itemLabel }}</h3>
                  <small>{{ item.itemCode }}</small>
                </div>
              </div>
              <label
                ><input
                  v-model="item.applicable"
                  type="checkbox"
                  :disabled="!isDraft || !canReview"
                />
                Применим</label
              >
            </div>
            <div class="criterion-fields">
              <label
                >Баллы
                <InputNumber
                  v-model="item.score"
                  :min="0"
                  :max="item.maximumScore"
                  :disabled="!isDraft || !item.applicable || !canReview"
                  show-buttons /></label
              ><span class="maximum">из {{ item.maximumScore }}</span
              ><label class="feedback"
                >Комментарий
                <InputText
                  v-model="item.feedback"
                  :disabled="!isDraft || !canReview"
                  placeholder="Что было хорошо и что улучшить"
              /></label>
            </div>
          </article>
        </section>
        <aside class="review-aside">
          <section class="surface">
            <div class="surface-title">
              <div>
                <h2>Доказательства</h2>
                <p>Сообщения закрепляются по ревизии.</p>
              </div>
              <Button
                v-if="isDraft && canReview"
                icon="pi pi-plus"
                text
                rounded
                aria-label="Добавить доказательство"
                @click="addEvidence"
              />
            </div>
            <div class="evidence-list">
              <div
                v-for="(item, index) in draft.evidence"
                :key="index"
                class="evidence"
              >
                <label
                  >ID сообщения<InputText
                    v-model="item.messageId"
                    :disabled="!isDraft || !canReview" /></label
                ><label
                  >Почему важно<Textarea
                    v-model="item.rationale"
                    :disabled="!isDraft || !canReview"
                    rows="2" /></label
                ><Button
                  v-if="isDraft && canReview"
                  icon="pi pi-trash"
                  text
                  severity="danger"
                  size="small"
                  label="Убрать"
                  @click="removeEvidence(index)"
                />
              </div>
              <p v-if="!draft.evidence.length" class="empty-copy">
                Добавьте хотя бы одно сообщение перед отправкой.
              </p>
            </div>
          </section>
          <section class="surface summary">
            <div class="surface-title">
              <div>
                <h2>Итоговая обратная связь</h2>
                <p>Коротко, конкретно и по действиям.</p>
              </div>
            </div>
            <Textarea
              v-model="draft.summary"
              rows="5"
              :disabled="!isDraft || !canReview"
              placeholder="Итог оценки и следующий шаг"
            />
          </section>
          <section
            v-if="review.state === 'SUBMITTED' && canSelfRead"
            class="surface feedback-actions"
          >
            <div class="surface-title">
              <div>
                <h2>Ответ оператора</h2>
                <p>Подтвердите получение или откройте апелляцию.</p>
              </div>
            </div>
            <Button
              v-if="review.acknowledgmentState === 'PENDING'"
              label="Подтвердить"
              icon="pi pi-check"
              @click="acknowledge"
            /><Button
              label="Ответить"
              severity="secondary"
              outlined
              @click="dialog = 'reply'"
            /><Button
              v-if="canDispute"
              label="Открыть апелляцию"
              severity="danger"
              text
              @click="dialog = 'dispute'"
            />
          </section>
          <section v-if="review.disputes.length" class="surface dispute-history">
            <div class="surface-title">
              <div><h2>История апелляций</h2><p>Решение не переписывает оценку.</p></div>
            </div>
            <article v-for="item in review.disputes" :key="item.id">
              <span><Tag :value="item.state" :severity="item.state === 'OPEN' ? 'warn' : 'secondary'" />{{ item.reason }}</span>
              <Button
                v-if="item.state === 'OPEN' && item.openedByCmsUserId === auth.user?.id"
                label="Отозвать"
                text
                severity="secondary"
                :loading="saving"
                @click="withdrawDispute(item)"
              />
            </article>
          </section>
        </aside>
      </div>
      <footer v-if="isDraft && canReview" class="sticky-actions">
        <span
          ><strong>{{ percent }}%</strong> ·
          {{ draft.evidence.length }} доказательств</span
        >
        <div>
          <Button
            label="Сохранить"
            severity="secondary"
            outlined
            :loading="saving"
            @click="save"
          /><Button
            label="Отправить оператору"
            icon="pi pi-send"
            :disabled="!canSubmit"
            :loading="saving"
            @click="submit"
          />
        </div>
      </footer>
    </template>
    <Dialog
      :visible="dialog !== null"
      modal
      :header="dialog === 'reply' ? 'Ответить на оценку' : 'Открыть апелляцию'"
      :style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
      @update:visible="dialog = null"
      ><Textarea
        v-model="dialogText"
        rows="5"
        class="dialog-text"
        :placeholder="
          dialog === 'reply'
            ? 'Комментарий к обратной связи'
            : 'Что необходимо пересмотреть'
        " /><template #footer
        ><Button
          label="Отмена"
          text
          severity="secondary"
          @click="dialog = null" /><Button
          :label="dialog === 'reply' ? 'Отправить' : 'Открыть апелляцию'"
          :severity="dialog === 'reply' ? undefined : 'danger'"
          :disabled="!dialogText.trim()"
          :loading="saving"
          @click="sendDialog" /></template
    ></Dialog>
  </main>
</template>

<style scoped>
.review-page {
  max-width: 1500px;
  margin: 0 auto;
  padding: 20px 24px 96px;
  display: grid;
  gap: 16px;
}
.review-header {
  display: grid;
  gap: 8px;
}
.review-header :deep(.p-button) {
  justify-self: start;
}
.review-heading {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.eyebrow {
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--p-primary-color);
  font-weight: 700;
}
.review-heading h1 {
  margin: 3px 0;
  font-size: clamp(1.6rem, 3vw, 2.25rem);
  letter-spacing: -0.035em;
}
.review-heading p,
.surface-title p {
  margin: 0;
  color: var(--p-text-muted-color);
}
.notice {
  padding: 10px 12px;
  border-radius: 8px;
}
.notice.error {
  background: var(--p-red-50);
  color: var(--p-red-700);
  border: 1px solid var(--p-red-200);
}
.notice.success {
  background: var(--p-green-50);
  color: var(--p-green-700);
  border: 1px solid var(--p-green-200);
}
.review-spine {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  overflow: hidden;
}
.review-spine div {
  padding: 14px 16px;
  border-right: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 2px;
}
.review-spine div:last-child {
  border: 0;
}
.review-spine span,
.review-spine small {
  color: var(--p-text-muted-color);
}
.review-spine strong {
  font-size: 1.7rem;
}
.review-spine strong.compact {
  font-size: 1rem;
  margin: 7px 0;
}
.review-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.review-aside {
  display: grid;
  gap: 16px;
}
.surface {
  border: 1px solid var(--p-content-border-color);
  background: var(--p-content-background);
  border-radius: 12px;
  overflow: hidden;
}
.surface-title {
  padding: 14px 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.surface-title h2 {
  margin: 0 0 3px;
  font-size: 1rem;
}
.criterion {
  padding: 16px;
  border-bottom: 1px solid var(--p-content-border-color);
  display: grid;
  gap: 14px;
}
.criterion:last-child {
  border: 0;
}
.criterion.disabled {
  opacity: 0.56;
}
.criterion-heading,
.criterion-heading > div {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.criterion-heading > div {
  justify-content: flex-start;
}
.criterion-heading > div > span {
  font: 700 0.72rem/1 monospace;
  color: var(--p-text-muted-color);
  padding-top: 4px;
}
.criterion-heading h3 {
  margin: 0;
  font-size: 0.95rem;
}
.criterion-heading small {
  color: var(--p-text-muted-color);
}
.criterion-heading label {
  font-size: 0.78rem;
  display: flex;
  align-items: center;
  gap: 6px;
}
.criterion-fields {
  display: grid;
  grid-template-columns: 100px auto 1fr;
  gap: 10px;
  align-items: end;
}
.criterion-fields label,
.evidence label {
  font-size: 0.74rem;
  color: var(--p-text-muted-color);
  display: grid;
  gap: 5px;
}
.criterion-fields :deep(.p-inputnumber),
.criterion-fields :deep(.p-inputtext) {
  width: 100%;
}
.maximum {
  padding-bottom: 10px;
  color: var(--p-text-muted-color);
}
.summary {
  padding-bottom: 16px;
}
.summary > textarea {
  margin: 16px;
  width: calc(100% - 32px);
}
.evidence-list {
  padding: 12px;
  display: grid;
  gap: 10px;
}
.evidence {
  padding: 12px;
  border: 1px solid var(--p-content-border-color);
  border-radius: 8px;
  display: grid;
  gap: 8px;
}
.evidence :deep(.p-inputtext),
.evidence :deep(.p-textarea) {
  width: 100%;
}
.evidence :deep(.p-button) {
  justify-self: start;
}
.evidence :deep(.p-button-danger.p-button-text) {
  color: var(--p-red-700);
}
.empty-copy {
  font-size: 0.82rem;
  color: var(--p-text-muted-color);
  text-align: center;
}
.feedback-actions {
  padding-bottom: 14px;
}
.feedback-actions > :not(.surface-title) {
  margin: 10px 14px 0;
}
.dispute-history article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--p-content-border-color);
}
.dispute-history article > span {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sticky-actions {
  position: fixed;
  left: var(--app-sidebar-width, 0);
  right: 0;
  bottom: 0;
  z-index: 20;
  padding: 12px 24px;
  background: color-mix(in srgb, var(--p-content-background) 92%, transparent);
  backdrop-filter: blur(12px);
  border-top: 1px solid var(--p-content-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.sticky-actions > div {
  display: flex;
  gap: 8px;
}
.dialog-text {
  width: 100%;
}
.loading-state {
  padding: 60px;
  text-align: center;
  color: var(--p-text-muted-color);
}
@media (max-width: 1050px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
  .review-spine {
    grid-template-columns: repeat(2, 1fr);
  }
  .review-spine div:nth-child(2) {
    border-right: 0;
  }
  .review-spine div:nth-child(-n + 2) {
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
@media (max-width: 600px) {
  .review-page {
    padding: 12px 12px 110px;
  }
  .review-spine {
    grid-template-columns: 1fr 1fr;
  }
  .criterion-fields {
    grid-template-columns: 90px 1fr;
  }
  .criterion-fields .feedback {
    grid-column: 1/-1;
  }
  .sticky-actions {
    left: 0;
    padding: 10px 12px;
    align-items: stretch;
  }
  .sticky-actions > span {
    display: none;
  }
  .sticky-actions > div {
    width: 100%;
  }
  .sticky-actions :deep(.p-button) {
    flex: 1;
  }
  .review-heading {
    align-items: flex-start;
  }
  .review-heading :deep(.p-tag) {
    flex-shrink: 0;
  }
}
@media (max-width: 360px) {
  .review-spine {
    grid-template-columns: 1fr;
  }
  .review-spine div {
    border-right: 0;
    border-bottom: 1px solid var(--p-content-border-color);
  }
}
</style>
