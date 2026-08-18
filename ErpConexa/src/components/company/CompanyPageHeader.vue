<template>
  <header class="company-page-header">
    <h1 class="company-page-header__title">
      <q-icon v-if="icon" :name="icon" class="company-page-header__icon" />
      {{ title }}
    </h1>
    <p v-if="subtitle" class="company-page-header__subtitle">{{ subtitle }}</p>
  </header>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  subtitle: { type: String, default: '' },
})
</script>
