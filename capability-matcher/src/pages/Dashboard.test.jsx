import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'

vi.mock('./ProfileTab', () => ({
  default: () => <div>ProfileTab</div>,
}))

vi.mock('./ProjectsTab', () => ({
  default: () => <div>ProjectsTab</div>,
}))

vi.mock('./SkillsTab', () => ({
  default: () => <div>SkillsTab</div>,
}))

vi.mock('./AdminProjectsTab', () => ({
  default: () => <div>AdminProjectsTab</div>,
}))

vi.mock('./AdminEmployeesTab', () => ({
  default: () => <div>AdminEmployeesTab</div>,
}))

describe('Dashboard role-based tab rendering', () => {
  it('renders only the Employee tabs for an Employee role', () => {
    render(
      <Dashboard
        profile={{ role: 'Employee', first_name: 'Ava', last_name: 'Stone' }}
        onStartMatching={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Skills' })).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'Capability Matcher' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'All Projects' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'All Employees' })).toBeNull()
  })

  it('renders the Manager-only Capability Matcher tab for a Manager role', () => {
    render(
      <Dashboard
        profile={{ role: 'Manager', first_name: 'Jordan', last_name: 'Lee' }}
        onStartMatching={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Skills' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Capability Matcher' })).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'All Projects' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'All Employees' })).toBeNull()
  })

  it('renders the Admin-only directory tabs for an Admin role', () => {
    render(
      <Dashboard
        profile={{ role: 'Admin', first_name: 'Taylor', last_name: 'Ng' }}
        onStartMatching={() => {}}
      />
    )

    expect(screen.getByRole('button', { name: 'Profile' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'My Skills' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All Projects' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'All Employees' })).toBeTruthy()

    expect(screen.queryByRole('button', { name: 'Capability Matcher' })).toBeNull()
  })
})
