<script setup lang="ts">
import { computed } from 'vue'

import { parseMarkdownDocument } from '../model/markdown-document'

const props = defineProps<{ source: string }>()
const blocks = computed(() => parseMarkdownDocument(props.source))

function headingIcon(text: string): string {
  const value = text.toLocaleLowerCase('ru')
  if (value.includes('событ') || value.includes('event')) return 'pi pi-bolt'
  if (value.includes('audience') || value.includes('пользовател')) return 'pi pi-users'
  if (value.includes('eligibility') || value.includes('услов')) return 'pi pi-filter'
  if (value.includes('действ') || value.includes('схем')) return 'pi pi-sitemap'
  if (value.includes('goal') || value.includes('deadline') || value.includes('ожидан')) return 'pi pi-clock'
  if (value.includes('delivery') || value.includes('online')) return 'pi pi-send'
  if (value.includes('чернов') || value.includes('провер') || value.includes('preview')) return 'pi pi-pencil'
  if (value.includes('публик') || value.includes('верс') || value.includes('откат')) return 'pi pi-lock'
  if (value.includes('пример')) return 'pi pi-sparkles'
  if (value.includes('вопрос')) return 'pi pi-question-circle'
  return 'pi pi-bookmark'
}
</script>

<template>
  <article class="markdown-article">
    <template v-for="(block, index) in blocks" :key="block.type === 'heading' ? block.id : `${block.type}-${index}`">
      <component :is="`h${block.level}`" v-if="block.type === 'heading'" :id="block.id" :class="{ 'section-heading': block.level === 2 }">
        <span v-if="block.level === 2" class="heading-icon" aria-hidden="true"><i :class="headingIcon(block.text)" /></span>
        <template v-for="(token, tokenIndex) in block.inline" :key="tokenIndex"><code v-if="token.type === 'code'">{{ token.value }}</code><template v-else>{{ token.value }}</template></template>
      </component>
      <p v-else-if="block.type === 'paragraph'"><template v-for="(token, tokenIndex) in block.inline" :key="tokenIndex"><code v-if="token.type === 'code'">{{ token.value }}</code><template v-else>{{ token.value }}</template></template></p>
      <component :is="block.ordered ? 'ol' : 'ul'" v-else-if="block.type === 'list'">
        <li v-for="(item, itemIndex) in block.items" :key="itemIndex"><template v-for="(token, tokenIndex) in item" :key="tokenIndex"><code v-if="token.type === 'code'">{{ token.value }}</code><template v-else>{{ token.value }}</template></template></li>
      </component>
      <figure v-else class="code-example"><figcaption><i class="pi pi-code" /> Пример</figcaption><pre tabindex="0" aria-label="Пример конфигурации сценария"><code>{{ block.value }}</code></pre></figure>
    </template>
  </article>
</template>

<style scoped>
.markdown-article{min-width:0;color:var(--surface-emphasis-hover)}.markdown-article :deep(h1){display:none}.markdown-article :deep(h2),.markdown-article :deep(h3){scroll-margin-top:26px}.markdown-article :deep(h2){display:flex;align-items:center;gap:12px;margin:48px 0 16px;padding-top:30px;border-top:1px solid var(--line);font-size:1.48rem}.markdown-article :deep(h2:first-of-type){margin-top:8px;padding-top:0;border-top:0}.markdown-article :deep(h3){margin:28px 0 10px;font-size:1rem;color:var(--text-secondary)}.heading-icon{display:grid;place-items:center;flex:0 0 38px;height:38px;border-radius:12px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.88rem}.markdown-article p{max-width:78ch;margin:0 0 14px;color:var(--text-secondary);font-size:.94rem;line-height:1.72}.markdown-article ul,.markdown-article ol{display:grid;gap:8px;max-width:78ch;margin:0 0 20px;padding-left:25px;color:var(--text-secondary)}.markdown-article li{padding-left:4px;line-height:1.58}.markdown-article li::marker{color:var(--status-violet-text);font-weight:800}.markdown-article code{border-radius:6px;background:var(--surface-subtle);padding:2px 5px;color:var(--status-violet-text);font:600 .84em ui-monospace,SFMono-Regular,Menlo,monospace}.code-example{max-width:78ch;margin:18px 0 24px;overflow:hidden;border:1px solid var(--border-default);border-radius:16px;background:var(--surface-emphasis);box-shadow:var(--shadow-raised)}.code-example figcaption{display:flex;align-items:center;gap:7px;padding:10px 14px;border-bottom:1px solid var(--border-on-emphasis);color:var(--text-on-emphasis-muted);font-size:.68rem;text-transform:uppercase;letter-spacing:.1em}.code-example figcaption i{color:var(--brand)}.code-example pre{margin:0;padding:17px 18px;overflow:auto;color:var(--text-on-emphasis);font:500 .78rem/1.65 ui-monospace,SFMono-Regular,Menlo,monospace}.code-example pre code{padding:0;background:transparent;color:inherit;font:inherit}@media(max-width:700px){.markdown-article :deep(h2){align-items:flex-start;font-size:1.25rem}.markdown-article p{font-size:.9rem}.code-example{border-radius:12px}}
.markdown-article{color:var(--text-primary)}
</style>
