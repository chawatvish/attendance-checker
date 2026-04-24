import Database from 'better-sqlite3'
import path from 'path'
import { app } from 'electron'
import type { Event, Attendee, CheckIn, ImportResult } from '../shared/types'

let db: Database.Database

export function initDatabase(): void {
  const dbPath = path.join(app.getPath('userData'), 'attendance.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema()
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      date        TEXT,
      description TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS attendees (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      thai_id   TEXT NOT NULL,
      full_name TEXT,
      UNIQUE(event_id, thai_id)
    );

    CREATE TABLE IF NOT EXISTS checkins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      thai_id       TEXT NOT NULL,
      full_name     TEXT,
      dob           TEXT,
      checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      method        TEXT CHECK(method IN ('card', 'manual')),
      UNIQUE(event_id, thai_id)
    );
  `)
}

// ── Events ──────────────────────────────────────────────────────────────────

export function getEvents(): Event[] {
  return db.prepare('SELECT * FROM events ORDER BY created_at DESC').all() as Event[]
}

export function createEvent(name: string, date: string | null, description: string | null): Event {
  const stmt = db.prepare('INSERT INTO events (name, date, description) VALUES (?, ?, ?)')
  const result = stmt.run(name, date, description)
  return db.prepare('SELECT * FROM events WHERE id = ?').get(result.lastInsertRowid) as Event
}

export function deleteEvent(id: number): void {
  db.prepare('DELETE FROM events WHERE id = ?').run(id)
}

// ── Attendees ────────────────────────────────────────────────────────────────

export function getAttendees(eventId: number): Attendee[] {
  return db.prepare('SELECT * FROM attendees WHERE event_id = ? ORDER BY full_name').all(eventId) as Attendee[]
}

export function findAttendee(eventId: number, thaiId: string): Attendee | undefined {
  return db.prepare('SELECT * FROM attendees WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId) as Attendee | undefined
}

export function importAttendees(eventId: number, rows: { thai_id: string; full_name?: string }[]): ImportResult {
  const stmt = db.prepare(`
    INSERT INTO attendees (event_id, thai_id, full_name)
    VALUES (?, ?, ?)
    ON CONFLICT(event_id, thai_id) DO UPDATE SET full_name = excluded.full_name
  `)
  let imported = 0
  const errors: string[] = []
  const insertMany = db.transaction(() => {
    for (const row of rows) {
      if (!row.thai_id || row.thai_id.trim().length !== 13) {
        errors.push(`Invalid Thai ID: ${row.thai_id}`)
        continue
      }
      stmt.run(eventId, row.thai_id.trim(), row.full_name?.trim() || null)
      imported++
    }
  })
  insertMany()
  return { imported, skipped: rows.length - imported - errors.length, errors }
}

// ── Check-ins ────────────────────────────────────────────────────────────────

export function findCheckin(eventId: number, thaiId: string): CheckIn | undefined {
  return db.prepare('SELECT * FROM checkins WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId) as CheckIn | undefined
}

export function createCheckin(
  eventId: number,
  thaiId: string,
  fullName: string | null,
  dob: string | null,
  method: 'card' | 'manual'
): CheckIn {
  const stmt = db.prepare(`
    INSERT INTO checkins (event_id, thai_id, full_name, dob, method, checked_in_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(eventId, thaiId, fullName, dob, method, new Date().toISOString())
  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(result.lastInsertRowid) as CheckIn
}

export function getCheckins(eventId: number): CheckIn[] {
  return db.prepare(`
    SELECT c.*, (a.id IS NULL) AS is_walkin
    FROM checkins c
    LEFT JOIN attendees a ON a.event_id = c.event_id AND a.thai_id = c.thai_id
    WHERE c.event_id = ?
    ORDER BY c.checked_in_at DESC
  `).all(eventId).map((row: any) => ({
    ...row,
    is_walkin: row.is_walkin === 1,
  })) as CheckIn[]
}

export function getAttendeeCount(eventId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM attendees WHERE event_id = ?').get(eventId) as { count: number }
  return row.count
}

export function getCheckinCount(eventId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM checkins WHERE event_id = ?').get(eventId) as { count: number }
  return row.count
}

/** Returns separate counts for registered vs walk-in check-ins in a single query. */
export function getCheckinBreakdown(eventId: number): { registered_checkedin: number; walkin_checkedin: number } {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END) AS registered_checkedin,
      SUM(CASE WHEN a.id IS NULL     THEN 1 ELSE 0 END) AS walkin_checkedin
    FROM checkins c
    LEFT JOIN attendees a ON a.event_id = c.event_id AND a.thai_id = c.thai_id
    WHERE c.event_id = ?
  `).get(eventId) as { registered_checkedin: number | null; walkin_checkedin: number | null }
  return {
    registered_checkedin: row.registered_checkedin ?? 0,
    walkin_checkedin: row.walkin_checkedin ?? 0,
  }
}
