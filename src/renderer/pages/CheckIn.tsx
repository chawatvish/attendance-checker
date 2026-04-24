import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Keyboard, Wifi, WifiOff } from 'lucide-react'
import { useApp } from '../App'
import CardPopup from '../components/CardPopup'
import type { CardData, CheckInResult } from '@shared/types'

export default function CheckInPage() {
  const { t } = useTranslation()
  const { activeEvent } = useApp()
  const [readerName, setReaderName] = useState<string | null>(null)
  const [cardDipped, setCardDipped] = useState(false)
  const [reading, setReading] = useState(false)
  const [result, setResult] = useState<CheckInResult | null>(null)
  const [manualId, setManualId] = useState('')
  const [manualError, setManualError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!activeEvent) return

    window.api.smartcard.start()

    // If reader was already connected before this component mounted (e.g. user
    // navigated away and back), restore its name immediately.
    window.api.smartcard.getReaderName().then((name) => {
      if (name) setReaderName(name)
    })

    window.api.smartcard.onReaderConnected((name) => setReaderName(name))
    window.api.smartcard.onReaderDisconnected(() => {
      setReaderName(null)
      setCardDipped(false)
      setReading(false)
    })
    window.api.smartcard.onCardPresent(() => {
      setCardDipped(true)
      setReading(true)
    })
    window.api.smartcard.onCardInserted((data: CardData) => {
      setReading(false)
      handleCardData(data, 'card')
    })
    window.api.smartcard.onCardRemoved(() => {
      setCardDipped(false)
      setReading(false)
    })
    window.api.smartcard.onError((msg) => {
      setReading(false)
      console.error('[SmartCard Error]', msg)
    })

    return () => {
      window.api.smartcard.removeAllListeners()
    }
  }, [activeEvent])

  const handleCardData = async (data: CardData, method: 'card' | 'manual') => {
    if (!activeEvent) return
    const res = await window.api.checkins.process(activeEvent.id, data, method)
    setResult(res)
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setManualError('')
    const id = manualId.replace(/\D/g, '')
    if (id.length !== 13) {
      setManualError('กรุณากรอกเลขบัตรประชาชน 13 หลัก')
      return
    }
    const cardData: CardData = { thai_id: id, thai_name: '', en_name: '', dob: '', photo: null }
    await handleCardData(cardData, 'manual')
    setManualId('')
  }

  const handleConfirm = async () => {
    if (!result || !activeEvent) return
    await window.api.checkins.confirm(activeEvent.id, result.card_data, result.card_data.photo ? 'card' : 'manual')
    setResult(null)
    inputRef.current?.focus()
  }

  const handleDismiss = () => {
    setResult(null)
    inputRef.current?.focus()
  }

  if (!activeEvent) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <div className="text-center">
          <CreditCard size={48} className="mx-auto mb-3 opacity-30" />
          <p>{t('checkin.no_event')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-8 p-6">
      {/* Reader + card dip status */}
      <div className="flex flex-col items-center gap-2">
        <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-full ${
          readerName ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
        }`}>
          {readerName ? <Wifi size={15} /> : <WifiOff size={15} />}
          {readerName ? t('checkin.reader_status', { name: readerName }) : t('checkin.no_reader')}
        </div>

        {/* Card dip status — only shown when a reader is connected */}
        {readerName && (
          <div className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-full transition-all ${
            cardDipped && reading
              ? 'bg-blue-50 text-blue-600 animate-pulse'
              : cardDipped
                ? 'bg-green-50 text-green-600'
                : 'bg-gray-50 text-gray-400'
          }`}>
            <CreditCard size={12} />
            {cardDipped && reading
              ? t('checkin.card_dipped')
              : cardDipped
                ? t('checkin.card_read')
                : t('checkin.card_not_dipped')}
          </div>
        )}
      </div>

      {/* Card visual */}
      <div className={`flex flex-col items-center justify-center w-72 h-44 rounded-2xl border-2 border-dashed transition-all ${
        reading ? 'border-blue-400 bg-blue-50 animate-pulse' : 'border-gray-200 bg-white'
      }`}>
        <CreditCard size={48} className={reading ? 'text-blue-400' : 'text-gray-200'} />
        <p className={`mt-3 text-sm font-medium ${reading ? 'text-blue-500' : 'text-gray-400'}`}>
          {reading ? t('checkin.reading') : t('checkin.insert_card')}
        </p>
      </div>

      {/* Manual entry */}
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-2 text-sm text-gray-600 font-medium">
          <Keyboard size={15} /> {t('checkin.manual_entry')}
        </div>
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            maxLength={13}
            value={manualId}
            onChange={(e) => setManualId(e.target.value.replace(/\D/g, ''))}
            placeholder={t('checkin.manual_placeholder')}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono tracking-widest"
          />
          <button
            type="submit"
            disabled={manualId.length !== 13}
            className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t('checkin.manual_submit')}
          </button>
        </form>
        {manualError && <p className="text-xs text-red-500 mt-1">{manualError}</p>}
      </div>

      {/* Popup */}
      {result && (
        <CardPopup
          result={result}
          onConfirm={handleConfirm}
          onDismiss={handleDismiss}
        />
      )}
    </div>
  )
}
