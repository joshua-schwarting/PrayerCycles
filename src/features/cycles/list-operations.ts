import { db } from '../../db/db'
import { generateId } from '../../lib/id'
import { snapshotToLocalStorage } from '../backup/local-backup'
import type { ListStatus, PrayerList } from '../../db/types'

export const UNSCHEDULED_ID = '__unscheduled__'

export async function ensureUnscheduledList(): Promise<void> {
  const existing = await db.prayerLists.get(UNSCHEDULED_ID)
  if (existing) return
  const list: PrayerList = {
    id: UNSCHEDULED_ID,
    name: 'Unscheduled',
    description: '',
    status: 'active',
    rotationState: { queue: [], pointer: 0, lastCadenceBoundary: Date.now(), tallyOffsets: {} },
    completionTally: 0,
    createdAt: 0,
    tags: [],
  }
  try {
    await db.prayerLists.add(list)
  } catch {
    // ConstraintError from a concurrent startup (StrictMode double-mount)
    // means another call already created it — that's fine.
  }
}

export async function createList(
  name: string,
  description = '',
  initialPrayerTitles: string[] = [],
  tags: string[] = [],
): Promise<string> {
  const id = generateId()

  const queue: string[] = []
  const now = Date.now()
  const prayersToAdd = initialPrayerTitles
    .map((t) => t.trim())
    .filter(Boolean)
    .map((title, i) => {
      const prayerId = generateId()
      queue.push(prayerId)
      return {
        id: prayerId,
        title,
        description: '',
        listIds: [id],
        createdAt: now + i,
        lastPrayedAt: null,
        prayerTally: 0,
        sortOrder: {},
        tags: [] as string[],
      }
    })

  const list: PrayerList = {
    id,
    name,
    description,
    status: 'active',
    rotationState: { queue, pointer: 0, lastCadenceBoundary: Date.now(), tallyOffsets: {} },
    completionTally: 0,
    createdAt: Date.now(),
    tags,
  }

  await db.transaction('rw', [db.prayerLists, db.prayers], async () => {
    await db.prayerLists.add(list)
    if (prayersToAdd.length > 0) {
      await db.prayers.bulkAdd(prayersToAdd)
    }
  })

  snapshotToLocalStorage()
  return id
}

export async function getList(id: string): Promise<PrayerList | undefined> {
  return db.prayerLists.get(id)
}

export async function getAllLists(): Promise<PrayerList[]> {
  return db.prayerLists.orderBy('createdAt').toArray()
}

export async function getListsByStatus(status: ListStatus): Promise<PrayerList[]> {
  return db.prayerLists.where('status').equals(status).sortBy('createdAt')
}

export async function updateList(
  id: string,
  changes: Partial<Omit<PrayerList, 'id' | 'createdAt'>>,
): Promise<void> {
  const existing = await db.prayerLists.get(id)
  if (!existing) return
  await db.prayerLists.put({ ...existing, ...changes })
  snapshotToLocalStorage()
}

export async function archiveList(id: string): Promise<void> {
  const list = await db.prayerLists.get(id)
  if (list) await db.prayerLists.put({ ...list, status: 'archived' })
  snapshotToLocalStorage()
}

export async function reactivateList(id: string): Promise<void> {
  const list = await db.prayerLists.get(id)
  if (list) await db.prayerLists.put({ ...list, status: 'active' })
  snapshotToLocalStorage()
}

export async function deleteList(id: string): Promise<void> {
  await db.transaction('rw', [db.prayerLists, db.prayers], async () => {
    const list = await db.prayerLists.get(id)
    if (list) await db.prayerLists.put({ ...list, status: 'deleted', deletedAt: Date.now() })
    const prayers = await db.prayers.where('listIds').equals(id).toArray()
    for (const prayer of prayers) {
      const remaining = prayer.listIds.filter((lid) => lid !== id)
      if (remaining.length === 0) {
        await db.prayers.delete(prayer.id)
      } else {
        await db.prayers.put({ ...prayer, listIds: remaining })
      }
    }
  })
  snapshotToLocalStorage()
}

export async function restoreList(id: string): Promise<void> {
  const list = await db.prayerLists.get(id)
  if (list) await db.prayerLists.put({ ...list, status: 'active', deletedAt: undefined })
  snapshotToLocalStorage()
}

export async function getDeletedLists(): Promise<PrayerList[]> {
  return db.prayerLists.where('status').equals('deleted').sortBy('createdAt')
}

const FIFTY_DAYS_MS = 50 * 24 * 60 * 60 * 1000

export async function purgeExpiredLists(): Promise<void> {
  const cutoff = Date.now() - FIFTY_DAYS_MS
  const deleted = await db.prayerLists.where('status').equals('deleted').toArray()
  const expired = deleted.filter((l) => l.deletedAt && l.deletedAt < cutoff)
  if (expired.length === 0) return

  await db.transaction('rw', [db.prayerLists, db.prayers], async () => {
    for (const list of expired) {
      const prayers = await db.prayers.where('listIds').equals(list.id).toArray()
      for (const prayer of prayers) {
        const remaining = prayer.listIds.filter((lid) => lid !== list.id)
        if (remaining.length === 0) {
          await db.prayers.delete(prayer.id)
        } else {
          await db.prayers.put({ ...prayer, listIds: remaining })
        }
      }
      await db.prayerLists.delete(list.id)
    }
  })
  snapshotToLocalStorage()
}
