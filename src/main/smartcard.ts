import { EventEmitter } from 'events'
import iconv from 'iconv-lite'
import type { CardData } from '../shared/types'

// pcsclite is a native module — require at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pcsclite = require('pcsclite')

export const cardEmitter = new EventEmitter()

let pcsc: ReturnType<typeof pcsclite> | null = null
let currentReaderName: string | null = null

/** Returns the name of the currently connected reader, or null if none. */
export function getCurrentReaderName(): string | null {
  return currentReaderName
}

// ── Thai National ID Card APDU commands ─────────────────────────────────────
//
// Format: 80 B0 [offset_hi] [offset_lo] 02 00 [length]
//   CLA = 0x80, INS = 0xB0 (READ BINARY), P1:P2 = file offset,
//   Lc = 0x02, Data = 00 [Le] (extended length)
//
// Source: github.com/chawatvish/ThaiIDSmartCardReader
//   เลขบัตร          offset 0x0004  len 0x0D (13)
//   ชื่อนามสกุล TH   offset 0x0011  len 0x64 (100)
//   ชื่อนามสกุล EN   offset 0x0075  len 0x64 (100)
//   วันเกิด          offset 0x00D9  len 0x08 (8)
//   เพศ              offset 0x00E1  len 0x01 (1)
//   หน่วยงานออกบัตร  offset 0x00F6  len 0x64 (100)
//   วันออกบัตร       offset 0x0167  len 0x08 (8)
//   วันหมดอายุ       offset 0x016F  len 0x08 (8)
//   ศาสนา            offset 0x0177  len 0x02 (2)
//   ที่อยู่          offset 0x1579  len 0x64 (100)
//   เลขใต้บัตร       offset 0x1619  len 0x0E (14)
//   Photo: 20 parts × 255 bytes, part i → 80 B0 (0x01+i) (0x7B-i) 02 00 FF

const SELECT_APPLET = Buffer.from([
  0x00, 0xa4, 0x04, 0x00, 0x08, 0xa0, 0x00, 0x00, 0x00, 0x54, 0x48, 0x00, 0x01
])

function makeReadCmd(
  offsetHi: number,
  offsetLo: number,
  length: number
): Buffer {
  return Buffer.from([0x80, 0xb0, offsetHi, offsetLo, 0x02, 0x00, length])
}

// Photo: 20 fixed parts of 255 bytes each (total 5100 bytes = raw JPEG)
function makePhotoPartCmd(part: number): Buffer {
  return Buffer.from([0x80, 0xb0, 0x01 + part, 0x7b - part, 0x02, 0x00, 0xff])
}

const APDU = {
  SELECT_APPLET,
  READ_CID: makeReadCmd(0x00, 0x04, 0x0d), // เลขบัตร (13)
  READ_TH_NAME: makeReadCmd(0x00, 0x11, 0x64), // ชื่อนามสกุล TH (100)
  READ_EN_NAME: makeReadCmd(0x00, 0x75, 0x64), // ชื่อนามสกุล EN (100)
  READ_DOB: makeReadCmd(0x00, 0xd9, 0x08), // วันเกิด (8)
  READ_GENDER: makeReadCmd(0x00, 0xe1, 0x01), // เพศ (1)
  READ_ISSUER: makeReadCmd(0x00, 0xf6, 0x64), // หน่วยงานออกบัตร (100)
  READ_ISSUE_DATE: makeReadCmd(0x01, 0x67, 0x08), // วันออกบัตร (8)
  READ_EXP_DATE: makeReadCmd(0x01, 0x6f, 0x08), // วันหมดอายุ (8)
  READ_RELIGION: makeReadCmd(0x01, 0x77, 0x02), // ศาสนา (2)
  READ_ADDRESS: makeReadCmd(0x15, 0x79, 0x64), // ที่อยู่ (100)
  READ_CARD_BACK: makeReadCmd(0x16, 0x19, 0x0e) // เลขใต้บัตร (14)
}

function transmit(card: any, cmd: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    card.transmit(
      cmd,
      1024,
      card.protocol,
      (err: Error | null, data: Buffer) => {
        if (err) return reject(err)
        if (data.length < 2) return reject(new Error('APDU response too short'))

        const sw1 = data[data.length - 2]
        const sw2 = data[data.length - 1]

        if (sw1 === 0x90 && sw2 === 0x00) {
          // Normal success
          return resolve(data)
        }

        if (sw1 === 0x61) {
          // "xx bytes still available" — issue GET RESPONSE to retrieve them,
          // then resolve as if the original command succeeded.
          const getResponse = Buffer.from([0x00, 0xc0, 0x00, 0x00, sw2])
          card.transmit(
            getResponse,
            1024,
            card.protocol,
            (err2: Error | null, data2: Buffer) => {
              if (err2) return reject(err2)
              // Return original data payload (without SW) + new GET RESPONSE data
              const payload = data.slice(0, data.length - 2)
              const extra = data2.slice(0, data2.length - 2)
              // Reconstruct with trailing 90 00
              const combined = Buffer.concat([
                payload,
                extra,
                Buffer.from([0x90, 0x00])
              ])
              return resolve(combined)
            }
          )
          return
        }

        // Any other SW is a genuine error
        reject(
          new Error(
            `APDU error: SW=${sw1.toString(16).padStart(2, '0')}${sw2.toString(16).padStart(2, '0')} cmd=${cmd.toString('hex')}`
          )
        )
      }
    )
  })
}

// Card data is TIS-620 encoded (Thai charset), NOT UTF-8.
// Strip trailing SW1 SW2 status bytes before decoding.
// Thai ID card uses '#' (0x23) as a field separator/padding — replace with space.
function parseTIS620(buf: Buffer): string {
  const data = buf.slice(0, buf.length - 2)
  return iconv
    .decode(data, 'tis620')
    .replace(/#/g, ' ')   // '#' is the card's field separator (e.g. นาย#ชื่อ#นามสกุล)
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ') // collapse multiple spaces left by padding
    .trim()
}

// Dates on card are YYYYMMDD in Buddhist Era (BE). Convert to CE ISO date.
function parseBEDate(buf: Buffer): string | null {
  const raw = buf
    .slice(0, buf.length - 2)
    .toString('ascii')
    .trim()
  if (!/^\d{8}$/.test(raw)) return null
  const yearCE = parseInt(raw.slice(0, 4)) - 543
  return `${yearCE}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`
}

function parseGender(raw: string): string | null {
  switch (raw.trim()) {
    case '1':
      return 'ชาย'
    case '2':
      return 'หญิง'
    case '3':
      return 'ไม่ระบุ'
    default:
      return null
  }
}

const RELIGION_MAP: Record<string, string> = {
  '00': 'ไม่ปรากฏศาสนา',
  '01': 'พุทธ',
  '02': 'อิสลาม',
  '03': 'คริสต์',
  '04': 'พราหมณ์-ฮินดู',
  '05': 'ซิกข์',
  '06': 'อื่นๆ',
  '07': 'อื่นๆ',
  '08': 'อื่นๆ',
  '09': 'อื่นๆ',
}

function parseReligion(buf: Buffer): string | null {
  // Religion field is a 2-byte ASCII code (e.g. "01" = พุทธ)
  const code = buf
    .slice(0, buf.length - 2)
    .toString('ascii')
    .replace(/\0/g, '')
    .trim()
  return RELIGION_MAP[code] ?? (code ? `อื่นๆ (${code})` : null)
}

async function readPhoto(card: any): Promise<string | null> {
  try {
    // 20 fixed parts × 255 bytes = 5100 raw bytes (JPEG image)
    const parts: Buffer[] = []
    for (let i = 0; i < 20; i++) {
      const resp = await transmit(card, makePhotoPartCmd(i))
      // Strip SW1 SW2
      parts.push(resp.slice(0, resp.length - 2))
    }
    const photoBuffer = Buffer.concat(parts)
    return photoBuffer.toString('base64')
  } catch {
    return null
  }
}

async function readThaiIdCard(card: any): Promise<CardData> {
  console.log('[SmartCard] Selecting Thai ID applet...')
  await transmit(card, APDU.SELECT_APPLET)

  // All fields must be read sequentially (card doesn't support concurrent APDU)
  console.log('[SmartCard] Reading CID...')
  const cidResp = await transmit(card, APDU.READ_CID)
  console.log('[SmartCard] Reading Thai name...')
  const thNameResp = await transmit(card, APDU.READ_TH_NAME)
  console.log('[SmartCard] Reading EN name...')
  const enNameResp = await transmit(card, APDU.READ_EN_NAME)
  console.log('[SmartCard] Reading DOB...')
  const dobResp = await transmit(card, APDU.READ_DOB)
  console.log('[SmartCard] Reading gender...')
  const genderResp = await transmit(card, APDU.READ_GENDER)
  console.log('[SmartCard] Reading issuer...')
  const issuerResp = await transmit(card, APDU.READ_ISSUER)
  console.log('[SmartCard] Reading issue date...')
  const issueDtResp = await transmit(card, APDU.READ_ISSUE_DATE)
  console.log('[SmartCard] Reading expiry date...')
  const expDtResp = await transmit(card, APDU.READ_EXP_DATE)
  console.log('[SmartCard] Reading religion...')
  const religResp = await transmit(card, APDU.READ_RELIGION)
  console.log('[SmartCard] Reading address...')
  const addrResp = await transmit(card, APDU.READ_ADDRESS)
  console.log('[SmartCard] Reading card back number...')
  const backResp = await transmit(card, APDU.READ_CARD_BACK)

  // CID is ASCII digits
  const thai_id = cidResp
    .slice(0, cidResp.length - 2)
    .toString('ascii')
    .trim()
  console.log('[SmartCard] CID raw:', JSON.stringify(thai_id))
  if (thai_id.length !== 13 || !/^\d{13}$/.test(thai_id)) {
    throw new Error(`Invalid CID: "${thai_id}" (len=${thai_id.length})`)
  }

  const thai_name = parseTIS620(thNameResp)
  const en_name = parseTIS620(enNameResp)
  const dob = parseBEDate(dobResp) ?? ''
  const gender = parseGender(parseTIS620(genderResp))
  const issuer = parseTIS620(issuerResp) || null
  const issue_date = parseBEDate(issueDtResp)
  const expire_date = parseBEDate(expDtResp)
  const religion = parseReligion(religResp)
  const address = parseTIS620(addrResp) || null
  // เลขใต้บัตร is ASCII
  const card_number_back =
    backResp
      .slice(0, backResp.length - 2)
      .toString('ascii')
      .trim() || null

  console.log('[SmartCard] Reading photo...')
  const photo = await readPhoto(card)
  console.log('[SmartCard] Done. photo:', photo ? 'yes' : 'null')

  return {
    thai_id,
    thai_name,
    en_name,
    dob,
    gender,
    issuer,
    issue_date,
    expire_date,
    religion,
    address,
    card_number_back,
    photo
  }
}

// Retry connecting to the card — the OS sometimes reports PRESENT before the
// card is electrically ready, causing SCARD_E_NO_SMARTCARD (0x8010000c).
// onDone is called when the connect/read cycle finishes so the caller can
// clear its 'connected' tracking flag.
function connectWithRetry(
  reader: any,
  attemptsLeft: number,
  onDone: () => void,
  delayMs = 300
): void {
  reader.connect(
    { share_mode: 2 },
    async (err: Error | null, protocol: number) => {
      if (err) {
        if (attemptsLeft > 1) {
          setTimeout(
            () => connectWithRetry(reader, attemptsLeft - 1, onDone, delayMs),
            delayMs
          )
        } else {
          console.error('[SmartCard] Connect failed:', err.message)
          onDone()
          cardEmitter.emit('error', `Card connect error: ${err.message}`)
        }
        return
      }
      reader.protocol = protocol
      try {
        const data = await readThaiIdCard(reader)
        // Disconnect before emitting so the card is released for other apps
        reader.disconnect(reader.SCARD_LEAVE_CARD, () => {})
        onDone()
        cardEmitter.emit('card_inserted', data)
      } catch (readErr: any) {
        reader.disconnect(reader.SCARD_LEAVE_CARD, () => {})
        onDone()
        console.error('[SmartCard] Read error:', readErr)
        cardEmitter.emit('error', `Read error: ${readErr?.message ?? readErr}`)
      }
    }
  )
}

export function startCardListener(): void {
  if (pcsc) return

  try {
    pcsc = pcsclite()
  } catch (err) {
    console.error('[SmartCard] PC/SC not available:', err)
    cardEmitter.emit('error', 'PC/SC service not available')
    return
  }

  pcsc.on('reader', (reader: any) => {
    console.log('[SmartCard] Reader detected:', reader.name)
    currentReaderName = reader.name
    cardEmitter.emit('reader_connected', reader.name)

    // Track card presence with our own boolean to avoid reader.state XOR timing issues.
    // Also track whether we have an active connection open to avoid double-disconnect.
    let cardPresent = false
    let connected = false

    reader.on('status', (status: any) => {
      const PRESENT = 0x0020
      const isPresent = !!(status.state & PRESENT)

      if (isPresent && !cardPresent) {
        // Card just inserted — start reading
        cardPresent = true
        connected = true
        cardEmitter.emit('card_present')
        connectWithRetry(reader, 3, () => { connected = false })
      } else if (!isPresent && cardPresent) {
        // Card physically removed
        cardPresent = false
        // Only call disconnect if we still have an open connection.
        // connectWithRetry already calls disconnect on success/failure, so
        // calling it again after a successful read would double-disconnect,
        // which on some platforms causes the reader 'end' event to fire.
        if (connected) {
          connected = false
          reader.disconnect(reader.SCARD_LEAVE_CARD, () => {})
        }
        cardEmitter.emit('card_removed')
      }
    })

    reader.on('end', () => {
      currentReaderName = null
      cardEmitter.emit('reader_disconnected', reader.name)
    })

    reader.on('error', (err: Error) => {
      cardEmitter.emit('error', err.message)
    })
  })

  pcsc.on('error', (err: Error) => {
    cardEmitter.emit('error', err.message)
  })
}

export function stopCardListener(): void {
  if (pcsc) {
    pcsc.close()
    pcsc = null
  }
}
