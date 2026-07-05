import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ApiError } from './lib/api'

// Мокаем границу сети (callDb) и firebase-auth. Логика стора — под тестом.
vi.mock('./lib/firebase', () => ({
  auth: { currentUser: { uid: 'stylist', getIdToken: async () => 'tok' } },
}))
vi.mock('./lib/api', () => ({ callDb: vi.fn() }))

import { callDb } from './lib/api'
import { useStore } from './store'

const mockedCallDb = vi.mocked(callDb)

interface FakeWardrobe { id: string; name: string; ownerUid: string; role: 'owner' | 'member' }

/** Простая ин-мемори имитация сервера. Тесты могут менять server.wardrobes/members. */
function fakeServer() {
  const server = {
    wardrobes: [] as FakeWardrobe[],
    members: [] as { uid: string; displayName: string; email: string; role: 'owner' | 'member' }[],
    counter: 0,
    loadCalls: [] as unknown[], // wardrobeId каждого load
  }
  mockedCallDb.mockImplementation(async (op: string, args: Record<string, unknown> = {}) => {
    switch (op) {
      case 'listWardrobes':
        return { wardrobes: server.wardrobes.map((w) => ({ ...w })) }
      case 'load': {
        server.loadCalls.push(args.wardrobeId)
        const w = server.wardrobes.find((x) => x.id === args.wardrobeId)
        return {
          wardrobe: [], shopping: [], outfits: [], boards: [], features: [], profile: {},
          workspace: { id: args.wardrobeId, name: w?.name ?? 'Мой гардероб', role: w?.role ?? 'owner', ownerUid: w?.ownerUid ?? 'stylist' },
        }
      }
      case 'createWardrobe': {
        const id = `w-${++server.counter}`
        server.wardrobes.push({ id, name: String(args.name), ownerUid: 'stylist', role: 'owner' })
        return { id, name: args.name }
      }
      case 'createInvite':
        return { token: 'tok-1' }
      case 'acceptInvite':
        // имитация: на сервере добавилось членство в shared-1
        if (!server.wardrobes.some((w) => w.id === 'shared-1')) {
          server.wardrobes.push({ id: 'shared-1', name: 'Гардероб клиента', ownerUid: 'client', role: 'member' })
        }
        return { wardrobeId: 'shared-1', name: 'Гардероб клиента' }
      case 'listMembers':
        return { members: server.members }
      default:
        return { ok: true }
    }
  })
  return server
}

function resetStore() {
  useStore.setState({
    wardrobe: [], shopping: [], outfits: [], boards: [], profile: { features: [], preferredStyles: [] },
    loading: true, loadError: null,
    wardrobes: [], activeWardrobeId: null, wardrobesLoading: false,
    members: [], membersLoading: false, accessRevokedNotice: null, _loadEpoch: 0,
  })
}

const lastCall = (op: string) => mockedCallDb.mock.calls.filter(([o]) => o === op).at(-1)

beforeEach(() => {
  mockedCallDb.mockReset()
  localStorage.clear()
  resetStore()
})

describe('subscribe / выбор активного гардероба', () => {
  it('legacy: пустой список → активным становится личный (id=uid), load с wardrobeId=uid', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    expect(useStore.getState().activeWardrobeId).toBe('stylist')
    expect(useStore.getState().wardrobes.some((w) => w.id === 'stylist' && w.isPersonal)).toBe(true)
    expect(lastCall('load')?.[1]).toMatchObject({ wardrobeId: 'stylist' })
  })

  it('восстанавливает сохранённый активный гардероб', async () => {
    const server = fakeServer()
    server.wardrobes.push({ id: 'w-x', name: 'Клиент', ownerUid: 'stylist', role: 'owner' })
    localStorage.setItem('activeWardrobe:stylist', 'w-x')
    await useStore.getState().subscribe('stylist')
    expect(useStore.getState().activeWardrobeId).toBe('w-x')
  })

  it('сохранённый недоступен → фолбэк на личный', async () => {
    fakeServer()
    localStorage.setItem('activeWardrobe:stylist', 'gone')
    await useStore.getState().subscribe('stylist')
    expect(useStore.getState().activeWardrobeId).toBe('stylist')
  })

  it('guard: повторный subscribe во время загрузки не плодит вызовы', async () => {
    fakeServer()
    useStore.setState({ wardrobesLoading: true })
    await useStore.getState().subscribe('stylist')
    expect(mockedCallDb).not.toHaveBeenCalled()
  })
})

describe('UC1 — создание и переключение пространств', () => {
  it('createWardrobe: добавляет в список, делает активным, сохраняет в localStorage', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const meta = await useStore.getState().createWardrobe('Клиент А')
    expect(useStore.getState().wardrobes.some((w) => w.id === meta.id)).toBe(true)
    expect(useStore.getState().activeWardrobeId).toBe(meta.id)
    expect(localStorage.getItem('activeWardrobe:stylist')).toBe(meta.id)
  })

  it('createWardrobe шлёт глобальный вызов с именем', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    await useStore.getState().createWardrobe('Клиент А')
    expect(lastCall('createWardrobe')?.[1]).toMatchObject({ name: 'Клиент А' })
  })

  it('switchWardrobe: load вызывается с разными wardrobeId, данные не протекают', async () => {
    const server = fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Клиент А')
    await useStore.getState().switchWardrobe('stylist')
    expect(useStore.getState().activeWardrobeId).toBe('stylist')
    // load вызывался и для нового гардероба, и для личного — с разными id
    expect(server.loadCalls).toContain(a.id)
    expect(server.loadCalls).toContain('stylist')
  })

  it('renameWardrobe оптимистичен; ошибка сервера → откат', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Старое')
    // следующий renameWardrobe упадёт
    mockedCallDb.mockImplementationOnce(async () => { throw new Error('fail') })
    await expect(useStore.getState().renameWardrobe(a.id, 'Новое')).rejects.toThrow()
    expect(useStore.getState().wardrobes.find((w) => w.id === a.id)?.name).toBe('Старое')
  })

  it('deleteWardrobe личного → бросает, список не тронут', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    await expect(useStore.getState().deleteWardrobe('stylist')).rejects.toThrow('личный')
  })

  it('deleteWardrobe активного → переключение на личный', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Клиент А')
    expect(useStore.getState().activeWardrobeId).toBe(a.id)
    await useStore.getState().deleteWardrobe(a.id)
    expect(useStore.getState().wardrobes.some((w) => w.id === a.id)).toBe(false)
    expect(useStore.getState().activeWardrobeId).toBe('stylist')
  })
})

describe('UC2 — приглашение клиенту', () => {
  it('createInvite возвращает URL с токеном', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Клиент')
    const url = await useStore.getState().createInvite(a.id, 'owner')
    expect(url).toContain('/invite/tok-1')
    expect(lastCall('createInvite')?.[1]).toMatchObject({ wardrobeId: a.id, role: 'owner' })
  })

  it('acceptInvite: refresh + switch на новый гардероб', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const res = await useStore.getState().acceptInvite('tok-1')
    expect(res.wardrobeId).toBe('shared-1')
    expect(useStore.getState().activeWardrobeId).toBe('shared-1')
    expect(useStore.getState().wardrobes.some((w) => w.id === 'shared-1')).toBe(true)
  })

  it('idempotency: двойной acceptInvite → один гардероб в списке', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    await useStore.getState().acceptInvite('tok-1')
    await useStore.getState().acceptInvite('tok-1')
    expect(useStore.getState().wardrobes.filter((w) => w.id === 'shared-1')).toHaveLength(1)
  })
})

describe('UC3 — участники и отзыв доступа', () => {
  it('loadMembers заполняет members', async () => {
    const server = fakeServer()
    server.members = [{ uid: 'client', displayName: 'Клиент', email: 'c@x', role: 'owner' }]
    await useStore.getState().subscribe('stylist')
    await useStore.getState().loadMembers('shared-1')
    expect(useStore.getState().members).toHaveLength(1)
  })

  it('removeMember оптимистично убирает; ошибка → откат', async () => {
    fakeServer()
    useStore.setState({
      activeWardrobeId: 'shared-1',
      members: [{ uid: 'm1', displayName: 'M', email: 'e', role: 'member' }],
    })
    mockedCallDb.mockImplementationOnce(async () => { throw new Error('fail') })
    await expect(useStore.getState().removeMember('m1')).rejects.toThrow()
    expect(useStore.getState().members).toHaveLength(1) // откат
  })
})

describe('edge: отзыв доступа в полёте (no_access)', () => {
  it('переключение на гардероб с no_access → возврат на личный + тост, без loadError', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Клиент')
    // Уходим на личный, чтобы повторный switch на a.id реально дёрнул load.
    await useStore.getState().switchWardrobe('stylist')
    expect(useStore.getState().activeWardrobeId).toBe('stylist')

    // load отозванного гардероба падает с no_access; личный грузится нормально.
    mockedCallDb.mockImplementation(async (op: string, args: Record<string, unknown> = {}) => {
      if (op === 'load' && args.wardrobeId === a.id) {
        const err = new Error('not found') as ApiError
        err.code = 'no_access'
        throw err
      }
      if (op === 'load') {
        return { wardrobe: [], shopping: [], outfits: [], boards: [], features: [], profile: {} }
      }
      return { ok: true }
    })

    await useStore.getState().switchWardrobe(a.id) // load(a.id) → no_access → revoke
    await new Promise((r) => setTimeout(r, 0)) // фоновая загрузка личного завершается

    expect(useStore.getState().activeWardrobeId).toBe('stylist')
    expect(useStore.getState().wardrobes.some((w) => w.id === a.id)).toBe(false)
    expect(useStore.getState().accessRevokedNotice).toBe('Клиент')
    expect(useStore.getState().loadError).toBeNull()
  })
})

describe('scoped: wardrobeId уходит в callDb для мутаций', () => {
  it('addClothing шлёт активный wardrobeId', async () => {
    fakeServer()
    await useStore.getState().subscribe('stylist')
    const a = await useStore.getState().createWardrobe('Клиент')
    mockedCallDb.mockImplementation(async () => ({ id: 'item-1' }))
    await useStore.getState().addClothing({ name: 'Топ', category: 'tops', color: 'белый', seasons: [] })
    expect(lastCall('add')?.[1]).toMatchObject({ wardrobeId: a.id, col: 'wardrobe' })
  })
})
