<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";

const props = defineProps<{
  caseTitle: string;
  projectSequence: string;
  summary: string;
  goal: string;
  blockers?: string[];
  limitations?: string[];
}>();

const expanded = ref(false);
const cleanSummary = computed(
  () => props.summary.trim() || "Сводка пока не сформирована.",
);
const cleanGoal = computed(
  () => props.goal.trim() || "Цель обращения пока не сформулирована.",
);
const hasBlockerData = computed(() => props.blockers !== undefined);
const blockers = computed(() =>
  (props.blockers ?? []).map((item) => item.trim()).filter(Boolean),
);
const limitations = computed(() =>
  (props.limitations ?? []).map((item) => item.trim()).filter(Boolean),
);
</script>

<template>
  <section class="case-brief" aria-labelledby="case-brief-title">
    <header class="case-brief__header">
      <div>
        <span class="case-brief__kicker">Контекст обращения</span>
        <h4 id="case-brief-title">Суть обращения</h4>
      </div>
      <Button
        class="case-brief__expand"
        type="button"
        label="Подробнее"
        aria-label="Открыть полный контекст обращения"
        icon="pi pi-expand"
        icon-pos="right"
        severity="secondary"
        size="small"
        text
        @click="expanded = true"
      />
    </header>

    <div class="case-brief__summary">
      <span>Сводка</span>
      <p>{{ cleanSummary }}</p>
    </div>

    <div class="case-brief__rail">
      <article class="case-brief__goal">
        <i class="pi pi-bullseye" aria-hidden="true" />
        <div>
          <span>Цель</span>
          <p>{{ cleanGoal }}</p>
        </div>
      </article>
      <article
        v-if="hasBlockerData"
        class="case-brief__blockers"
        :class="{ 'is-clear': !blockers.length }"
      >
        <i
          :class="blockers.length ? 'pi pi-ban' : 'pi pi-check-circle'"
          aria-hidden="true"
        />
        <div>
          <span>Блокеры · {{ blockers.length }}</span>
          <p>
            {{
              blockers[0] ??
              "Активных препятствий для продолжения работы не зафиксировано."
            }}
          </p>
        </div>
      </article>
    </div>
  </section>

  <Dialog
    v-model:visible="expanded"
    modal
    :header="`Контекст обращения #${projectSequence}`"
    :style="{ width: 'min(720px, calc(100vw - 24px))' }"
    :draggable="false"
  >
    <div class="case-brief-sheet">
      <header>
        <span class="case-brief__kicker">{{ caseTitle }}</span>
        <h3>Что важно знать перед ответом</h3>
      </header>

      <section>
        <span class="case-brief-sheet__label">Сводка</span>
        <p>{{ cleanSummary }}</p>
      </section>
      <section>
        <span class="case-brief-sheet__label">Цель пользователя</span>
        <p>{{ cleanGoal }}</p>
      </section>
      <section v-if="hasBlockerData" class="case-brief-sheet__blockers">
        <span class="case-brief-sheet__label">
          Блокеры
          <small>{{ blockers.length }}</small>
        </span>
        <ul v-if="blockers.length">
          <li v-for="blocker in blockers" :key="blocker">{{ blocker }}</li>
        </ul>
        <p v-else>Активных блокеров нет.</p>
      </section>
      <section v-if="limitations.length">
        <span class="case-brief-sheet__label">
          Ограничения
          <small>{{ limitations.length }}</small>
        </span>
        <ul>
          <li v-for="limitation in limitations" :key="limitation">
            {{ limitation }}
          </li>
        </ul>
      </section>
    </div>
    <template #footer>
      <Button
        type="button"
        label="Закрыть"
        severity="secondary"
        outlined
        @click="expanded = false"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.case-brief {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.case-brief__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.case-brief__header h4 {
  margin: 3px 0 0;
  font-size: 0.88rem;
  font-weight: 750;
  letter-spacing: -0.01em;
  line-height: 1.3;
  text-wrap: balance;
}
.case-brief__kicker,
.case-brief__summary > span,
.case-brief__rail article span,
.case-brief-sheet__label {
  color: var(--text-muted);
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}
.case-brief__expand {
  flex: 0 0 auto;
  min-height: 40px;
}
.case-brief__summary {
  padding: 8px 10px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--brand-soft) 56%, var(--surface-card));
}
.case-brief__summary p,
.case-brief__rail p {
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 0.76rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.case-brief__summary p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.case-brief__rail {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid var(--line);
}
.case-brief__rail article {
  min-width: 0;
  padding: 8px 10px 0;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: start;
  gap: 7px;
}
.case-brief__rail article + article {
  border-left: 1px solid var(--line);
}
.case-brief__rail i {
  margin-top: 2px;
  color: var(--brand-primary);
  font-size: 0.78rem;
}
.case-brief__rail .case-brief__blockers i,
.case-brief__rail .case-brief__blockers span {
  color: var(--status-warning-text);
}
.case-brief__rail .case-brief__blockers.is-clear i,
.case-brief__rail .case-brief__blockers.is-clear span {
  color: var(--status-success-text);
}
.case-brief__rail p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.case-brief-sheet {
  display: grid;
  gap: 12px;
}
.case-brief-sheet > header {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--line);
}
.case-brief-sheet h3 {
  margin: 4px 0 0;
  font-size: 1.05rem;
  letter-spacing: -0.015em;
}
.case-brief-sheet > section {
  padding: 12px;
  border-radius: 12px;
  background: var(--surface-muted);
}
.case-brief-sheet > section:first-of-type {
  background: color-mix(in srgb, var(--brand-soft) 48%, var(--surface-card));
}
.case-brief-sheet__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.case-brief-sheet__label small {
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}
.case-brief-sheet p,
.case-brief-sheet ul {
  margin: 8px 0 0;
  color: var(--text-primary);
  font-size: 0.86rem;
  line-height: 1.6;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.case-brief-sheet ul {
  display: grid;
  gap: 6px;
  padding-left: 18px;
}
.case-brief-sheet__blockers {
  box-shadow: inset 3px 0 0 var(--status-warning-text);
}
</style>
