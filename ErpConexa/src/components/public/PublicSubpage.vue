<template>
  <q-page class="public-subpage">
    <header class="public-subhero">
      <div class="public-subhero__inner">
        <h1 class="public-subhero__title">{{ title }}</h1>
        <p class="public-subhero__lead">{{ lead }}</p>
      </div>
    </header>
    <section class="public-subpage__body">
      <div class="public-subpage__inner">
        <slot />
      </div>
    </section>
  </q-page>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  lead: { type: String, default: '' },
})
</script>

<style scoped>
.public-subhero {
  background: linear-gradient(135deg, #0d47a1 0%, #1976d2 55%, #1565c0 100%);
  color: white;
  padding: 28px 16px 24px;
}
.public-subhero__inner,
.public-subpage__inner {
  max-width: 1200px;
  margin: 0 auto;
}
.public-subhero__title {
  margin: 0 0 6px;
  font-size: clamp(1.6rem, 3vw, 2rem);
  font-weight: 700;
  line-height: 1.15;
}
.public-subhero__lead {
  margin: 0;
  max-width: 640px;
  font-size: 1rem;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.92);
}
.public-subpage__body {
  background: #f4f7f8;
  padding: 28px 16px 40px;
}
</style>
