# UI Components & Pages — Version 1

## Layout (`App.tsx`)

Single-page shell with a fixed left sidebar (224px) and a scrollable main content area.

### Sidebar

```
┌──────────────────┐
│ Attendance Check-in │  ← app title (i18n: nav.title)
│ [Event dropdown] │  ← <select> populated from events.list()
├──────────────────┤
│ 📅 Events        │  ← nav item
│ ✓  Check-in      │  ← nav item (active = blue highlight)
│ 👥 Attendance    │  ← nav item
├──────────────────┤
│ 🌐 ภาษาไทย/English │  ← language toggle button
└──────────────────┘
```

### Event Selector

- Loads all events via `window.api.events.list()` on mount
- Renders a `<select>` dropdown with placeholder "— Select event —"
- Selecting updates `activeEvent` in `AppContext` immediately — works from any page
- `refreshEvents()` is exposed in context so `EventsPage` triggers a reload after create/delete

### `AppContext`

```ts
{
  activeEvent: Event | null
  setActiveEvent: (e: Event | null) => void
  refreshEvents: () => void
}
```

Accessed via `useApp()` hook.

---

## Pages

### Events Page (`pages/Events.tsx`)

**Purpose**: Manage events (create, delete, import attendee list).

**Features**:
- List of all events with attendee count
- Create event form (name required, date + description optional)
- Delete event (confirm dialog; cascades to attendees + check-ins)
- Import attendees button → opens `ImportDialog`
- Click "Select" on any event row → updates `activeEvent` in context AND calls `refreshEvents()` to sync sidebar dropdown

**State**: local `events[]`, `showCreate`, `importEventId`, `form`

---

### Check-in Page (`pages/CheckIn.tsx`)

**Purpose**: Real-time check-in station for staff.

**Guard**: Shows "Please select an event first" if `activeEvent` is null.

**Layout**:
```
[ Reader status pill ]    ← green: connected | gray: not connected
[ Card dip status pill ]  ← blue pulse: reading | green: read done | gray: no card

[ Card visual area ]      ← dashed rectangle, pulses blue while reading

[ Manual entry form ]     ← 13-digit input + Check button
```

**Smart card lifecycle**:
1. `useEffect` on `activeEvent` → `smartcard.start()` + register all listeners
2. `onReaderConnected` → `setReaderName(name)`
3. `onCardPresent` → `setCardDipped(true)`, `setReading(true)` (blue pulse starts)
4. `onCardInserted(data)` → `setReading(false)`, call `handleCardData(data, 'card')`
5. `onCardRemoved` → `setCardDipped(false)`, `setReading(false)`
6. `onReaderDisconnected` → clear all state
7. Cleanup: `removeAllListeners()` on unmount

**Card status pill states** (only shown when reader is connected):

| State | Visual | Condition |
|---|---|---|
| Reading | Blue + animate-pulse | `cardDipped && reading` |
| Read done, card in | Green steady | `cardDipped && !reading` |
| No card | Gray | `!cardDipped` |

**`handleCardData`**:
- Calls `checkins.process(eventId, cardData, method)`
- Sets `result` state → triggers `CardPopup`

**Manual entry**:
- Strips non-digits, validates length === 13
- Creates minimal `CardData` with only `thai_id` filled
- Calls same `handleCardData` with `method='manual'`

**On confirm**: `checkins.confirm(...)` → close popup → focus input

---

### Attendance Page (`pages/Attendance.tsx`)

**Purpose**: Real-time attendance summary and check-in history table.

**Guard**: Shows "Please select an event first" if `activeEvent` is null.

**Layout**:
```
[ Title ]                    [ Export CSV button ]

[ Stat card: Registered checked-in  X/Y ]  (green)
[ Stat card: Total registered       Y   ]  (blue)
[ Stat card: Walk-in                Z   ]  (orange)
[ Stat card: Percentage             X%  ]  (purple)

[ Progress bar ]  ← green fill, only shown when total_registered > 0

[ Search input ]

[ Check-in table ]
  # | Thai ID | Full Name | Check-in Time | Method | Type
```

**Progress calculation**:
```ts
pct = Math.round((summary.registered_checkedin / summary.total_registered) * 100)
```
Only shown when `total_registered > 0`. Shows `—` in the percentage card otherwise.

**Table — Type column** (last column):
- 🟢 Green badge "Registered" → `is_walkin === false`
- 🟠 Orange badge "Walk-in" → `is_walkin === true`
- Walk-in rows also have a subtle `bg-orange-50/40` row tint

**Method column**:
- 🔵 Blue badge "Smart Card" → `method === 'card'`
- Gray badge "Manual" → `method === 'manual'`

**CSV export**: downloads `{eventName}-attendance.csv` with columns: Thai ID, Full Name, Date of Birth, Check-in Time, Method, Walk-in.

---

## Components

### `CardPopup.tsx`

Modal overlay shown after `checkins.process` returns a result.

**Status configurations**:

| Status | Header color | Body tint | Icon |
|---|---|---|---|
| `approved` | Green | Green | ✅ CheckCircle2 |
| `duplicate` | Yellow | Yellow | ⚠️ AlertTriangle |
| `not_found` | Red | Red | ❌ XCircle |

**Content**:
- Photo (base64 JPEG if available, else silhouette placeholder)
- Thai ID, Thai name, English name, DOB, gender, religion, address, expiry date
- For `duplicate`: shows original check-in timestamp

**Actions**:
- `approved`: "Confirm Check-in" (green) + "Dismiss"
- `not_found`: "Confirm Check-in" (red — walk-in confirmation) + "Dismiss"
- `duplicate`: "Dismiss" only

Confirm → calls `checkins.confirm` in parent, closes popup.  
Dismiss → closes popup without recording.

---

### `ImportDialog.tsx`

Modal for importing attendee list from CSV or Excel.

**Features**:
- Drag-and-drop or click-to-browse file input (`.csv`, `.xlsx`, `.xls`)
- CSV preview (first 5 rows, Thai ID + name columns auto-detected)
- Calls `attendees.importCsv` or `attendees.importExcel` based on file type
- Shows import result: "Imported X records (Y skipped, Z errors)"

**CSV auto-detection**: finds column containing a 13-digit value as Thai ID; next column is treated as name. Handles files with or without header rows.

---

## Internationalization (`i18n/`)

Two locale files: `en.json` (English) and `th.json` (Thai).

Switched at runtime via the sidebar "ภาษาไทย / English" toggle button. Language preference is in-memory only (not persisted across sessions) in v1.

### Key namespaces

| Key prefix | Covers |
|---|---|
| `nav.*` | Sidebar labels, event selector placeholder |
| `common.*` | Shared labels (Confirm, Cancel, Import, etc.) |
| `events.*` | Events page labels |
| `checkin.*` | Check-in page + popup |
| `attendance.*` | Attendance page, stat cards, table columns |
| `import.*` | Import dialog |
