<script setup lang="ts">
import type {
  AttributeContractRevisionResponseDto,
  AttributeContractRevisionSummaryResponseDto,
} from '@/shared/api/generated/models';

defineProps<{
  items: AttributeContractRevisionSummaryResponseDto[];
  selected: AttributeContractRevisionResponseDto | null;
}>();

defineEmits<{
  select: [revisionId: string];
}>();

function date(value: string) {
  return new Date(value).toLocaleString('ru-RU');
}
</script>

<template>
  <section aria-labelledby="contract-history-title">
    <header class="history-heading">
      <h3 id="contract-history-title">Версии контракта</h3>
      <p>
        Producer-интеграция меняется только при изменении ключей, типов, обязательности или правил
        допустимых значений.
      </p>
    </header>

    <ol v-if="items.length" class="history-list">
      <li v-for="revision in items" :key="revision.id">
        <button
          type="button"
          :data-revision-id="revision.id"
          :aria-current="selected?.id === revision.id ? 'true' : undefined"
          @click="$emit('select', revision.id)"
        >
          <span class="history-title">
            <strong>Контракт v{{ revision.version }}</strong>
            <span>{{ revision.fieldCount }} полей</span>
          </span>
          <span>{{ date(revision.publishedAt) }}</span>
          <span>{{ revision.publishReason }}</span>
          <code>{{ revision.canonicalHash }}</code>
        </button>
      </li>
    </ol>
    <p v-else class="empty">Версий контракта пока нет.</p>

    <article v-if="selected" class="history-detail" aria-labelledby="contract-detail-title">
      <h4 id="contract-detail-title">Контракт v{{ selected.version }}</h4>
      <dl>
        <div>
          <dt>Полей</dt>
          <dd>{{ selected.fields.length }}</dd>
        </div>
        <div>
          <dt>Допускается версий</dt>
          <dd>{{ selected.acceptances.length }}</dd>
        </div>
        <div>
          <dt>Canonical hash</dt>
          <dd>
            <code>{{ selected.canonicalHash }}</code>
          </dd>
        </div>
      </dl>
    </article>
  </section>
</template>

<style scoped>
.history-heading h3,
.history-heading p {
  margin: 0;
}

.history-heading p,
.history-list button > span {
  color: var(--p-text-muted-color);
}

.history-list {
  display: grid;
  gap: 0.65rem;
  margin: 1rem 0 0;
  padding: 0;
  list-style: none;
}

.history-list button {
  display: grid;
  width: 100%;
  gap: 0.35rem;
  padding: 0.9rem;
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  color: inherit;
  text-align: left;
  background: var(--p-content-background);
  cursor: pointer;
}

.history-list button[aria-current='true'] {
  border-color: var(--p-primary-color);
}

.history-title {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
}

.history-detail {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 12px;
  background: var(--p-content-hover-background);
}

.history-detail h4 {
  margin: 0;
}

.history-detail dl {
  display: grid;
  gap: 0.6rem;
}

.history-detail dl > div {
  display: grid;
  grid-template-columns: minmax(9rem, 0.4fr) 1fr;
  gap: 0.6rem;
}

.history-detail dt {
  color: var(--p-text-muted-color);
}

.history-detail dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
