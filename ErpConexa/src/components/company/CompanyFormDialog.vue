<template>
  <q-dialog
    :model-value="modelValue"
    persistent
    :full-width="client || dianEmitter || dianResolution || salesDocument || creditNote || documentView"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-card bordered class="company-form-dialog" :class="dialogClass">
      <q-card-section
        class="company-form-dialog__header row items-center no-wrap"
        :class="{ 'company-form-dialog__header--compact': client || compact }"
      >
        <q-avatar
          v-if="icon"
          :icon="icon"
          color="primary"
          text-color="white"
          :size="client ? '32px' : '36px'"
          class="q-mr-sm"
        />
        <div :class="client ? 'text-subtitle1 text-weight-medium' : 'text-h6 text-weight-medium'">
          {{ title }}
        </div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="Cerrar" v-close-popup />
      </q-card-section>

      <q-separator v-if="!client" />

      <q-card-section
        class="company-form-dialog__body"
        :class="{
          'company-form-dialog__body--client': client,
          'company-form-dialog__body--compact': compact && !client && !dianEmitter && !dianResolution,
          'company-form-dialog__body--dian-emitter': dianEmitter,
          'company-form-dialog__body--dian-resolution': dianResolution,
          'company-form-dialog__body--sales-document': salesDocument,
          'company-form-dialog__body--credit-note': creditNote,
          'company-form-dialog__body--document-view': documentView,
        }"
      >
        <slot />
      </q-card-section>

      <template v-if="$slots.actions">
        <q-separator v-if="!client" />
        <q-card-actions
          align="right"
          class="company-form-dialog__actions"
          :class="client ? 'q-pa-sm' : 'q-pa-md'"
        >
          <slot name="actions" />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Boolean, required: true },
  title: { type: String, required: true },
  icon: { type: String, default: '' },
  wide: { type: Boolean, default: false },
  client: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  dianEmitter: { type: Boolean, default: false },
  dianResolution: { type: Boolean, default: false },
  salesDocument: { type: Boolean, default: false },
  creditNote: { type: Boolean, default: false },
  documentView: { type: Boolean, default: false },
})

defineEmits(['update:modelValue'])

const dialogClass = computed(() => ({
  'company-form-dialog--wide': props.wide && !props.client,
  'company-form-dialog--client': props.client,
  'company-form-dialog--dian-emitter': props.dianEmitter,
  'company-form-dialog--dian-resolution': props.dianResolution,
  'company-form-dialog--sales-document': props.salesDocument,
  'company-form-dialog--credit-note': props.creditNote,
  'company-form-dialog--document-view': props.documentView,
}))
</script>
