import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Users, Search } from 'lucide-react'
import { useApp } from '../App'
import type { AttendanceSummary } from '@shared/types'

export default function AttendancePage() {
  const { t, i18n } = useTranslation()
  const { activeEvent } = useApp()
  const [summary, setSummary] = useState<AttendanceSummary | null>(null)
  const [search, setSearch] = useState('')
  const [exporting, setExporting] = useState(false)

  const load = async () => {
    if (!activeEvent) return
    const data = await window.api.checkins.summary(activeEvent.id)
    setSummary(data)
  }

  useEffect(() => { load() }, [activeEvent])

  const handleExport = async () => {
    if (!activeEvent) return
    setExporting(true)
    const csv = await window.api.checkins.exportCsv(activeEvent.id)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeEvent.name}-attendance.csv`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  if (!activeEvent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <Users size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('attendance.no_event')}</p>
        </div>
      </div>
    )
  }

  const filtered = summary?.checkins.filter((c) => {
    const q = search.toLowerCase()
    return (
      c.thai_id.includes(q) ||
      (c.full_name ?? '').toLowerCase().includes(q)
    )
  }) ?? []

  const pct = summary && summary.total_registered > 0
    ? Math.round((summary.registered_checkedin / summary.total_registered) * 100)
    : 0

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{t('attendance.title')}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{activeEvent.name}</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || !summary?.checkins.length}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          <Download size={15} /> {t('attendance.export_csv')}
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-4 gap-4 mb-5">
          <StatCard
            label={t('attendance.registered_checkedin')}
            value={`${summary.registered_checkedin} / ${summary.total_registered}`}
            color="text-green-600"
          />
          <StatCard
            label={t('attendance.total_registered')}
            value={summary.total_registered}
            color="text-blue-600"
          />
          <StatCard
            label={t('attendance.walk_in')}
            value={summary.walkin_checkedin}
            color="text-orange-500"
          />
          <StatCard
            label={t('attendance.percent')}
            value={summary.total_registered > 0 ? `${pct}%` : '—'}
            color="text-purple-600"
          />
        </div>
      )}

      {/* Progress bar — only meaningful when a list is imported */}
      {summary && summary.total_registered > 0 && (
        <div className="bg-gray-100 rounded-full h-2 mb-5 overflow-hidden">
          <div
            className="bg-green-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto rounded-xl border border-gray-200 bg-white">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-400 text-sm">
            {t('attendance.no_checkins')}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">#</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('attendance.columns.thai_id')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('attendance.columns.full_name')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('attendance.columns.checked_in_at')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('attendance.columns.method')}</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">{t('attendance.attendance_type')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c, i) => (
                <tr key={c.id} className={`hover:bg-gray-50 ${c.is_walkin ? 'bg-orange-50/40' : ''}`}>
                  <td className="px-4 py-3 text-gray-400">{i + 1}</td>
                  <td className="px-4 py-3 font-mono text-gray-800">{c.thai_id}</td>
                  <td className="px-4 py-3 text-gray-700">{c.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{new Date(c.checked_in_at).toLocaleString(i18n.language === 'th' ? 'th-TH' : 'en-GB')}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      c.method === 'card' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {t(`attendance.method.${c.method}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {c.is_walkin ? (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-orange-100 text-orange-700">
                        {t('attendance.walk_in')}
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-green-50 text-green-700">
                        {t('attendance.registered')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-1">{label}</p>
    </div>
  )
}
