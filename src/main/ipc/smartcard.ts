import { ipcMain, BrowserWindow } from 'electron'
import { cardEmitter, startCardListener, stopCardListener, getCurrentReaderName } from '../smartcard'
import type { CardData } from '../../shared/types'

export function registerSmartcardHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('smartcard:start', () => startCardListener())
  ipcMain.handle('smartcard:stop', () => stopCardListener())
  ipcMain.handle('smartcard:get_reader_name', () => getCurrentReaderName())

  cardEmitter.on('card_inserted', (data: CardData) => {
    getWindow()?.webContents.send('smartcard:card_inserted', data)
  })

  cardEmitter.on('card_present', () => {
    getWindow()?.webContents.send('smartcard:card_present')
  })

  cardEmitter.on('card_removed', () => {
    getWindow()?.webContents.send('smartcard:card_removed')
  })

  cardEmitter.on('reader_connected', (name: string) => {
    getWindow()?.webContents.send('smartcard:reader_connected', name)
  })

  cardEmitter.on('reader_disconnected', (name: string) => {
    getWindow()?.webContents.send('smartcard:reader_disconnected', name)
  })

  cardEmitter.on('error', (message: string) => {
    getWindow()?.webContents.send('smartcard:error', message)
  })
}
