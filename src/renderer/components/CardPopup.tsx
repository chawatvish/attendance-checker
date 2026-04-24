import { useTranslation } from 'react-i18next'
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'
import type { CheckInResult } from '@shared/types'

interface Props {
  result: CheckInResult
  onConfirm: () => void
  onDismiss: () => void
}

const STATUS_CONFIG = {
  approved: {
    bg: 'bg-green-50',
    border: 'border-green-400',
    badge: 'bg-green-100 text-green-800',
    icon: <CheckCircle2 size={28} className="text-green-500" />,
    headerBg: 'bg-green-500',
  },
  duplicate: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-400',
    badge: 'bg-yellow-100 text-yellow-800',
    icon: <AlertTriangle size={28} className="text-yellow-500" />,
    headerBg: 'bg-yellow-500',
  },
  not_found: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    badge: 'bg-red-100 text-red-800',
    icon: <XCircle size={28} className="text-red-500" />,
    headerBg: 'bg-red-500',
  },
}

export default function CardPopup({ result, onConfirm, onDismiss }: Props) {
  const { t } = useTranslation()
  const { status, card_data, checkin } = result
  const cfg = STATUS_CONFIG[status]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border-2 ${cfg.border}`}>
        {/* Header */}
        <div className={`${cfg.headerBg} text-white px-5 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            {cfg.icon}
            <span className="text-lg font-bold">{t(`checkin.popup.${status}`)}</span>
          </div>
          <button onClick={onDismiss} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Photo + info */}
        <div className="p-5 flex gap-4">
          {card_data.photo ? (
            <img
              src={`data:image/jpeg;base64,${card_data.photo}`}
              alt="ID Photo"
              className="w-24 h-32 object-cover rounded-lg border border-gray-200 shrink-0"
            />
          ) : (
            <div className="w-24 h-32 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 border border-gray-200">
              <svg className="w-10 h-10 text-gray-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
              </svg>
            </div>
          )}

          <div className="flex-1 space-y-2">
            <InfoRow label={t('checkin.popup.id')} value={card_data.thai_id} mono />
            {card_data.thai_name && <InfoRow label={t('checkin.popup.name')} value={card_data.thai_name} />}
            {card_data.en_name && <InfoRow label="" value={card_data.en_name} small />}
            {card_data.dob && <InfoRow label={t('checkin.popup.dob')} value={formatDate(card_data.dob)} />}
            {card_data.gender && <InfoRow label={t('checkin.popup.gender')} value={card_data.gender} small />}
            {card_data.religion && <InfoRow label={t('checkin.popup.religion')} value={card_data.religion} small />}
            {card_data.address && <InfoRow label={t('checkin.popup.address')} value={card_data.address} small />}
            {card_data.expire_date && (
              <InfoRow label={t('checkin.popup.expire_date')} value={formatDate(card_data.expire_date)} small />
            )}
            {status === 'duplicate' && checkin && (
              <InfoRow
                label={t('checkin.popup.checkin_at')}
                value={new Date(checkin.checked_in_at).toLocaleString('th-TH')}
                small
              />
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          {status !== 'duplicate' && (
            <button
              onClick={onConfirm}
              className={`flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-colors ${
                status === 'approved' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {t('checkin.popup.confirm_checkin')}
            </button>
          )}
          <button
            onClick={onDismiss}
            className={`${status === 'duplicate' ? 'flex-1' : ''} px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors`}
          >
            {t('checkin.popup.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono, small }: { label: string; value: string; mono?: boolean; small?: boolean }) {
  return (
    <div>
      {label && <span className="text-xs text-gray-400">{label}</span>}
      <p className={`${small ? 'text-xs' : 'text-sm'} ${mono ? 'font-mono tracking-wider' : 'font-medium'} text-gray-800`}>
        {value}
      </p>
    </div>
  )
}

function formatDate(dob: string): string {
  if (!dob) return ''
  const parts = dob.replace(/-/g, '')
  if (parts.length === 8) {
    const y = parseInt(parts.slice(0, 4))
    const m = parts.slice(4, 6)
    const d = parts.slice(6, 8)
    // Convert Buddhist Era to Christian Era for display
    return `${d}/${m}/${y}`
  }
  return dob
}
