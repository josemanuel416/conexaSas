<template>
  <PublicSubpage
    title="Paquetes"
    lead="Elija el plan que mejor se adapte a su operación."
  >
    <PlanCards />
  </PublicSubpage>
</template>

<script setup>
import PublicSubpage from 'src/components/public/PublicSubpage.vue'
import PlanCards from 'src/components/public/PlanCards.vue'
</script>
