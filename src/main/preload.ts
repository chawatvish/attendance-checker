import { contextBridge, ipcRenderer } from 'electron'
import type {
  Event,
  Attendee,
  CheckIn,
  CardData,
  CheckInResult,
  ImportResult,
  AttendanceSummary,
} from '../shared/types'

const api = {
  // Events
  events: {
    list: (): Promise<Event[]> => ipcRenderer.invoke('events:list'),
    create: (name: string, date: string | null, description: string | null): Promise<Event> =>
      ipcRenderer.invoke('events:create', name, date, description),
    delete: (id: number): Promise<void> => ipcRenderer.invoke('events:delete', id),
  },

  // Attendees
  attendees: {
    list: (eventId: number): Promise<Attendee[]> => ipcRenderer.invoke('attendees:list', eventId),
    importCsv: (eventId: number, csvContent: string): Promise<ImportResult> =>
      ipcRenderer.invoke('attendees:import-csv', eventId, csvContent),
    importExcel: (eventId: number, base64: string): Promise<ImportResult> =>
      ipcRenderer.invoke('attendees:import-excel', eventId, base64),
  },

  // Check-ins
  checkins: {
    process: (eventId: number, cardData: CardData, method: 'card' | 'manual'): Promise<CheckInResult> =>
      ipcRenderer.invoke('checkins:process', eventId, cardData, method),
    confirm: (eventId: number, cardData: CardData, method: 'card' | 'manual'): Promise<CheckInResult> =>
      ipcRenderer.invoke('checkins:confirm', eventId, cardData, method),
    list: (eventId: number): Promise<CheckIn[]> => ipcRenderer.invoke('checkins:list', eventId),
    summary: (eventId: number): Promise<AttendanceSummary> => ipcRenderer.invoke('checkins:summary', eventId),
    exportCsv: (eventId: number): Promise<string> => ipcRenderer.invoke('checkins:export-csv', eventId),
  },

  // Smart card
  smartcard: {
    start: (): Promise<void> => ipcRenderer.invoke('smartcard:start'),
    stop: (): Promise<void> => ipcRenderer.invoke('smartcard:stop'),
    getReaderName: (): Promise<string | null> => ipcRenderer.invoke('smartcard:get_reader_name'),
    onCardInserted: (cb: (data: CardData) => void) => {
      ipcRenderer.on('smartcard:card_inserted', (_e, data) => cb(data))
    },
    onCardPresent: (cb: () => void) => {
      ipcRenderer.on('smartcard:card_present', () => cb())
    },
    onCardRemoved: (cb: () => void) => {
      ipcRenderer.on('smartcard:card_removed', () => cb())
    },
    onReaderConnected: (cb: (name: string) => void) => {
      ipcRenderer.on('smartcard:reader_connected', (_e, name) => cb(name))
    },
    onReaderDisconnected: (cb: (name: string) => void) => {
      ipcRenderer.on('smartcard:reader_disconnected', (_e, name) => cb(name))
    },
    onError: (cb: (msg: string) => void) => {
      ipcRenderer.on('smartcard:error', (_e, msg) => cb(msg))
    },
    removeAllListeners: () => {
      ;[
        'smartcard:card_inserted',
        'smartcard:card_present',
        'smartcard:card_removed',
        'smartcard:reader_connected',
        'smartcard:reader_disconnected',
        'smartcard:error',
      ].forEach((ch) => ipcRenderer.removeAllListeners(ch))
    },
  },
}

contextBridge.exposeInMainWorld('api', api)

export type API = typeof api
