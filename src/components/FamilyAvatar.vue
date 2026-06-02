<script setup>
import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'

const props = defineProps({
  uid: { type: String, required: true },
  size: { type: Number, default: 32 },
})

const family = useFamilyStore()

const member = computed(() => family.members.find(m => m.uid === props.uid))
const colour = computed(() => member.value?.colour ?? '#9E9E9E')
const initials = computed(() => {
  const name = member.value?.name ?? '?'
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
})
</script>

<template>
  <div
    class="family-avatar"
    :style="{
      width: size + 'px',
      height: size + 'px',
      backgroundColor: colour,
      fontSize: Math.round(size * 0.4) + 'px',
    }"
    :title="member?.name"
  >
    {{ initials }}
  </div>
</template>

<style scoped>
.family-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: #fff;
  font-weight: 600;
  flex-shrink: 0;
  user-select: none;
}
</style>
