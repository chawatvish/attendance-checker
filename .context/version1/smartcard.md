# Smart Card Integration — Version 1

## Overview

Thai national ID cards (บัตรประจำตัวประชาชน) are read via ISO 7816 APDU commands using the PC/SC subsystem. The app uses the `pcsclite` native Node module (wraps `libpcsclite` on macOS/Linux, `winscard.dll` on Windows).

Source reference: [github.com/chawatvish/ThaiIDSmartCardReader](https://github.com/chawatvish/ThaiIDSmartCardReader)

---

## APDU Command Format

All data fields use a custom READ BINARY command (CLA=0x80):

```
80 B0 [offset_hi] [offset_lo] 02 00 [length]
```

- `CLA` = 0x80
- `INS` = 0xB0 (READ BINARY)
- `P1:P2` = file offset (big-endian, 16-bit)
- `Lc` = 0x02
- `Data` = `00 [Le]` (extended length form)

### Field Map

| Field | APDU bytes | Offset | Length | Encoding |
|---|---|---|---|---|
| เลขบัตร (Thai ID) | `80 B0 00 04 02 00 0D` | 0x0004 | 13 | ASCII digits |
| ชื่อนามสกุล TH | `80 B0 00 11 02 00 64` | 0x0011 | 100 | TIS-620 |
| ชื่อนามสกุล EN | `80 B0 00 75 02 00 64` | 0x0075 | 100 | TIS-620 |
| วันเกิด | `80 B0 00 D9 02 00 08` | 0x00D9 | 8 | ASCII YYYYMMDD (BE) |
| เพศ | `80 B0 00 E1 02 00 01` | 0x00E1 | 1 | ASCII '1'=ชาย '2'=หญิง '3'=ไม่ระบุ |
| หน่วยงานออกบัตร | `80 B0 00 F6 02 00 64` | 0x00F6 | 100 | TIS-620 |
| วันออกบัตร | `80 B0 01 67 02 00 08` | 0x0167 | 8 | ASCII YYYYMMDD (BE) |
| วันหมดอายุ | `80 B0 01 6F 02 00 08` | 0x016F | 8 | ASCII YYYYMMDD (BE) |
| ศาสนา | `80 B0 01 77 02 00 02` | 0x0177 | 2 | ASCII code (see below) |
| ที่อยู่ | `80 B0 15 79 02 00 64` | 0x1579 | 100 | TIS-620 |
| เลขใต้บัตร | `80 B0 16 19 02 00 0E` | 0x1619 | 14 | ASCII |

### Photo

Photo is stored as raw JPEG bytes split across 20 fixed parts of 255 bytes each (5100 bytes total):

```
Part i: 80 B0 (0x01 + i) (0x7B - i) 02 00 FF
```

Parts are concatenated to reconstruct the JPEG. Stored as base64 string in `CardData.photo`.

### SELECT APPLET

Must be sent before any READ BINARY command:

```
00 A4 04 00 08 A0 00 00 00 54 48 00 01
```

---

## PC/SC State Machine (`startCardListener`)

```
pcsc.on('reader')
  └─ currentReaderName = reader.name
     cardEmitter.emit('reader_connected', name)

     reader.on('status')
       cardPresent = false, connected = false (local per-reader booleans)

       PRESENT bit set AND !cardPresent →
         cardPresent = true
         connected = true
         cardEmitter.emit('card_present')          ← immediate, before read
         connectWithRetry(reader, 3, onDone=()=>{ connected=false })

       PRESENT bit clear AND cardPresent →
         cardPresent = false
         if connected → reader.disconnect() + connected=false
         cardEmitter.emit('card_removed')

     reader.on('end')  →  cardEmitter.emit('reader_disconnected', name)
     reader.on('error') → cardEmitter.emit('error', msg)

pcsc.on('error') → cardEmitter.emit('error', msg)
```

### Why local `cardPresent` and `connected` booleans?

- **`cardPresent`**: The standard pcsclite pattern XORs `reader.state` with `status.state` to detect transitions. This requires updating `reader.state` after each event, which is error-prone. Using a local boolean is simpler and reliable.
- **`connected`**: `connectWithRetry` calls `reader.disconnect()` on success/failure. If the card is then removed, the `status` handler must NOT call `reader.disconnect()` again. Double-disconnect on some platforms fires the `end` event, which incorrectly emits `reader_disconnected`.

### `connectWithRetry`

Retries up to 3 times with 300ms delay. Necessary because the OS sometimes reports `SCARD_STATE_PRESENT` before the card is electrically ready, causing `SCARD_E_NO_SMARTCARD (0x8010000c)` on the first connect attempt.

---

## Encoding / Parsing

### TIS-620 (`parseTIS620`)

Thai ID cards encode text fields in TIS-620 (Thai national charset), NOT UTF-8.

1. Strip trailing 2-byte APDU status (`SW1 SW2`)
2. Decode buffer with `iconv-lite` as `tis620`
3. Replace `#` (0x23) with space — the card uses `#` as a word separator (e.g., `นาย#ชัย#ใจดี` → `นาย ชัย ใจดี`)
4. Strip null bytes (`\0`)
5. Collapse multiple spaces
6. Trim

### Buddhist Era Dates (`parseBEDate`)

Dates are `YYYYMMDD` ASCII strings in Buddhist Era (BE = CE + 543). Converts to ISO `YYYY-MM-DD` in CE:

```
yearCE = parseInt(raw.slice(0, 4)) - 543
```

Returns `null` if the field is not exactly 8 digits.

### Religion (`parseReligion`)

The 2-byte religion field is ASCII code, NOT TIS-620. Map:

| Code | Religion |
|---|---|
| 00 | ไม่ปรากฏศาสนา |
| 01 | พุทธ |
| 02 | อิสลาม |
| 03 | คริสต์ |
| 04 | พราหมณ์-ฮินดู |
| 05 | ซิกข์ |
| 06–09 | อื่นๆ |

Unknown codes fall through to `อื่นๆ (XX)` for debugging.

### Gender (`parseGender`)

Single ASCII byte: `'1'` = ชาย, `'2'` = หญิง, `'3'` = ไม่ระบุ.

---

## APDU `transmit` Helper

Handles both success and `SW1=0x61` ("more data available") by issuing a `GET RESPONSE (00 C0 00 00 <sw2>)` command automatically. Any other status word raises an error with the hex SW bytes and command in the message.

---

## `CardData` TypeScript Interface

```ts
interface CardData {
  thai_id: string            // 13-digit national ID
  thai_name: string          // ชื่อนามสกุล TH (spaces, not #)
  en_name: string            // ชื่อนามสกุล EN
  dob: string                // YYYY-MM-DD (CE)
  gender: string | null      // ชาย / หญิง / ไม่ระบุ
  issuer: string | null      // หน่วยงานออกบัตร
  issue_date: string | null  // YYYY-MM-DD (CE)
  expire_date: string | null // YYYY-MM-DD (CE)
  religion: string | null    // Thai text from RELIGION_MAP
  address: string | null     // ที่อยู่
  card_number_back: string | null  // เลขใต้บัตร
  photo: string | null       // base64 JPEG
}
```
