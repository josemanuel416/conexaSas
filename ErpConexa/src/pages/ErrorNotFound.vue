<template>
  <div class="error-404">
    <img
      :src="brandAssets.error404"
      alt="Página no encontrada"
      class="error-404__art"
    />
    <q-btn
      to="/"
      no-caps
      unelevated
      icon="home"
      label="Volver al inicio"
      class="error-404__home"
    />
  </div>
</template>

<script setup>
import { BRAND_ASSETS } from 'src/config/brand-assets.js'

const brandAssets = BRAND_ASSETS
</script>

<style scoped>
.error-404 {
  position: fixed;
  inset: 0;
  background: #061033;
  overflow: hidden;
}
.error-404__art {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  display: block;
}
.error-404__home {
  position: absolute;
  top: 20px;
  left: 20px;
  background: rgba(8, 16, 48, 0.55) !important;
  color: #fff !important;
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 999px;
  backdrop-filter: blur(8px);
}
</style>
