import { ipcMain } from 'electron'
import { getEvents, createEvent, deleteEvent } from '../database'

export function registerEventHandlers(): void {
  ipcMain.handle('events:list', () => getEvents())

  ipcMain.handle('events:create', (_e, name: string, date: string | null, description: string | null) =>
    createEvent(name, date, description)
  )

  ipcMain.handle('events:delete', (_e, id: number) => deleteEvent(id))
}
