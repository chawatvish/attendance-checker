import { ipcMain } from 'electron'
import Papa from 'papaparse'
import {
  findAttendee,
  findCheckin,
  createCheckin,
  getCheckins,
  getAttendeeCount,
  getCheckinBreakdown,
} from '../database'
import type { CardData, CheckInResult } from '../../shared/types'

export function registerCheckinHandlers(): void {
  ipcMain.handle(
    'checkins:process',
    (_e, eventId: number, cardData: CardData, method: 'card' | 'manual'): CheckInResult => {
      const attendee = findAttendee(eventId, cardData.thai_id)
      const existing = findCheckin(eventId, cardData.thai_id)

      if (existing) {
        return { status: 'duplicate', card_data: cardData, checkin: existing, attendee }
      }

      const status = attendee ? 'approved' : 'not_found'
      return { status, card_data: cardData, attendee }
    }
  )

  ipcMain.handle(
    'checkins:confirm',
    (_e, eventId: number, cardData: CardData, method: 'card' | 'manual'): CheckInResult => {
      // Allow force check-in even if not in attendee list
      const attendee = findAttendee(eventId, cardData.thai_id)
      const existing = findCheckin(eventId, cardData.thai_id)

      if (existing) {
        return { status: 'duplicate', card_data: cardData, checkin: existing, attendee }
      }

      const checkin = createCheckin(
        eventId,
        cardData.thai_id,
        cardData.thai_name || cardData.en_name || null,
        cardData.dob || null,
        method
      )
      return { status: attendee ? 'approved' : 'not_found', card_data: cardData, checkin, attendee }
    }
  )

  ipcMain.handle('checkins:list', (_e, eventId: number) => getCheckins(eventId))

  ipcMain.handle('checkins:summary', (_e, eventId: number) => {
    const { registered_checkedin, walkin_checkedin } = getCheckinBreakdown(eventId)
    return {
      total_registered: getAttendeeCount(eventId),
      registered_checkedin,
      walkin_checkedin,
      checkins: getCheckins(eventId),
    }
  })

  ipcMain.handle('checkins:export-csv', (_e, eventId: number) => {
    const checkins = getCheckins(eventId)
    return Papa.unparse(
      checkins.map((c) => ({
        'Thai ID': c.thai_id,
        'Full Name': c.full_name ?? '',
        'Date of Birth': c.dob ?? '',
        'Check-in Time': c.checked_in_at,
        Method: c.method,
        'Walk-in': c.is_walkin ? 'Yes' : 'No',
      }))
    )
  })
}
