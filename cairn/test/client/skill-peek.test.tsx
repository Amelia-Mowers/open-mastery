import { it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dashboard } from '../../src/client/app/Dashboard'
import { DemoApi } from '../../src/client/demo/DemoApi'
import { fixtureBundle } from '../core/fixtures'

afterEach(cleanup)

it('clicking a node opens a MODAL with the preamble; Start fires onPick; Esc closes', async () => {
  const user = userEvent.setup()
  const api = new DemoApi('peek', fixtureBundle(), null)
  let picked: string | null = null
  render(<Dashboard api={api} testMode onPick={(id) => (picked = id)} />)
  await waitFor(() => screen.getAllByRole('button', { name: /Solve|What/ }).length > 0 || true)
  const node = await waitFor(() => {
    const els = document.querySelectorAll('.skill-node[role="button"]')
    expect(els.length).toBeGreaterThan(0)
    return els[0] as HTMLElement
  })
  await user.click(node)
  const dialog = await screen.findByRole('dialog')
  expect(dialog).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /Start this skill|Keep working/ }))
  expect(picked).not.toBeNull()
  // reopen and close via Escape
  await user.click(node)
  await screen.findByRole('dialog')
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
})
