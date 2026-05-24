import type { StatsResponse, ChartPoint, Hotzone, ConfigEntry, SightingsPage, ThreatProfile, ActivityData, RelatedFingerprint, Campaign } from './types'

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://api.thesnaphook.app'

function adminHeaders(): Record<string, string> {
  return {
    'X-Admin-Key': localStorage.getItem('snaphook_admin_key') ?? '',
    'Content-Type': 'application/json',
  }
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: adminHeaders() })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json() as Promise<T>
}

export async function testAuth(key: string): Promise<boolean> {
  const res = await fetch(`${BASE_URL}/admin/stats`, {
    headers: { 'X-Admin-Key': key, 'Content-Type': 'application/json' },
  })
  if (res.status === 401) return false
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return true
}

export const fetchStats    = ()  => request<StatsResponse>('/admin/stats')
export const fetchSightings = (page: number, limit: number) =>
  request<SightingsPage>(`/admin/sightings?page=${page}&limit=${limit}`)
export const fetchChart    = ()  => request<ChartPoint[]>('/admin/sightings/chart')
export const fetchHotzones = ()  => request<Hotzone[]>('/admin/hotzones')
export const fetchConfig   = ()  => request<ConfigEntry[]>('/admin/config')

export async function updateConfig(key: string, value: string): Promise<ConfigEntry> {
  const res = await fetch(`${BASE_URL}/admin/config/${encodeURIComponent(key)}`, {
    method:  'PUT',
    headers: adminHeaders(),
    body:    JSON.stringify({ value }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status })
  }
  return res.json() as Promise<ConfigEntry>
}

export async function triggerTriangulation(fingerprintId: string): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/admin/triangulate/${encodeURIComponent(fingerprintId)}`, {
    method:  'POST',
    headers: adminHeaders(),
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json()
}

export async function generateTestSightings(params: {
  lat:           number
  lng:           number
  fingerprintId: string
  count?:        number
  radiusM?:      number
}): Promise<{ ok: boolean; generated: number; fingerprintId: string }> {
  const res = await fetch(`${BASE_URL}/admin/test/generate-sightings`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify(params),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    throw Object.assign(new Error(body.error ?? `HTTP ${res.status}`), { status: res.status })
  }
  return res.json() as Promise<{ ok: boolean; generated: number; fingerprintId: string }>
}

// GER-62: Threat Profile endpoints
export const fetchFingerprintProfile = (id: string) =>
  request<ThreatProfile>(`/admin/fingerprints/${encodeURIComponent(id)}`)

export const fetchFingerprintActivity = (id: string) =>
  request<ActivityData>(`/admin/fingerprints/${encodeURIComponent(id)}/activity`)

export const fetchFingerprintRelated = (id: string) =>
  request<{ related: RelatedFingerprint[] }>(`/admin/fingerprints/${encodeURIComponent(id)}/related`)

export async function updateFingerprintNotes(id: string, notes: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/admin/fingerprints/${encodeURIComponent(id)}/notes`, {
    method:  'PUT',
    headers: adminHeaders(),
    body:    JSON.stringify({ notes }),
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
}

export const fetchCampaigns = () => request<Campaign[]>('/admin/campaigns')

export async function createCampaign(data: {
  name: string; notes?: string; fingerprintIds: string[]
}): Promise<Campaign> {
  const res = await fetch(`${BASE_URL}/admin/campaigns`, {
    method:  'POST',
    headers: adminHeaders(),
    body:    JSON.stringify(data),
  })
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status })
  return res.json() as Promise<Campaign>
}
