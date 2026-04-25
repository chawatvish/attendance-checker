# Database — Version 1

## Engine

`better-sqlite3` (synchronous SQLite3 bindings for Node.js).  
Stored at `app.getPath('userData')/attendance.db`.  
Pragmas: `journal_mode = WAL`, `foreign_keys = ON`.

---

## Schema

### `events`

```sql
CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  date        TEXT,                          -- ISO date string, optional
  description TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### `attendees`

Pre-registered attendee list imported from CSV/Excel before the event.

```sql
CREATE TABLE IF NOT EXISTS attendees (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  thai_id   TEXT NOT NULL,
  full_name TEXT,
  UNIQUE(event_id, thai_id)
);
```

### `checkins`

One row per check-in. `UNIQUE(event_id, thai_id)` prevents double check-in at the DB level.

```sql
CREATE TABLE IF NOT EXISTS checkins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  thai_id       TEXT NOT NULL,
  full_name     TEXT,                        -- from card or attendee list
  dob           TEXT,                        -- ISO date from card (CE, YYYY-MM-DD)
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  method        TEXT CHECK(method IN ('card', 'manual')),
  UNIQUE(event_id, thai_id)
);
```

> **Note on `checked_in_at`**: `createCheckin()` explicitly passes `new Date().toISOString()` (UTC with `Z`) so the renderer can parse the timestamp correctly in all timezones. The `DEFAULT CURRENT_TIMESTAMP` column default is not relied upon.

---

## Functions (`src/main/database.ts`)

### Events

| Function | Signature | Notes |
|---|---|---|
| `getEvents()` | `() → Event[]` | All events, newest first |
| `createEvent()` | `(name, date, description) → Event` | Returns the created row |
| `deleteEvent()` | `(id) → void` | Cascades to attendees + checkins |

### Attendees

| Function | Signature | Notes |
|---|---|---|
| `getAttendees()` | `(eventId) → Attendee[]` | Sorted by `full_name` |
| `findAttendee()` | `(eventId, thaiId) → Attendee \| undefined` | Used in check-in flow |
| `importAttendees()` | `(eventId, rows[]) → ImportResult` | Upsert; validates 13-digit Thai ID; runs in a transaction |

### Check-ins

| Function | Signature | Notes |
|---|---|---|
| `findCheckin()` | `(eventId, thaiId) → CheckIn \| undefined` | Duplicate detection |
| `createCheckin()` | `(eventId, thaiId, fullName, dob, method) → CheckIn` | Inserts with `new Date().toISOString()` timestamp |
| `getCheckins()` | `(eventId) → CheckIn[]` | LEFT JOIN attendees; populates `is_walkin` boolean |
| `getAttendeeCount()` | `(eventId) → number` | Count of pre-registered attendees |
| `getCheckinCount()` | `(eventId) → number` | Total check-ins (registered + walk-in) |
| `getCheckinBreakdown()` | `(eventId) → { registered_checkedin, walkin_checkedin }` | Single query; used for summary stat cards |

---

## Key Queries

### `getCheckins` — LEFT JOIN to determine walk-in status

```sql
SELECT c.*, (a.id IS NULL) AS is_walkin
FROM checkins c
LEFT JOIN attendees a ON a.event_id = c.event_id AND a.thai_id = c.thai_id
WHERE c.event_id = ?
ORDER BY c.checked_in_at DESC
```

> SQLite returns `0`/`1` integers for `(a.id IS NULL)`. The TypeScript code maps `row.is_walkin === 1` to a boolean.

### `getCheckinBreakdown` — separate registered vs walk-in counts

```sql
SELECT
  SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS registered_checkedin,
  SUM(CASE WHEN a.id IS NULL     THEN 1 ELSE 0 END) AS walkin_checkedin
FROM checkins c
LEFT JOIN attendees a ON a.event_id = c.event_id AND a.thai_id = c.thai_id
WHERE c.event_id = ?
```

> `SUM` returns `null` on an empty table; the code null-coalesces to `0`.

### `importAttendees` — upsert

```sql
INSERT INTO attendees (event_id, thai_id, full_name)
VALUES (?, ?, ?)
ON CONFLICT(event_id, thai_id) DO UPDATE SET full_name = excluded.full_name
```

---

## Walk-in Logic

A "walk-in" is a check-in whose `thai_id` does NOT appear in the `attendees` table for the same `event_id`. There is **no separate flag column** in `checkins`; walk-in status is derived at query time via LEFT JOIN. This means:
- If a Thai ID is imported into the attendee list after a walk-in check-in, the check-in would retroactively appear as "registered" — acceptable for v1.
- The `is_walkin` field on the `CheckIn` TypeScript type is a computed property, not persisted.
