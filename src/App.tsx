import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { TopBar } from './components/TopBar'
import { SideMenu } from './components/SideMenu'
import { AddModal } from './components/AddModal'
import { ExportImportModal } from './components/ExportImportModal'
import { LanguageModal } from './components/LanguageModal'
import { ThemeModal } from './components/ThemeModal'
import { ResetDataModal } from './components/ResetDataModal'
import { TimerProvider } from './context/TimerContext'
import { checkAndRestoreFromLocalStorage } from './features/backup/local-backup'
import { purgeExpiredLists, ensureUnscheduledList } from './features/cycles/list-operations'
import { I18nContext, translations, getSavedLocale, saveLocale, type Locale } from './i18n'
import { getSavedTheme, applyTheme } from './lib/themes'
import { initEncryption } from './lib/key-manager'
import { migrateUnencryptedData } from './db/encryption-hooks'
import { db } from './db/db'
import { ListsPage } from './routes/ListsPage'
import { ListDetailPage } from './routes/ListDetailPage'
import { TimerPage } from './routes/TimerPage'
import { TrashPage } from './routes/TrashPage'
import { TagsPage } from './routes/TagsPage'

/** The nav destinations, in order, for swipe navigation. */
const NAV_ROUTES = ['/', '/timer']

/** Past this fraction of the screen the swipe commits; short of it, it snaps back. */
const COMMIT_RATIO = 0.3
/** A quick flick commits even when it hasn't travelled far. */
const FLICK_VELOCITY = 0.45
const SETTLE_MS = 260
const SETTLE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'

/**
 * Rendered twice during a swipe — once for the page you're on and once for the
 * one sliding in — so `location` can be forced for the incoming copy.
 */
function AppRoutes({ location }: { location?: ReturnType<typeof useLocation> }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<ListsPage />} />
      <Route path="/lists" element={<Navigate to="/" replace />} />
      <Route path="/lists/:id" element={<ListDetailPage />} />
      <Route path="/timer" element={<TimerPage />} />
      <Route path="/tags" element={<TagsPage />} />
      <Route path="/trash" element={<TrashPage />} />
      {/* /tap and /history are gone; a saved link or restored PWA route would
          otherwise land on an empty shell. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function AppContent() {
  const [addOpen, setAddOpen] = useState(false)
  const [addListId, setAddListId] = useState<string | undefined>(undefined)
  const [editListId, setEditListId] = useState<string | undefined>(undefined)
  const [menuOpen, setMenuOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [ready, setReady] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  // Horizontal drag between the main pages. The incoming page is rendered and
  // moved with your finger so the swipe reads as a physical push, and anything
  // short of COMMIT_RATIO springs back to where it started.
  const [dx, setDx] = useState(0)
  const [settling, setSettling] = useState(false)
  const [neighbor, setNeighbor] = useState<string | null>(null)
  const gesture = useRef<{ x: number; y: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; v: number } | null>(null)
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const routeIndex = NAV_ROUTES.indexOf(location.pathname)
  useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current) }, [])

  // Clear the drag in the same commit that first renders the new page. navigate()
  // updates the URL synchronously but the router's location arrives a render
  // later, so zeroing the transform on a timer instead parked the outgoing page
  // back at centre for a frame -- a visible flash of the screen you just left.
  useLayoutEffect(() => {
    setDx(0)
    setSettling(false)
    setNeighbor(null)
  }, [location.pathname])

  function resetGesture() {
    gesture.current = null
    setDx(0)
    setSettling(false)
    setNeighbor(null)
  }

  function onPageTouchStart(e: React.TouchEvent) {
    if (settling || routeIndex === -1) return
    const el = e.target as HTMLElement
    // leave gestures inside the wizard, drag handles and side-scrollers alone
    if (el.closest('[data-step], [data-no-page-swipe], input, textarea, select')) return
    const p = e.touches[0]
    gesture.current = { x: p.clientX, y: p.clientY, axis: null, lastX: p.clientX, lastT: e.timeStamp, v: 0 }
  }

  function onPageTouchMove(e: React.TouchEvent) {
    const g = gesture.current
    if (!g) return
    const p = e.touches[0]
    const totalX = p.clientX - g.x
    const totalY = p.clientY - g.y

    // Lock to one axis on the first decisive movement, so a vertical scroll is
    // never hijacked and a horizontal swipe isn't fighting the scroller.
    if (g.axis === null) {
      if (Math.abs(totalX) > 12 && Math.abs(totalX) > Math.abs(totalY)) g.axis = 'x'
      else if (Math.abs(totalY) > 12) { gesture.current = null; return }
      else return
    }

    const dt = e.timeStamp - g.lastT
    if (dt > 0) g.v = (p.clientX - g.lastX) / dt
    g.lastX = p.clientX
    g.lastT = e.timeStamp

    const target = totalX < 0 ? routeIndex + 1 : routeIndex - 1
    const hasNeighbor = target >= 0 && target < NAV_ROUTES.length
    // No page that way? Let it move a little and resist, rather than feeling dead.
    const offset = hasNeighbor ? totalX : totalX / 4
    setNeighbor(hasNeighbor ? NAV_ROUTES[target] : null)
    setDx(offset)
  }

  function onPageTouchEnd() {
    const g = gesture.current
    if (!g || g.axis !== 'x') { gesture.current = null; setDx(0); setNeighbor(null); return }
    gesture.current = null

    const width = window.innerWidth || 1
    const target = dx < 0 ? routeIndex + 1 : routeIndex - 1
    const hasNeighbor = target >= 0 && target < NAV_ROUTES.length
    const far = Math.abs(dx) > width * COMMIT_RATIO
    const flicked = Math.abs(g.v) > FLICK_VELOCITY && Math.sign(g.v) === Math.sign(dx)

    setSettling(true)
    if (hasNeighbor && (far || flicked)) {
      // Carry it the rest of the way, then swap routes at rest so nothing flashes.
      setDx(dx < 0 ? -width : width)
      settleTimer.current = setTimeout(() => navigate(NAV_ROUTES[target]), SETTLE_MS)
    } else {
      setDx(0)
      settleTimer.current = setTimeout(() => { setSettling(false); setNeighbor(null) }, SETTLE_MS)
    }
  }

  const swiping = dx !== 0 || settling
  const pageTransition = settling ? `transform ${SETTLE_MS}ms ${SETTLE_EASE}` : 'none'

  // While a modal is up, hide the bottom nav and the add button: the nav would
  // otherwise ride above the keyboard on top of the modal's own buttons, and
  // navigating away mid-flow would silently discard what you were entering.
  const modalOpen = addOpen || exportOpen || langOpen || themeOpen || resetOpen

  // A list's "+ Prayer" asks for the wizard with that list already chosen.
  useEffect(() => {
    function onAddPrayer(e: Event) {
      setAddListId((e as CustomEvent<{ listId: string }>).detail?.listId)
      setAddOpen(true)
    }
    function onEditList(e: Event) {
      setAddListId(undefined)
      setEditListId((e as CustomEvent<{ listId: string }>).detail?.listId)
      setAddOpen(true)
    }
    window.addEventListener('prayercycles:add-prayer', onAddPrayer)
    window.addEventListener('prayercycles:edit-list', onEditList)
    return () => {
      window.removeEventListener('prayercycles:add-prayer', onAddPrayer)
      window.removeEventListener('prayercycles:edit-list', onEditList)
    }
  }, [])

  useEffect(() => {
    applyTheme(getSavedTheme())
    initEncryption()
      .then(() => migrateUnencryptedData(db))
      .then(() => checkAndRestoreFromLocalStorage())
      .then(async (restored) => {
        if (restored) {
          window.dispatchEvent(new Event('prayercycles:refresh'))
        }
        await purgeExpiredLists()
        await ensureUnscheduledList()
        setReady(true)
      })
      .catch((err) => {
        console.error('Encryption init failed:', err)
        setReady(true)
      })
  }, [])

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-base text-text" />
  }

  return (
      <TimerProvider>
      <div className="flex h-dvh flex-col overflow-hidden bg-base text-text">
        {!modalOpen && <TopBar onMenuOpen={() => setMenuOpen(true)} onNavigate={() => setMenuOpen(false)} />}
        <SideMenu
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          onExportImport={() => { setMenuOpen(false); setExportOpen(true) }}
          onLanguages={() => { setMenuOpen(false); setLangOpen(true) }}
          onThemes={() => { setMenuOpen(false); setThemeOpen(true) }}
          onResetData={() => { setMenuOpen(false); setResetOpen(true) }}
        />
        <div
          className={`relative flex min-h-0 flex-1 flex-col ${swiping ? 'overflow-hidden' : ''}`}
          style={{ touchAction: 'pan-y' }}
          onTouchStart={onPageTouchStart}
          onTouchMove={onPageTouchMove}
          onTouchEnd={onPageTouchEnd}
          onTouchCancel={resetGesture}
        >
          <div
            className="flex min-h-0 flex-1 flex-col"
            // No transform at rest: any transform makes this a containing block
            // for position:fixed descendants, which would anchor a page's modals
            // to this element instead of the viewport.
            style={{
              transform: swiping ? `translate3d(${dx}px, 0, 0)` : undefined,
              transition: pageTransition,
              willChange: swiping ? 'transform' : undefined,
            }}
          >
            <AppRoutes />
          </div>
          {neighbor && (
            <div
              className="absolute inset-0 flex flex-col bg-base"
              style={{
                transform: `translate3d(calc(${dx < 0 ? '100%' : '-100%'} + ${dx}px), 0, 0)`,
                transition: pageTransition,
                willChange: 'transform',
              }}
            >
              <AppRoutes location={{ ...location, pathname: neighbor }} />
            </div>
          )}
        </div>

        {!modalOpen && (
          <button
            onClick={() => { setAddListId(undefined); setEditListId(undefined); setAddOpen(true) }}
            className="fixed right-4 z-40 flex h-16 w-16 items-center justify-center rounded-full bg-input-hover text-text shadow-lg transition-colors hover:bg-input"
            style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
            aria-label="Add"
          >
            <Plus size={30} />
          </button>
        )}

        <AddModal open={addOpen} initialListId={addListId} editListId={editListId} onClose={() => { setAddOpen(false); setAddListId(undefined); setEditListId(undefined) }} onAdded={(focusListId) => {
          window.dispatchEvent(new Event('prayercycles:refresh'))
          // Editing happens in place; only a brand new entry is worth going to see.
          if (editListId) return
          navigate(focusListId ? `/?focus=${encodeURIComponent(focusListId)}` : '/')
        }} />
        <ExportImportModal open={exportOpen} onClose={() => setExportOpen(false)} />
        <LanguageModal open={langOpen} onClose={() => setLangOpen(false)} />
        <ThemeModal open={themeOpen} onClose={() => setThemeOpen(false)} />
        <ResetDataModal open={resetOpen} onClose={() => setResetOpen(false)} />
      </div>
      </TimerProvider>
  )
}

export function App() {
  const [locale, setLocaleState] = useState<Locale>(getSavedLocale)

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    saveLocale(l)
  }, [])

  return (
    <I18nContext.Provider value={{ locale, t: translations[locale], setLocale }}>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </I18nContext.Provider>
  )
}

export default App
