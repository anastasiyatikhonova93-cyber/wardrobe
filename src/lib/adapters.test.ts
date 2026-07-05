import { describe, it, expect } from 'vitest'
import { asClothing, asShopping, asOutfit, asBoard } from './adapters'

describe('asClothing', () => {
  it('дефолт seasons', () => {
    expect(asClothing({ id: '1', name: 'Топ' }).seasons).toEqual([])
  })
})

describe('asShopping', () => {
  it('дефолты isAiSuggested/isConfirmed/seasons', () => {
    const s = asShopping({ id: '1', name: 'Юбка' })
    expect(s).toMatchObject({ seasons: [], isAiSuggested: false, isConfirmed: true })
  })
  it('не затирает заданные поля', () => {
    expect(asShopping({ id: '1', isConfirmed: false }).isConfirmed).toBe(false)
  })
})

describe('asOutfit', () => {
  it('миграция weather → categories', () => {
    expect(asOutfit({ id: '1', weather: ['hot'] }).categories).toEqual(['hot'])
  })
  it('новое поле categories имеет приоритет над weather', () => {
    expect(asOutfit({ id: '1', categories: ['evening'], weather: ['hot'] }).categories).toEqual(['evening'])
  })
  it('дефолты массивов', () => {
    const o = asOutfit({ id: '1' })
    expect(o.wardrobeItemIds).toEqual([])
    expect(o.itemPositions).toEqual([])
    expect(o.categories).toEqual([])
  })
})

describe('asBoard', () => {
  it('дефолт outfitIds', () => {
    expect(asBoard({ id: '1', name: 'Доска' }).outfitIds).toEqual([])
  })
})
