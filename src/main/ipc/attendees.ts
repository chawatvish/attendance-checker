import { ipcMain } from 'electron'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { getAttendees, importAttendees } from '../database'

export function registerAttendeeHandlers(): void {
  ipcMain.handle('attendees:list', (_e, eventId: number) => getAttendees(eventId))

  ipcMain.handle('attendees:import-csv', (_e, eventId: number, csvContent: string) => {
    const result = Papa.parse<Record<string, string>>(csvContent, {
      header: true,
      skipEmptyLines: true,
    })
    const rows = normalizeRows(result.data)
    return importAttendees(eventId, rows)
  })

  ipcMain.handle('attendees:import-excel', async (_e, eventId: number, base64: string) => {
    const nodeBuffer = Buffer.from(base64, 'base64')
    const arrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer as ArrayBuffer)
    const sheet = workbook.worksheets[0]

    const rawRows: Record<string, string>[] = []
    let headers: string[] = []

    sheet.eachRow((row, rowNumber) => {
      const values = (row.values as (string | number | null)[]).slice(1) // ExcelJS uses 1-based, index 0 is empty
      if (rowNumber === 1) {
        headers = values.map((v) => String(v ?? ''))
      } else {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = String(values[i] ?? '') })
        rawRows.push(obj)
      }
    })

    const rows = normalizeRows(rawRows)
    return importAttendees(eventId, rows)
  })
}

function normalizeRows(data: Record<string, string>[]): { thai_id: string; full_name?: string }[] {
  return data.map((row) => {
    const values = Object.values(row)

    // Try to find columns by header name
    const idKey = Object.keys(row).find((k) =>
      /id|thai.?id|citizen|เลขบัตร|รหัสประชาชน/.test(k.toLowerCase())
    )
    const nameKey = Object.keys(row).find((k) =>
      /name|ชื่อ|นาม/.test(k.toLowerCase())
    )

    const thai_id = (idKey ? row[idKey] : values[0] ?? '').toString().replace(/\D/g, '')
    const full_name = (nameKey ? row[nameKey] : values[1] ?? '').toString()

    return { thai_id, full_name: full_name || undefined }
  })
}
