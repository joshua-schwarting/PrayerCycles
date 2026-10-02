import { X, Download, Trash2, Globe, Palette, ShieldCheck, Hash } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useT } from '../i18n'

type SideMenuProps = {
  open: boolean
  onClose: () => void
  onExportImport: () => void
  onLanguages: () => void
  onThemes: () => void
  onResetData: () => void
}

export function SideMenu({ open, onClose, onExportImport, onLanguages, onThemes, onResetData }: SideMenuProps) {
  const navigate = useNavigate()
  const { t } = useT()

  function goTo(path: string) {
    navigate(path)
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[70] bg-overlay"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 left-0 z-[71] h-full w-72 bg-card shadow-2xl transition-transform duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          className="flex items-center justify-between border-b border-border p-4"
          style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}
        >
          <h2 className="text-lg font-semibold text-text">{t.appName}</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-text-tertiary hover:bg-input"
            aria-label={t.close}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="p-2 space-y-1">
          <button
            onClick={() => onExportImport()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <Download size={18} />
            {t.exportImport}
          </button>

          <button
            onClick={() => onLanguages()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <Globe size={18} />
            {t.languages}
          </button>

          <button
            onClick={() => onThemes()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <Palette size={18} />
            {t.themes}
          </button>

          <button
            onClick={() => goTo('/tags')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <Hash size={18} />
            {t.prayerTags}
          </button>

          <button
            onClick={() => goTo('/trash')}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <Trash2 size={18} />
            {t.deletedLists}
          </button>

          <button
            onClick={() => {
              // A real navigation, not a router one: /privacy is a static page
              // outside the SPA, and the router's catch-all would bounce it home.
              // The filename is explicit because nothing resolves a directory
              // index here -- bare /privacy falls through to the app shell.
              onClose()
              window.location.assign('/privacy/index.html')
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-text-secondary hover:bg-input transition-colors"
          >
            <ShieldCheck size={18} />
            {t.privacyPolicy}
          </button>

          <button
            onClick={() => onResetData()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm text-danger-text hover:bg-input transition-colors"
          >
            <Trash2 size={18} />
            {t.resetPrayerData}
          </button>
        </nav>
      </div>
    </>
  )
}
