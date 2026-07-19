<script setup lang="ts">
import { computed } from 'vue'

import { parseMarkdownDocument } from '../model/markdown-document'
import MarkdownDocument from './MarkdownDocument.vue'

type GuideMeta = { icon: string; label: string }
type GuideVisualNode = { icon: string; tone?: 'base' | 'highlight' | 'accent' }

const props = defineProps<{
  source: string
  title: string
  description: string
  meta: GuideMeta[]
  visualNodes: GuideVisualNode[]
  visualCaption: string
  contentLabel: string
  sectionIcon: string
  footerTitle: string
  footerAction: string
  footerRouteName: string
}>()

const sections = computed(() => parseMarkdownDocument(props.source)
  .filter((block) => block.type === 'heading' && block.level === 2)
  .map((block) => block.type === 'heading' ? ({ id: block.id, text: block.text }) : null)
  .filter((block): block is { id: string; text: string } => Boolean(block)))
</script>

<template>
  <div class="admin-guide-page">
    <RouterLink :to="{ name: 'documentation' }" class="guide-back"><i class="pi pi-arrow-left" /> Вся документация</RouterLink>
    <header class="guide-hero">
      <div class="hero-copy">
        <span class="guide-kicker"><i class="pi pi-sparkles" /> Руководство для администратора</span>
        <h1>{{ title }}</h1>
        <p>{{ description }}</p>
        <div class="guide-meta"><span v-for="item in meta" :key="item.label"><i :class="item.icon" /> {{ item.label }}</span></div>
      </div>
      <div class="hero-visual" aria-hidden="true">
        <template v-for="(node, index) in visualNodes" :key="`${node.icon}-${index}`">
          <span v-if="index" class="visual-line" />
          <span class="visual-node" :class="node.tone"><i :class="node.icon" /></span>
        </template>
        <small>{{ visualCaption }}</small>
      </div>
    </header>

    <div class="guide-layout">
      <aside class="guide-nav card" :aria-label="`Содержание: ${title}`">
        <div><span>На этой странице</span><strong>{{ sections.length }} разделов</strong></div>
        <a class="skip-guide" href="#guide-content">Перейти к руководству <i class="pi pi-arrow-down" /></a>
        <nav><a v-for="section in sections" :key="section.id" :href="`#${section.id}`">{{ section.text }}</a></nav>
      </aside>
      <section id="guide-content" class="guide-content card" :aria-label="contentLabel">
        <MarkdownDocument :source="source" :fallback-heading-icon="sectionIcon" />
        <footer>
          <span><i class="pi pi-check-circle" /> {{ footerTitle }}</span>
          <RouterLink :to="{ name: footerRouteName }">{{ footerAction }} <i class="pi pi-arrow-right" /></RouterLink>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
.admin-guide-page{max-width:1320px;margin:0 auto;padding:28px 34px 64px}.guide-back{display:inline-flex;align-items:center;gap:8px;margin:0 0 14px;color:var(--status-violet-text);font-size:.72rem;font-weight:750}.guide-back:hover{color:var(--status-violet-text)}.guide-hero{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 360px;align-items:center;gap:40px;min-height:310px;overflow:hidden;padding:46px 52px;border-radius:28px;background:var(--surface-emphasis);color:var(--text-on-emphasis);box-shadow:var(--shadow-raised)}.guide-hero:before{content:'';position:absolute;right:-80px;top:-130px;width:430px;height:430px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 18%,transparent),transparent 68%)}.hero-copy{position:relative;z-index:1}.guide-kicker{display:inline-flex;align-items:center;gap:8px;color:var(--brand);font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.guide-hero h1{max-width:760px;margin-top:16px;font-size:clamp(2.3rem,5vw,4.1rem);line-height:1}.guide-hero p{max-width:680px;margin:17px 0 0;color:var(--text-on-emphasis-muted);font-size:1rem}.guide-meta{display:flex;flex-wrap:wrap;gap:9px;margin-top:24px}.guide-meta span{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--border-on-emphasis);border-radius:10px;background:var(--surface-emphasis-hover);color:var(--text-on-emphasis-muted);font-size:.67rem}.guide-meta i{color:var(--brand)}.hero-visual{position:relative;z-index:1;display:flex;align-items:center;justify-content:center}.visual-node{display:grid;place-items:center;flex:0 0 58px;width:58px;height:58px;border-radius:19px;background:var(--surface-subtle);color:var(--text-primary);font-size:1.1rem;box-shadow:var(--shadow-dialog)}.visual-node.highlight{background:var(--status-violet);color:var(--on-status-violet);transform:translateY(-16px)}.visual-node.accent{background:var(--accent);color:var(--surface-emphasis)}.visual-line{width:42px;height:2px;background:linear-gradient(90deg,var(--text-secondary),var(--brand))}.hero-visual small{position:absolute;top:82px;left:0;width:100%;color:var(--text-on-emphasis-muted);text-align:center;font-size:.68rem}.guide-layout{display:grid;grid-template-columns:265px minmax(0,1fr);align-items:start;gap:22px;margin-top:22px}.guide-nav{position:sticky;top:18px;max-height:calc(100vh - 36px);overflow:auto;padding:18px}.guide-nav>div{padding:2px 3px 14px;border-bottom:1px solid var(--line)}.guide-nav span,.guide-nav strong{display:block}.guide-nav span{color:var(--muted);font-size:.62rem;text-transform:uppercase;letter-spacing:.1em}.guide-nav strong{margin-top:4px;font-size:.78rem}.guide-nav nav{display:grid;gap:2px;margin-top:11px}.guide-nav a{padding:7px 8px;border-radius:8px;color:var(--text-secondary);font-size:.68rem;line-height:1.35}.guide-nav a:hover{background:var(--status-violet-soft);color:var(--status-violet-text)}.skip-guide{display:none}.guide-content{min-width:0;padding:34px 42px 40px;scroll-margin-top:16px}.guide-content footer{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:48px;padding:20px 22px;border-radius:16px;background:var(--status-success-soft);color:var(--status-success-text)}.guide-content footer span,.guide-content footer a{display:flex;align-items:center;gap:8px;font-weight:700}.guide-content footer a{padding:10px 13px;border-radius:10px;background:var(--surface-emphasis);color:var(--text-on-emphasis);font-size:.75rem}@media(max-width:1000px){.guide-hero{grid-template-columns:1fr}.hero-visual{display:none}.guide-layout{grid-template-columns:1fr}.guide-nav{position:static;max-height:none}.guide-nav nav{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.admin-guide-page{padding:16px 14px 44px}.guide-hero{min-height:auto;padding:30px 24px;border-radius:21px}.guide-meta{display:grid}.guide-content{padding:24px 18px 30px}.skip-guide{display:flex;align-items:center;justify-content:space-between;margin:12px 0 4px;padding:10px 11px!important;background:var(--status-violet-soft);color:var(--status-violet-text)!important;font-weight:750}.guide-nav nav{grid-template-columns:1fr;max-height:230px;overflow:auto;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:7px 0}.guide-content footer{align-items:flex-start;flex-direction:column}.guide-content footer a{width:100%;justify-content:center}}
</style>
