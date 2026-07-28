<script setup lang="ts">
import type {
  AttributePublicationResponseDto,
  AttributePublicationSummaryResponseDto,
} from "@/shared/api/generated/models";
import {
  actorLabel,
  publicationChangeLabels,
} from "../model/publication-domain";

defineProps<{
  items: AttributePublicationSummaryResponseDto[];
  selected: AttributePublicationResponseDto | null;
}>();

defineEmits<{
  select: [publicationId: string];
}>();

function date(value: string) {
  return new Date(value).toLocaleString("ru-RU");
}
</script>

<template>
  <section aria-labelledby="publication-history-title">
    <header class="history-heading">
      <div>
        <h3 id="publication-history-title">Публикации настроек</h3>
        <p>
          Каждая запись фиксирует применённые настройки Lola. Версия контракта
          может остаться прежней.
        </p>
      </div>
    </header>

    <ol v-if="items.length" class="history-list">
      <li v-for="publication in items" :key="publication.id">
        <button
          type="button"
          :data-publication-id="publication.id"
          :aria-current="selected?.id === publication.id ? 'true' : undefined"
          @click="$emit('select', publication.id)"
        >
          <span class="history-title">
            <strong>Публикация #{{ publication.sequence }}</strong>
            <span>Контракт v{{ publication.contractVersion }}</span>
          </span>
          <span>{{ date(publication.publishedAt) }}</span>
          <span>{{
            actorLabel(
              publication.publishedActorType,
              publication.publishedActorId,
            )
          }}</span>
          <span>{{ publication.publishReason }}</span>
          <span class="change-list">
            <span
              v-for="change in publicationChangeLabels(publication.changes)"
              :key="change"
              >{{ change }}</span
            >
          </span>
        </button>
      </li>
    </ol>
    <p v-else class="empty">Публикаций пока нет.</p>

    <article
      v-if="selected"
      class="history-detail"
      aria-labelledby="publication-detail-title"
    >
      <h4 id="publication-detail-title">
        Публикация #{{ selected.sequence }}
      </h4>
      <dl>
        <div>
          <dt>Эффективный контракт</dt>
          <dd>v{{ selected.contractVersion }}</dd>
        </div>
        <div>
          <dt>Полей</dt>
          <dd>{{ selected.document.fields.length }}</dd>
        </div>
        <div>
          <dt>Canonical hash</dt>
          <dd><code>{{ selected.canonicalHash }}</code></dd>
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

.history-list button[aria-current="true"] {
  border-color: var(--p-primary-color);
}

.history-title,
.change-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: space-between;
}

.change-list {
  justify-content: flex-start;
}

.change-list span {
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  background: var(--p-content-hover-background);
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
