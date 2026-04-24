import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, FileText } from 'lucide-react'

interface Props {
  eventId: number
  onClose: () => void
}

interface PreviewRow {
  thai_id: string
  full_name: string
}

export default function ImportDialog({ eventId, onClose }: Props) {
  const { t } = useTranslation()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [fileName, setFileName] = useState('')
  const [fileData, setFileData] = useState<{ type: 'csv'; content: string } | { type: 'excel'; base64: string } | null>(null)
  const [importing, setImporting] = useState(false)
  const [resultMsg, setResultMsg] = useState('')
  const [dragging, setDragging] = useState(false)

  const processFile = (file: File) => {
    setFileName(file.name)
    setResultMsg('')

    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        setFileData({ type: 'csv', content })
        parsePreviewCsv(content)
      }
      reader.readAsText(file, 'UTF-8')
    } else {
      const reader = new FileReader()
      reader.onload = (e) => {
        const base64 = btoa(
          new Uint8Array(e.target?.result as ArrayBuffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        )
        setFileData({ type: 'excel', base64 })
        // Excel preview is done server-side, just show file info
        setPreview([])
        setTotalRows(-1)
      }
      reader.readAsArrayBuffer(file)
    }
  }

  const parsePreviewCsv = (content: string) => {
    const lines = content.split('\n').filter((l) => l.trim())
    const hasHeader = isNaN(Number(lines[0].split(',')[0]?.replace(/\D/g, '')))
    const dataLines = hasHeader ? lines.slice(1) : lines
    setTotalRows(dataLines.length)

    const rows: PreviewRow[] = dataLines.slice(0, 5).map((line) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
      const idCol = cols.find((c) => /^\d{13}$/.test(c)) ?? cols[0] ?? ''
      const nameIdx = cols.indexOf(idCol) + 1
      const name = cols[nameIdx] ?? ''
      return { thai_id: idCol, full_name: name }
    })
    setPreview(rows)
  }

  const handleImport = async () => {
    if (!fileData) return
    setImporting(true)
    try {
      let result
      if (fileData.type === 'csv') {
        result = await window.api.attendees.importCsv(eventId, fileData.content)
      } else {
        result = await window.api.attendees.importExcel(eventId, fileData.base64)
      }
      setResultMsg(
        t('import.result', {
          imported: result.imported,
          skipped: result.skipped,
          errors: result.errors.length,
        })
      )
    } catch (e) {
      setResultMsg(String(e))
    } finally {
      setImporting(false)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{t('import.title')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-4">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Upload size={24} className="mx-auto text-gray-300 mb-2" />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm text-blue-600 font-medium">
                <FileText size={15} /> {fileName}
              </div>
            ) : (
              <p className="text-sm text-gray-400">{t('import.drop_here')}</p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }}
          />

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">
                {t('import.preview')} — {t('import.total_rows', { count: totalRows })}
              </p>
              <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Thai ID</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.map((r, i) => (
                      <tr key={i}>
                        <td className="px-3 py-1.5 font-mono text-gray-700">{r.thai_id}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.full_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Excel info */}
          {totalRows === -1 && (
            <p className="text-xs text-gray-500">{t('import.select_file')} ✓</p>
          )}

          {/* Result */}
          {resultMsg && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              {resultMsg}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={handleImport}
            disabled={!fileData || importing}
            className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {importing ? t('import.importing') : t('common.import')}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50">
            {resultMsg ? t('common.close') : t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
