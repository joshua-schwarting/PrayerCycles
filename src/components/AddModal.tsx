import { useState, useEffect, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useT } from '../i18n'
import { useTimer } from '../context/TimerContext'
import { TagInput } from './TagInput'
import type { PrayerList } from '../db/types'
import { createList, updateList, getList, getAllLists, UNSCHEDULED_ID } from '../features/cycles/list-operations'
import { createPrayer, bulkCreatePrayers } from '../features/prayers/prayer-operations'
import { getAllTags } from '../features/tags/tag-operations'

type AddModalProps = {
  open: boolean
  onClose: () => void
  /** Receives the list to scroll to on the lists page, so a new entry isn't lost. */
  onAdded: (focusListId?: string) => void
  /** Opens straight into "add a prayer" with this list already chosen. */
  initialListId?: string
  /** Opens the same wizard over an existing list, to edit it rather than create. */
  editListId?: string
}

type Mode = 'create-list' | 'add-single' | 'edit-list'

const LIST_STEPS = ['name', 'people'] as const
const PRAYER_STEPS = ['who', 'list', 'details'] as const
type StepKey = (typeof LIST_STEPS)[number] | (typeof PRAYER_STEPS)[number]

/** Steps that open the keyboard when you land on them. */
const TEXT_STEPS: StepKey[] = ['name', 'who', 'people']

/** Fraction of the card you must drag before it commits to the next step. */
const COMMIT_RATIO = 0.28
/** px/ms — a quick flick commits even if you didn't drag far. */
const FLICK_VELOCITY = 0.4

export function AddModal({ open, onClose, onAdded, initialListId, editListId }: AddModalProps) {
  const { t } = useT()
  const { refreshLists: refreshTimerLists } = useTimer()
  const [mode, setMode] = useState<Mode>('create-list')
  const [step, setStep] = useState(0)
  const [lists, setLists] = useState<PrayerList[]>([])
  const [existingTags, setExistingTags] = useState<string[]>([])

  // Create list fields
  const [listName, setListName] = useState('')
  const [listDescription, setListDescription] = useState('')
  const [initialPrayers, setInitialPrayers] = useState('')
  const [listTags, setListTags] = useState<string[]>([])

  // Add prayer fields
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedListId, setSelectedListId] = useState('')
  const addDescRef = useRef<HTMLTextAreaElement>(null)
  const [prayerTags, setPrayerTags] = useState<string[]>([])

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  // Swipe/drag state
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragX, setDragX] = useState(0)
  const [animating, setAnimating] = useState(false)
  const gestureStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const axis = useRef<'h' | 'v' | null>(null)

  const isListMode = mode === 'create-list' || mode === 'edit-list'
  const steps: readonly StepKey[] = isListMode ? LIST_STEPS : PRAYER_STEPS
  const total = steps.length
  const current = steps[step]
  const isLast = step === total - 1

  useEffect(() => {
    if (open) {
      getAllLists().then(setLists)
      getAllTags().then(setExistingTags)
      // Arriving from a list's "+ Prayer" skips the choice of what to make.
      setMode(editListId ? 'edit-list' : initialListId ? 'add-single' : 'create-list')
      setSelectedListId(initialListId ?? '')
      setStep(0)
      setDragX(0)
      if (editListId) {
        getList(editListId).then((l) => {
          if (!l) return
          setListName(l.name)
          setListDescription(l.description)
          setListTags(l.tags ?? [])
          setInitialPrayers('')
        })
      }
    }
  }, [open, initialListId, editListId])

  // On open, focus immediately so the keyboard rises with the modal as a single
  // motion (a delay here reads as the window "glitching" a moment later). When
  // moving between steps, wait for the slide to settle first.
  const justOpened = useRef(true)
  useEffect(() => {
    if (!open) {
      justOpened.current = true
      return
    }
    if (!TEXT_STEPS.includes(current)) return
    const delay = justOpened.current ? 0 : 340
    justOpened.current = false
    const id = setTimeout(() => {
      const panel = trackRef.current?.querySelector(`[data-step="${current}"]`)
      panel?.querySelector<HTMLElement>('input[type="text"], textarea')?.focus()
    }, delay)
    return () => clearTimeout(id)
  }, [open, current])

  function reset() {
    setListName('')
    setListDescription('')
    setInitialPrayers('')
    setListTags([])
    setTitle('')
    setDescription('')
    setSelectedListId('')
    setPrayerTags([])
    setMode('create-list')
    setStep(0)
    setDragX(0)
    setSaveError(null)
    setSaving(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function switchMode(m: Mode) {
    setMode(m)
    setStep(0)
    setDragX(0)
    setSaveError(null)
  }

  /** Nothing is mandatory — every list already has its own id. */
  function canLeave(_index: number): boolean {
    return true
  }

  function goTo(next: number) {
    if (next < 0 || next > total - 1) return
    if (next > step && !canLeave(step)) return
    setAnimating(true)
    setStep(next)
  }

  // ---- Drag handling -------------------------------------------------
  // touch-action: pan-y on the track means vertical scrolling stays native
  // and horizontal gestures come to us, with no preventDefault needed.
  function onTouchStart(e: React.TouchEvent) {
    if (saving) return
    const p = e.touches[0]
    gestureStart.current = { x: p.clientX, y: p.clientY, t: Date.now() }
    axis.current = null
    setAnimating(false)
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = gestureStart.current
    if (!start) return
    const p = e.touches[0]
    const dx = p.clientX - start.x
    const dy = p.clientY - start.y

    if (!axis.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
      axis.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (axis.current !== 'h') return

    // Rubber-band when there's nowhere to go that way.
    const blocked =
      (dx < 0 && (isLast || !canLeave(step))) || (dx > 0 && step === 0)
    setDragX(blocked ? dx * 0.22 : dx)
  }

  function onTouchEnd() {
    const start = gestureStart.current
    gestureStart.current = null
    const wasHorizontal = axis.current === 'h'
    axis.current = null
    if (!start || !wasHorizontal) return

    const width = trackRef.current?.offsetWidth || 320
    const elapsed = Math.max(Date.now() - start.t, 1)
    const velocity = Math.abs(dragX) / elapsed
    const commit = Math.abs(dragX) > width * COMMIT_RATIO || velocity > FLICK_VELOCITY

    setAnimating(true)
    if (commit) {
      if (dragX < 0) goTo(step + 1)
      else goTo(step - 1)
    }
    setDragX(0)
  }
  // --------------------------------------------------------------------

  function burst() {
    const el = cardRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (rect.left + rect.width / 2) / window.innerWidth
    const y = (rect.top + rect.height / 2) / window.innerHeight
    // One modest puff rather than three overlapping bursts: 350 particles
    // filling the screen read as a celebration of the app rather than of the
    // list you just made. Above the sheet's z-index so it still shows over it.
    confetti({
      origin: { x, y },
      zIndex: 70,
      ticks: 90,
      particleCount: 45,
      spread: 60,
      startVelocity: 24,
      scalar: 0.9,
      gravity: 1.2,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Enter on a non-final step just advances.
    if (!isLast) {
      goTo(step + 1)
      return
    }
    setSaveError(null)
    setSaving(true)
    burst()
    try {
      let focusListId: string | undefined
      if (mode === 'edit-list' && editListId) {
        await updateList(editListId, {
          name: listName.trim(),
          description: listDescription.trim(),
          tags: listTags,
        })
        // The people step adds to the list here rather than defining it, so an
        // edit that only renames the list leaves its prayers untouched.
        const added = initialPrayers.split('\n').map((x) => x.trim()).filter(Boolean)
        if (added.length) await bulkCreatePrayers(added, editListId)
        refreshTimerLists()
        focusListId = editListId
      } else if (mode === 'create-list') {
        const titles = initialPrayers.split('\n').filter((x) => x.trim())
        focusListId = await createList(
          listName.trim(),
          listDescription.trim(),
          titles,
          listTags,
        )
        refreshTimerLists()
      } else {
        focusListId = selectedListId || UNSCHEDULED_ID
        await createPrayer(title.trim(), [focusListId], description.trim(), prayerTags)
      }
      reset()
      onAdded(focusListId)
      onClose()
    } catch (err) {
      setSaving(false)
      setSaveError(err instanceof Error ? `${err.name}: ${err.message}` : String(err))
    }
  }

  const selectableLists = lists.filter((l) => l.status !== 'deleted' && l.id !== UNSCHEDULED_ID)

  if (!open) return null

  const inputClass =
    'w-full rounded-lg bg-input px-3 py-3 text-text placeholder-text-tertiary outline-none focus:ring-2 focus:ring-text-muted'
  const pill = (active: boolean) =>
    `rounded-lg px-4 py-2 text-sm transition-colors ${active ? 'bg-input-hover text-text' : 'bg-input text-text-tertiary'}`
  // Small-caps renders the first letter full height and the rest as smaller
  // capitals, which is the look we want for the step titles.
  const titleClass = 'text-center text-2xl font-semibold tracking-wide text-text [font-variant:small-caps]'
  const subtitle = 'text-center text-sm text-text-tertiary/70'

  function renderStep(key: StepKey) {
    switch (key) {
      case 'name':
        return (
          <>
            <p className={titleClass}>List Name</p>
            <p className={subtitle}>{t.qListName}</p>
            <input
              type="text"
              placeholder={t.listName}
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              className={`${inputClass} text-center`}
            />
            <div>
              <textarea
                placeholder={t.listDescriptionOptional}
                value={listDescription}
                onChange={(e) => setListDescription(e.target.value.slice(0, 500))}
                rows={3}
                maxLength={500}
                className={`${inputClass} resize-none text-center`}
              />
              <div className="mt-1 text-right text-xs text-text-muted">{listDescription.length}/500</div>
            </div>
          </>
        )

      case 'people':
        return (
          <>
            <p className={titleClass}>{t.prayersAndTags}</p>
            <p className={`${subtitle} flex flex-wrap items-center justify-center gap-1`}>
              {t.peopleHelp}
              <CornerDownLeft size={14} className="inline shrink-0 rounded border border-text-tertiary/40 p-[1px]" />
            </p>
            <textarea
              placeholder={t.prayersPlaceholder}
              value={initialPrayers}
              onChange={(e) => setInitialPrayers(e.target.value)}
              rows={3}
              className={`${inputClass} resize-none text-center`}
            />
            <div>
              <div className="mb-2 text-center text-sm text-text-tertiary">{t.tags}</div>
              <TagInput tags={listTags} onChange={setListTags} placeholder={t.tagsPlaceholder} allTags={existingTags} />
            </div>
          </>
        )

      case 'who':
        return (
          <>
            <p className={titleClass}>{t.newPrayer.replace('+ ', '')}</p>
            <p className={subtitle}>{t.whoToPray}</p>
            <input
              type="text"
              placeholder={t.prayerTitle}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} text-center`}
            />
          </>
        )

      case 'list':
        return (
          <>
            <p className={titleClass}>{t.addToList}</p>
            <p className={subtitle}>{t.qWhichList}</p>
            <select
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              className={`${inputClass} cursor-pointer appearance-none text-center text-sm`}
            >
              <option value="">{t.unscheduled}</option>
              {selectableLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </>
        )

      case 'details':
        return (
          <>
            <p className={titleClass}>{t.detailsTitle}</p>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-text-muted">{description.length}/2000</span>
              </div>
              <textarea
                ref={addDescRef}
                placeholder={t.descriptionOptional}
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                maxLength={2000}
                rows={4}
                className={`${inputClass} resize-none text-center`}
              />
              <div className="mt-2">
                <TagInput tags={prayerTags} onChange={setPrayerTags} placeholder={t.tagsPlaceholder} allTags={existingTags} />
              </div>
            </div>
          </>
        )
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-stretch justify-center bg-overlay p-3 sm:items-center"
      style={{
        paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
        paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
      }}
    >
      <div
        ref={cardRef}
        className="sheet-height flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-card shadow-xl"
      >
        {/* Navigation lives on the edges and in the swipe, so the header only
            carries the close affordance. */}
        <div className="shrink-0 px-5 pt-5">
          <div className="flex items-center justify-end">
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-text-tertiary hover:bg-input"
              aria-label={t.close}
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-3 flex gap-1.5" aria-label={t.stepOf(step + 1, total)}>
            {steps.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-accent' : 'bg-input'}`}
              />
            ))}
          </div>

          {step === 0 && (
            <div className="mt-4 flex justify-center gap-2">
              <button type="button" onClick={() => switchMode('create-list')} className={pill(mode === 'create-list')} hidden={mode === 'edit-list'}>
                {t.newPrayerList}
              </button>
              <button type="button" onClick={() => switchMode('add-single')} className={pill(mode === 'add-single')} hidden={mode === 'edit-list'}>
                {t.newPrayer}
              </button>
            </div>
          )}
        </div>

        {/* Swipeable track — the card follows your finger and settles on release */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1">
            {/* Full-height, borderless edge arrows: they read as part of the
                sheet rather than buttons, and mirror the swipe gesture. */}
            {step > 0 && (
              <button
                type="button"
                onClick={() => goTo(step - 1)}
                aria-label={t.back}
                className="absolute inset-y-0 left-0 z-10 flex w-7 items-center justify-center text-text-tertiary/40 transition-colors hover:text-text-secondary cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={() => goTo(step + 1)}
                aria-label={t.next}
                className="absolute inset-y-0 right-0 z-10 flex w-7 items-center justify-center text-text-tertiary/40 transition-colors hover:text-text-secondary cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
            )}
            <div
              ref={trackRef}
              className="min-h-0 flex-1 overflow-hidden"
              style={{ touchAction: 'pan-y' }}
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
              onTouchCancel={onTouchEnd}
            >
            <div
              className="flex h-full"
              style={{
                width: `${total * 100}%`,
                transform: `translateX(calc(${(-step * 100) / total}% + ${dragX}px))`,
                transition: animating ? 'transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1)' : 'none',
              }}
              onTransitionEnd={() => setAnimating(false)}
            >
              {steps.map((stepKey, i) => (
                <div
                  key={stepKey}
                  data-step={stepKey}
                  className="h-full shrink-0 space-y-4 overflow-y-auto px-8 py-5"
                  style={{ width: `${100 / total}%` }}
                >
                  {renderStep(stepKey)}

                  {i === total - 1 && (
                    <>
                      {saveError && (
                        <div className="rounded-lg border border-red-500/40 bg-red-500/15 px-3 py-2 text-xs text-red-300 break-words">
                          Couldn't save: {saveError}
                        </div>
                      )}
                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-accent py-3 text-sm font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {saving ? '…' : mode === 'edit-list' ? t.save : mode === 'create-list' ? t.createList : t.addPrayer}
                      </button>
                    </>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
