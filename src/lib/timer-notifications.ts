import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { Prayer } from '../db/types'

/**
 * Local notifications for a running timebox — the only way the app can tell you
 * a prayer changed while it is in the background, since iOS freezes the webview
 * and the in-app sound can't play. Nothing here is a push notification: there is
 * no server, no entitlement and no App ID capability involved.
 *
 * Ours live in one id range so cancelling never touches anyone else's.
 */
const ID_BASE = 7100
/** iOS keeps 64 pending notifications per app; stay well under. */
const MAX_SCHEDULED = 48

function available() {
  return Capacitor.isNativePlatform()
}

/** Asked the first time a timer starts, not at launch. */
export async function ensurePermission(): Promise<boolean> {
  if (!available()) return false
  try {
    const current = await LocalNotifications.checkPermissions()
    if (current.display === 'granted') return true
    if (current.display === 'denied') return false
    const asked = await LocalNotifications.requestPermissions()
    return asked.display === 'granted'
  } catch {
    return false
  }
}

export async function cancelAll(): Promise<void> {
  if (!available()) return
  try {
    const pending = await LocalNotifications.getPending()
    const ours = pending.notifications.filter((n) => n.id >= ID_BASE && n.id < ID_BASE + MAX_SCHEDULED + 1)
    if (ours.length > 0) {
      await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) })
    }
  } catch {
    // A failed cancel just leaves a stale banner; never worth breaking the timer.
  }
}

type ScheduleArgs = {
  prayers: Prayer[]
  currentIndex: number
  /** Epoch ms when the whole session ends. */
  deadlineAt: number
  prayerIncrement: number
  totalTime: number
  finishedLabel: string
}

/**
 * One notification per prayer change still ahead of us, at its absolute time,
 * plus one when the session ends. Prayer i starts when the clock says
 * `deadline - (totalTime - i * increment)`, so each fires without the app
 * needing to be awake.
 */
export async function scheduleUpcoming({
  prayers,
  currentIndex,
  deadlineAt,
  prayerIncrement,
  totalTime,
  finishedLabel,
}: ScheduleArgs): Promise<void> {
  if (!available() || prayers.length === 0 || prayerIncrement <= 0) return
  const granted = await ensurePermission()
  if (!granted) return

  await cancelAll()

  const now = Date.now()
  const notifications = []
  for (let i = currentIndex + 1; i < prayers.length && notifications.length < MAX_SCHEDULED; i++) {
    const at = deadlineAt - (totalTime - i * prayerIncrement) * 1000
    // Anything inside the next second has effectively already happened.
    if (at <= now + 1000) continue
    notifications.push({
      id: ID_BASE + notifications.length,
      title: prayers[i].title,
      body: `${i + 1} of ${prayers.length}`,
      schedule: { at: new Date(at) },
    })
  }
  if (deadlineAt > now + 1000 && notifications.length < MAX_SCHEDULED) {
    notifications.push({
      id: ID_BASE + notifications.length,
      title: finishedLabel,
      body: '',
      schedule: { at: new Date(deadlineAt) },
    })
  }
  if (notifications.length === 0) return

  try {
    await LocalNotifications.schedule({ notifications })
  } catch {
    // Permission revoked mid-session, or the OS refused — the in-app timer is
    // still correct, you just don't get the banner.
  }
}
