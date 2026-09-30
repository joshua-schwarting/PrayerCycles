import { useState, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { useT } from '../i18n'
import type { Prayer } from '../db/types'
import { updatePrayer, deletePrayer } from '../features/prayers/prayer-operations'

type PrayerDetailModalProps = {
  prayer: Prayer
  onClose: () => void
  onUpdated: () => void
}

export function PrayerDetailModal({ prayer, onClose, onUpdated }: PrayerDetailModalProps) {
  const { t } = useT()
  const [title, setTitle] = useState(prayer.title)
  const [description, setDescription] = useState(prayer.description)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const descRef = useRef<HTMLTextAreaElement>(null)



  async function handleSave() {
    const changes: Partial<Prayer> = {}
    if (title.trim() && title.trim() !== prayer.title) changes.title = title.trim()
    if (description.trim() !== prayer.description) changes.description = description.trim()
    if (Object.keys(changes).length > 0) {
      await updatePrayer(prayer.id, changes)
    }
    onUpdated()
    onClose()
  }

  async function handleDelete() {
    await deletePrayer(prayer.id)
    onUpdated()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-overlay p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-card p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text">{t.prayer}</h2>
          <button
            onClick={() => { handleSave() }}
            className="rounded-full p-1 text-text-tertiary hover:bg-input"
            aria-label={t.close}
          >
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg bg-input px-3 py-2 text-text outline-none focus:ring-2 focus:ring-text-muted text-lg font-semibold"
          />

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-text-muted">{description.length}/5000</span>
            </div>
            <textarea
              ref={descRef}
              placeholder={t.addDescription}
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
              maxLength={5000}
              rows={4}
              className="w-full rounded-lg bg-input px-3 py-2 text-text placeholder-text-tertiary outline-none focus:ring-2 focus:ring-text-muted resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 text-sm text-danger-text hover:text-danger-hover"
              >
                <Trash2 size={14} />
                {t.delete}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-danger-text">{t.deletePrayerConfirm}</span>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-danger px-3 py-1 text-sm text-white hover:bg-danger-hover"
                >
                  {t.yes}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg bg-input px-3 py-1 text-sm text-text-secondary hover:bg-input-hover"
                >
                  {t.no}
                </button>
              </div>
            )}

            <button
              onClick={handleSave}
              className="rounded-lg bg-input-hover px-4 py-2 text-sm font-medium text-text hover:bg-input"
            >
              {t.save}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
