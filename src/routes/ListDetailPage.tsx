import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Trash2, GripVertical, Timer } from 'lucide-react'
import type { PrayerList, Prayer } from '../db/types'
import { getList, deleteList, archiveList, reactivateList } from '../features/cycles/list-operations'
import { getPrayersByList, reorderPrayers } from '../features/prayers/prayer-operations'
import { PrayerDetailModal } from '../components/PrayerDetailModal'
import { useTimer } from '../context/TimerContext'
import { useT } from '../i18n'

export function ListDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useT()
  const { refreshLists: refreshTimerLists, setSelectedListId } = useTimer()
  const [list, setList] = useState<PrayerList | null>(null)
  const [prayers, setPrayers] = useState<Prayer[]>([])
  const [selectedPrayer, setSelectedPrayer] = useState<Prayer | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  type SortMode = 'default' | 'az' | 'za'
  const storageKey = `prayercycles-sort-${id}`
  // Older builds stored 'original'/'custom'; both are just 'default' now.
  const readSort = (): SortMode => {
    const saved = localStorage.getItem(storageKey)
    if (!saved || saved === 'original' || saved === 'custom') return 'default'
    return saved as SortMode
  }
  const [sortMode, setSortMode] = useState<SortMode>(readSort)
  const [sortTrail, setSortTrail] = useState<SortMode[]>(() => [readSort()])

  // Drag-and-drop state
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [overIdx, setOverIdx] = useState<number | null>(null)
  const [dragArmed, setDragArmed] = useState(false)
  const dragTouchY = useRef<number>(0)
  const listContainerRef = useRef<HTMLDivElement>(null)

  function handleSort(mode: SortMode) {
    setSortMode(mode)
    localStorage.setItem(storageKey, mode)
    setSortTrail((prev) => [...prev.slice(-2), mode])
  }

  function getTrailStyle(mode: SortMode): string {
    const lastIndex = sortTrail.lastIndexOf(mode)
    if (lastIndex === -1) return 'bg-card text-text-muted'

    const recency = sortTrail.length - 1 - lastIndex
    if (recency === 0) return 'bg-accent text-white'
    if (recency === 1) return 'bg-accent/40 text-text-secondary'
    if (recency === 2) return 'bg-accent/20 text-text-tertiary'
    return 'bg-card text-text-muted'
  }


  const load = useCallback(async () => {
    if (!id) return
    const l = await getList(id)
    if (!l) return
    setList(l)
    setPrayers(await getPrayersByList(id))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // The edit wizard lives at the app root, so it reports back by event.
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('prayercycles:refresh', handler)
    return () => window.removeEventListener('prayercycles:refresh', handler)
  }, [load])


  async function handleDeleteList() {
    if (!id) return
    await deleteList(id)
    refreshTimerLists()
    navigate('/')
  }

  async function handleToggleArchive() {
    if (!id || !list) return
    if (list.status === 'active') {
      await archiveList(id)
    } else {
      await reactivateList(id)
    }
    refreshTimerLists()
    load()
  }


  if (!list) {
    return <div className="flex h-40 items-center justify-center text-text-muted">{t.loading}</div>
  }







  const sortedPrayers = [...prayers].sort((a, b) => {
    if (sortMode === 'default') {
      const aOrder = a.sortOrder?.[id!]
      const bOrder = b.sortOrder?.[id!]
      if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder
      if (aOrder !== undefined) return -1
      if (bOrder !== undefined) return 1
      return a.createdAt - b.createdAt
    }
    if (sortMode === 'az') return a.title.localeCompare(b.title) || a.createdAt - b.createdAt
    if (sortMode === 'za') return b.title.localeCompare(a.title) || a.createdAt - b.createdAt
    return a.createdAt - b.createdAt
  })

  const visiblePrayers = sortedPrayers

  // Drag-and-drop handlers
  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setOverIdx(idx)
  }

  async function handleDrop(idx: number) {
    if (dragIdx === null || dragIdx === idx || !id) { setDragIdx(null); setOverIdx(null); return }
    const reordered = [...visiblePrayers]
    const [moved] = reordered.splice(dragIdx, 1)
    reordered.splice(idx, 0, moved)
    await reorderPrayers(id, reordered.map((p) => p.id))
    handleSort('default')
    setDragIdx(null)
    setOverIdx(null)
    load()
  }

  // Touch drag handlers
  function handleTouchStart(idx: number, e: React.TouchEvent) {
    dragTouchY.current = e.touches[0].clientY
    setDragIdx(idx)
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!dragArmed || dragIdx === null || !listContainerRef.current) return
    const touch = e.touches[0]
    const container = listContainerRef.current
    const children = Array.from(container.children) as HTMLElement[]
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect()
      if (touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        setOverIdx(i)
        break
      }
    }
  }

  async function handleTouchEnd() {
    setDragArmed(false)
    if (dragIdx !== null && overIdx !== null && dragIdx !== overIdx && id) {
      await handleDrop(overIdx)
    } else {
      setDragIdx(null)
      setOverIdx(null)
    }
  }


  // Calculate total time prayed for all prayers in this list

  // Edit mode input style — consistent for all fields including TagInput

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-nav pt-4">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <button
          onClick={() => navigate('/')}
          className="mb-4 flex items-center gap-1 text-sm text-text-tertiary hover:text-text-secondary"
        >
          <ArrowLeft size={16} />
          {t.backToPrayerLists}
        </button>

        {/* List info — tapping it anywhere but the controls opens the editor */}
        <div
          className="cursor-pointer rounded-lg bg-card p-5 shadow-md"
          onClick={(e) => {
            if (!id) return
            // let the toggle, the action buttons and any link do their own thing
            if ((e.target as HTMLElement).closest('button, a')) return
            window.dispatchEvent(new CustomEvent('prayercycles:edit-list', { detail: { listId: id } }))
          }}
        >
              {/* Active/Deactivated toggle — top right */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-text -mt-0.5">{list.name}</h2>
                </div>
                <button
                  onClick={handleToggleArchive}
                  className="flex items-center gap-1.5 shrink-0 mt-1"
                  title={list.status === 'active' ? t.activeTapToDeactivate : t.deactivatedTapToReactivate}
                >
                  <span className="text-[10px] text-text-muted">{list.status === 'active' ? t.active : t.inactive}</span>
                  <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${list.status === 'active' ? 'bg-toggle' : 'bg-input-hover'}`}>
                    <div className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-transform duration-200 ${list.status === 'active' ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
                  </div>
                </button>
              </div>
              {list.description && (
                <p className="mt-1 text-sm text-text-secondary">{list.description}</p>
              )}
              {(list.tags ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {list.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-input px-2 py-0.5 text-xs text-text-tertiary">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {/* Pray Now · + Prayer · Delete — editing is a tap on the card */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    if (!id) return
                    setSelectedListId(id)
                    navigate('/timer')
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-accent/15 px-3 py-1 text-sm font-medium text-accent-text hover:bg-accent/25 transition-colors"
                >
                  <Timer size={14} />
                  {t.prayNow}
                </button>
                <button
                  onClick={() =>
                    window.dispatchEvent(
                      new CustomEvent('prayercycles:add-prayer', { detail: { listId: id } }),
                    )
                  }
                  className="rounded-lg border border-border-light bg-input px-3 py-1 text-sm text-text-secondary hover:bg-input-hover transition-colors"
                >
                  {t.newPrayer}
                </button>
                {!confirmDelete ? (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 rounded-lg border border-danger-text/30 px-3 py-1 text-sm text-danger-text hover:bg-danger-text/10 transition-colors"
                  >
                    <Trash2 size={14} />
                    {t.delete}
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-danger-text">{t.deleteConfirm}</span>
                    <button
                      onClick={handleDeleteList}
                      className="rounded-lg bg-danger px-2 py-1 text-xs text-white hover:bg-danger-hover transition-colors"
                    >
                      {t.yes}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-lg border border-border-light bg-input px-2 py-1 text-xs text-text-secondary hover:bg-input-hover transition-colors"
                    >
                      {t.no}
                    </button>
                  </div>
                )}
              </div>
        </div>


        {/* Prayer list */}
        <div className="mt-4 space-y-1">
          <div className="flex flex-wrap gap-1 mb-2">
            {([['default', t.sortOriginal], ['az', t.sortAZ], ['za', t.sortZA]] as [SortMode, string][]).map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => handleSort(mode)}
                className={`rounded px-3 py-1 text-xs transition-colors ${getTrailStyle(mode)}`}
              >
                {label}
              </button>
            ))}
          </div>


          <div ref={listContainerRef} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {visiblePrayers.map((prayer, idx) => (
              <div
                key={prayer.id}
                draggable={dragArmed}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => { setDragIdx(null); setOverIdx(null); setDragArmed(false) }}
                className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm text-text-secondary hover:bg-card transition-colors cursor-pointer ${
                  dragIdx === idx ? 'opacity-40' : ''
                } ${overIdx === idx && dragIdx !== null && dragIdx !== idx ? 'border-t-2 border-accent' : ''}`}
                onClick={() => { if (dragIdx === null) setSelectedPrayer(prayer) }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Dragging is armed by the handle only — otherwise scrolling a
                      long list drags people around by accident. */}
                  <span
                    className="-m-1 shrink-0 cursor-grab p-1 touch-none"
                    onPointerDown={() => setDragArmed(true)}
                    onPointerUp={() => setDragArmed(false)}
                    onTouchStart={(e) => { setDragArmed(true); handleTouchStart(idx, e) }}
                  >
                    <GripVertical size={16} className="text-text-tertiary" />
                  </span>
                  <span className="truncate">{prayer.title}</span>
                  <span className="ml-auto shrink-0 pl-2 text-xs text-accent-text">{prayer.prayerTally}</span>
                </div>
              </div>
            ))}
          </div>
          {visiblePrayers.length === 0 && prayers.length === 0 && (
            <p className="text-sm text-text-muted italic pt-2">{t.noPrayersInList}</p>
          )}
        </div>
      </div>

      {selectedPrayer && (
        <PrayerDetailModal
          prayer={selectedPrayer}
          onClose={() => setSelectedPrayer(null)}
          onUpdated={load}
        />
      )}
    </div>
  )
}
