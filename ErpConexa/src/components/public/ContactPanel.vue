<template>
  <div class="glow-form">
    <form class="glow-form__card" @submit.prevent="submitContact">
      <div class="glow-form__title">Contacto</div>
      <input v-model="contactForm.fullName" class="glow-form__field" type="text" placeholder="Nombre" required />
      <input v-model="contactForm.email" class="glow-form__field" type="email" placeholder="Email" required />
      <input v-model="contactForm.phone" class="glow-form__field" type="tel" placeholder="Teléfono" />
      <input v-model="contactForm.companyName" class="glow-form__field" type="text" placeholder="Empresa" />
      <textarea
        v-model="contactForm.message"
        class="glow-form__field glow-form__message"
        placeholder="Mensaje"
        required
      />
      <button type="submit" :disabled="sending">{{ sending ? 'Enviando' : 'Enviar' }}</button>
      <div v-if="hasContact" class="glow-form__meta">
        <span v-if="contact.email">{{ contact.email }}</span>
        <span v-if="contact.phone">{{ contact.phone }}</span>
        <span v-if="contact.address">{{ contact.address }}</span>
      </div>
    </form>

    <div class="glow-form__rays" aria-hidden="true">
      <svg fill="none" viewBox="0 0 299 152" height="9em" width="18em" xmlns="http://www.w3.org/2000/svg">
        <path fill="url(#contact-rays)" d="M149.5 152H133.42L0 0H149.5L299 0L165.58 152H149.5Z" />
        <defs>
          <linearGradient id="contact-rays" gradientUnits="userSpaceOnUse" x1="149.5" y1="152" x2="150.12" y2="12.2">
            <stop stop-color="#00E5FF" />
            <stop offset="1" stop-color="#65EDFF" stop-opacity="0" />
          </linearGradient>
        </defs>
      </svg>
    </div>

    <div class="glow-form__base" aria-hidden="true">
      <svg fill="none" viewBox="0 0 160 61" height="61" width="160" xmlns="http://www.w3.org/2000/svg">
        <ellipse fill="url(#contact-core)" cx="80" cy="17.4" rx="28.4" ry="4.8" />
        <path fill="#323232" fill-rule="evenodd" d="M80 28C122 28 156 22.4 156 15.5S122 3 80 3 4 8.6 4 15.5 38 28 80 28Zm0-7.7c16.1 0 29.2-2.1 29.2-4.8s-13.1-4.8-29.2-4.8-29.2 2.1-29.2 4.8 13.1 4.8 29.2 4.8Z" />
        <path fill="#1976D2" fill-rule="evenodd" d="M106.7 17.5c1.6-.6 2.5-1.3 2.5-2s-13.1-4.8-29.2-4.8-29.2 2.1-29.2 4.8c0 .7.9 1.4 2.5 2 0 0 0-.1 0-.1 0-2.6 12-4.8 26.7-4.8s26.7 2.2 26.7 4.8c0 .1 0 .1 0 .1Z" />
        <defs>
          <radialGradient id="contact-core" cx="0" cy="0" r="1" gradientTransform="translate(80 17.4) rotate(90) scale(6.25 36.9)" gradientUnits="userSpaceOnUse">
            <stop stop-color="#00E5FF" />
            <stop offset="0.9" stop-color="#0D47A1" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useQuasar } from 'quasar'
import { api } from 'src/services/api.js'

const $q = useQuasar()
const route = useRoute()
const contact = ref({})
const sending = ref(false)
const contactForm = reactive({
  fullName: '',
  email: '',
  phone: '',
  companyName: '',
  message: '',
})

const hasContact = computed(() => contact.value.email || contact.value.phone || contact.value.address)

watch(() => route.query.plan, (plan) => {
  if (plan && !contactForm.message.trim()) {
    contactForm.message = `Quiero información del paquete ${plan}.`
  }
}, { immediate: true })

async function submitContact() {
  sending.value = true
  try {
    const response = await api.public.contact({
      ...contactForm,
      fullName: contactForm.fullName.trim(),
      email: contactForm.email.trim(),
      message: contactForm.message.trim(),
    })
    $q.notify({ type: 'positive', message: response.message || 'Mensaje enviado' })
    Object.assign(contactForm, { fullName: '', email: '', phone: '', companyName: '', message: '' })
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message })
  } finally {
    sending.value = false
  }
}

onMounted(async () => {
  try {
    const site = await api.public.site()
    contact.value = site.contact || {}
  } catch (error) {
    $q.notify({ type: 'warning', message: 'No se pudieron cargar los datos de contacto. ' + error.message })
  }
})
</script>

<style scoped>
.glow-form {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 420px);
}
.glow-form__card {
  position: relative;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 0.85em;
  width: 100%;
  padding: 1.4rem 1.2rem 1.2rem;
  border-radius: 0.5rem;
  border: 4px solid #fff;
  background: rgba(0, 229, 255, 0.28);
  box-shadow: 0 0 64px 0 #82e1ff inset, 0 0 16px #a8fffaa6;
  backdrop-filter: blur(3.5px);
  animation: glow-float 3.6s ease-in-out infinite;
}
.glow-form__card:focus-within {
  animation-play-state: paused;
}
.glow-form__title {
  text-align: center;
  color: white;
  font-size: 1.7rem;
  font-weight: 600;
  letter-spacing: 0.35rem;
  text-shadow: 0 0 16px rgb(243, 243, 243);
}
.glow-form__field {
  width: 100%;
  height: 3em;
  padding: 1px 10px;
  color: white;
  letter-spacing: 0.04rem;
  font-weight: 600;
  border-radius: 6px;
  border: 2px solid #fff;
  background: rgba(139, 255, 247, 0.28);
  box-shadow: 0 0 1px 3px #9ee5e3 inset, 0 4px 4px 0 #181a6040;
  text-shadow: 0 1px 4px rgb(243, 243, 243);
}
.glow-form__field::placeholder {
  font-weight: 300;
  color: white;
  letter-spacing: 0.08rem;
  text-shadow: 0 1px 5px rgb(66, 66, 66);
}
.glow-form__field:hover,
.glow-form__field:focus {
  outline: none;
  background: rgba(25, 118, 210, 0.45);
  box-shadow: 0 0 1px 4px #9ee5e3;
}
.glow-form__message {
  height: 6.5em;
  padding-top: 10px;
  resize: vertical;
}
.glow-form__card button {
  cursor: pointer;
  height: 3.2rem;
  color: white;
  font-size: 1.15rem;
  letter-spacing: 0.18rem;
  border-radius: 6px;
  border: 2px solid white;
  background: linear-gradient(144deg, #0d47a1, #1976d2 50%, #00e5ff);
}
.glow-form__card button:hover:not(:disabled) {
  background: linear-gradient(144deg, #1565c0, #1e88e5 50%, #00e5ff);
  box-shadow: 0 0 2px 2px #ffffff;
  transform: translateY(-3px);
}
.glow-form__card button:disabled {
  cursor: wait;
  opacity: 0.75;
}
.glow-form__meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: white;
  font-size: 0.78rem;
  text-align: center;
  text-shadow: 0 1px 4px rgb(0, 0, 0);
}
.glow-form__rays {
  z-index: 2;
  position: relative;
  bottom: 1.6em;
  animation: glow-rays 2s ease-in-out infinite;
}
.glow-form__base {
  position: relative;
  z-index: 1;
  margin-top: -2.2em;
}
@keyframes glow-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@keyframes glow-rays {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .glow-form__card,
  .glow-form__rays {
    animation: none;
  }
}
</style>
