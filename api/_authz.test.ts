// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  HttpError,
  resolveWardrobeId,
  isMember,
  assertMember,
  isOwner,
  assertOwner,
  roleOf,
  stripWorkspaceFields,
  planInviteAcceptance,
} from './_authz'

const UID = 'user-1'
const OTHER = 'user-2'

describe('resolveWardrobeId', () => {
  it('пусто/не-строка → собственный uid (legacy)', () => {
    expect(resolveWardrobeId(undefined, UID)).toBe(UID)
    expect(resolveWardrobeId('', UID)).toBe(UID)
    expect(resolveWardrobeId(null, UID)).toBe(UID)
  })
  it('строка → как есть', () => {
    expect(resolveWardrobeId('w123', UID)).toBe('w123')
  })
})

describe('isMember / assertMember', () => {
  it('нет документа, свой личный (id===uid) → член', () => {
    expect(isMember(null, UID, UID)).toBe(true)
  })
  it('нет документа, чужой id → не член', () => {
    expect(isMember(null, UID, 'w999')).toBe(false)
  })
  it('legacy без ownerUid/memberUids, свой личный → член', () => {
    expect(isMember({}, UID, UID)).toBe(true)
  })
  it('мигрированный, uid в memberUids → член', () => {
    expect(isMember({ ownerUid: UID, memberUids: [UID] }, UID, UID)).toBe(true)
    expect(isMember({ ownerUid: OTHER, memberUids: [OTHER, UID] }, UID, 'shared')).toBe(true)
  })
  it('uid не в memberUids → не член', () => {
    expect(isMember({ memberUids: [OTHER] }, UID, 'shared')).toBe(false)
  })
  it('assertMember кидает 404 (no_access) если не член', () => {
    expect(() => assertMember({ memberUids: [OTHER] }, UID, 'shared')).toThrow(HttpError)
    try {
      assertMember(undefined, UID, 'w999')
    } catch (e) {
      expect((e as HttpError).code).toBe(404)
      expect((e as HttpError).publicCode).toBe('no_access')
    }
  })
  it('assertMember кидает 404 для гардероба в состоянии deleting даже для члена', () => {
    expect(() => assertMember({ memberUids: [UID], deleting: true }, UID, 'shared')).toThrow(HttpError)
  })
  it('assertMember не кидает для члена', () => {
    expect(() => assertMember({ ownerUid: UID, memberUids: [UID] }, UID, UID)).not.toThrow()
  })
})

describe('isOwner / assertOwner', () => {
  it('ownerUid совпадает → владелец', () => {
    expect(isOwner({ ownerUid: UID, memberUids: [UID] }, UID, UID)).toBe(true)
  })
  it('legacy без ownerUid, личный → владелец', () => {
    expect(isOwner({}, UID, UID)).toBe(true)
    expect(isOwner(null, UID, UID)).toBe(true)
  })
  it('member чужого гардероба → не владелец', () => {
    expect(isOwner({ ownerUid: OTHER, memberUids: [OTHER, UID] }, UID, 'shared')).toBe(false)
    expect(() => assertOwner({ ownerUid: OTHER, memberUids: [OTHER, UID] }, UID, 'shared')).toThrow(HttpError)
  })
  it('assertOwner кидает 403', () => {
    try {
      assertOwner({ ownerUid: OTHER }, UID, 'shared')
    } catch (e) {
      expect((e as HttpError).code).toBe(403)
    }
  })
})

describe('roleOf', () => {
  it('владелец → owner', () => {
    expect(roleOf({ ownerUid: UID, memberUids: [UID] }, UID, UID)).toBe('owner')
  })
  it('участник → member', () => {
    expect(roleOf({ ownerUid: OTHER, memberUids: [OTHER, UID], members: { [UID]: { role: 'member' } } }, UID, 'shared')).toBe('member')
  })
})

describe('stripWorkspaceFields', () => {
  it('вырезает служебные поля, оставляет профильные', () => {
    const out = stripWorkspaceFields({
      height: 170,
      bodyType: 'pear',
      ownerUid: 'attacker',
      memberUids: ['attacker'],
      members: {},
      name: 'hack',
      schemaVersion: 99,
      deleting: true,
    })
    expect(out).toEqual({ height: 170, bodyType: 'pear' })
  })
  it('пустой/невалидный вход → {}', () => {
    expect(stripWorkspaceFields(undefined)).toEqual({})
    expect(stripWorkspaceFields(null)).toEqual({})
  })
})

describe('planInviteAcceptance', () => {
  it('member-ссылка: принявший становится member, владелец не меняется', () => {
    expect(planInviteAcceptance(OTHER, UID, 'member')).toEqual({
      accepterRole: 'member',
      newOwnerUid: OTHER,
      demotedUid: null,
    })
  })
  it('owner-ссылка (хэндофф): принявший становится владельцем, прежний понижается', () => {
    expect(planInviteAcceptance(OTHER, UID, 'owner')).toEqual({
      accepterRole: 'owner',
      newOwnerUid: UID,
      demotedUid: OTHER,
    })
  })
  it('owner-ссылка, принявший = прежний владелец → без понижения', () => {
    expect(planInviteAcceptance(UID, UID, 'owner')).toEqual({
      accepterRole: 'owner',
      newOwnerUid: UID,
      demotedUid: null,
    })
  })
})
