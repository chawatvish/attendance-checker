/**
 * Import logic tests — CSV parsing and Excel parsing with column normalisation
 */
import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import path from 'path'
import fs from 'fs'

// ── Column normalisation (mirrors src/main/ipc/attendees.ts) ─────────────────

function normalizeRows(data: Record<string, string>[]): { thai_id: string; full_name?: string }[] {
  return data.map((row) => {
    const values = Object.values(row)
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

// ── Column header detection ───────────────────────────────────────────────────

describe('normalizeRows — column header detection', () => {
  it('detects english "thai_id" header', () => {
    const rows = normalizeRows([{ thai_id: '1100100000001', full_name: 'Test' }])
    expect(rows[0].thai_id).toBe('1100100000001')
    expect(rows[0].full_name).toBe('Test')
  })

  it('detects english "Citizen ID" header', () => {
    const rows = normalizeRows([{ 'Citizen ID': '1100100000002', Name: 'Person' }])
    expect(rows[0].thai_id).toBe('1100100000002')
  })

  it('detects thai "รหัสประชาชน" header', () => {
    const rows = normalizeRows([{ 'รหัสประชาชน': '1100100000003', 'ชื่อ-นามสกุล': 'สมชาย' }])
    expect(rows[0].thai_id).toBe('1100100000003')
    expect(rows[0].full_name).toBe('สมชาย')
  })

  it('detects thai "เลขบัตร" header', () => {
    const rows = normalizeRows([{ 'เลขบัตร': '1100100000004', 'นามสกุล': 'ใจดี' }])
    expect(rows[0].thai_id).toBe('1100100000004')
  })

  it('falls back to first column when no matching header', () => {
    const rows = normalizeRows([{ col1: '1100100000005', col2: 'Someone' }])
    expect(rows[0].thai_id).toBe('1100100000005')
    expect(rows[0].full_name).toBe('Someone')
  })

  it('strips non-digit characters from ID (e.g. dashes)', () => {
    const rows = normalizeRows([{ thai_id: '1-1001-00000-01-1', full_name: 'Test' }])
    expect(rows[0].thai_id).toBe('1100100000011')
  })

  it('returns empty string for missing ID', () => {
    const rows = normalizeRows([{ full_name: 'No ID' } as any])
    expect(rows[0].thai_id).toBe('')
  })

  it('handles full_name being undefined gracefully', () => {
    const rows = normalizeRows([{ thai_id: '1100100000001' }])
    expect(rows[0].full_name).toBeUndefined()
  })

  it('processes batch of rows correctly', () => {
    const input = [
      { thai_id: '1100100000001', full_name: 'Person A' },
      { thai_id: '1100100000002', full_name: 'Person B' },
      { thai_id: '1100100000003', full_name: 'Person C' },
    ]
    const rows = normalizeRows(input)
    expect(rows).toHaveLength(3)
    expect(rows.map(r => r.thai_id)).toEqual(['1100100000001', '1100100000002', '1100100000003'])
  })
})

// ── CSV parsing ───────────────────────────────────────────────────────────────

describe('CSV import', () => {
  it('parses CSV with english headers', () => {
    const csv = `thai_id,full_name\n1100100000001,สมชาย ใจดี\n1100100000002,สมหญิง รักไทย`
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    const rows = normalizeRows(result.data)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ thai_id: '1100100000001', full_name: 'สมชาย ใจดี' })
  })

  it('parses CSV with Thai headers', () => {
    const csv = `รหัสประชาชน,ชื่อ-นามสกุล\n1100100000001,สมชาย ใจดี`
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    const rows = normalizeRows(result.data)
    expect(rows[0].thai_id).toBe('1100100000001')
    expect(rows[0].full_name).toBe('สมชาย ใจดี')
  })

  it('skips empty lines', () => {
    const csv = `thai_id,full_name\n1100100000001,Person A\n\n1100100000002,Person B\n`
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    expect(result.data).toHaveLength(2)
  })

  it('handles trailing whitespace in IDs', () => {
    const csv = `thai_id,full_name\n 1100100000001 ,Person`
    const result = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
    const rows = normalizeRows(result.data)
    // normalizeRows strips non-digits, so spaces are removed
    expect(rows[0].thai_id).toBe('1100100000001')
  })

  it('parses the mockdata attendees.csv file', () => {
    const csvPath = path.join(__dirname, '../mockdata/attendees.csv')
    const content = fs.readFileSync(csvPath, 'utf-8')
    const result = Papa.parse<Record<string, string>>(content, { header: true, skipEmptyLines: true })
    const rows = normalizeRows(result.data)
    expect(rows).toHaveLength(20)
    expect(rows.every(r => r.thai_id.length === 13)).toBe(true)
    expect(rows[0].full_name).toBe('สมชาย ใจดี')
  })
})

// ── Excel parsing ─────────────────────────────────────────────────────────────

async function parseExcel(filePath: string): Promise<{ thai_id: string; full_name?: string }[]> {
  const buffer = fs.readFileSync(filePath)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer)
  const ws = wb.worksheets[0]
  const rawRows: Record<string, string>[] = []
  let headers: string[] = []
  ws.eachRow((row, rowNumber) => {
    const values = (row.values as (string | number | null)[]).slice(1)
    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? ''))
    } else {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = String(values[i] ?? '') })
      rawRows.push(obj)
    }
  })
  return normalizeRows(rawRows)
}

describe('Excel import', () => {
  it('parses the mockdata attendees.xlsx file (english headers)', async () => {
    const rows = await parseExcel(path.join(__dirname, '../mockdata/attendees.xlsx'))
    expect(rows).toHaveLength(20)
    expect(rows.every(r => r.thai_id.length === 13)).toBe(true)
    expect(rows[0].full_name).toBe('สมชาย ใจดี')
  })

  it('parses the mockdata attendees_thai_headers.xlsx file (Thai headers)', async () => {
    const rows = await parseExcel(path.join(__dirname, '../mockdata/attendees_thai_headers.xlsx'))
    expect(rows).toHaveLength(20)
    expect(rows.every(r => r.thai_id.length === 13)).toBe(true)
  })

  it('handles Excel workbook roundtrip', async () => {
    // Create workbook in memory, write, then read back
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Sheet1')
    ws.addRow(['thai_id', 'full_name'])
    ws.addRow(['1100100000001', 'Test Person'])
    ws.addRow(['1100100000002', 'Another Person'])
    const buf = await wb.xlsx.writeBuffer()

    const wb2 = new ExcelJS.Workbook()
    await wb2.xlsx.load(buf as ArrayBuffer)
    const ws2 = wb2.worksheets[0]
    const rawRows: Record<string, string>[] = []
    let headers: string[] = []
    ws2.eachRow((row, rowNumber) => {
      const values = (row.values as (string | number | null)[]).slice(1)
      if (rowNumber === 1) headers = values.map(v => String(v ?? ''))
      else {
        const obj: Record<string, string> = {}
        headers.forEach((h, i) => { obj[h] = String(values[i] ?? '') })
        rawRows.push(obj)
      }
    })
    const rows = normalizeRows(rawRows)
    expect(rows).toHaveLength(2)
    expect(rows[0].thai_id).toBe('1100100000001')
    expect(rows[0].full_name).toBe('Test Person')
  })
})
