<template>
  <q-page class="landing-page">
    <section class="landing-hero">
      <div class="landing-hero__inner">
        <div class="row q-col-gutter-md items-center">
          <div class="col-12 col-md-6">
            <div class="landing-hero__badge">ERP modular para PYMES</div>
            <h1 class="landing-hero__title">{{ site.heroTitle || 'ConexaSoft ERP' }}</h1>
            <p class="landing-hero__subtitle">{{ site.heroSubtitle || tagline }}</p>
            <div class="row q-gutter-sm q-mt-md">
              <q-btn unelevated color="white" text-color="primary" no-caps label="Solicitar demo" href="#contacto" />
              <q-btn outline color="white" no-caps label="Ingresar" to="/login" />
            </div>
          </div>
          <div class="col-12 col-md-6 flex flex-center">
            <div class="landing-hero__logo-panel">
              <img :src="brandAssets.logoLightPng" alt="ConexaSoft" class="landing-hero__logo-img" />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section">
      <div class="landing-section__inner">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-6">
            <div class="landing-card">
              <q-icon name="flag" size="24px" color="primary" class="q-mb-sm" />
              <h2 class="landing-card__title">Misión</h2>
              <p class="landing-card__text">{{ site.mission || '—' }}</p>
            </div>
          </div>
          <div class="col-12 col-md-6">
            <div class="landing-card">
              <q-icon name="visibility" size="24px" color="primary" class="q-mb-sm" />
              <h2 class="landing-card__title">Visión</h2>
              <p class="landing-card__text">{{ site.vision || '—' }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section landing-section--muted">
      <div class="landing-section__inner">
        <div class="text-center q-mb-lg">
          <h2 class="landing-section__title">¿Por qué ConexaSoft?</h2>
          <p class="landing-section__lead">Todo lo que su empresa necesita para operar con orden y cumplimiento.</p>
        </div>
        <div class="row q-col-gutter-md">
          <div v-for="(item, idx) in site.benefits" :key="idx" class="col-12 col-sm-6 col-md-4">
            <div class="landing-benefit">
              <q-icon :name="item.icon || 'check_circle'" size="28px" color="primary" />
              <h3>{{ item.title }}</h3>
              <p>{{ item.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="paquetes" class="landing-section">
      <div class="landing-section__inner">
        <div class="text-center q-mb-lg">
          <h2 class="landing-section__title">Paquetes</h2>
          <p class="landing-section__lead">Elija el plan que mejor se adapte a su operación.</p>
        </div>
        <div class="row q-col-gutter-md justify-center">
          <div v-for="plan in plans" :key="plan.id" class="col-12 col-md-4">
            <div class="landing-plan" :class="{ 'landing-plan--featured': plan.isFeatured }">
              <div v-if="plan.isFeatured" class="landing-plan__ribbon">Recomendado</div>
              <h3>{{ plan.name }}</h3>
              <p class="landing-plan__desc">{{ plan.description }}</p>
              <div class="landing-plan__price">
                <span class="landing-plan__amount">${{ formatMoney(plan.priceMonthly) }}</span>
                <span class="landing-plan__period">/ mes</span>
              </div>
              <div v-if="plan.priceYearly" class="text-caption text-grey-7 q-mb-md">
                o ${{ formatMoney(plan.priceYearly) }} / año
              </div>
              <ul class="landing-plan__features">
                <li v-for="(f, i) in plan.features" :key="i">
                  <q-icon name="check" color="positive" size="16px" /> {{ f }}
                </li>
              </ul>
              <q-btn
                unelevated
                :color="plan.isFeatured ? 'primary' : 'grey-8'"
                class="full-width q-mt-md"
                no-caps
                label="Contactar"
                href="#contacto"
              />
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="contacto" class="landing-section landing-section--muted">
      <div class="landing-section__inner">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-5">
            <h2 class="landing-section__title">Contacto</h2>
            <p class="landing-section__lead q-mb-md">Cuéntenos sobre su empresa y le respondemos pronto.</p>
            <div v-if="site.contact?.email" class="landing-contact-item">
              <q-icon name="email" color="primary" /> {{ site.contact.email }}
            </div>
            <div v-if="site.contact?.phone" class="landing-contact-item">
              <q-icon name="phone" color="primary" /> {{ site.contact.phone }}
            </div>
            <div v-if="site.contact?.address" class="landing-contact-item">
              <q-icon name="place" color="primary" /> {{ site.contact.address }}
            </div>
          </div>
          <div class="col-12 col-md-7">
            <q-form @submit.prevent="submitContact" class="landing-contact-form q-pa-md">
              <div class="row q-col-gutter-md">
                <div class="col-12 col-md-6">
                  <q-input v-model="contactForm.fullName" label="Nombre *" outlined dense :rules="[req]" />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="contactForm.email" label="Email *" type="email" outlined dense :rules="[req]" />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="contactForm.phone" label="Teléfono" outlined dense />
                </div>
                <div class="col-12 col-md-6">
                  <q-input v-model="contactForm.companyName" label="Empresa" outlined dense />
                </div>
                <div class="col-12">
                  <q-input v-model="contactForm.message" label="Mensaje *" type="textarea" outlined autogrow :rules="[req]" />
                </div>
              </div>
              <q-btn type="submit" color="primary" unelevated icon="send" label="Enviar mensaje" class="q-mt-md" :loading="sending" />
            </q-form>
          </div>
        </div>
      </div>
    </section>
  </q-page>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'
import { BRAND_ASSETS, BRAND_TAGLINE } from 'src/config/brand-assets.js'

const $q = useQuasar()
const brandAssets = BRAND_ASSETS
const tagline = BRAND_TAGLINE

const site = ref({ benefits: [], contact: {} })
const plans = ref([])
const sending = ref(false)

const contactForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  message: '',
})

const req = (v) => !!v?.trim?.() || !!v || 'Requerido'

function formatMoney(v) {
  return Number(v || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
}

async function loadData() {
  const [siteData, plansData] = await Promise.all([
    api.public.site(),
    api.public.plans(),
  ])
  site.value = siteData
  plans.value = plansData
}

async function submitContact() {
  sending.value = true
  try {
    const res = await api.public.contact(contactForm)
    $q.notify({ type: 'positive', message: res.message || 'Mensaje enviado' })
    Object.assign(contactForm, { fullName: '', email: '', phone: '', companyName: '', message: '' })
  } catch (e) {
    $q.notify({ type: 'negative', message: e.message })
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    await loadData()
  } catch (e) {
    $q.notify({ type: 'warning', message: 'No se pudo cargar el sitio. ' + e.message })
  }
})
</script>

<style scoped>
.landing-hero {
  background: linear-gradient(135deg, #0d7377 0%, #14a085 55%, #1cb5a3 100%);
  color: white;
  padding: 28px 16px 32px;
}
.landing-hero__inner,
.landing-section__inner {
  max-width: 1200px;
  margin: 0 auto;
}
.landing-hero__badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.2);
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
}
.landing-hero__title {
  font-size: clamp(1.45rem, 3.2vw, 2rem);
  font-weight: 700;
  line-height: 1.15;
  margin: 0 0 8px;
}
.landing-hero__subtitle {
  font-size: 1.05rem;
  opacity: 1;
  max-width: 480px;
  margin: 0;
  line-height: 1.45;
}
.landing-hero__logo-panel {
  background: #ffffff;
  border-radius: 16px;
  padding: 14px 18px 12px;
  width: min(100%, 420px);
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.15);
}
.landing-hero__logo-img {
  width: 100%;
  max-width: 340px;
  height: auto;
  display: block;
  margin: 0 auto;
}
.landing-section {
  padding: 36px 16px;
}
.landing-section--muted {
  background: #f4f7f8;
}
.landing-section__title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 6px;
  color: #1a2e35;
}
.landing-section__lead {
  color: #5f6f77;
  font-size: 0.95rem;
  margin: 0;
}
.landing-card {
  background: white;
  border-radius: 12px;
  padding: 16px 18px;
  height: 100%;
  box-shadow: 0 2px 16px rgba(0, 0, 0, 0.05);
}
.landing-card__title {
  font-size: 1.1rem;
  margin: 0 0 8px;
}
.landing-card__text {
  color: #5f6f77;
  line-height: 1.6;
  margin: 0;
}
.landing-benefit {
  background: white;
  border-radius: 10px;
  padding: 14px 16px;
  height: 100%;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
}
.landing-benefit h3 {
  font-size: 1rem;
  margin: 8px 0 4px;
}
.landing-benefit p {
  color: #5f6f77;
  margin: 0;
  line-height: 1.45;
  font-size: 0.9rem;
}
.landing-plan {
  background: white;
  border-radius: 12px;
  padding: 18px;
  height: 100%;
  border: 2px solid #e8ecef;
  position: relative;
}
.landing-plan--featured {
  border-color: #0d7377;
  box-shadow: 0 8px 24px rgba(13, 115, 119, 0.12);
  transform: none;
}
.landing-plan__ribbon {
  position: absolute;
  top: 10px;
  right: 10px;
  background: #0d7377;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 999px;
}
.landing-plan h3 {
  margin: 0 0 6px;
  font-size: 1.15rem;
}
.landing-plan__desc {
  color: #5f6f77;
  min-height: 36px;
  font-size: 0.9rem;
}
.landing-plan__price {
  margin: 10px 0 2px;
}
.landing-plan__amount {
  font-size: 1.6rem;
  font-weight: 700;
  color: #0d7377;
}
.landing-plan__period {
  color: #5f6f77;
}
.landing-plan__features {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  font-size: 0.88rem;
}
.landing-plan__features li {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin-bottom: 5px;
  color: #3d4f56;
}
.landing-contact-item {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #3d4f56;
  font-size: 0.92rem;
}
.landing-contact-form {
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
}
</style>
