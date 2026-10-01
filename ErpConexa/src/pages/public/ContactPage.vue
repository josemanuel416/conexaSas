<template>
  <q-page class="contact-page">
    <ContactPanel />
  </q-page>
</template>

<script setup>
import ContactPanel from 'src/components/public/ContactPanel.vue'
</script>

<style scoped>
.contact-page {
  min-height: calc(100vh - 110px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 56px 16px 72px;
  background:
    radial-gradient(circle at 50% 42%, rgba(25, 118, 210, 0.45), transparent 42%),
    #050814;
}
</style>
