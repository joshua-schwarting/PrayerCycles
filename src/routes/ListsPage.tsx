import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { useT } from '../i18n'
import { MasonryColumns } from '../components/MasonryColumns'
import type { PrayerList, Prayer } from '../db/types'
import { getAllLists, UNSCHEDULED_ID } from '../features/cycles/list-operations'
import { getPrayersByList } from '../features/prayers/prayer-operations'
import { getAllTags } from '../features/tags/tag-operations'

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-400/40 text-inherit rounded-sm px-0.5">{part}</mark>
      : part
  )
}

/**
 * Last successful load, kept outside the component. Committing a page swipe
 * unmounts the copy that slid in and mounts a fresh one, so without this the
 * page you just swiped to blanks to Loading... at the moment it arrives.
 */
let lastLoad: { data: ListWithPrayers[]; allTags: string[] } | null = null

type ListWithPrayers = {
  list: PrayerList
  prayers: Prayer[]
}

export function ListsPage() {
  const { t } = useT()
  const [searchParams, setSearchParams] = useSearchParams()
  const focusId = searchParams.get('focus')
  useEffect(() => {
    if (!focusId) return
    // Clear it once consumed, so revisiting the page doesn't scroll again.
    const id = setTimeout(() => setSearchParams({}, { replace: true }), 1500)
    return () => clearTimeout(id)
  }, [focusId, setSearchParams])
  const [data, setData] = useState<ListWithPrayers[]>(() => lastLoad?.data ?? [])
  // Only the very first load of the session has nothing to show.
  const [loading, setLoading] = useState(lastLoad === null)
  const [searchQuery, setSearchQuery] = useState('')
  const [allTags, setAllTags] = useState<string[]>(() => lastLoad?.allTags ?? [])
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())
  const [tagsExpanded, setTagsExpanded] = useState(false)
  const [tagsOverflow, setTagsOverflow] = useState(false)
  const tagsRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const [lists, tags] = await Promise.all([
      getAllLists(),
      getAllTags(),
    ])
    const withPrayers = await Promise.all(
      lists.map(async (list) => ({
        list,
        prayers: await getPrayersByList(list.id),
      })),
    )
    lastLoad = { data: withPrayers, allTags: tags }
    setData(withPrayers)
    setAllTags(tags)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const handler = () => load()
    window.addEventListener('prayercycles:refresh', handler)
    return () => window.removeEventListener('prayercycles:refresh', handler)
  }, [load])

  // Detect if tag bar overflows 3 lines
  useEffect(() => {
    const el = tagsRef.current
    if (el) {
      setTagsOverflow(el.scrollHeight > 84)
    }
  }, [allTags])

  if (loading) {
    return <div className="flex h-40 items-center justify-center text-text-muted">{t.loading}</div>
  }

  const lower = searchQuery.toLowerCase()
  const hasTagFilter = selectedTags.size > 0

  // Text search filter
  const textFiltered = lower
    ? data.filter((d) =>
        d.list.name.toLowerCase().includes(lower) ||
        d.list.description.toLowerCase().includes(lower) ||
        (d.list.tags ?? []).some((tag) => tag.toLowerCase().includes(lower)) ||
        d.prayers.some((p) => p.title.toLowerCase().includes(lower) || p.description.toLowerCase().includes(lower))
      )
    : data

  // Tag filter (OR — show list if it has ANY of the selected tags)
  const filtered = hasTagFilter
    ? textFiltered.filter((d) =>
        (d.list.tags ?? []).some((tag) => selectedTags.has(tag)),
      )
    : textFiltered

  // Hide Unscheduled list unless it has prayers or user is searching
  const visibleData = filtered.filter((d) =>
    d.list.id !== UNSCHEDULED_ID || d.prayers.length > 0 || lower,
  )
  const active = visibleData.filter((d) => d.list.status === 'active')
  const archived = visibleData.filter((d) => d.list.status === 'archived')

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-nav pt-4">
      <div className="mx-auto max-w-5xl">
        {/* Inline search bar */}
        <div className="mb-2 mx-auto flex items-center gap-2 rounded-lg bg-card border border-border px-3 py-2 max-w-2xl">
          <Search size={16} className="text-text-muted shrink-0" />
          <input
            type="text"
            placeholder={t.searchPrayers}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm text-text placeholder-text-muted outline-none"
          />
        </div>

        {/* Tag filter bar */}
        {allTags.length > 0 && (
          <div className="mb-4">
            <div className="relative">
              <div
                ref={tagsRef}
                className={`flex flex-wrap gap-1.5 overflow-hidden transition-all duration-200 ${
                  tagsExpanded ? '' : 'max-h-[5.25rem]'
                }`}
              >
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                      selectedTags.has(tag)
                        ? 'bg-accent text-white'
                        : 'bg-card text-text-tertiary hover:bg-input hover:text-text-secondary'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
              {!tagsExpanded && tagsOverflow && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-7 bg-gradient-to-t from-base to-transparent" />
              )}
            </div>
            {tagsOverflow && (
              <div className="flex justify-center">
                <button
                  onClick={() => setTagsExpanded(!tagsExpanded)}
                  aria-label={tagsExpanded ? t.seeLess : t.seeMore}
                  className="p-1 text-text-muted transition-colors hover:text-text-secondary cursor-pointer"
                >
                  {tagsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            )}
          </div>
        )}

        {active.length === 0 && archived.length === 0 && (
          <p className="pt-20 text-center text-text-tertiary">{t.noListsYet}</p>
        )}

        <MasonryColumns>
          {active.map(({ list, prayers }) => (
            <ListCard key={list.id} list={list} prayers={prayers} query={searchQuery} focused={list.id === focusId} />
          ))}
        </MasonryColumns>

        {archived.length > 0 && (
          <>
            <div className="pb-2 pt-4 text-xs font-medium uppercase tracking-wide text-text-muted">
              {t.deactivated}
            </div>
            <MasonryColumns>
              {archived.map(({ list, prayers }) => (
                <ListCard key={list.id} list={list} prayers={prayers} query={searchQuery} focused={list.id === focusId} />
              ))}
            </MasonryColumns>
          </>
        )}
      </div>
    </div>
  )
}

const MAX_VISIBLE = 30

function ListCard({ list, prayers, query, focused }: { list: PrayerList; prayers: Prayer[]; query: string; focused?: boolean }) {
  const { t } = useT()
  const cardRef = useRef<HTMLDivElement>(null)
  // Scroll a just-created list into view and ring it, so you can see where it landed.
  useEffect(() => {
    if (!focused) return
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [focused])
  const navigate = useNavigate()
  const descRef = useRef<HTMLParagraphElement>(null)
  const [isClamped, setIsClamped] = useState(false)
  const isArchived = list.status === 'archived'
  const displayName = list.id === UNSCHEDULED_ID ? t.unscheduled : list.name

  useEffect(() => {
    const el = descRef.current
    if (el) setIsClamped(el.scrollHeight > el.clientHeight)
  }, [list.description])
  const visible = prayers.slice(0, MAX_VISIBLE)
  const overflow = prayers.length - MAX_VISIBLE

  const isUnscheduled = list.id === UNSCHEDULED_ID
  const borderClass = isUnscheduled
    ? 'border-2 border-text-muted/60 shadow-[0_0_14px_rgba(148,163,184,0.2)]'
    : 'border-2 border-accent-text/80 shadow-[0_0_14px_var(--color-accent-glow)]'

  return (
    <div
      ref={cardRef}
      className={`rounded-lg p-4 shadow-md break-inside-avoid cursor-pointer bg-card hover:bg-input transition ${borderClass} ${isArchived ? 'opacity-50' : ''} ${focused ? 'ring-4 ring-accent-text ring-offset-2 ring-offset-base' : ''}`}
      onClick={() => navigate(`/lists/${list.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/lists/${list.id}`) }}
    >
      <h3 className="text-lg font-semibold text-text"><Highlight text={displayName} query={query} /></h3>
      {list.description && (
        <div className="relative mt-1">
          <p ref={descRef} className="text-xs italic text-text-secondary line-clamp-5"><Highlight text={list.description} query={query} /></p>
          {isClamped && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-5 bg-gradient-to-t from-card to-transparent" />
          )}
        </div>
      )}

      <div className="mt-2 space-y-1">
        {visible.map((prayer) => (
          <div key={prayer.id} className="text-sm text-text-secondary">
            <Highlight text={prayer.title} query={query} />
          </div>
        ))}
        {overflow > 0 && (
          <div className="text-xs text-text-tertiary">{t.expand}</div>
        )}
        {prayers.length === 0 && (
          <div className="text-xs text-text-tertiary italic">{t.noPrayersYet}</div>
        )}
      </div>

      {/* Tags */}
      {(list.tags ?? []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {list.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-input px-2 py-0.5 text-[10px] text-text-tertiary">
              #{tag}
            </span>
          ))}
        </div>
      )}

      {/* Times the whole list has been prayed through, as it used to sit */}
      <div className="mt-3 text-right text-xs text-accent-text">{list.completionTally ?? 0}</div>
    </div>
  )
}
