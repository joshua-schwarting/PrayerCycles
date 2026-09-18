export type ListStatus = 'active' | 'archived' | 'deleted'

export type RotationState = {
  queue: string[]
  pointer: number
  lastCadenceBoundary: number
  tallyOffsets: Record<string, number>
}

export type PrayerList = {
  id: string
  name: string
  description: string
  status: ListStatus
  rotationState: RotationState
  completionTally: number
  createdAt: number
  deletedAt?: number
  tags: string[]
}

export type Prayer = {
  id: string
  title: string
  description: string
  listIds: string[]
  createdAt: number
  lastPrayedAt: number | null
  prayerTally: number
  sortOrder?: Record<string, number>
  tags: string[]
}

