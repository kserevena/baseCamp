import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let familyStore

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import FamilyAvatar from '@/components/FamilyAvatar.vue'

const vuetify = createVuetify({ components, directives })

function mountAvatar(props) {
  return mount(FamilyAvatar, {
    props,
    global: { plugins: [vuetify] },
  })
}

describe('FamilyAvatar', () => {
  beforeEach(() => {
    familyStore = reactive({
      members: [
        { uid: 'user-1', name: 'Alice Smith', colour: '#FF5500' },
        { uid: 'user-2', name: 'Bob',         colour: '#00AA00' },
        { uid: 'user-3', name: 'Charlie David Evans', colour: '#1234AB' },
      ],
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('initials', () => {
    it('shows first initial for a single-word name', () => {
      const wrapper = mountAvatar({ uid: 'user-2' })
      expect(wrapper.text().trim()).toBe('B')
    })

    it('shows up to two initials for a two-word name', () => {
      const wrapper = mountAvatar({ uid: 'user-1' })
      expect(wrapper.text().trim()).toBe('AS')
    })

    it('shows only two initials even for names with three or more words', () => {
      const wrapper = mountAvatar({ uid: 'user-3' })
      expect(wrapper.text().trim()).toBe('CD')
    })

    it('shows ? for an unknown uid', () => {
      const wrapper = mountAvatar({ uid: 'unknown-uid' })
      expect(wrapper.text().trim()).toBe('?')
    })

    it('initials are uppercased', () => {
      familyStore.members = [{ uid: 'user-lc', name: 'alice bob', colour: '#000' }]
      const wrapper = mountAvatar({ uid: 'user-lc' })
      expect(wrapper.text().trim()).toBe('AB')
    })
  })

  describe('colour', () => {
    it('applies the member colour as background', () => {
      const wrapper = mountAvatar({ uid: 'user-2' })
      // #00AA00 normalises to rgb(0, 170, 0) in jsdom
      expect(wrapper.element.style.backgroundColor).toBe('rgb(0, 170, 0)')
    })

    it('falls back to #9E9E9E when the uid is not in the members list', () => {
      const wrapper = mountAvatar({ uid: 'unknown-uid' })
      // #9E9E9E normalises to rgb(158, 158, 158) in jsdom
      expect(wrapper.element.style.backgroundColor).toBe('rgb(158, 158, 158)')
    })
  })

  describe('size prop', () => {
    it('applies the size as width and height', () => {
      const wrapper = mountAvatar({ uid: 'user-1', size: 48 })
      expect(wrapper.element.style.width).toBe('48px')
      expect(wrapper.element.style.height).toBe('48px')
    })

    it('defaults to 32px when size is not provided', () => {
      const wrapper = mountAvatar({ uid: 'user-1' })
      expect(wrapper.element.style.width).toBe('32px')
      expect(wrapper.element.style.height).toBe('32px')
    })

    it('scales font size relative to the avatar size', () => {
      const wrapper = mountAvatar({ uid: 'user-1', size: 40 })
      // fontSize = Math.round(40 * 0.4) = 16px
      expect(wrapper.element.style.fontSize).toBe('16px')
    })
  })

  describe('title attribute', () => {
    it('sets the title to the member name for tooltip support', () => {
      const wrapper = mountAvatar({ uid: 'user-1' })
      expect(wrapper.attributes('title')).toBe('Alice Smith')
    })

    it('title is undefined for unknown uid', () => {
      const wrapper = mountAvatar({ uid: 'unknown-uid' })
      // member is undefined, so member?.name is undefined → title not set
      expect(wrapper.attributes('title')).toBeUndefined()
    })
  })
})
