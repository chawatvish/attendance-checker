import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Trash2, CheckCircle, Upload } from 'lucide-react'
import { useApp } from '../App'
import ImportDialog from '../components/ImportDialog'
import type { Event } from '@shared/types'

export default function EventsPage() {
  const { t } = useTranslation()
  const { activeEvent, setActiveEvent, refreshEvents } = useApp()
  const [events, setEvents] = useState<Event[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [importEventId, setImportEventId] = useState<number | null>(null)
  const [form, setForm] = useState({ name: '', date: '', description: '' })

  const load = async () => {
    const data = await window.api.events.list()
    setEvents(data)
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    const ev = await window.api.events.create(form.name, form.date || null, form.description || null)
    setForm({ name: '', date: '', description: '' })
    setShowCreate(false)
    await load()
    refreshEvents()
    setActiveEvent(ev)
  }

  const handleDelete = async (id: number) => {
    if (!confirm(t('events.delete_confirm'))) return
    await window.api.events.delete(id)
    if (activeEvent?.id === id) setActiveEvent(null)
    await load()
    refreshEvents()
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">{t('events.title')}</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          <Plus size={16} /> {t('events.create')}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-4 shadow-sm">
          <form onSubmit={handleCreate} className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('events.name')} *</label>
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('events.date')}</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('events.description')}</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                {t('common.save')}
              </button>
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Events list */}
      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarIcon />
          <p className="mt-3 text-sm">{t('events.no_events')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <div
              key={ev.id}
              className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 transition-colors ${
                activeEvent?.id === ev.id ? 'border-blue-400 bg-blue-50' : 'border-gray-200'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-800 truncate">{ev.name}</span>
                  {activeEvent?.id === ev.id && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {t('events.active')}
                    </span>
                  )}
                </div>
                {ev.date && <p className="text-xs text-gray-500 mt-0.5">📅 {ev.date}</p>}
                {ev.description && <p className="text-xs text-gray-400 mt-0.5 truncate">{ev.description}</p>}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setImportEventId(ev.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50"
                >
                  <Upload size={13} /> {t('common.import')}
                </button>
                <button
                  onClick={() => setActiveEvent(ev)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    activeEvent?.id === ev.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-blue-300 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  <CheckCircle size={13} /> {t('events.select')}
                </button>
                <button
                  onClick={() => handleDelete(ev.id)}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {importEventId !== null && (
        <ImportDialog
          eventId={importEventId}
          onClose={() => { setImportEventId(null); load() }}
        />
      )}
    </div>
  )
}

function CalendarIcon() {
  return (
    <svg className="mx-auto w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  )
}
