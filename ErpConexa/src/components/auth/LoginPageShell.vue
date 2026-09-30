<template>
  <q-page class="login-page flex flex-center">
    <div class="login-page__bg" aria-hidden="true" />
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
  position: relative;
  min-height: 100vh;
  background: linear-gradient(160deg, #0d47a1 0%, #1565c0 52%, #1976d2 100%);
  padding: 24px 16px;
}
.login-page__bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.login-page__bg::before,
.login-page__bg::after {
  content: '';
  position: absolute;
  border-radius: 50%;
}
.login-page__bg::before {
  width: 320px;
  height: 320px;
  top: -110px;
  right: -90px;
  background: rgba(0, 229, 255, 0.16);
}
.login-page__bg::after {
  width: 240px;
  height: 240px;
  bottom: -90px;
  left: -70px;
  background: rgba(255, 255, 255, 0.1);
}
.login-page__container {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 420px;
}
.login-page__back {
  color: rgba(255, 255, 255, 0.95);
  margin-bottom: 12px;
  font-size: 13px;
}
.login-card {
  width: 100%;
  border-radius: 22px;
  overflow: hidden;
  border-top: 3px solid #00e5ff;
  box-shadow: 0 24px 56px rgba(4, 20, 40, 0.28) !important;
}
.login-card__brand-panel {
  background: #fff;
  padding: 18px 20px 8px;
  text-align: center;
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
  color: #1976d2;
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
.login-page .q-field--outlined .q-field__control {
  border-radius: 12px;
  background: #f3f7fb;
}
.login-page .q-field--outlined .q-field__control:before {
  border-color: #d5e3f0;
}
.login-page .q-field--focused .q-field__control {
  background: #fff;
  box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.16);
}
.login-page .q-field--error .q-field__control {
  background: #fff;
  box-shadow: none;
}
.login-page .login-submit-btn {
  min-height: 44px;
  border-radius: 12px;
  background: linear-gradient(90deg, #0d47a1, #1976d2) !important;
  color: #fff !important;
  box-shadow: 0 10px 20px rgba(13, 71, 161, 0.28);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.login-page .login-submit-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 26px rgba(13, 71, 161, 0.34);
}
@media (prefers-reduced-motion: reduce) {
  .login-page .login-submit-btn {
    transition: none;
  }
  .login-page .login-submit-btn:hover {
    transform: none;
  }
}
</style>
