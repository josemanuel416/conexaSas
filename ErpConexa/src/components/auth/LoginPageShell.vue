<template>
  <q-page class="login-page flex flex-center">
    <div class="login-page__container">
      <q-btn
        flat
        no-caps
        icon="home"
        label="Volver al inicio"
        to="/"
        class="login-page__back"
      />

      <q-card class="login-card" flat>
        <div class="login-card__brand-panel">
          <img :src="brandAssets.logoLightPng" alt="ConexaSoft" class="login-card__logo" />
        </div>

        <q-card-section class="login-card__header text-center q-pt-md q-pb-none">
          <div class="login-card__title">{{ title }}</div>
          <div class="login-card__subtitle">{{ subtitle }}</div>
        </q-card-section>

        <q-card-section>
          <slot />
        </q-card-section>

        <q-card-section v-if="$slots.links" class="login-card__links text-center q-pt-none">
          <slot name="links" />
        </q-card-section>
      </q-card>
    </div>
  </q-page>
</template>

<script setup>
import { BRAND_ASSETS } from 'src/config/brand-assets.js'

defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' },
})

const brandAssets = BRAND_ASSETS
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #0d7377 0%, #14a085 55%, #1cb5a3 100%);
  padding: 24px 16px;
}
.login-page__container {
  width: 100%;
  max-width: 440px;
}
.login-page__back {
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 12px;
  font-size: 13px;
}
.login-card {
  width: 100%;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
}
.login-card__brand-panel {
  background: #fff;
  padding: 16px 20px 12px;
  text-align: center;
  border-bottom: 1px solid #eef2f4;
}
.login-card__logo {
  width: 100%;
  max-width: 300px;
  height: auto;
  display: block;
  margin: 0 auto;
}
.login-card__title {
  font-size: 1.2rem;
  font-weight: 700;
  color: #1a2e35;
}
.login-card__subtitle {
  font-size: 0.88rem;
  color: #5f6f77;
  margin-top: 4px;
}
.login-card__links :deep(a) {
  color: #0d7377;
  text-decoration: none;
  font-size: 13px;
}
.login-card__links :deep(a:hover) {
  text-decoration: underline;
}
.login-card__links :deep(.login-card__sep) {
  color: #b0bec5;
  margin: 0 8px;
}
</style>

<style>
.login-page .login-submit-btn {
  background: #0d7377 !important;
  color: #fff !important;
}
.login-page .login-submit-btn:hover {
  background: #0a5c5f !important;
}
</style>
