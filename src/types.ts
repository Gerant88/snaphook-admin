export interface SightingRow {
  id:                 number
  lat:                number | null
  lng:                number | null
  threatScore:        number
  radioType:          string
  signalStrength:     number | null
  estimatedDistanceM: number | null
  fingerprintId:      string | null
  timestamp:          string
}

export interface SightingsPage {
  data:       SightingRow[]
  total:      number
  page:       number
  limit:      number
  totalPages: number
}

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
  isAppConfig: boolean
  updatedAt:   string
}

export interface ChartPoint {
  date: string
  count: number
}

export interface Hotzone {
  id:               number
  centerLat:        number
  centerLng:        number
  radius:           number
  reportCount:      number
  firstSeen:        string
  lastSeen:         string
  updatedAt:        string
  fingerprintId:    string | null
  triLat:           number | null
  triLng:           number | null
  triConfidenceM:   number | null
  triReporterCount: number | null
  isMobile:         boolean
  lastTriangulated: string | null
}

// GER-62: Threat Profile types
export interface ThreatProfile {
  fingerprintId:        string
  cellId:               number | null
  mcc:                  string | null
  mnc:                  string | null
  lac:                  number | null
  radioType:            string
  firstSeen:            string
  lastSeen:             string
  totalSightings:       number
  uniqueReporters:      number
  threatClassification: 'NO_IDENTITY' | 'UNKNOWN_TOWER' | 'STRONG_SIGNAL'
  status:               'ACTIVE' | 'DORMANT' | 'INACTIVE'
  sightingPoints:       { lat: number; lng: number; timestamp: string; threatScore: number }[]
  hotzone:              { triLat: number | null; triLng: number | null; triConfidenceM: number | null; isMobile: boolean; triReporterCount: number | null } | null
  avgSignalStrength:    number | null
  minSignalStrength:    number | null
  maxSignalStrength:    number | null
  avgDistanceM:         number | null
  minDistanceM:         number | null
  maxDistanceM:         number | null
  notes:                string | null
  campaigns:            { id: number; name: string }[]
  correlationEvents:    number
  correlatedConfidence: number | null
  correlationBreakdown: Record<string, number>
  correlationList:      { correlationType: string; boost: number; timestamp: string }[]
}

export interface ActivityData {
  grid:        { hour: number; dow: number; count: number }[]
  dailySeries: { date: string; count: number }[]
  peakHour:    number
  peakDow:     number
}

export interface RelatedFingerprint {
  fingerprintId:       string
  distanceM:           number
  temporalOverlapPct:  number
  sightingCount:       number
  confidence:          number
}

export interface Campaign {
  id:             number
  name:           string
  notes:          string | null
  fingerprintIds: string[]
  createdAt:      string
  updatedAt:      string
}
