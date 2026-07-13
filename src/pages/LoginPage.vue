<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import { loginDefaults } from '@/features/auth/login-defaults'
import { dataMode } from '@/shared/config/data-mode'

const defaults = loginDefaults(dataMode)
const login = ref(defaults.login)
const password = ref(defaults.password)
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')
const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

async function submit() {
  error.value = ''
  const normalizedLogin = login.value.trim()
  if (!normalizedLogin || normalizedLogin.length > 255) { error.value = 'Введите email или имя пользователя'; return }
  if (password.value.length < 8) { error.value = 'Пароль должен содержать минимум 8 символов'; return }
  loading.value = true
  try {
    await auth.login(normalizedLogin, password.value)
    if (auth.requiresProjectSelection) return
    await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/overview')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Не удалось войти' }
  finally { loading.value = false }
}

async function chooseProject(projectId: string) {
  auth.selectProject(projectId)
  await router.replace(typeof route.query.redirect === 'string' ? route.query.redirect : '/overview')
}
</script>

<template>
  <main class="login-page">
    <section class="intro">
      <div class="logo"><span>Lo</span><strong>Lola</strong></div>
      <div class="intro-copy">
        <div class="eyebrow">Control room</div>
        <h1>Настраивайте путь пользователя, пока Lola ведёт его к цели.</h1>
        <p>События, интерфейс и сценарии — в одном спокойном рабочем пространстве.</p>
      </div>
      <div class="signal-card">
        <div class="signal-avatar">L</div>
        <div><span class="signal-live"><i /> LIVE</span><strong>registration_completed</strong><small>Сценарий «После регистрации» запущен</small></div>
      </div>
      <div class="orb orb-one" /><div class="orb orb-two" />
    </section>
    <section class="login-panel">
      <form v-if="!auth.requiresProjectSelection" class="login-form" @submit.prevent="submit">
        <div class="mobile-logo logo"><span>Lo</span><strong>Lola</strong></div>
        <div><div class="eyebrow">Добро пожаловать</div><h2>Войти в Lola</h2><p>После входа мы откроем доступный вам проект.</p></div>
        <div class="field"><label for="login">Email или имя пользователя</label><InputText id="login" v-model="login" type="text" size="large" autofocus autocomplete="username" placeholder="name@company.com или admin" /></div>
        <div class="field"><div class="row-between"><label for="password">Пароль</label><span class="forgot" title="Обратитесь к администратору проекта">Забыли пароль?</span></div><div class="password-wrap"><InputText id="password" v-model="password" :type="showPassword ? 'text' : 'password'" size="large" placeholder="Введите пароль" /><button type="button" :aria-label="showPassword ? 'Скрыть пароль' : 'Показать пароль'" @click="showPassword = !showPassword"><i :class="showPassword ? 'pi pi-eye-slash' : 'pi pi-eye'" /></button></div></div>
        <Message v-if="error" severity="error" size="small">{{ error }}</Message>
        <Button type="submit" label="Продолжить" icon="pi pi-arrow-right" icon-pos="right" size="large" :loading="loading" fluid />
        <p class="mode-note"><i class="pi pi-info-circle" /> {{ auth.mode === 'mock' ? 'Demo-режим: подойдёт любой логин.' : 'Доступ проверяется по участникам проекта.' }}</p>
      </form>
      <section v-else class="login-form project-choice">
        <div><div class="eyebrow">Рабочее пространство</div><h2>Выберите проект</h2><p>У вашей учётной записи есть доступ к нескольким проектам.</p></div>
        <button v-for="item in auth.projects" :key="item.id" type="button" class="project-option" @click="chooseProject(item.id)">
          <span class="project-option__mark">{{ item.name.slice(0, 2).toUpperCase() }}</span>
          <span><strong>{{ item.name }}</strong><small>{{ item.organization?.name ?? item.slug }}</small></span>
          <i class="pi pi-arrow-right" />
        </button>
      </section>
      <footer>© 2026 Lola AI · Безопасность · Поддержка</footer>
    </section>
  </main>
</template>

<style scoped>
.login-page{min-height:100vh;display:grid;grid-template-columns:minmax(420px,1.08fr) minmax(420px,.92fr);background:white}.intro{position:relative;overflow:hidden;background:#22251f;color:white;padding:42px 52px;display:flex;flex-direction:column}.logo{display:flex;align-items:center;gap:11px;font:700 1.2rem Manrope}.logo span{display:grid;place-items:center;width:40px;height:40px;background:var(--accent);color:#22251f;border-radius:13px;transform:rotate(-4deg)}.intro-copy{margin:auto 0;max-width:660px;position:relative;z-index:2}.intro-copy .eyebrow{color:var(--accent)}.intro-copy h1{font-size:clamp(2.7rem,5vw,5.4rem);line-height:.98;margin:12px 0 26px}.intro-copy p{max-width:520px;color:#b9bdb3;font-size:1.05rem}.signal-card{position:relative;z-index:2;align-self:flex-end;display:flex;gap:14px;width:min(390px,90%);padding:16px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:18px;backdrop-filter:blur(14px)}.signal-avatar{display:grid;place-items:center;width:48px;height:48px;border-radius:15px;background:#8e77f5;font:700 1.2rem Manrope}.signal-card strong,.signal-card small,.signal-live{display:block}.signal-card strong{font-size:.83rem;margin:4px 0}.signal-card small{color:#aeb2a7}.signal-live{font-size:.6rem;letter-spacing:.12em;color:#84d98b}.signal-live i{display:inline-block;width:5px;height:5px;background:#84d98b;border-radius:50%;margin-right:4px}.orb{position:absolute;border-radius:50%;filter:blur(2px)}.orb-one{width:440px;height:440px;background:radial-gradient(circle at 35% 35%,rgba(215,255,100,.22),transparent 67%);right:-100px;top:-80px}.orb-two{width:520px;height:520px;background:radial-gradient(circle,rgba(142,119,245,.17),transparent 70%);left:-150px;bottom:-220px}.login-panel{display:flex;flex-direction:column;justify-content:center;align-items:center;padding:48px}.login-form{width:min(430px,100%);display:flex;flex-direction:column;gap:22px}.login-form h2{font-size:2.1rem;margin:0}.login-form p{color:var(--muted);margin:8px 0 0}.mode-note{font-size:.76rem!important;text-align:center}.mode-note i{margin-right:4px}.forgot{font-size:.72rem;color:#735ed0;font-weight:600;cursor:help}.password-wrap{position:relative}.password-wrap .p-inputtext{padding-right:42px}.password-wrap button{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:34px;height:34px;border:0;border-radius:9px;background:transparent;color:#8c9087;cursor:pointer}.password-wrap button:hover{background:#f1f2ed;color:#343832}.login-panel footer{position:absolute;bottom:24px;color:#a0a49b;font-size:.72rem}.mobile-logo{display:none}
.project-choice{gap:12px}.project-choice>div{margin-bottom:10px}.project-option{width:100%;display:flex;align-items:center;gap:14px;padding:14px;border:1px solid var(--line);border-radius:16px;background:#fff;color:var(--ink);text-align:left;cursor:pointer;transition:.18s ease}.project-option:hover{border-color:#b9aefd;box-shadow:0 10px 26px rgba(44,39,72,.09);transform:translateY(-1px)}.project-option__mark{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;background:#8e77f5;color:#fff;font-weight:700}.project-option>span:nth-child(2){flex:1}.project-option strong,.project-option small{display:block}.project-option small{margin-top:4px;color:var(--muted)}.project-option>i{color:#8e77f5}
@media(max-width:900px){.login-page{grid-template-columns:1fr}.intro{display:none}.login-panel{min-height:100vh;padding:28px}.mobile-logo{display:flex;margin-bottom:12px}.login-panel footer{position:static;margin-top:60px}}
</style>
