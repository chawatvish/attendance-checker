# IPC API Reference — Version 1

All IPC is exposed to the renderer via `window.api` (set up in `preload.ts` using `contextBridge`).

---

## `window.api.events`

### `events.list(): Promise<Event[]>`
Returns all events ordered by `created_at DESC`.

### `events.create(name, date, description): Promise<Event>`
Creates a new event. `date` and `description` may be `null`.

### `events.delete(id): Promise<void>`
Deletes an event. Cascades to `attendees` and `checkins`.

---

## `window.api.attendees`

### `attendees.list(eventId): Promise<Attendee[]>`
Returns all attendees for the event, sorted by `full_name`.

### `attendees.importCsv(eventId, csvContent): Promise<ImportResult>`
Parses and upserts attendees from a CSV string. Validates 13-digit Thai IDs. Returns:
```ts
{ imported: number, skipped: number, errors: string[] }
```

### `attendees.importExcel(eventId, base64): Promise<ImportResult>`
Same as CSV but accepts a base64-encoded `.xlsx`/`.xls` file. Parsed with ExcelJS in main process.

---

## `window.api.checkins`

### `checkins.process(eventId, cardData, method): Promise<CheckInResult>`
**Checks** whether the Thai ID is registered and not a duplicate. Does NOT create a check-in record. Returns:

```ts
interface CheckInResult {
  status: 'approved' | 'duplicate' | 'not_found'
  card_data: CardData
  checkin?: CheckIn      // present when status='duplicate'
  attendee?: Attendee    // present when status='approved'
}
```

- `approved` — ID is in the attendee list, no prior check-in
- `duplicate` — already checked in
- `not_found` — ID not in attendee list (potential walk-in)

### `checkins.confirm(eventId, cardData, method): Promise<CheckInResult>`
**Writes** the check-in record. Called after staff confirms the popup. Handles all three status cases:
- `approved` → creates check-in, returns `status: 'approved'`
- `not_found` → creates check-in as walk-in, returns `status: 'not_found'`
- `duplicate` → does not create another record, returns `status: 'duplicate'`

### `checkins.list(eventId): Promise<CheckIn[]>`
Returns all check-ins for the event with `is_walkin` boolean (derived from LEFT JOIN with attendees).

### `checkins.summary(eventId): Promise<AttendanceSummary>`
Returns aggregated data for the Attendance page:
```ts
interface AttendanceSummary {
  total_registered: number       // COUNT(attendees) for the event
  registered_checkedin: number   // check-ins whose Thai ID is in attendees
  walkin_checkedin: number       // check-ins whose Thai ID is NOT in attendees
  checkins: CheckIn[]            // full list with is_walkin flag
}
```

### `checkins.exportCsv(eventId): Promise<string>`
Returns a CSV string (PapaParse `unparse`). Columns:
- Thai ID, Full Name, Date of Birth, Check-in Time, Method, Walk-in (Yes/No)

---

## `window.api.smartcard`

### Invoke (request/response)

| Method | Description |
|---|---|
| `smartcard.start()` | Starts the PC/SC listener (`startCardListener`) |
| `smartcard.stop()` | Stops the PC/SC listener |
| `smartcard.getReaderName()` | Returns the currently connected reader name or `null` |

### Subscribe (push events from main)

| Method | Fires when |
|---|---|
| `smartcard.onReaderConnected(cb: (name: string) => void)` | A USB smart card reader is detected |
| `smartcard.onReaderDisconnected(cb: (name: string) => void)` | A reader is unplugged |
| `smartcard.onCardPresent(cb: () => void)` | Card is physically dipped (before APDU read) |
| `smartcard.onCardInserted(cb: (data: CardData) => void)` | APDU read complete; carries full `CardData` |
| `smartcard.onCardRemoved(cb: () => void)` | Card is physically removed |
| `smartcard.onError(cb: (msg: string) => void)` | Any PC/SC or APDU error |

### `smartcard.removeAllListeners()`
Removes all `ipcRenderer` listeners for all smart card channels. Must be called in `useEffect` cleanup to avoid duplicate handlers when the CheckIn page remounts.

---

## Shared Types (`src/shared/types.ts`)

```ts
interface Event {
  id: number
  name: string
  date: string | null
  description: string | null
  created_at: string
}

interface Attendee {
  id: number
  event_id: number
  thai_id: string
  full_name: string | null
}

interface CheckIn {
  id: number
  event_id: number
  thai_id: string
  full_name: string | null
  dob: string | null
  checked_in_at: string   // ISO 8601 UTC (e.g. 2026-04-25T03:33:00.000Z)
  method: 'card' | 'manual'
  is_walkin?: boolean     // computed, not stored in DB
}

type CheckInStatus = 'approved' | 'duplicate' | 'not_found'

interface CardData { /* see smartcard.md */ }
interface CheckInResult { /* see checkins.process above */ }
interface ImportResult { imported: number; skipped: number; errors: string[] }
interface AttendanceSummary { /* see checkins.summary above */ }
```
