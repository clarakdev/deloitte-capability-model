// api.js — the ONLY file in the React app that talks to the Python backend.
// Every fetch() call lives here. Components never call fetch() directly.
// If the backend URL ever changes (e.g. deployed to a server), you only
// change BASE_URL here — nothing else needs to touch.

const BASE_URL = 'http://localhost:8000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) throw new Error(`API error ${res.status} on ${path}`);
  return res.json();
}

// Frame 1
export function getProject() {
  return request('/project');
}

// Frame 2
export function getCapabilities(roleId) {
  return request(`/roles/${roleId}/capabilities`);
}

export function addCapability(roleId, escoUri, weight = 3) {
  return request(`/roles/${roleId}/capabilities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ esco_uri: escoUri, weight }),
  });
}

export function updateCapability(roleId, capId, updates) {
  return request(`/roles/${roleId}/capabilities/${encodeURIComponent(capId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export function deleteCapability(roleId, capId) {
  return request(`/roles/${roleId}/capabilities/${encodeURIComponent(capId)}`, {
    method: 'DELETE',
  });
}

export function searchEsco(query) {
  return request(`/esco/search?q=${encodeURIComponent(query)}`);
}

// Frame 3
export function getCandidates(roleId, availableOnly = false, requirePriorExp = false) {
  return request(
    `/roles/${roleId}/candidates?available_only=${availableOnly}&require_prior_experience=${requirePriorExp}`
  );
}

// Frame 4
export function getCandidateFit(roleId, empId) {
  return request(`/roles/${roleId}/candidates/${empId}/fit`);
}