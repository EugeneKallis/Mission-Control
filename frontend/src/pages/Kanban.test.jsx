import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Kanban from './Kanban'

vi.mock('../context/AgentContext', () => ({
  useAgentContext: () => ({
    agents: [
      { id: 'coder', name: 'coder' },
      { id: 'reviewer', name: 'reviewer' },
    ],
    selectedScopeId: 'all',
    setSelectedScopeId: vi.fn(),
  }),
}))

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    connected: true,
    connection: 'connected',
    loading: false,
    state: { updated_at: '2026-04-09T13:41:54.652498Z' },
  }),
}))

vi.mock('../components/Nav', () => ({
  Nav: ({ rightContent }) => <div data-testid="nav">{rightContent}</div>,
}))

vi.mock('../components/Header', () => ({
  Header: () => <div data-testid="header" />,
}))

vi.mock('../components/AgentScopePicker', () => ({
  AgentScopePicker: () => <div data-testid="scope-picker" />,
}))

vi.mock('../components/LoadingOverlay', () => ({
  LoadingOverlay: () => null,
}))

vi.mock('../lib/apiBase', () => ({
  getApiBase: () => 'http://example.test/api',
}))

const longTodo = {
  id: 'todo-1',
  content: 'Make PR required editable on the card. '.repeat(12),
  status: 'pending',
  created_at: '2026-04-09T12:52:44.158453Z',
  assigned_agent: 'coder',
  pr_required: true,
  pr_link: null,
}

const shortTodo = {
  id: 'todo-2',
  content: 'Short task content stays fully visible.',
  status: 'pending',
  created_at: '2026-04-09T12:52:44.158453Z',
  assigned_agent: 'reviewer',
  pr_required: false,
  pr_link: null,
}

describe('Kanban', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    global.fetch = vi.fn(async (url, options = {}) => {
      if (!options.method || options.method === 'GET') {
        return {
          ok: true,
          json: async () => ({ todos: [longTodo, shortTodo], updated_at: '2026-04-09T13:41:54.652498Z' }),
        }
      }

      return {
        ok: true,
        json: async () => longTodo,
        text: async () => '',
      }
    })
  })

  it('shows an editable PR required checkbox on existing cards and removes the status dropdown', async () => {
    render(<Kanban />)

    await waitFor(() => expect(screen.getByText(/Make PR required editable on the card/)).toBeInTheDocument())

    const card = screen.getByText(/Make PR required editable on the card/).closest('div[class*="bg-slate-800"]')
    expect(card).not.toBeNull()

    const cardQueries = within(card)
    const prRequiredCheckbox = cardQueries.getByRole('checkbox', { name: /pr required/i })
    expect(prRequiredCheckbox).toBeChecked()

    expect(cardQueries.queryByRole('combobox', { name: /status/i })).not.toBeInTheDocument()
    expect(cardQueries.getAllByRole('combobox')).toHaveLength(1)
  })

  it('truncates long task content and shows the full details in a modal', async () => {
    render(<Kanban />)

    const showMoreButton = await screen.findByRole('button', { name: /show more/i })
    fireEvent.click(showMoreButton)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /full task details/i })).toBeInTheDocument()
    expect(within(dialog).getByText((_, node) => node?.textContent === longTodo.content)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('does not show a show more button for short task content', async () => {
    render(<Kanban />)

    const shortCardText = await screen.findAllByText(shortTodo.content)

    const shortCard = shortCardText[0].closest('div[class*="bg-slate-800"]')
    expect(shortCard).not.toBeNull()
    expect(within(shortCard).queryByRole('button', { name: /show more/i })).not.toBeInTheDocument()
  })
})
