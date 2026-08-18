<template>
  <q-input
    :model-value="text"
    :label="label"
    outlined
    dense
    inputmode="decimal"
    :hint="formattedHint"
    @update:model-value="onInput"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { formatCop, parseMoneyInput, sanitizeMoneyInput, moneyInputFromNumber } from 'src/utils/money-format.js'

const props = defineProps({
  modelValue: { type: [Number, String], default: 0 },
  label: { type: String, default: 'Precio' },
})

const emit = defineEmits(['update:modelValue'])

const text = ref('')

watch(
  () => props.modelValue,
  (value) => {
    const parsed = parseMoneyInput(text.value)
    const next = Number(value ?? 0)
    if (parsed !== next) {
      text.value = moneyInputFromNumber(next)
    }
  },
  { immediate: true }
)

const formattedHint = computed(() => {
  if (!text.value.trim()) return ''
  const n = parseMoneyInput(text.value)
  if (Number.isNaN(n)) return ''
  return formatCop(n)
})

function onInput(value) {
  text.value = sanitizeMoneyInput(value)
  emit('update:modelValue', parseMoneyInput(text.value))
}
</script>
