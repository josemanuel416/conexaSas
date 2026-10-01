<template>
  <q-page class="landing-page">
    <section class="landing-hero">
      <div class="landing-hero__inner">
        <div class="row q-col-gutter-sm items-center">
          <div class="col-12 col-md-6">
            <div class="landing-hero__badge">ERP modular para PYMES en Colombia</div>
            <h1 class="landing-hero__title">{{ site.heroTitle || 'ConexaSoft ERP' }}</h1>
            <p class="landing-hero__subtitle">{{ site.heroSubtitle || tagline }}</p>
            <div class="row q-gutter-sm landing-hero__actions">
              <q-btn unelevated color="white" text-color="primary" no-caps label="Solicitar demo" to="/contacto" />
              <q-btn outline color="white" no-caps label="Ingresar" to="/login" />
            </div>
          </div>
          <div class="col-12 col-md-6 flex flex-center">
            <div class="brand-card" tabindex="0">
              <span class="brand-card__burst" aria-hidden="true" />
              <img :src="brandAssets.icon" alt="" class="brand-card__icon" />
              <img :src="brandAssets.logoDark" alt="ConexaSoft" class="brand-card__word" />
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
          <p class="landing-section__lead">
            Porque su operación diaria y su facturación DIAN no deberían vivir en sistemas distintos.
            ErpConexa es un ERP modular para PYMES colombianas — sólido hoy, preparado para la gestión inteligente del mañana.
          </p>
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

    <section class="landing-section">
      <div class="landing-section__inner">
        <div class="text-center q-mb-lg">
          <h2 class="landing-section__title">Cómo funciona</h2>
          <p class="landing-section__lead">Tres pasos. Un solo sistema. Datos reales de su negocio.</p>
        </div>
        <div class="row q-col-gutter-md">
          <div v-for="step in howItWorks" :key="step.title" class="col-12 col-md-4">
            <div class="landing-step">
              <div class="landing-step__num">{{ step.num }}</div>
              <q-icon :name="step.icon" size="32px" color="primary" class="q-mb-sm" />
              <h3>{{ step.title }}</h3>
              <p>{{ step.text }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="landing-section landing-section--ai">
      <div class="landing-section__inner">
        <div class="row q-col-gutter-lg items-center">
          <div class="col-12 col-md-7">
            <div class="landing-ai__badge">Nuestro rumbo</div>
            <h2 class="landing-section__title landing-ai__title">Gestión inteligente sobre datos reales</h2>
            <p class="landing-ai__text">
              La inteligencia artificial solo aporta valor cuando descansa sobre información confiable.
              Por eso ConexaSoft construye primero un ERP sólido — ventas, caja, inventario, DIAN y contabilidad unificados —
              y sobre esa base desarrolla capacidades inteligentes para ayudar a decidir, automatizar y anticipar.
            </p>
            <p class="landing-ai__text q-mb-none">
              <strong>Hoy:</strong> operación completa y facturación DIAN integrada.
              <strong>Mañana:</strong> asistentes y automatización inteligente sobre la misma plataforma.
            </p>
          </div>
          <div class="col-12 col-md-5">
            <div class="landing-ai__panel">
              <div v-for="item in aiPillars" :key="item.title" class="landing-ai__item">
                <q-icon :name="item.icon" color="white" size="22px" />
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.text }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="paquetes" class="landing-section landing-section--muted">
      <div class="landing-section__inner">
        <div class="text-center q-mb-lg">
          <h2 class="landing-section__title">Paquetes</h2>
          <p class="landing-section__lead">Elija el plan que mejor se adapte a su operación.</p>
        </div>
        <PlanCards />
      </div>
    </section>

    <section id="contacto" class="landing-section">
      <div class="landing-section__inner">
        <div class="row q-col-gutter-md">
          <div class="col-12 col-md-5">
            <h2 class="landing-section__title">Contacto</h2>
            <p class="landing-section__lead q-mb-md">
              Cuéntenos cómo opera su empresa hoy y le mostramos cómo ErpConexa puede unificar su operación, facturación DIAN y preparar el camino hacia la gestión inteligente.
            </p>
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
import PlanCards from 'src/components/public/PlanCards.vue'

const $q = useQuasar()
const brandAssets = BRAND_ASSETS
const tagline = BRAND_TAGLINE

const site = ref({ benefits: [], contact: {} })
const sending = ref(false)

const contactForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  message: '',
})

const howItWorks = [
  {
    num: '1',
    icon: 'storefront',
    title: 'Opere',
    text: 'Registre ventas, cobros en caja, citas o movimientos de inventario con clientes y catálogos unificados.',
  },
  {
    num: '2',
    icon: 'receipt_long',
    title: 'Facture',
    text: 'Convierta la operación en factura electrónica, envíe a la DIAN y consulte el estado de cada intento.',
  },
  {
    num: '3',
    icon: 'insights',
    title: 'Controle y crezca',
    text: 'Cierre caja, revise existencias, lleve contabilidad y prepare datos reales para decisiones — e inteligencia — futuras.',
  },
]

const aiPillars = [
  {
    icon: 'foundation',
    title: 'ERP sólido primero',
    text: 'Módulos reales, datos unificados, DIAN integrada.',
  },
  {
    icon: 'psychology',
    title: 'IA con propósito',
    text: 'Capacidades inteligentes sobre información verificable, no sobre suposiciones.',
  },
  {
    icon: 'trending_up',
    title: 'Evolución continua',
    text: 'La plataforma crece con su operación y con las necesidades de su empresa.',
  },
]

const req = (v) => !!v?.trim?.() || !!v || 'Requerido'

async function loadData() {
  site.value = await api.public.site()
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
  background: linear-gradient(135deg, #0d47a1 0%, #1976d2 55%, #1565c0 100%);
  color: white;
  padding: 16px 16px 20px;
}
.landing-hero__inner,
.landing-section__inner {
  max-width: 1200px;
  margin: 0 auto;
}
.landing-hero__badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  margin-bottom: 4px;
}
.landing-hero__title {
  font-size: clamp(1.35rem, 2.8vw, 1.85rem);
  font-weight: 700;
  line-height: 1.12;
  margin: 0 0 4px;
}
.landing-hero__subtitle {
  font-size: 0.95rem;
  opacity: 1;
  max-width: 480px;
  margin: 0;
  line-height: 1.35;
}
.landing-hero__actions {
  margin-top: 10px;
}
.brand-card {
  position: relative;
  width: min(100%, 340px);
  height: 176px;
  border-radius: 20px;
  background: #071428;
  overflow: hidden;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
}
.brand-card__burst {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 96px;
  height: 96px;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  background: radial-gradient(circle at 50% 42%, #1565c0 0%, #0d47a1 72%);
  box-shadow: 0 0 0 3px #00e5ff, 0 0 26px rgba(0, 229, 255, 0.72);
  transition: width 0.55s ease, height 0.55s ease, border-radius 0.55s ease, box-shadow 0.55s ease, background 0.55s ease;
  animation: brand-burst 2.8s ease 0.5s 1;
}
.brand-card__icon,
.brand-card__word {
  position: relative;
  z-index: 1;
}
.brand-card__icon {
  width: 68px;
  height: 68px;
  transition: opacity 0.4s ease, transform 0.5s ease;
  animation: brand-icon 2.8s ease 0.5s 1;
}
.brand-card__word {
  position: absolute;
  width: 88%;
  height: auto;
  opacity: 0;
  transform: scale(0.88);
  transition: opacity 0.45s ease 0.12s, transform 0.45s ease 0.12s;
  animation: brand-word 2.8s ease 0.5s 1;
}
.brand-card:hover .brand-card__burst,
.brand-card:focus .brand-card__burst,
.brand-card:focus-visible .brand-card__burst {
  width: 150%;
  height: 280%;
  border-radius: 24px;
  background: linear-gradient(145deg, #0d47a1, #1976d2 58%, #0288d1);
  box-shadow: none;
  animation: none;
}
.brand-card:hover .brand-card__icon,
.brand-card:focus .brand-card__icon,
.brand-card:focus-visible .brand-card__icon {
  opacity: 0;
  transform: scale(1.12);
  animation: none;
}
.brand-card:hover .brand-card__word,
.brand-card:focus .brand-card__word,
.brand-card:focus-visible .brand-card__word {
  opacity: 1;
  transform: scale(1);
  animation: none;
}
@keyframes brand-burst {
  0%, 16% {
    width: 96px;
    height: 96px;
    border-radius: 50%;
  }
  42%, 66% {
    width: 150%;
    height: 280%;
    border-radius: 24px;
    box-shadow: none;
  }
  100% {
    width: 96px;
    height: 96px;
    border-radius: 50%;
  }
}
@keyframes brand-icon {
  0%, 20% { opacity: 1; transform: scale(1); }
  44%, 64% { opacity: 0; transform: scale(1.12); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes brand-word {
  0%, 20% { opacity: 0; transform: scale(0.88); }
  44%, 64% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.88); }
}
@media (hover: none) {
  .brand-card__burst {
    width: 150%;
    height: 280%;
    border-radius: 24px;
    background: linear-gradient(145deg, #0d47a1, #1976d2 58%, #0288d1);
    box-shadow: none;
    animation: none;
  }
  .brand-card__icon {
    opacity: 0;
    animation: none;
  }
  .brand-card__word {
    opacity: 1;
    transform: none;
    animation: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .brand-card__burst,
  .brand-card__icon,
  .brand-card__word {
    animation: none;
    transition: none;
  }
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
.landing-card,
.landing-benefit,
.landing-step {
  position: relative;
  overflow: hidden;
}
.landing-card::before,
.landing-benefit::before,
.landing-step::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
  background: linear-gradient(90deg, #0d47a1, #1976d2 62%, #00e5ff);
}
.landing-card,
.landing-benefit,
.landing-step {
  transition: transform 0.22s ease, box-shadow 0.22s ease;
}
.landing-card:hover,
.landing-benefit:hover,
.landing-step:hover {
  transform: translateY(-4px);
  box-shadow: 0 14px 32px rgba(13, 71, 161, 0.14);
}
.landing-card {
  background: white;
  border-radius: 12px;
  padding: 16px 18px;
  height: 100%;
  box-shadow: 0 2px 16px rgba(13, 71, 161, 0.06);
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
  box-shadow: 0 2px 12px rgba(13, 71, 161, 0.06);
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
.landing-step {
  background: white;
  border-radius: 12px;
  padding: 18px 16px;
  height: 100%;
  text-align: center;
  box-shadow: 0 2px 16px rgba(13, 71, 161, 0.06);
}
.landing-step__num {
  position: absolute;
  top: 10px;
  left: 12px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1976d2;
  color: white;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.landing-step h3 {
  font-size: 1.05rem;
  margin: 4px 0 6px;
}
.landing-step p {
  color: #5f6f77;
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
}
.landing-section--ai {
  background: linear-gradient(135deg, #0d47a1 0%, #1976d2 55%, #1565c0 100%);
  color: white;
  padding: 36px 16px;
}
.landing-section--ai .landing-section__title,
.landing-ai__title {
  color: white;
}
.landing-ai__badge {
  display: inline-block;
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 8px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.landing-ai__text {
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.55;
  margin: 0 0 12px;
  font-size: 0.95rem;
}
.landing-ai__panel {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 16px;
}
.landing-ai__item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}
.landing-ai__item:last-child {
  margin-bottom: 0;
}
.landing-ai__item strong {
  display: block;
  font-size: 0.95rem;
  margin-bottom: 2px;
}
.landing-ai__item p {
  margin: 0;
  font-size: 0.85rem;
  opacity: 0.88;
  line-height: 1.4;
}
@media (prefers-reduced-motion: reduce) {
  .landing-card,
  .landing-benefit,
  .landing-step {
    transition: none;
  }
  .landing-card:hover,
  .landing-benefit:hover,
  .landing-step:hover {
    transform: none;
  }
}
</style>
