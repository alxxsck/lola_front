<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import type { createSupportInternalKnowledgeController } from "../model/use-support-internal-knowledge";
import type { SupportKnowledgeSearchItemResponseDto } from "@/shared/api/generated/models";
import { relativeTime } from "@/shared/lib/format";

const props = defineProps<{ controller: ReturnType<typeof createSupportInternalKnowledgeController> }>();
const content = ref<HTMLTextAreaElement | null>(null);
const selectedQuote = ref("");
const searchQuery = ref(props.controller.query.value);
const activeItem = computed(() => {
  const document = props.controller.selected.value;
  return document ? props.controller.items.value.find((item) => item.documentId === document.documentId && item.revisionId === document.revisionId) ?? null : null;
});

function submitSearch(): void {
  props.controller.closeDocument();
  props.controller.setQuery(searchQuery.value);
  selectedQuote.value = "";
  void props.controller.search();
}

function selectText(): void {
  const element = content.value;
  if (!element) return;
  selectedQuote.value = element.value.slice(element.selectionStart, element.selectionEnd).trim().slice(0, 2_000);
}

async function open(item: SupportKnowledgeSearchItemResponseDto): Promise<void> {
  selectedQuote.value = "";
  if (item.sourceType === "FILE") {
    await props.controller.download(item);
    return;
  }
  await props.controller.open(item);
  await nextTick();
  content.value?.focus();
}
</script>

<template>
  <section class="knowledge-pane" aria-label="Внутренняя база знаний">
    <header class="knowledge-heading">
      <div>
        <span class="knowledge-kicker">Только для поддержки</span>
        <h3>Внутренняя база знаний</h3>
        <p>Найдите проверенный материал и вставьте цитату или ссылку в черновик ответа.</p>
      </div>
      <span class="knowledge-lock"><i class="pi pi-lock" aria-hidden="true" /> Внутренний источник</span>
    </header>

    <form class="knowledge-search" role="search" @submit.prevent="submitSearch">
      <i class="pi pi-search" aria-hidden="true" />
      <InputText v-model="searchQuery" aria-label="Поиск во внутренней базе знаний" placeholder="Например, депозит не поступил" maxlength="240" />
      <Button type="submit" label="Найти" icon="pi pi-arrow-right" :disabled="!searchQuery.trim() || controller.loading.value" :loading="controller.loading.value" />
    </form>

    <Message v-if="controller.error.value" severity="warn" :closable="false" role="alert">{{ controller.error.value }}</Message>
    <div v-if="controller.freshness.value" class="knowledge-freshness">
      <span :class="`state-${controller.freshness.value.state.toLowerCase()}`">Материалы актуальны</span>
      <span>Каталог {{ controller.freshness.value.catalogGeneration }}</span>
      <span>{{ relativeTime(controller.freshness.value.evaluatedAt) }}</span>
    </div>

    <div v-if="controller.selected.value && activeItem" class="knowledge-document">
      <Button class="knowledge-back" label="К результатам" icon="pi pi-arrow-left" severity="secondary" text @click="controller.closeDocument" />
      <div class="knowledge-document-title">
        <span class="source-icon"><i class="pi pi-align-left" aria-hidden="true" /></span>
        <div>
          <h4>{{ controller.selected.value.title }}</h4>
          <p>Редакция {{ controller.selected.value.revisionNumber }} · {{ controller.selected.value.language?.toUpperCase() ?? 'без языка' }} · опубликовано {{ relativeTime(controller.selected.value.publishedAt) }}</p>
        </div>
      </div>
      <textarea ref="content" class="knowledge-content" :value="controller.selected.value.contentText" readonly aria-label="Текст внутреннего материала. Выделите фрагмент для цитирования" @select="selectText" @keyup="selectText" />
      <p class="selection-hint">{{ selectedQuote ? `Выбрано ${selectedQuote.length} символов` : 'Выделите точный фрагмент текста для цитаты.' }}</p>
      <div class="knowledge-actions">
        <Button label="Вставить цитату" icon="pi pi-quote-right" :disabled="!controller.canInsert.value || !selectedQuote || controller.inserting.value" :loading="controller.inserting.value" @click="controller.insert(activeItem, 'QUOTE', selectedQuote)" />
        <Button label="Вставить ссылку" icon="pi pi-link" severity="secondary" outlined :disabled="!controller.canInsert.value || controller.inserting.value" @click="controller.insert(activeItem, 'LINK')" />
        <Button v-if="activeItem.allowedActions.includes('DOWNLOAD')" label="Скачать" icon="pi pi-download" severity="secondary" text :loading="controller.downloadingId.value === activeItem.documentId" @click="controller.download(activeItem)" />
      </div>
      <p v-if="controller.activeCitation.value" class="knowledge-edit-note">Источник уже добавлен в ответ. Чтобы выбрать другой, сначала удалите текущий источник вместе с производным текстом.</p>
      <p v-else-if="!controller.canInsert.value" class="knowledge-edit-note">Материал доступен для чтения, но добавлять источник в ответ сейчас нельзя.</p>
      <p class="knowledge-edit-note">Сам материал видит только команда поддержки. Вставленный фрагмент попадёт в публичный черновик; источник и точная редакция сохранятся в истории сообщения.</p>
    </div>

    <template v-else>
      <ul v-if="controller.items.value.length" class="knowledge-results" aria-label="Результаты поиска">
        <li v-for="item in controller.items.value" :key="`${item.documentId}:${item.revisionId}`">
          <button type="button" :disabled="controller.openingId.value === item.documentId" @click="open(item)">
            <span class="source-icon"><i :class="item.sourceType === 'FILE' ? 'pi pi-file' : 'pi pi-align-left'" aria-hidden="true" /></span>
            <span class="result-copy"><strong>{{ item.title }}</strong><small>{{ item.snippet }}</small><span>Редакция {{ item.revisionNumber }} · {{ item.language?.toUpperCase() ?? 'без языка' }}</span></span>
            <i :class="item.sourceType === 'FILE' ? 'pi pi-download' : 'pi pi-chevron-right'" class="result-arrow" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <div v-else-if="!controller.loading.value && controller.query.value.trim()" class="knowledge-empty">
        <i class="pi pi-book" aria-hidden="true" /><strong>Материалов не найдено</strong><p>Уточните формулировку или проверьте тему обращения.</p>
      </div>
      <div v-else-if="!controller.loading.value" class="knowledge-empty knowledge-empty--idle">
        <i class="pi pi-sparkles" aria-hidden="true" /><strong>Ответ опирается на проверенный источник</strong><p>Поиск ограничен текущим проектом, обращением и доступом оператора.</p>
      </div>
      <Button v-if="controller.nextCursor.value" class="load-more" label="Показать ещё" icon="pi pi-chevron-down" severity="secondary" outlined :loading="controller.loading.value" @click="controller.search(controller.nextCursor.value ?? undefined)" />
    </template>
  </section>
</template>

<style scoped>
.knowledge-pane { display:grid; gap:14px; min-width:0; }
.knowledge-heading { display:grid; gap:10px; }
.knowledge-kicker { color:var(--text-muted); font-size:.66rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.knowledge-heading h3 { margin:4px 0 0; color:var(--text-primary); font-size:1rem; }
.knowledge-heading p,.knowledge-edit-note,.selection-hint { margin:5px 0 0; color:var(--text-muted); font-size:.7rem; line-height:1.5; }
.knowledge-lock { width:max-content; display:inline-flex; align-items:center; gap:6px; min-height:26px; padding:0 9px; border-radius:999px; background:var(--status-warning-soft); color:var(--status-warning-text); font-size:.66rem; font-weight:700; }
.knowledge-search { display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:center; gap:8px; padding:6px 6px 6px 12px; border:1px solid var(--line); border-radius:12px; background:var(--surface); transition:border-color 140ms ease,box-shadow 140ms ease; }
.knowledge-search:focus-within { border-color:var(--brand); box-shadow:0 0 0 3px var(--focus-ring); }
.knowledge-search>i { color:var(--text-muted); }
.knowledge-search :deep(.p-inputtext) { width:100%; min-width:0; padding:8px 0; border:0; box-shadow:none; background:transparent; font-size:.76rem; }
.knowledge-search :deep(.p-button) { min-height:36px; }
.knowledge-freshness { display:flex; flex-wrap:wrap; gap:6px; }
.knowledge-freshness span { padding:4px 7px; border-radius:7px; background:var(--surface-muted); color:var(--text-muted); font-size:.64rem; }
.knowledge-freshness .state-current { background:var(--status-success-soft); color:var(--status-success-text); }
.knowledge-results { display:grid; gap:0; margin:0; padding:0; list-style:none; border-block:1px solid var(--line); }
.knowledge-results li+li { border-top:1px solid var(--line); }
.knowledge-results button { width:100%; display:grid; grid-template-columns:auto minmax(0,1fr) auto; align-items:start; gap:10px; padding:12px 4px; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; transition:background-color 140ms ease,transform 120ms ease; }
.knowledge-results button:hover { background:var(--surface-muted); }
.knowledge-results button:active { transform:scale(.99); }
.knowledge-results button:focus-visible { outline:3px solid var(--focus-ring); outline-offset:-3px; }
.source-icon { width:30px; height:30px; display:grid; place-items:center; flex:0 0 auto; border-radius:9px; background:var(--brand-soft); color:var(--text-brand); }
.result-copy { min-width:0; display:grid; gap:4px; }
.result-copy strong { overflow:hidden; color:var(--text-primary); font-size:.76rem; line-height:1.35; text-overflow:ellipsis; white-space:nowrap; }
.result-copy small { display:-webkit-box; overflow:hidden; color:var(--text-muted); font-size:.68rem; line-height:1.45; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.result-copy>span { color:var(--text-muted); font-size:.62rem; }
.result-arrow { align-self:center; color:var(--text-muted); font-size:.7rem; }
.knowledge-empty { min-height:170px; display:grid; place-items:center; align-content:center; gap:7px; padding:20px; border:1px dashed var(--line); border-radius:14px; color:var(--text-muted); text-align:center; }
.knowledge-empty>i { font-size:1.2rem; color:var(--text-brand); }
.knowledge-empty strong { color:var(--text-primary); font-size:.8rem; }
.knowledge-empty p { max-width:17rem; margin:0; font-size:.7rem; line-height:1.5; }
.knowledge-document { display:grid; gap:12px; }
.knowledge-back { width:max-content; margin-left:-8px; }
.knowledge-document-title { display:flex; align-items:flex-start; gap:10px; }
.knowledge-document-title h4 { margin:0; color:var(--text-primary); font-size:.84rem; line-height:1.35; }
.knowledge-document-title p { margin:4px 0 0; color:var(--text-muted); font-size:.64rem; line-height:1.4; }
.knowledge-content { width:100%; min-height:210px; resize:vertical; padding:12px; border:1px solid var(--line); border-radius:12px; background:var(--surface-muted); color:var(--text-primary); font:inherit; font-size:.74rem; line-height:1.6; }
.knowledge-content:focus-visible { outline:3px solid var(--focus-ring); outline-offset:2px; }
.knowledge-actions { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; }
.knowledge-actions :deep(.p-button) { justify-content:center; min-width:0; }
.knowledge-actions :deep(.p-button:last-child) { grid-column:1/-1; }
.load-more { width:100%; }
@media (max-width:767px) { .knowledge-heading { grid-template-columns:minmax(0,1fr) auto; align-items:start; }.knowledge-lock { grid-column:1/-1; }.knowledge-search { grid-template-columns:auto minmax(0,1fr); }.knowledge-search :deep(.p-button) { grid-column:1/-1; width:100%; }.knowledge-content { min-height:180px; }.knowledge-actions { grid-template-columns:1fr; }.knowledge-actions :deep(.p-button:last-child) { grid-column:auto; }.result-copy strong { white-space:normal; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }}
@media (prefers-reduced-motion:reduce) { .knowledge-search,.knowledge-results button { transition:none; }}
</style>
