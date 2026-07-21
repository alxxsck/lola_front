<script setup lang="ts">
const guides = [
  {
    category: 'Сценарии',
    title: 'Как работают сценарии Lola',
    description: 'От событий, аудитории и условий до действий, ожиданий, публикации и безопасного отката.',
    icon: 'pi pi-sitemap',
    to: { name: 'scenario-guide' },
    meta: ['30 разделов', '20 минут', 'С примерами'],
  },
  {
    category: 'Данные пользователей',
    title: 'Поля профиля пользователей',
    description: 'Создание полей, обязательность, версии, публикация, зависимости, архивирование и качество данных.',
    icon: 'pi pi-id-card',
    to: { name: 'profile-fields-guide' },
    meta: ['20 разделов', '18 минут', 'Полный пример'],
  },
  {
    category: 'Аудитории',
    title: 'Сегменты пользователей',
    description: 'Конструктор правил, свежесть данных, проверки, версии, сценарии и пять практических примеров.',
    icon: 'pi pi-users',
    to: { name: 'segments-guide' },
    meta: ['30 разделов', '17 минут', '5 примеров'],
  },
]
</script>

<template>
  <section class="documentation-page">
    <header class="documentation-hero">
      <div class="hero-copy">
        <span class="hero-kicker"><i class="pi pi-book" /> База руководств</span>
        <h1>Документация Lola</h1>
        <p>Понятные руководства по настройке Lola — от первого сценария до ежедневной работы с событиями и действиями.</p>
      </div>
      <div class="hero-library" aria-hidden="true">
        <span class="library-card card-back"><i class="pi pi-bolt" /></span>
        <span class="library-card card-middle"><i class="pi pi-directions-alt" /></span>
        <span class="library-card card-front"><i class="pi pi-sitemap" /></span>
      </div>
    </header>

    <div class="documentation-heading">
      <div><span>Все материалы</span><h2>Руководства</h2></div>
      <strong>{{ guides.length }} руководства</strong>
    </div>

    <div class="guide-grid">
      <RouterLink v-for="guide in guides" :key="guide.title" :to="guide.to" class="guide-card">
        <span class="guide-icon"><i :class="guide.icon" /></span>
        <span class="guide-card-copy"><small>{{ guide.category }}</small><strong>{{ guide.title }}</strong><span>{{ guide.description }}</span></span>
        <span class="guide-meta"><span v-for="item in guide.meta" :key="item"><i class="pi pi-check" /> {{ item }}</span></span>
        <span class="guide-action">Открыть руководство <i class="pi pi-arrow-right" /></span>
      </RouterLink>
    </div>

    <aside class="documentation-note">
      <span><i class="pi pi-sparkles" /></span>
      <div><strong>Начните с руководства перед настройкой</strong><p>Каждая статья объясняет не только кнопки, но и последствия публикации, версии, ограничения и безопасный порядок работы.</p></div>
    </aside>
  </section>
</template>

<style scoped>
.documentation-page{max-width:1320px;margin:0 auto;padding:28px 34px 64px}.documentation-hero{position:relative;display:grid;grid-template-columns:minmax(0,1fr) 330px;align-items:center;gap:40px;min-height:300px;overflow:hidden;padding:46px 52px;border-radius:28px;background:linear-gradient(125deg,var(--surface-emphasis) 0%,var(--surface-emphasis-raised) 62%,var(--brand-soft) 100%);color:var(--text-on-emphasis);box-shadow:var(--shadow-raised)}.documentation-hero:before{content:'';position:absolute;right:-70px;top:-180px;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 20%,transparent),transparent 68%)}.hero-copy{position:relative;z-index:1}.hero-kicker{display:inline-flex;align-items:center;gap:8px;color:var(--brand);font-size:.7rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.documentation-hero h1{max-width:720px;margin:16px 0 0;font-size:clamp(2.4rem,5vw,4.2rem);line-height:1}.documentation-hero p{max-width:680px;margin:18px 0 0;color:var(--text-on-emphasis-muted);font-size:1rem;line-height:1.65}.hero-library{position:relative;z-index:1;height:190px}.library-card{position:absolute;display:grid;place-items:center;width:150px;height:178px;border-radius:24px;font-size:1.65rem;box-shadow:var(--shadow-dialog)}.card-back{right:120px;top:5px;transform:rotate(-10deg);background:var(--surface-subtle);color:var(--surface-emphasis-raised)}.card-middle{right:58px;top:0;transform:rotate(4deg);background:var(--status-violet);color:var(--on-status-violet)}.card-front{right:0;top:15px;transform:rotate(12deg);background:var(--accent);color:var(--surface-emphasis)}.documentation-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:38px 0 18px}.documentation-heading span{color:var(--muted);font-size:.66rem;text-transform:uppercase;letter-spacing:.11em}.documentation-heading h2{margin:4px 0 0;font-size:1.65rem}.documentation-heading>strong{padding:7px 10px;border-radius:9px;background:var(--status-violet-soft);color:var(--status-violet-text);font-size:.7rem}.guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.guide-card{position:relative;display:grid;grid-template-columns:58px minmax(0,1fr);gap:18px;padding:25px;border:1px solid var(--line);border-radius:22px;background:linear-gradient(135deg,var(--surface-card) 0%,var(--status-violet-soft) 68%,var(--status-success-soft) 140%);box-shadow:var(--shadow-raised);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.guide-card:hover{transform:translateY(-3px);border-color:var(--status-violet);box-shadow:var(--shadow-raised)}.guide-icon{display:grid;place-items:center;width:58px;height:58px;border-radius:18px;background:var(--surface-emphasis-raised);color:var(--brand);font-size:1.15rem}.guide-card-copy{min-width:0}.guide-card-copy small,.guide-card-copy strong,.guide-card-copy>span{display:block}.guide-card-copy small{color:var(--status-violet-text);font-size:.62rem;font-weight:800;text-transform:uppercase;letter-spacing:.11em}.guide-card-copy strong{margin-top:5px;color:var(--ink);font:750 1.16rem/1.25 var(--font-display)}.guide-card-copy>span{max-width:58ch;margin-top:8px;color:var(--muted);font-size:.78rem;line-height:1.55}.guide-meta{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;padding-top:4px}.guide-meta span{display:inline-flex;align-items:center;gap:5px;padding:6px 8px;border-radius:8px;background:var(--surface-subtle);color:var(--text-secondary);font-size:.64rem}.guide-meta i{color:var(--status-violet-text);font-size:.58rem}.guide-action{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;padding-top:15px;border-top:1px solid var(--line);color:var(--status-violet-text);font-size:.73rem;font-weight:750}.documentation-note{display:flex;align-items:center;gap:14px;margin-top:22px;padding:18px 20px;border:1px dashed var(--border-default);border-radius:17px;background:var(--surface-subtle)}.documentation-note>span{display:grid;place-items:center;flex:0 0 40px;height:40px;border-radius:12px;background:var(--status-success-soft);color:var(--status-success-text)}.documentation-note strong,.documentation-note p{display:block}.documentation-note strong{font-size:.8rem}.documentation-note p{margin:4px 0 0;color:var(--muted);font-size:.71rem;line-height:1.45}@media(max-width:900px){.documentation-hero{grid-template-columns:1fr}.hero-library{display:none}.guide-grid{grid-template-columns:1fr}}@media(max-width:700px){.documentation-page{padding:16px 14px 44px}.documentation-hero{min-height:auto;padding:30px 24px;border-radius:21px}.documentation-heading{margin-top:28px}.guide-card{grid-template-columns:48px minmax(0,1fr);padding:19px;gap:14px}.guide-icon{width:48px;height:48px;border-radius:15px}.documentation-note{align-items:flex-start}}
.card-back{color:var(--text-primary)}
</style>
