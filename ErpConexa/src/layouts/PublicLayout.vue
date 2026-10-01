<template>
  <q-layout view="hHh lpR lFf" class="public-layout">
    <PageIntro />
    <q-header elevated class="public-header">
      <q-toolbar class="public-header__toolbar">
        <router-link to="/" class="public-header__brand">
          <span class="public-header__burst" aria-hidden="true" />
          <img :src="brandAssets.iconWhite" alt="" class="public-header__icon" />
          <span class="public-header__name">
            Conexa<span class="public-header__name-soft">Soft</span>
          </span>
        </router-link>
        <q-space />
        <q-btn flat no-caps label="Inicio" to="/" exact class="public-header__link gt-xs" />
        <q-btn flat no-caps label="Paquetes" to="/paquetes" exact class="public-header__link gt-xs" />
        <q-btn flat no-caps label="Contacto" to="/contacto" exact class="public-header__link gt-xs" />
        <q-btn outline no-caps label="Ingresar" to="/login" class="public-header__btn" />
        <q-btn unelevated no-caps color="white" text-color="primary" label="Admin" to="/admin/login" class="q-ml-sm" />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <q-footer class="public-footer">
      <div class="public-footer__inner row items-center q-col-gutter-md">
        <div class="col-12 col-md-4 row items-center no-wrap">
          <img :src="brandAssets.iconWhitePng" alt="" class="public-footer__icon q-mr-sm" />
          <div>
            <div class="public-footer__brand">ConexaSoft</div>
            <div class="public-footer__tagline">{{ tagline }}</div>
          </div>
        </div>
        <div class="col-12 col-md-4 public-footer__links">
          <router-link to="/login" class="public-footer__link">Portal compañía</router-link>
          <span class="public-footer__sep">·</span>
          <router-link to="/admin/login" class="public-footer__link">Admin</router-link>
        </div>
        <div class="col-12 col-md-4 public-footer__copy">
          © {{ year }} ConexaSoft
        </div>
      </div>
    </q-footer>
  </q-layout>
</template>

<script setup>
import { BRAND_ASSETS, BRAND_TAGLINE } from 'src/config/brand-assets.js'
import PageIntro from 'src/components/public/PageIntro.vue'

const brandAssets = BRAND_ASSETS
const tagline = BRAND_TAGLINE
const year = new Date().getFullYear()
</script>

<style scoped>
.public-header {
  background: linear-gradient(135deg, #0d47a1 0%, #1976d2 100%);
}
.public-header__brand {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 999px;
  overflow: hidden;
  text-decoration: none;
  isolation: isolate;
}
.public-header__burst {
  position: absolute;
  left: 4px;
  top: 50%;
  z-index: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  transform: translateY(-50%);
  background: #071833;
  box-shadow: 0 0 0 2px #00e5ff, 0 0 14px rgba(0, 229, 255, 0.75);
  transition: width 0.45s ease, height 0.45s ease, left 0.45s ease, top 0.45s ease, border-radius 0.45s ease, transform 0.45s ease, background 0.45s ease, box-shadow 0.45s ease;
}
.public-header__brand:hover .public-header__burst,
.public-header__brand:focus .public-header__burst,
.public-header__brand:focus-visible .public-header__burst {
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  transform: none;
  background: linear-gradient(90deg, #0d47a1, #1976d2 62%, #00e5ff);
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.45);
}
.public-header :deep(.q-toolbar) {
  min-height: 52px;
}
.public-header__toolbar {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
  padding: 0 16px;
}
.public-header__icon {
  position: relative;
  z-index: 1;
  height: 36px;
  width: 36px;
}
.public-header__name {
  position: relative;
  z-index: 1;
  color: #fff;
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1;
}
.public-header__name-soft {
  color: #90caf9;
  font-weight: 500;
}
.public-header__brand:hover .public-header__name-soft,
.public-header__brand:focus .public-header__name-soft,
.public-header__brand:focus-visible .public-header__name-soft {
  color: #fff;
}
.public-header__link {
  color: rgba(255, 255, 255, 0.95);
  font-size: 14px;
}
.public-header__btn {
  color: white;
  border-color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
}
.public-footer {
  background: #0d47a1;
  color: rgba(255, 255, 255, 0.85);
  padding: 10px 12px;
}
.public-footer__inner {
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
}
.public-footer__icon {
  height: 28px;
  width: 28px;
  object-fit: contain;
}
.public-footer__brand {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.2;
}
.public-footer__tagline {
  font-size: 11px;
  opacity: 0.75;
  line-height: 1.2;
}
.public-footer__links {
  font-size: 12px;
  text-align: center;
}
.public-footer__copy {
  font-size: 11px;
  opacity: 0.7;
  text-align: right;
}
.public-footer__link {
  color: #90caf9;
  text-decoration: none;
}
.public-footer__link:hover {
  text-decoration: underline;
}
.public-footer__sep {
  margin: 0 6px;
  opacity: 0.5;
}
@media (prefers-reduced-motion: reduce) {
  .public-header__burst {
    transition: none;
  }
}
@media (max-width: 1023px) {
  .public-footer__links,
  .public-footer__copy {
    text-align: left;
  }
}
</style>
