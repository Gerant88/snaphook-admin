import type { StatsResponse, ChartPoint, Hotzone } from './types'

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
export const fetchChart    = ()  => request<ChartPoint[]>('/admin/sightings/chart')
export const fetchHotzones = ()  => request<Hotzone[]>('/admin/hotzones')
