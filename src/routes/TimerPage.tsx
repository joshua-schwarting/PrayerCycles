import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Play, Pause, RotateCcw, Dices, ChevronDown, Volume2, VolumeX } from 'lucide-react'
import { FormattedText } from '../components/FormattedText'
import confetti from 'canvas-confetti'
import { useTimer } from '../context/TimerContext'
import { useT } from '../i18n'

type EditableTimeHandle = {
  startEditMin: () => void
}

const EditableTime = forwardRef<EditableTimeHandle, {
  seconds: number
  onChangeSeconds: (s: number) => void
  disabled: boolean
  onTabForward?: () => void
}>(function EditableTime({ seconds, onChangeSeconds, disabled, onTabForward }, ref) {
  const [editingPart, setEditingPart] = useState<'min' | 'sec' | null>(null)
  const [editMin, setEditMin] = useState('')
  const [editSec, setEditSec] = useState('')
  const minRef = useRef<HTMLInputElement>(null)
  const secRef = useRef<HTMLInputElement>(null)

  const m = Math.floor(seconds / 60)
  const s = seconds % 60

  useImperativeHandle(ref, () => ({
    startEditMin() {
      if (disabled) return
      setEditMin('')
      setEditSec(String(s))
      setEditingPart('min')
      setTimeout(() => minRef.current?.focus(), 0)
    },
  }))

  function startEdit(part: 'min' | 'sec') {
    if (disabled) return
    if (part === 'min') {
      setEditMin('')
      setEditSec(String(s))
    } else {
      setEditMin(String(m))
      setEditSec('')
    }
    setEditingPart(part)
    setTimeout(() => (part === 'min' ? minRef : secRef).current?.focus(), 0)
  }

  function commitEdit() {
    // If fields are empty, keep the original values (user clicked in and out without typing)
    const mins = editMin === '' ? m : Math.max(0, Math.min(999, parseInt(editMin) || 0))
    const secs = editSec === '' ? s : Math.max(0, Math.min(59, parseInt(editSec) || 0))
    const newVal = mins * 60 + secs
    if (newVal !== seconds) onChangeSeconds(newVal)
    setEditingPart(null)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') commitEdit()
    if (e.key === 'Escape') setEditingPart(null)
    if (e.key === 'Tab' && editingPart === 'min') {
      e.preventDefault()
      setEditMin(editMin || String(m))
      setEditingPart('sec')
      setEditSec('')
      setTimeout(() => secRef.current?.focus(), 0)
    }
    if (e.key === 'Tab' && editingPart === 'sec') {
      if (onTabForward) {
        e.preventDefault()
        commitEdit()
        onTabForward()
      }
    }
  }

  const clickClass = disabled ? '' : 'cursor-pointer hover:text-accent-hover transition-colors'

  return (
    <div className="flex items-center gap-0.5 justify-center" onBlur={(e) => {
      if (editingPart && !e.currentTarget.contains(e.relatedTarget)) commitEdit()
    }}>
      {editingPart === 'min' ? (
        <input
          ref={minRef}
          type="text"
          inputMode="numeric"
          value={editMin}
          onChange={(e) => setEditMin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKeyDown}
          className="w-14 text-2xl font-bold rounded bg-input px-1 py-0.5 text-text text-center outline-none focus:ring-2 focus:ring-accent"
        />
      ) : (
        <span
          onClick={() => startEdit('min')}
          className={`text-3xl font-bold text-text tracking-wider ${clickClass}`}
          title={disabled ? undefined : 'Click to edit minutes'}
        >
          {String(m).padStart(2, '0')}
        </span>
      )}
      <span className="text-3xl font-bold text-text-muted">:</span>
      {editingPart === 'sec' ? (
        <input
          ref={secRef}
          type="text"
          inputMode="numeric"
          value={editSec}
          onChange={(e) => setEditSec(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKeyDown}
          className="w-14 text-2xl font-bold rounded bg-input px-1 py-0.5 text-text text-center outline-none focus:ring-2 focus:ring-accent"
        />
      ) : (
        <span
          onClick={() => startEdit('sec')}
          className={`text-3xl font-bold text-text tracking-wider ${clickClass}`}
          title={disabled ? undefined : 'Click to edit seconds'}
        >
          {String(s).padStart(2, '0')}
        </span>
      )}
    </div>
  )
})

export function TimerPage() {
  const { t } = useT()
  const [localDropdown, setLocalDropdown] = useState(false)
  const {
    lists,
    selectedListId,
    prayers,
    prayerIncrement,
    timerMode,
    running,
    timeLeft,
    totalTime,
    currentIndex,
    incrementTimeLeft,
    transitionSound,
    setSelectedListId,
    setPrayerIncrement,
    setTimerMode,
    setCustomMinutes,
    setTimeLeft,
    handleStart,
    handlePause,
    handleReset,
    pickRandom,
    refreshLists,
    cycleTransitionSound,
  } = useTimer()

  const timeboxRef = useRef<HTMLDivElement>(null)
  const totalTimeRef = useRef<EditableTimeHandle>(null)
  const prevTimeLeftRef = useRef(timeLeft)
  const wasRunningRef = useRef(false)

  // Hold a screen wake lock while this page is open so the phone doesn't
  // dim mid-prayer. Re-acquired when returning to the tab, since iOS drops it.
  useEffect(() => {
    type WakeLockSentinel = { release: () => Promise<void> }
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> } }
    if (!nav.wakeLock) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const lock = await nav.wakeLock!.request('screen')
        if (cancelled) { lock.release().catch(() => {}); return }
        sentinel = lock
      } catch {
        // denied or unsupported — the screen just dims as usual
      }
    }
    acquire()

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release().catch(() => {})
    }
  }, [])

  // Refresh lists when page is visited
  useEffect(() => { refreshLists() }, [refreshLists])

  // Confetti when timer completes
  const fireConfetti = useCallback(() => {
    const el = timeboxRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight

    const defaults = { origin: { x, y }, zIndex: 5, ticks: 160 }

    confetti({ ...defaults, particleCount: 150, spread: 360, startVelocity: 36, scalar: 1.3 })
    confetti({ ...defaults, particleCount: 100, spread: 180, startVelocity: 46, angle: 60 })
    confetti({ ...defaults, particleCount: 100, spread: 180, startVelocity: 46, angle: 120 })
  }, [])

  useEffect(() => {
    if (running) wasRunningRef.current = true
  }, [running])

  useEffect(() => {
    if (wasRunningRef.current && prevTimeLeftRef.current > 0 && timeLeft === 0 && !running && prayers.length > 0) {
      fireConfetti()
      wasRunningRef.current = false
    }
    prevTimeLeftRef.current = timeLeft
  }, [timeLeft, running, prayers.length, fireConfetti])

  const selectedList = lists.find((l) => l.id === selectedListId)
  const displayName = selectedList?.name ?? t.selectAPrayerList
  const hasSelection = !!selectedList
  const currentPrayer = prayers.length > 0 ? (prayers[currentIndex] ?? prayers[0]) : null

  // Big timer: shows per-prayer countdown when running or paused mid-session
  const midSession = timeLeft > 0 && timeLeft < totalTime
  const bigTimerValue = (running || midSession) ? incrementTimeLeft : prayerIncrement
  // Total timer: shows total timebox countdown (subtract 1 when running to count through current second)
  const totalTimerValue = running ? Math.max(0, timeLeft - 1) : timeLeft

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-4 pb-nav pt-4">
      <div className="mx-auto flex w-full min-h-0 flex-1 max-w-2xl flex-col space-y-3">

        {/* Timebox — timers on top, the prayer gets the whole width below so a
            long description isn't squeezed into a narrow column. */}
        <div
          ref={timeboxRef}
          className="relative z-10 flex min-h-[260px] flex-1 flex-col rounded-lg border-2 border-accent-text/80 bg-card shadow-[0_0_14px_var(--color-accent-glow)]"
        >
          {/* ---- Timer panel ---- */}
          <div className="shrink-0 space-y-3 border-b border-border p-4">

            {/* List selector + random pick */}
            <div className="relative">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { if (!running) setLocalDropdown(!localDropdown) }}
                  className={`flex flex-1 min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-input px-3 py-2 text-left transition-colors hover:border-border-light ${running ? 'opacity-50' : ''}`}
                >
                  <span className={`truncate text-base font-semibold ${hasSelection ? 'text-text' : 'text-text-muted'}`}>
                    {displayName}
                  </span>
                  <ChevronDown size={18} className={`shrink-0 text-text-tertiary transition-transform ${localDropdown ? 'rotate-180' : ''}`} />
                </button>
                <button
                  onClick={pickRandom}
                  className={`shrink-0 rounded-lg border border-border bg-input p-2 text-text-tertiary transition-colors hover:bg-input-hover hover:text-text-secondary ${running ? 'opacity-50' : ''}`}
                  title={t.pickRandomList}
                >
                  <Dices size={20} />
                </button>
              </div>

              {localDropdown && !running && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLocalDropdown(false)} />
                  <div className="absolute z-50 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                    {lists.map((list) => (
                      <button
                        key={list.id}
                        onClick={() => { setSelectedListId(list.id); setLocalDropdown(false) }}
                        className={`w-full px-4 py-3 text-left text-sm transition-colors hover:bg-input ${selectedListId === list.id ? 'text-accent-text' : 'text-text-secondary'}`}
                      >
                        {list.name}
                      </button>
                    ))}
                    {lists.length === 0 && (
                      <div className="px-4 py-3 text-sm italic text-text-muted">{t.noOtherLists}</div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Sound choice + auto-adjust */}
            <div className="flex items-center justify-between">
              <button
                onClick={cycleTransitionSound}
                className="flex items-center gap-1"
                title={transitionSound ?? 'No Sound'}
              >
                {transitionSound
                  ? <Volume2 size={13} className="text-text-muted" />
                  : <VolumeX size={13} className="text-text-muted" />}
                <span className="whitespace-nowrap text-[10px] text-text-muted">{transitionSound ?? 'No Sound'}</span>
              </button>

              <button
                onClick={() => {
                  if (!running) {
                    if (timerMode === 'until-done') {
                      setCustomMinutes(Math.max(1, Math.ceil(totalTime / 60)))
                      setTimerMode('custom')
                    } else {
                      setTimerMode('until-done')
                    }
                  }
                }}
                disabled={running}
                className={`flex items-center gap-1.5 ${running ? 'opacity-50' : ''}`}
                title={timerMode === 'until-done' ? t.autoToggleOnTooltip : t.autoToggleOffTooltip}
              >
                <span className="whitespace-nowrap text-[10px] text-text-muted">{t.autoAdjust}</span>
                <div className={`relative h-[16px] w-7 rounded-full transition-colors duration-200 ${timerMode === 'until-done' ? 'bg-toggle' : 'bg-input'}`}>
                  <div className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white shadow transition-transform duration-200 ${timerMode === 'until-done' ? 'translate-x-[13px]' : 'translate-x-[2px]'}`} />
                </div>
              </button>
            </div>

            {/* Timers side by side */}
            <div className="flex items-start justify-center gap-8">
              <div className="text-center" title="Time per prayer — click to edit">
                <div className="mb-1 text-[10px] text-text-muted">{t.timePerPrayer}</div>
                <EditableTime
                  seconds={bigTimerValue}
                  onChangeSeconds={setPrayerIncrement}
                  disabled={running}
                  onTabForward={() => totalTimeRef.current?.startEditMin()}
                />
              </div>
              <div className="text-center" title="Total timebox — click to edit">
                <div className="mb-1 text-[10px] text-text-muted">{t.totalTimebox}</div>
                <EditableTime
                  ref={totalTimeRef}
                  seconds={totalTimerValue}
                  onChangeSeconds={(sec) => {
                    if (!running) {
                      setCustomMinutes(Math.max(1, Math.ceil(sec / 60)))
                      setTimeLeft(sec)
                      if (prayers.length > 0) {
                        setPrayerIncrement(Math.max(1, Math.floor(sec / prayers.length)))
                      }
                    }
                  }}
                  disabled={running}
                />
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-2">
              {!running ? (
                <button
                  onClick={handleStart}
                  disabled={!selectedListId || prayers.length === 0}
                  className="rounded-full bg-input p-2.5 text-text transition-colors hover:bg-input-hover disabled:cursor-not-allowed disabled:opacity-30"
                  aria-label={t.startTimer}
                >
                  <Play size={20} />
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="rounded-full bg-input p-2.5 text-text transition-colors hover:bg-input-hover"
                  aria-label={t.pauseTimer}
                >
                  <Pause size={20} />
                </button>
              )}
              <button
                onClick={handleReset}
                className="rounded-full bg-input p-2.5 text-text-tertiary transition-colors hover:bg-input-hover"
                aria-label={t.resetTimer}
              >
                <RotateCcw size={20} />
              </button>
            </div>
          </div>

          {/* ---- Current prayer, full width ---- */}
          {/* data-no-page-swipe keeps the page-swipe handler off this
              gesture: without it a drag here is a candidate for changing pages,
              and the description never gets to scroll. overscroll-contain stops
              the drag continuing into the page behind once it hits the end. */}
          <div
            data-no-page-swipe
            className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain break-words p-4"
            style={{ touchAction: 'pan-y' }}
          >
            {currentPrayer ? (
              <>
                <div className="flex-1">
                  {running && (
                    <div className="mb-1 text-xs uppercase tracking-wide text-accent-text">{t.nowPraying}</div>
                  )}
                  {(() => {
                    const parentList = currentPrayer.listIds
                      .map((lid) => lists.find((l) => l.id === lid))
                      .find((l) => l !== undefined)
                    return parentList ? (
                      <div className="mb-0.5 text-[11px] text-text-muted">{parentList.name}</div>
                    ) : null
                  })()}
                  <h3 className="text-lg font-semibold text-text">{currentPrayer.title}</h3>
                  {currentPrayer.description && (
                    <FormattedText text={currentPrayer.description} className="mt-2 text-sm text-text-secondary" />
                  )}
                </div>
                {/* Tags run along the bottom left; the position sits in the corner */}
                <div className="mt-3 flex items-end justify-between gap-2">
                  <div className="flex flex-wrap gap-1">
                    {(() => {
                      const tagSet = new Set<string>(currentPrayer.tags ?? [])
                      for (const lid of currentPrayer.listIds) {
                        const parentList = lists.find((l) => l.id === lid)
                        if (parentList) for (const tg of parentList.tags ?? []) tagSet.add(tg)
                      }
                      return [...tagSet].map((tag) => (
                        <span key={tag} className="rounded-full bg-input px-2 py-0.5 text-[10px] text-text-muted">
                          #{tag}
                        </span>
                      ))
                    })()}
                  </div>
                  {prayers.length > 0 && (
                    <span className="shrink-0 text-[10px] text-text-muted">
                      {t.positionOf(currentIndex + 1, prayers.length)}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="text-center text-sm italic text-text-muted">
                  {selectedListId ? t.noPrayersInThisList : t.selectAPrayerList}
                </div>
              </div>
            )}
          </div>
        </div>

        {selectedListId && prayers.length === 0 && (
          <p className="pt-2 text-sm italic text-text-muted">{t.noPrayersInListYet}</p>
        )}

      </div>
    </div>
  )
}
