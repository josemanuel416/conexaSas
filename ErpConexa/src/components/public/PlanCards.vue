<template>
  <div class="row q-col-gutter-lg justify-center">
    <div v-for="plan in plans" :key="plan.id" class="col-12 col-sm-6 col-md-4">
      <article class="plan-card" :class="{ 'plan-card--featured': plan.isFeatured }">
        <div class="plan-card__cap">
          <p v-if="plan.isFeatured">Recomendado</p>
          <q-icon v-if="plan.isFeatured" name="auto_awesome" size="20px" />
        </div>
        <div class="plan-card__body">
          <p class="plan-card__name">{{ plan.name }}</p>
          <p class="plan-card__price">
            <span>${{ formatMoney(plan.priceMonthly) }}</span>
            <span>/ mes</span>
          </p>
          <p v-if="plan.priceYearly" class="plan-card__yearly">
            o ${{ formatMoney(plan.priceYearly) }} / año
          </p>
          <p class="plan-card__desc">{{ plan.description }}</p>
          <ul class="plan-card__features">
            <li v-for="(feature, index) in plan.features" :key="index">
              <q-icon name="check" size="16px" /> {{ feature }}
            </li>
          </ul>
          <q-btn
            class="plan-card__btn"
            unelevated
            no-caps
            label="Contactar"
            :to="{ path: '/contacto', query: { plan: plan.name } }"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'

const $q = useQuasar()
const plans = ref([])

function formatMoney(value) {
  return Number(value || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

onMounted(async () => {
  try {
    plans.value = await api.public.plans()
  } catch (error) {
    $q.notify({ type: 'warning', message: 'No se pudieron cargar los paquetes. ' + error.message })
  }
})
</script>

<style scoped>
.plan-card {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px;
  border-radius: 32px;
  background: linear-gradient(to top right, #0d47a1, #1976d2 40%, #4fc3f7 65%, #00acc1 100%);
}
.plan-card__cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  padding: 12px 18px;
  color: #fff;
}
.plan-card__cap p {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  font-style: italic;
  text-shadow: 2px 2px 6px #0d47a1;
}
.plan-card__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  background: #161a20;
  border-radius: 28px;
  color: #838383;
  padding: 18px;
}
.plan-card__name {
  margin: 0;
  font-weight: 600;
  color: #bab9b9;
  font-size: 14px;
}
.plan-card__price {
  margin: 0;
  line-height: 1;
}
.plan-card__price span:first-child {
  font-size: 36px;
  color: #fff;
  font-weight: 600;
}
.plan-card__price span:last-child {
  margin-left: 4px;
  font-size: 13px;
}
.plan-card__yearly,
.plan-card__desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.45;
}
.plan-card__features {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 13px;
}
.plan-card__features li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 6px;
  color: #c5ced6;
}
.plan-card__features .q-icon {
  color: #4fc3f7;
  margin-top: 1px;
}
.plan-card__btn {
  margin-top: auto;
  width: 100%;
  background: linear-gradient(4deg, #0d47a1, #1976d2 40%, #4fc3f7 65%, #00acc1) !important;
  color: #fff !important;
  border-radius: 8px;
  box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.6);
  transition: transform 0.3s ease, text-shadow 0.3s ease;
}
.plan-card__btn:hover {
  text-shadow: 0 0 8px #fff;
  transform: scale(1.03);
}
.plan-card__btn:active {
  transform: scale(1);
}
@media (prefers-reduced-motion: reduce) {
  .plan-card__btn {
    transition: none;
  }
  .plan-card__btn:hover,
  .plan-card__btn:active {
    transform: none;
  }
}
</style>
