# Architecture — Version 1

## Process Model

Electron splits the app into two isolated processes. All Node.js APIs (file system, native modules) run in the **main process**. The **renderer process** runs React inside a Chromium browser context with no direct Node access.

```
┌────────────────────────────────────────────────┐
│              MAIN PROCESS (Node.js)            │
│  index.ts → BrowserWindow                      │
│  database.ts (better-sqlite3)                  │
│  smartcard.ts (pcsclite)                       │
│  ipc/events | attendees | checkins | smartcard │
└───────────────┬────────────────────────────────┘
                │  IPC (ipcMain.handle / ipcRenderer.invoke)
                │  contextBridge (preload.ts)
┌───────────────▼─────────────────────────────┐
│            RENDERER PROCESS (React)         │
│  App.tsx (AppContext, sidebar)              │
│  pages: Events | CheckIn | Attendance       │
│  components: CardPopup | ImportDialog       │
│  window.api.*  ← exposed by preload         │
└─────────────────────────────────────────────┘
```

## IPC Communication

All cross-process calls go through `ipcMain.handle` / `ipcRenderer.invoke` (request/response pattern) or `ipcMain` → `webContents.send` (push events from main to renderer).

`preload.ts` uses `contextBridge.exposeInMainWorld('api', api)` to expose a typed `window.api` object. The renderer never calls `ipcRenderer` directly.

### Push events (main → renderer)

Smart card hardware events are forwarded from the `cardEmitter` (EventEmitter in `smartcard.ts`) to IPC channels and then to the renderer:

| cardEmitter event     | IPC channel                     | Triggered when                          |
| --------------------- | ------------------------------- | --------------------------------------- |
| `reader_connected`    | `smartcard:reader_connected`    | USB reader plugged in                   |
| `reader_disconnected` | `smartcard:reader_disconnected` | USB reader unplugged                    |
| `card_present`        | `smartcard:card_present`        | Card physically dipped (before read)    |
| `card_inserted`       | `smartcard:card_inserted`       | APDU read complete — carries `CardData` |
| `card_removed`        | `smartcard:card_removed`        | Card physically removed                 |
| `error`               | `smartcard:error`               | Any PC/SC / APDU error                  |

## State Management

Global state is managed with React Context (`AppContext` in `App.tsx`):

```ts
interface AppContextType {
  activeEvent: Event | null
  setActiveEvent: (e: Event | null) => void
  refreshEvents: () => void // triggers reload of events list in sidebar dropdown
}
```

Pages access this via `useApp()` hook. There is no Redux or external state library.

## Data Flow — Check-in

```
User inserts card
      │
      ▼
pcsclite status event (PRESENT)
      │
      ├─ cardEmitter.emit('card_present')   ← immediate (before read)
      │         └─ renderer: cardDipped=true, reading=true (blue pulse)
      │
      ▼
connectWithRetry (retries 3×, 300ms apart)
      │
      ▼
APDU sequence (SELECT APPLET → read 11 fields + photo)
      │
      ▼
cardEmitter.emit('card_inserted', CardData)
      │         └─ renderer: reading=false → handleCardData()
      │
      ▼
IPC: checkins:process(eventId, cardData, 'card')
      │     main: findAttendee + findCheckin
      │     returns CheckInResult { status, card_data, attendee?, checkin? }
      │
      ▼
CardPopup shown (approved / duplicate / not_found)
      │
      ├─ [approved]   → onConfirm → IPC: checkins:confirm → createCheckin
      ├─ [duplicate]  → onDismiss only (already checked in)
      └─ [not_found]  → onConfirm → IPC: checkins:confirm → createCheckin (walk-in)
```

## Database Location

SQLite database is stored in the Electron user data directory:

- **macOS**: `~/Library/Application Support/attendance-checker/attendance.db`
- **Windows**: `%APPDATA%\attendance-checker\attendance.db`

WAL mode and foreign keys are enabled on every open.

## Native Module Bundling

`electron-builder.yml` copies the pre-built `.node` binary directories into the packaged app via `extraResources`:

```yaml
extraResources:
  - from: node_modules/better-sqlite3/build
    to: better-sqlite3/build
  - from: node_modules/pcsclite/build
    to: pcsclite/build
```

This is required because `asar` archives cannot contain `.node` binaries that need to be loaded by the OS linker.
