// api.js — the ONLY file in the React app that talks to the Python backend.
// Every fetch() call lives here. Components never call fetch() directly.
// If the backend URL ever changes (e.g. deployed to a server), you only
// change BASE_URL here — nothing else needs to touch.
import { supabase } from '../supabase'
const BASE_URL = 'http://localhost:8000';

// Internal helper — all API calls go through this.
// If the server returns an error status (4xx, 5xx), it throws so the
// calling component can catch it and show an error message.
async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

// Frame 1
// Loads the demo project and its 5 roles from data/project.json via the backend.
// Backend endpoint: GET /project
export function getProject() {
  return request('/project');
}

// Frame 2
// Loads the capability list for a role.
// On the FIRST call, the backend auto-infers the top 5 ESCO skills using AI.
// On subsequent calls, it returns the current (possibly edited) list.
// Backend endpoint: GET /roles/{roleId}/capabilities
export function getCapabilities(roleId) {
  return request(`/roles/${roleId}/capabilities`);
}

// Adds a new ESCO skill to a role's capability list.
// escoUri comes from searchEsco() below — it's the skill's unique ESCO identifier.
// weight is importance 1–5 (default 3).
// Backend endpoint: POST /roles/{roleId}/capabilities
export function addCapability(roleId, escoUri, weight = 3) {
  return request(`/roles/${roleId}/capabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ esco_uri: escoUri, weight }),
  });
}

// Updates an existing capability — change its weight (1–5) or swap it for a
// different ESCO skill. Pass only the fields you want to change in `updates`.
// e.g. updateCapability(roleId, capId, { weight: 5 })
// e.g. updateCapability(roleId, capId, { esco_uri: '...', weight: 2 })
// NOTE: capId is a full ESCO URI like http://data.europa.eu/esco/skill/abc
// encodeURIComponent() is REQUIRED — the slashes in the URI break the URL otherwise.
// Backend endpoint: PUT /roles/{roleId}/capabilities/{capId}
export function updateCapability(roleId, capId, updates) {
  return request(`/roles/${roleId}/capabilities/${encodeURIComponent(capId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

// Removes a capability from a role's list entirely.
// Same encodeURIComponent() requirement as updateCapability.
// Backend endpoint: DELETE /roles/{roleId}/capabilities/{capId}
export function deleteCapability(roleId, capId) {
  return request(`/roles/${roleId}/capabilities/${encodeURIComponent(capId)}`, {
    method: 'DELETE',
  });
}

// Searches the ESCO skill database by keyword.
// Used in Frame 2 when the user wants to add a custom skill.
// Returns up to 20 matches. Falls back to semantic (AI) search if text
// search finds fewer than 5 results.
// Backend endpoint: GET /esco/search?q={query}
export function searchEsco(query) {
  return request(`/esco/search?q=${encodeURIComponent(query)}`);
}

// Frame 3
// Returns all 30 employees ranked by their fit to the role's capabilities.
// Two optional boolean filters:
//   availableOnly — only show employees marked available: true
//   requirePriorExp — only show employees who have held this role title before
// The match_score (0–1) is computed by the backend's matching engine.
// Backend endpoint: GET /roles/{roleId}/candidates
export function getCandidates(roleId, availableOnly = false, requirePriorExp = false) {
  return request(
    `/roles/${roleId}/candidates?available_only=${availableOnly}&require_prior_experience=${requirePriorExp}`
  );
}

// Frame 4
// Returns a per-capability gap breakdown for one specific employee.
// For each required capability, shows:
//   - best_match_skill: the employee's closest matching skill
//   - similarity: cosine similarity score 0–1
//   - is_gap: true if similarity < 0.6 (the employee lacks adequate coverage)
// Backend endpoint: GET /roles/{roleId}/candidates/{empId}/fit
export function getCandidateFit(roleId, empId) {
  return request(`/roles/${roleId}/candidates/${empId}/fit`);
}

// Frame 0 — Project management

// Temporary user id — replace with real user id from login session later
const CURRENT_USER_ID = '00000000-0000-0000-0000-000000000001'

// Fetch all projects belonging to the current user
export async function getProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, roles(*)')
    .eq('created_by', CURRENT_USER_ID)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data
}

// Create a new project
export async function createProject({ name, client, description, duration, start_date }) {
  const { data, error } = await supabase
    .from('projects')
    .insert([{ name, client, description, duration, start_date, created_by: CURRENT_USER_ID }])
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Update an existing project
export async function updateProject(id, updates) {
  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Delete a project — roles are deleted automatically
export async function deleteProject(id) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Roles

// Fetch all roles for a project
export async function getRoles(projectId) {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

// Create a new role under a project
export async function createRole(projectId, { title, description, sort_order = 0 }) {
  const { data, error } = await supabase
    .from('roles')
    .insert([{ 
      project_id:  projectId, 
      title, 
      description, 
      sort_order
    }])
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Update a role title or description
export async function updateRole(id, updates) {
  const { data, error } = await supabase
    .from('roles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Delete a role
export async function deleteRole(id) {
  const { error } = await supabase
    .from('roles')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// Infers capabilities for a Supabase role using its title and description.
// Used instead of getCapabilities() when the role has a UUID not known to the backend.
// Backend endpoint: POST /roles/{roleId}/capabilities/infer
export function inferCapabilities(roleId, title, description) {
  return request(`/infer/${encodeURIComponent(roleId)}/capabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, description }),
  })
}

// Capabilities persistence
// Saves the final capability list for a role to Supabase after Frame 2.
// On revisit, Frame 2 loads from Supabase instead of re-inferring from AI.

// Save all capabilities for a role (replaces existing ones)
export async function saveCapabilities(roleId, capabilities) {
  // Delete existing capabilities for this role first
  await supabase.from('capabilities').delete().eq('role_id', roleId)

  if (capabilities.length === 0) return []

  const { data, error } = await supabase
    .from('capabilities')
    .insert(
      capabilities.map(cap => ({
        role_id:          roleId,
        cap_id:           cap.cap_id,
        name:             cap.name,
        esco_description: cap.esco_description || '',
        weight:           cap.weight,
        is_inferred:      cap.is_inferred,
      }))
    )
    .select()
  if (error) throw new Error(error.message)
  return data
}

// Load saved capabilities for a role from Supabase
export async function getSavedCapabilities(roleId) {
  const { data, error } = await supabase
    .from('capabilities')
    .select('*')
    .eq('role_id', roleId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data
}

// Assignments
// Stores the employee chosen for a role after Frame 3.

// Save or update the employee assigned to a role
export async function saveAssignment(roleId, projectId, employee) {
  const { data, error } = await supabase
    .from('assignments')
    .upsert({
      role_id:       roleId,
      project_id:    projectId,
      employee_id:   employee.employee_id,
      employee_name: employee.name,
      match_score:   employee.match_score,
    }, { onConflict: 'role_id' })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Load the assignment for a role
export async function getAssignment(roleId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('role_id', roleId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

// Load all assignments for a project
export async function getProjectAssignments(projectId) {
  const { data, error } = await supabase
    .from('assignments')
    .select('*')
    .eq('project_id', projectId)
  if (error) throw new Error(error.message)
  return data
}