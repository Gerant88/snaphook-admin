export interface RecentSighting {
  id: number
  lat: number | null
  lng: number | null
  threatScore: number
  radioType: string
  fingerprintId: string | null
  estimatedDistanceM: number | null
  timestamp: string
}

export interface StatsResponse {
  sightings: {
    total: number
    last7days: number
    last30days: number
  }
  threatTypes: {
    NO_IDENTITY: number
    UNKNOWN_TOWER: number
    STRONG_SIGNAL: number
  }
  hotzones: {
    active: number
  }
  recentSightings: RecentSighting[]
}

export interface ConfigEntry {
  key:         string
  value:       string
  type:        'float' | 'int' | 'bool' | 'string'
  label:       string
  description: string
  minValue:    number | null
  maxValue:    number | null
  updatedAt:   string
}

export interface ChartPoint {
  date: string
  count: number
}

export interface Hotzone {
  id: number
  centerLat: number
  centerLng: number
  radius: number
  reportCount: number
  firstSeen: string
  lastSeen: string
  updatedAt: string
}
