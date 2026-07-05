import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../lib/firebase', () => ({
  auth: { currentUser: { uid: 'u', getIdToken: async () => 't' } },
}))
vi.mock('../lib/api', () => ({ callDb: vi.fn(async () => ({})) }))

import { WardrobeSwitcher } from './WardrobeSwitcher'
import { useStore } from '../store'

beforeEach(() => {
  useStore.setState({
    wardrobes: [
      { id: 'u', name: 'Мой гардероб', ownerUid: 'u', role: 'owner', isPersonal: true },
      { id: 'c1', name: 'Клиент', ownerUid: 'u', role: 'owner', isPersonal: false },
    ],
    activeWardrobeId: 'u',
  })
})

const renderSwitcher = () =>
  render(
    <MemoryRouter>
      <WardrobeSwitcher />
    </MemoryRouter>,
  )

describe('WardrobeSwitcher', () => {
  it('показывает активный гардероб и раскрывает список', async () => {
    renderSwitcher()
    expect(screen.getByText('Мой гардероб')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Мой гардероб'))
    expect(screen.getByText('Клиент')).toBeInTheDocument()
  })

  it('клик по гардеробу вызывает switchWardrobe', async () => {
    const spy = vi.fn(async () => {})
    useStore.setState({ switchWardrobe: spy })
    renderSwitcher()
    await userEvent.click(screen.getByText('Мой гардероб')) // открыть лист
    await userEvent.click(screen.getByText('Клиент'))
    expect(spy).toHaveBeenCalledWith('c1')
  })
})
