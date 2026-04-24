/**
 * Database layer tests — uses in-memory SQLite (no Electron dependency)
 */
import Database from 'better-sqlite3'

// ── Inline schema + helpers to avoid Electron's app.getPath ─────────────────

function buildDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      date        TEXT,
      description TEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE attendees (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id  INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      thai_id   TEXT NOT NULL,
      full_name TEXT,
      UNIQUE(event_id, thai_id)
    );
    CREATE TABLE checkins (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      thai_id       TEXT NOT NULL,
      full_name     TEXT,
      dob           TEXT,
      checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      method        TEXT CHECK(method IN ('card','manual')),
      UNIQUE(event_id, thai_id)
    );
  `)
  return db
}

type DB = ReturnType<typeof buildDb>

function createEvent(db: DB, name: string, date?: string, description?: string) {
  const r = db.prepare('INSERT INTO events (name, date, description) VALUES (?, ?, ?)').run(name, date ?? null, description ?? null)
  return db.prepare('SELECT * FROM events WHERE id = ?').get(r.lastInsertRowid) as any
}

function importAttendees(db: DB, eventId: number, rows: { thai_id: string; full_name?: string }[]) {
  const stmt = db.prepare(`
    INSERT INTO attendees (event_id, thai_id, full_name) VALUES (?, ?, ?)
    ON CONFLICT(event_id, thai_id) DO UPDATE SET full_name = excluded.full_name
  `)
  let imported = 0
  const errors: string[] = []
  const run = db.transaction(() => {
    for (const row of rows) {
      if (!row.thai_id || row.thai_id.trim().length !== 13) {
        errors.push(`Invalid Thai ID: ${row.thai_id}`)
        continue
      }
      stmt.run(eventId, row.thai_id.trim(), row.full_name?.trim() ?? null)
      imported++
    }
  })
  run()
  return { imported, skipped: rows.length - imported - errors.length, errors }
}

function findAttendee(db: DB, eventId: number, thaiId: string) {
  return db.prepare('SELECT * FROM attendees WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId) as any
}

function findCheckin(db: DB, eventId: number, thaiId: string) {
  return db.prepare('SELECT * FROM checkins WHERE event_id = ? AND thai_id = ?').get(eventId, thaiId) as any
}

function createCheckin(db: DB, eventId: number, thaiId: string, fullName: string | null, dob: string | null, method: 'card' | 'manual') {
  const r = db.prepare('INSERT INTO checkins (event_id, thai_id, full_name, dob, method) VALUES (?, ?, ?, ?, ?)').run(eventId, thaiId, fullName, dob, method)
  return db.prepare('SELECT * FROM checkins WHERE id = ?').get(r.lastInsertRowid) as any
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Database — Events', () => {
  let db: DB

  beforeEach(() => { db = buildDb() })
  afterEach(() => { db.close() })

  it('creates an event and retrieves it', () => {
    const ev = createEvent(db, 'Tech Conference 2024', '2024-06-01', 'Annual tech event')
    expect(ev.id).toBe(1)
    expect(ev.name).toBe('Tech Conference 2024')
    expect(ev.date).toBe('2024-06-01')
    expect(ev.description).toBe('Annual tech event')
  })

  it('creates an event with null date and description', () => {
    const ev = createEvent(db, 'Quick Event')
    expect(ev.name).toBe('Quick Event')
    expect(ev.date).toBeNull()
    expect(ev.description).toBeNull()
  })

  it('lists events ordered by created_at desc', () => {
    createEvent(db, 'Event A')
    createEvent(db, 'Event B')
    createEvent(db, 'Event C')
    const events = db.prepare('SELECT * FROM events ORDER BY id DESC').all() as any[]
    expect(events).toHaveLength(3)
    expect(events[0].name).toBe('Event C')
    expect(events[2].name).toBe('Event A')
  })

  it('cascade-deletes attendees and checkins when event is deleted', () => {
    const ev = createEvent(db, 'Delete Me')
    importAttendees(db, ev.id, [{ thai_id: '1100100000001', full_name: 'Test' }])
    createCheckin(db, ev.id, '1100100000001', 'Test', null, 'card')

    db.prepare('DELETE FROM events WHERE id = ?').run(ev.id)

    const att = db.prepare('SELECT * FROM attendees WHERE event_id = ?').all(ev.id)
    const cis = db.prepare('SELECT * FROM checkins WHERE event_id = ?').all(ev.id)
    expect(att).toHaveLength(0)
    expect(cis).toHaveLength(0)
  })
})

describe('Database — Attendees', () => {
  let db: DB
  let eventId: number

  beforeEach(() => {
    db = buildDb()
    eventId = createEvent(db, 'Test Event').id
  })
  afterEach(() => { db.close() })

  it('imports valid attendees', () => {
    const result = importAttendees(db, eventId, [
      { thai_id: '1100100000001', full_name: 'สมชาย ใจดี' },
      { thai_id: '1100100000002', full_name: 'สมหญิง รักไทย' },
    ])
    expect(result.imported).toBe(2)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects IDs shorter or longer than 13 digits', () => {
    const result = importAttendees(db, eventId, [
      { thai_id: '123456', full_name: 'Too Short' },
      { thai_id: '12345678901234', full_name: 'Too Long' },
      { thai_id: '1100100000001', full_name: 'Valid' },
    ])
    expect(result.imported).toBe(1)
    expect(result.errors).toHaveLength(2)
  })

  it('upserts on duplicate thai_id within same event', () => {
    importAttendees(db, eventId, [{ thai_id: '1100100000001', full_name: 'Old Name' }])
    importAttendees(db, eventId, [{ thai_id: '1100100000001', full_name: 'New Name' }])
    const att = findAttendee(db, eventId, '1100100000001')
    expect(att.full_name).toBe('New Name')
    const count = (db.prepare('SELECT COUNT(*) as c FROM attendees WHERE event_id = ?').get(eventId) as any).c
    expect(count).toBe(1)
  })

  it('allows same thai_id in different events', () => {
    const ev2 = createEvent(db, 'Event 2').id
    importAttendees(db, eventId, [{ thai_id: '1100100000001', full_name: 'Person' }])
    importAttendees(db, ev2, [{ thai_id: '1100100000001', full_name: 'Person' }])
    const count = (db.prepare('SELECT COUNT(*) as c FROM attendees WHERE thai_id = ?').get('1100100000001') as any).c
    expect(count).toBe(2)
  })

  it('finds an attendee by thai_id', () => {
    importAttendees(db, eventId, [{ thai_id: '1100100000005', full_name: 'Test' }])
    const att = findAttendee(db, eventId, '1100100000005')
    expect(att).not.toBeNull()
    expect(att.full_name).toBe('Test')
  })

  it('returns undefined for unknown thai_id', () => {
    const att = findAttendee(db, eventId, '9999999999999')
    expect(att).toBeUndefined()
  })
})

describe('Database — Check-ins', () => {
  let db: DB
  let eventId: number

  beforeEach(() => {
    db = buildDb()
    eventId = createEvent(db, 'Test Event').id
    importAttendees(db, eventId, [{ thai_id: '1100100000001', full_name: 'สมชาย ใจดี' }])
  })
  afterEach(() => { db.close() })

  it('creates a card check-in', () => {
    const ci = createCheckin(db, eventId, '1100100000001', 'สมชาย ใจดี', '1980-01-15', 'card')
    expect(ci.thai_id).toBe('1100100000001')
    expect(ci.method).toBe('card')
    expect(ci.full_name).toBe('สมชาย ใจดี')
    expect(ci.dob).toBe('1980-01-15')
  })

  it('creates a manual check-in', () => {
    const ci = createCheckin(db, eventId, '1100100000001', null, null, 'manual')
    expect(ci.method).toBe('manual')
  })

  it('prevents duplicate check-in for same person in same event', () => {
    createCheckin(db, eventId, '1100100000001', 'สมชาย', null, 'card')
    expect(() => {
      createCheckin(db, eventId, '1100100000001', 'สมชาย', null, 'manual')
    }).toThrow()
  })

  it('allows same person to check in to different events', () => {
    const ev2 = createEvent(db, 'Event 2').id
    createCheckin(db, eventId, '1100100000001', 'Person', null, 'card')
    expect(() => {
      createCheckin(db, ev2, '1100100000001', 'Person', null, 'card')
    }).not.toThrow()
  })

  it('allows check-in for person NOT in attendee list (force check-in)', () => {
    expect(() => {
      createCheckin(db, eventId, '9999999999999', 'Walk-in', null, 'card')
    }).not.toThrow()
    const ci = findCheckin(db, eventId, '9999999999999')
    expect(ci).not.toBeNull()
  })

  it('findCheckin returns existing record', () => {
    createCheckin(db, eventId, '1100100000001', 'Test', null, 'card')
    const ci = findCheckin(db, eventId, '1100100000001')
    expect(ci).not.toBeNull()
    expect(ci.method).toBe('card')
  })

  it('findCheckin returns undefined before check-in', () => {
    const ci = findCheckin(db, eventId, '1100100000001')
    expect(ci).toBeUndefined()
  })

  it('rejects invalid method value', () => {
    expect(() => {
      db.prepare('INSERT INTO checkins (event_id, thai_id, method) VALUES (?, ?, ?)').run(eventId, '1100100000002', 'invalid')
    }).toThrow()
  })
})

describe('Database — Attendance Counts', () => {
  let db: DB
  let eventId: number

  beforeEach(() => {
    db = buildDb()
    eventId = createEvent(db, 'Count Test').id
    importAttendees(db, eventId, [
      { thai_id: '1100100000001' },
      { thai_id: '1100100000002' },
      { thai_id: '1100100000003' },
    ])
  })
  afterEach(() => { db.close() })

  it('counts attendees correctly', () => {
    const count = (db.prepare('SELECT COUNT(*) as c FROM attendees WHERE event_id = ?').get(eventId) as any).c
    expect(count).toBe(3)
  })

  it('counts check-ins correctly after partial check-in', () => {
    createCheckin(db, eventId, '1100100000001', null, null, 'card')
    createCheckin(db, eventId, '1100100000002', null, null, 'manual')
    const count = (db.prepare('SELECT COUNT(*) as c FROM checkins WHERE event_id = ?').get(eventId) as any).c
    expect(count).toBe(2)
  })
})
