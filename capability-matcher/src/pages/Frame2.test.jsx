import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Frame2 from './Frame2'
import {
  addCapability,
  getCapabilities,
  getSavedCapabilities,
  inferCapabilities,
  loadCapabilities,
  saveCapabilities,
  searchEsco,
} from '../api/api'

vi.mock('../api/api', () => ({
  addCapability: vi.fn(),
  deleteCapability: vi.fn(),
  getCapabilities: vi.fn(),
  getSavedCapabilities: vi.fn(),
  inferCapabilities: vi.fn(),
  loadCapabilities: vi.fn(),
  saveCapabilities: vi.fn(),
  searchEsco: vi.fn(),
  updateCapability: vi.fn(),
}))

const inferredSkill = {
  cap_id: 'esco:inferred',
  name: 'Project planning',
  esco_description: 'Plan project work.',
  weight: 4,
  is_inferred: true,
}

const manualSkill = {
  concept_uri: 'esco:manual',
  preferred_label: 'Stakeholder communication',
  description: 'Communicate with stakeholders.',
}

function renderFrame2(overrides = {}) {
  const onNext = vi.fn()
  const props = {
    roleId: 'role-1',
    role: { title: 'Project Manager', description: 'Manage delivery.' },
    topK: 5,
    onBack: vi.fn(),
    onNext,
    ...overrides,
  }
  return { ...render(<Frame2 {...props} />), onNext }
}

beforeEach(() => {
  vi.clearAllMocks()
  getSavedCapabilities.mockResolvedValue([])
  loadCapabilities.mockResolvedValue(undefined)
  inferCapabilities.mockResolvedValue([inferredSkill])
  getCapabilities.mockResolvedValue([inferredSkill])
  saveCapabilities.mockResolvedValue(undefined)
  searchEsco.mockResolvedValue([manualSkill])
  addCapability.mockResolvedValue([inferredSkill, {
    cap_id: manualSkill.concept_uri,
    name: manualSkill.preferred_label,
    esco_description: manualSkill.description,
    weight: 3,
    is_inferred: false,
  }])
})

describe('Frame2 skill requirement workflow', () => {
  it('infers skills for a role with no saved capabilities', async () => {
    renderFrame2()

    expect(await screen.findByText('Project planning')).toBeInTheDocument()
    expect(inferCapabilities).toHaveBeenCalledWith(
      'role-1', 'Project Manager', 'Manage delivery.', 5, true,
    )
    expect(loadCapabilities).not.toHaveBeenCalled()
  })

  it('restores saved skills into backend state instead of inferring again', async () => {
    const saved = [{ ...inferredSkill, is_inferred: false }]
    getSavedCapabilities.mockResolvedValue(saved)

    renderFrame2()

    expect(await screen.findByText('Project planning')).toBeInTheDocument()
    expect(loadCapabilities).toHaveBeenCalledWith('role-1', saved)
    expect(inferCapabilities).not.toHaveBeenCalled()
  })

  it('searches ESCO, adds a selected skill, saves requirements, and continues', async () => {
    const { onNext } = renderFrame2()
    await screen.findByText('Project planning')

    fireEvent.change(screen.getByPlaceholderText(/Search ESCO skills/), {
      target: { value: 'stakeholder' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fireEvent.click(await screen.findByText('Stakeholder communication'))

    expect(searchEsco).toHaveBeenCalledWith('stakeholder')
    expect(addCapability).toHaveBeenCalledWith('role-1', 'esco:manual', 3)
    await waitFor(() => expect(addCapability).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /Browse candidates/ }))
    await waitFor(() => expect(saveCapabilities).toHaveBeenCalledWith(
      'role-1',
      expect.arrayContaining([
        expect.objectContaining({ cap_id: 'esco:manual', is_inferred: false }),
      ]),
    ))
    expect(onNext).toHaveBeenCalledWith('role-1')
  })
})
