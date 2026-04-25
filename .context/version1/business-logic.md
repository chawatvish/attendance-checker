# Business Logic — Version 1

## Check-in Flow

```
                ┌─────────────┐
                │  Card dipped │  (or manual ID entry)
                └──────┬──────┘
                       │
              checkins:process()
                       │
           ┌───────────┼───────────┐
           │           │           │
       approved    duplicate   not_found
           │           │           │
     In list,      Already      Not in
     not yet       checked in   list
     checked in         │           │
           │        Popup:      Popup:
       Popup:       dismiss     "Not in List"
       green        only        red confirm
           │                       │
     onConfirm                onConfirm
      (staff                  (staff agrees
       clicks)                 to walk-in)
           │                       │
              checkins:confirm()
                       │
               createCheckin()
               (is_walkin derived
                from LEFT JOIN,
                not stored)
```

## Two-Step Process vs One-Step

`checkins:process` is a **read-only check** — it never writes to the DB.  
`checkins:confirm` is the **write** — called only after staff explicitly clicks "Confirm Check-in".

This ensures:
- Staff can review card details before committing
- Staff can dismiss a walk-in if they suspect an error
- Duplicate cards do not offer a confirm button (nothing to write)

## Walk-in Handling

A walk-in is someone who arrives at the event without being pre-registered.

1. Card is read → `checkins:process` returns `status: 'not_found'`
2. Popup shows red "Not in List" header with full card details
3. Staff clicks "Confirm Check-in" → `checkins:confirm` creates the check-in record
4. The record is stored identically to a registered check-in (same `checkins` table row)
5. Walk-in status is **derived at query time** via LEFT JOIN — no separate DB column

**Walk-in confirmation is required** — staff cannot accidentally approve a walk-in by doing nothing. Dismissing the popup records nothing.

## Progress Calculation

Progress bar and percentage stat only count **registered** attendees to avoid inflating numbers with walk-ins.

```
pct = registered_checkedin / total_registered × 100
```

Where:
- `registered_checkedin` = check-ins whose `thai_id` is in the `attendees` table
- `total_registered` = total rows in `attendees` for the event
- `walkin_checkedin` = check-ins whose `thai_id` is NOT in `attendees`

Progress bar is hidden when `total_registered === 0` (no list imported yet).  
Percentage card shows `—` in the same case.

The four stat cards show:
1. Registered checked-in: `X / Y`
2. Total registered: `Y`
3. Walk-in: `Z`
4. Percentage: `X/Y × 100%` or `—`

## Duplicate Prevention

Duplicates are prevented at two levels:

1. **Application level**: `checkins:process` checks `findCheckin(eventId, thaiId)` before confirming. If found, returns `status: 'duplicate'` with the original check-in time. No confirm button is shown.
2. **Database level**: `UNIQUE(event_id, thai_id)` constraint on the `checkins` table. Any attempt to insert a duplicate will throw a SQLite error.

## Attendee Import

Before the event, staff imports a CSV or Excel file containing the attendee list.

**Required column**: one column with a 13-digit Thai national ID.  
**Optional column**: next column after Thai ID is treated as full name.  
**Duplicate IDs** in the import file: handled by `ON CONFLICT DO UPDATE SET full_name = excluded.full_name` — the name is updated but no error is thrown.  
**Invalid IDs** (not exactly 13 digits): skipped and counted in `ImportResult.errors`.

## Timestamp Handling

Check-in timestamps are stored as ISO 8601 UTC strings (e.g., `2026-04-25T10:33:00.000Z`).  
`new Date().toISOString()` is called explicitly in `createCheckin()` — SQLite's `CURRENT_TIMESTAMP` default is NOT used because it produces UTC time without a `Z` suffix (e.g., `2026-04-25 10:33:00`), which V8/Chrome incorrectly parses as local time, resulting in timestamps shifted by the local UTC offset.

Display uses `toLocaleString('th-TH')` or `toLocaleString('en-GB')` depending on the active app language.
