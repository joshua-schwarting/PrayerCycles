import { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { PrayerList, Prayer } from '../db/types'
import { getAllLists } from '../features/cycles/list-operations'
import { getPrayersByList } from '../features/prayers/prayer-operations'
import { completePrayer } from '../lib/surfacing'
import { cancelAll, ensurePermission, scheduleUpcoming } from '../lib/timer-notifications'
import { useT } from '../i18n'

type TimerMode = 'custom' | 'until-done'

export type TransitionSound = 'Ching' | 'Dooh' | 'Quowuwoo' | null
const SOUND_OPTIONS: TransitionSound[] = ['Ching', 'Dooh', 'Quowuwoo', null]
const SOUND_STORAGE_KEY = 'prayercycles_transition_sound'

function loadSavedSound(): TransitionSound {
  const saved = localStorage.getItem(SOUND_STORAGE_KEY)
  if (saved === 'null') return null
  if (SOUND_OPTIONS.includes(saved as TransitionSound)) return saved as TransitionSound
  return 'Ching'
}

function playTransitionSound(sound: TransitionSound) {
  if (!sound) return
  const audio = new Audio(`/audio/${sound}.mp3`)
  audio.play().catch(() => {})
}

/**
 * A running session, kept so closing the app (or iOS killing it) doesn't lose
 * the run: the deadline is an absolute moment, so it stays true while away.
 */
const SESSION_STORAGE_KEY = 'prayercycles_timer_session'

type SavedSession = {
  deadlineAt: number
  totalTime: number
  prayerIncrement: number
  timerMode: TimerMode
  customMinutes: number
  selectedListId: string | null
  completed: number[]
}

function loadSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedSession
    if (typeof saved?.deadlineAt !== 'number') return null
    return saved
  } catch {
    return null
  }
}

function clearSavedSession() {
  try { localStorage.removeItem(SESSION_STORAGE_KEY) } catch { /* private mode */ }
}

/** Which prayer a given elapsed time falls in. */
function indexAt(elapsed: number, increment: number, count: number) {
  return Math.min(Math.floor(elapsed / increment), Math.max(0, count - 1))
}

type TimerState = {
  lists: PrayerList[]
  selectedListId: string | null
  prayers: Prayer[]
  dropdownOpen: boolean
  prayerIncrement: number
  timerMode: TimerMode
  customMinutes: number
  running: boolean
  timeLeft: number
  totalTime: number
  currentIndex: number
  incrementTimeLeft: number
  transitionSound: TransitionSound
  setSelectedListId: (id: string | null) => void
  setDropdownOpen: (open: boolean) => void
  cycleTransitionSound: () => void
  setPrayerIncrement: (val: number) => void
  setTimerMode: (mode: TimerMode) => void
  setCustomMinutes: (val: number) => void
  setTimeLeft: (val: number) => void
  handleStart: () => void
  handlePause: () => void
  handleReset: () => void
  pickRandom: () => void
  refreshLists: () => void
  refreshPrayers: () => void
}

const TimerContext = createContext<TimerState | null>(null)

export function TimerProvider({ children }: { children: ReactNode }) {
  const { t } = useT()
  const [lists, setLists] = useState<PrayerList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [prayers, setPrayers] = useState<Prayer[]>([])
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const [prayerIncrement, setPrayerIncrement] = useState(60)
  const [timerMode, setTimerMode] = useState<TimerMode>('custom')
  const [customMinutes, setCustomMinutes] = useState(20)
  const [transitionSound, setTransitionSound] = useState<TransitionSound>(loadSavedSound)
  const hasAutoSwitched = useRef(false)
  const transitionSoundRef = useRef(transitionSound)
  useEffect(() => { transitionSoundRef.current = transitionSound }, [transitionSound])

  const cycleTransitionSound = useCallback(() => {
    setTransitionSound((prev) => {
      const idx = SOUND_OPTIONS.indexOf(prev)
      const next = SOUND_OPTIONS[(idx + 1) % SOUND_OPTIONS.length]
      localStorage.setItem(SOUND_STORAGE_KEY, String(next))
      if (next) playTransitionSound(next)
      return next
    })
  }, [])

  const [running, setRunning] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedIndicesRef = useRef<Set<number>>(new Set())
  /** Epoch ms the session ends at — the single source of truth while running. */
  const deadlineRef = useRef<number | null>(null)
  const timeLeftRef = useRef(0)
  useEffect(() => { timeLeftRef.current = timeLeft }, [timeLeft])
  const finishedLabelRef = useRef(t.timeboxFinished)
  useEffect(() => { finishedLabelRef.current = t.timeboxFinished }, [t])

  const refreshLists = useCallback(() => {
    getAllLists().then((all) => setLists(all.filter((l) => l.status === 'active')))
  }, [])

  useEffect(() => {
    refreshLists()
  }, [refreshLists])

  const loadPrayers = useCallback(() => {
    if (!selectedListId) { setPrayers([]); return }
    getPrayersByList(selectedListId).then(setPrayers)
  }, [selectedListId])

  // Load prayers when list changes
  useEffect(() => {
    loadPrayers()
  }, [loadPrayers])

  const refreshPrayers = useCallback(() => {
    loadPrayers()
  }, [loadPrayers])

  // Auto-switch to until-done once prayers exist (avoids goofy 1:00/0:00 on first launch)
  useEffect(() => {
    if (!hasAutoSwitched.current && prayers.length > 0) {
      hasAutoSwitched.current = true
      setTimerMode('until-done')
    }
  }, [prayers.length])

  const totalTime = timerMode === 'until-done'
    ? prayers.length * prayerIncrement
    : customMinutes * 60

  // Derive currentIndex and per-prayer countdown from timeLeft
  const elapsed = totalTime - timeLeft
  const currentIndex = prayerIncrement > 0
    ? Math.min(Math.floor(elapsed / prayerIncrement), Math.max(0, prayers.length - 1))
    : 0
  // When running, subtract 1 so the display counts through the current second
  // (e.g. 10s timer shows 9..8..7..0 instead of 10..9..8..1)
  const rawIncrementLeft = prayerIncrement > 0
    ? prayerIncrement - (elapsed % prayerIncrement)
    : 0
  const incrementTimeLeft = running ? Math.max(0, rawIncrementLeft - 1) : rawIncrementLeft

  const prevTotalTimeRef = useRef(totalTime)
  useEffect(() => {
    // Only reset timeLeft when totalTime actually changes (config change),
    // not when pausing/resuming
    if (prevTotalTimeRef.current !== totalTime && !running) {
      setTimeLeft(totalTime)
    }
    prevTotalTimeRef.current = totalTime
  }, [totalTime, running])

  // Track time per prayer and record completions when timer advances
  const prayersRef = useRef(prayers)
  const selectedListIdRef = useRef(selectedListId)
  const prayerIncrementRef = useRef(prayerIncrement)
  const totalTimeRef = useRef(totalTime)
  useEffect(() => { prayersRef.current = prayers }, [prayers])
  useEffect(() => { selectedListIdRef.current = selectedListId }, [selectedListId])
  useEffect(() => { prayerIncrementRef.current = prayerIncrement }, [prayerIncrement])
  useEffect(() => { totalTimeRef.current = totalTime }, [totalTime])

  // Every prayer in the timebox comes from the one selected list now, so a
  // prayer's index no longer has to be mapped back to a list of its own.
  function currentListId(): string | null {
    return selectedListIdRef.current
  }

  function recordCompleted(idx: number) {
    const prayer = prayersRef.current[idx]
    const listId = currentListId()
    if (!prayer || !listId) return
    if (completedIndicesRef.current.has(idx)) return
    completedIndicesRef.current.add(idx)
    completePrayer(prayer.id, listId)
  }

  /**
   * Bring the countdown in line with the clock. Everything reads from the
   * deadline rather than counting ticks, because iOS freezes this webview the
   * moment you switch apps — ticks go missing, the deadline doesn't move. So
   * coming back after four minutes away lands exactly where it should, and the
   * prayers passed on the way are all recorded.
   */
  const settle = useCallback(() => {
    const deadline = deadlineRef.current
    if (deadline === null) return
    const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    const prev = timeLeftRef.current
    if (next === prev) return

    const pp = prayersRef.current
    const inc = prayerIncrementRef.current
    const tt = totalTimeRef.current

    if (pp.length > 0 && inc > 0) {
      const prevIdx = indexAt(tt - prev, inc, pp.length)
      const finished = next <= 0
      const newIdx = finished ? pp.length - 1 : indexAt(tt - next, inc, pp.length)
      if (newIdx > prevIdx || finished) {
        // One sound even after a long absence — a burst of them helps nobody.
        playTransitionSound(transitionSoundRef.current)
        const lastToRecord = finished ? newIdx : newIdx - 1
        for (let i = prevIdx; i <= lastToRecord; i++) recordCompleted(i)
      }
    }

    timeLeftRef.current = next
    setTimeLeft(next)

    if (next <= 0) {
      deadlineRef.current = null
      setRunning(false)
      clearSavedSession()
      cancelAll()
    }
  }, [])

  useEffect(() => {
    if (running) {
      // Twice a second, so a return from the background corrects almost at once.
      intervalRef.current = setInterval(settle, 500)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [running, settle])

  // Catch up the moment we're looked at again, rather than up to half a second later.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') settle() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [settle])

  /**
   * Notifications are scheduled on the way out and cancelled on the way back in:
   * while you're looking at the app the in-app sound covers the prayer change,
   * and nothing stale is left pending after a pause.
   */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const handle = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        settle()
        cancelAll()
        return
      }
      const deadline = deadlineRef.current
      if (deadline === null) return
      scheduleUpcoming({
        prayers: prayersRef.current,
        currentIndex: indexAt(
          totalTimeRef.current - timeLeftRef.current,
          prayerIncrementRef.current,
          prayersRef.current.length,
        ),
        deadlineAt: deadline,
        prayerIncrement: prayerIncrementRef.current,
        totalTime: totalTimeRef.current,
        finishedLabel: finishedLabelRef.current,
      })
    })
    return () => { handle.then((h) => h.remove()) }
  }, [settle])

  /**
   * Pick a session back up after the app was closed or killed. A deadline still
   * in the future means the run is genuinely still going, so restore the list,
   * the settings it was using and the prayers already recorded. An expired one
   * is dropped rather than back-filling prayers nobody was present for.
   */
  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const saved = loadSavedSession()
    if (!saved) return
    if (saved.deadlineAt <= Date.now()) { clearSavedSession(); return }

    hasAutoSwitched.current = true
    setSelectedListId(saved.selectedListId)
    setTimerMode(saved.timerMode)
    setCustomMinutes(saved.customMinutes)
    setPrayerIncrement(saved.prayerIncrement)
    completedIndicesRef.current = new Set(saved.completed)
    const remaining = Math.max(0, Math.ceil((saved.deadlineAt - Date.now()) / 1000))
    timeLeftRef.current = remaining
    setTimeLeft(remaining)
    totalTimeRef.current = saved.totalTime
    deadlineRef.current = saved.deadlineAt
    setRunning(true)
  }, [])

  function saveSession(deadlineAt: number) {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
        deadlineAt,
        totalTime,
        prayerIncrement,
        timerMode,
        customMinutes,
        selectedListId,
        completed: [...completedIndicesRef.current],
      } satisfies SavedSession))
    } catch { /* private mode — the run just won't survive a kill */ }
  }

  function handleStart() {
    if (selectedListId && prayers.length === 0) return
    if (totalTime === 0) return
    let remaining = timeLeftRef.current
    if (timeLeft === 0) {
      remaining = totalTime
      timeLeftRef.current = totalTime
      setTimeLeft(totalTime)
      completedIndicesRef.current = new Set()
    }
    const deadlineAt = Date.now() + remaining * 1000
    deadlineRef.current = deadlineAt
    saveSession(deadlineAt)
    setRunning(true)
    // Ask once, early, so the first background switch can actually notify.
    ensurePermission()
  }

  function handlePause() {
    settle()
    deadlineRef.current = null
    setRunning(false)
    clearSavedSession()
    cancelAll()
  }

  function handleReset() {
    deadlineRef.current = null
    setRunning(false)
    timeLeftRef.current = totalTime
    setTimeLeft(totalTime)
    completedIndicesRef.current = new Set()
    clearSavedSession()
    cancelAll()
  }

  function pickRandom() {
    if (running || lists.length === 0) return
    const random = lists[Math.floor(Math.random() * lists.length)]
    setSelectedListId(random.id)
  }

  return (
    <TimerContext.Provider value={{
      lists,
      selectedListId,
      prayers,
      dropdownOpen,
      prayerIncrement,
      timerMode,
      customMinutes,
      running,
      timeLeft,
      totalTime,
      currentIndex,
      incrementTimeLeft,
      transitionSound,
      setSelectedListId,
      setDropdownOpen,
      cycleTransitionSound,
      setPrayerIncrement,
      setTimerMode,
      setCustomMinutes,
      setTimeLeft,
      handleStart,
      handlePause,
      handleReset,
      pickRandom,
      refreshLists,
      refreshPrayers,
    }}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const ctx = useContext(TimerContext)
  if (!ctx) throw new Error('useTimer must be used within TimerProvider')
  return ctx
}
