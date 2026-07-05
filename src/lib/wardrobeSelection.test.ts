import { describe, it, expect, beforeEach } from 'vitest'
import {
  normalizeWardrobes,
  pickActiveWardrobe,
  nextActiveAfterRemoval,
  getStoredWardrobeId,
  saveStoredWardrobeId,
} from './wardrobeSelection'
import type { WardrobeMeta } from '../types'

const UID = 'user-1'
const meta = (id: string, over: Partial<WardrobeMeta> = {}): WardrobeMeta => ({
  id, name: id, ownerUid: id, role: 'member', isPersonal: false, ...over,
})

describe('normalizeWardrobes', () => {
  it('проставляет isPersonal по id===uid', () => {
    const out = normalizeWardrobes([meta(UID), meta('shared')], UID)
    expect(out.find((w) => w.id === UID)?.isPersonal).toBe(true)
    expect(out.find((w) => w.id === 'shared')?.isPersonal).toBe(false)
  })
  it('legacy: пустой список → синтезирует личный гардероб', () => {
    const out = normalizeWardrobes([], UID)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: UID, isPersonal: true, role: 'owner', name: 'Мой гардероб' })
  })
  it('legacy: список без личного → добавляет личный первым', () => {
    const out = normalizeWardrobes([meta('shared')], UID)
    expect(out[0].id).toBe(UID)
    expect(out).toHaveLength(2)
  })
})

describe('pickActiveWardrobe', () => {
  const list = [meta(UID, { isPersonal: true }), meta('shared')]
  it('сохранённый доступен → он', () => {
    expect(pickActiveWardrobe(list, 'shared', UID)).toBe('shared')
  })
  it('сохранённый недоступен → личный', () => {
    expect(pickActiveWardrobe(list, 'gone', UID)).toBe(UID)
  })
  it('нет сохранённого → личный', () => {
    expect(pickActiveWardrobe(list, null, UID)).toBe(UID)
  })
  it('пустой список → uid', () => {
    expect(pickActiveWardrobe([], null, UID)).toBe(UID)
  })
})

describe('nextActiveAfterRemoval', () => {
  const list = [meta(UID, { isPersonal: true }), meta('a'), meta('b')]
  it('удалили активный → личный', () => {
    expect(nextActiveAfterRemoval(list, 'a', 'a', UID)).toBe(UID)
  })
  it('удалили неактивный → активный сохраняется', () => {
    expect(nextActiveAfterRemoval(list, 'b', 'a', UID)).toBe('a')
  })
  it('удалили активный, личного нет → первый из оставшихся', () => {
    const noPersonal = [meta('a'), meta('b')]
    expect(nextActiveAfterRemoval(noPersonal, 'a', 'a', UID)).toBe('b')
  })
})

describe('localStorage helpers (привязка к uid)', () => {
  beforeEach(() => localStorage.clear())
  it('сохраняет и читает по uid', () => {
    saveStoredWardrobeId(UID, 'w9')
    expect(getStoredWardrobeId(UID)).toBe('w9')
    expect(getStoredWardrobeId('other')).toBeNull()
  })
})
