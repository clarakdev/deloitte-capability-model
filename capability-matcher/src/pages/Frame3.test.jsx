import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Frame3 from './Frame3'
import { getCandidates, getEmployeeLocations, requestLLMReport } from '../api/api'

vi.mock('../api/api', () => ({
  getCandidates: vi.fn(),
  getEmployeeLocations: vi.fn(),
  requestLLMReport: vi.fn(),
}))

const candidates = [
  {
    employee_id: 'EMP001', name: 'Ava Stone', title: 'Project Manager',
    role_level: 'Manager', business_unit: 'Technology', location: 'Auckland',
    match_score: 0.9, available: true, has_prior_experience: true,
    remaining_capacity: 100, capacity_status: null,
  },
  {
    employee_id: 'EMP002', name: 'Ben Reed', title: 'Delivery Lead',
    role_level: 'Consultant', business_unit: 'Technology', location: 'Wellington',
    match_score: 0.8, available: true, has_prior_experience: false,
    remaining_capacity: 100, capacity_status: null,
  },
  {
    employee_id: 'EMP003', name: 'Cal North', title: 'Analyst',
    role_level: 'Analyst', business_unit: 'Technology', location: 'Auckland',
    match_score: 0.7, available: false, has_prior_experience: false,
    remaining_capacity: 0, capacity_status: 'On Leave',
  },
]

function renderFrame3(overrides = {}) {
  const onNext = vi.fn()
  const props = {
    roleId: 'role-1',
    projectStartDate: '2026-11-01',
    projectEndDate: '2027-01-01',
    requiredPercentage: 100,
    onBack: vi.fn(),
    onNext,
    ...overrides,
  }
  return { ...render(<Frame3 {...props} />), onNext }
}

beforeEach(() => {
  vi.clearAllMocks()
  getCandidates.mockResolvedValue(candidates)
  getEmployeeLocations.mockResolvedValue(['Auckland', 'Wellington'])
  requestLLMReport.mockResolvedValue({ report: 'Relevant delivery experience.', overall_fit_score: 88 })
  vi.stubGlobal('alert', vi.fn())
  vi.stubGlobal('confirm', vi.fn(() => true))
})

describe('Frame3 candidate selection workflow', () => {
  it('loads candidates using project context and filters by availability and location', async () => {
    renderFrame3()
    expect(await screen.findByText('Ava Stone')).toBeInTheDocument()
    expect(getCandidates).toHaveBeenCalledWith(
      'role-1', false, false, '2026-11-01', '2027-01-01', [], [], 100,
    )

    fireEvent.click(screen.getByLabelText('Available only'))
    await waitFor(() => expect(getCandidates).toHaveBeenLastCalledWith(
      'role-1', true, false, '2026-11-01', '2027-01-01', [], [], 100,
    ))

    fireEvent.click(screen.getByRole('button', { name: /Location/ }))
    fireEvent.click(screen.getByLabelText('Auckland'))
    await waitFor(() => expect(getCandidates).toHaveBeenLastCalledWith(
      'role-1', true, false, '2026-11-01', '2027-01-01', ['Auckland'], [], 100,
    ))
  })

  it('allows at most two candidates and advances with the selected pair', async () => {
    const { onNext } = renderFrame3()
    await screen.findByText('Ava Stone')

    fireEvent.click(screen.getByText('Ava Stone'))
    fireEvent.click(screen.getByText('Ben Reed'))
    expect(screen.getByRole('button', { name: /Compare gap analysis/ })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: /Compare gap analysis/ }))

    expect(onNext).toHaveBeenCalledTimes(1)
    expect(onNext.mock.calls[0][0].map((candidate) => candidate.employee_id)).toEqual(['EMP001', 'EMP002'])
  })

  it('does not select unavailable employees', async () => {
    const { onNext } = renderFrame3()
    const employee = await screen.findByText('Cal North')
    fireEvent.click(employee)

    expect(screen.getByRole('button', { name: /gap analysis/ })).toBeDisabled()
    expect(onNext).not.toHaveBeenCalled()
  })

  it('shows and toggles an AI report for a candidate', async () => {
    renderFrame3()
    await screen.findByText('Ava Stone')
    fireEvent.click(screen.getAllByRole('button', { name: 'Generate AI report' })[0])

    expect(await screen.findByText('Relevant delivery experience.')).toBeInTheDocument()
    expect(requestLLMReport).toHaveBeenCalledWith('role-1', 'EMP001')
    fireEvent.click(screen.getByRole('button', { name: 'AI report ✓' }))
    await waitFor(() => expect(screen.queryByText('Relevant delivery experience.')).not.toBeInTheDocument())
  })
})
