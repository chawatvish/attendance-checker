# Attendance Checker

Cross-platform desktop application for event attendance checking using Thai national ID smart cards. Staff insert a card into a USB smart card reader; the app reads all card fields via APDU, matches the ID against a pre-imported attendee list, and records the check-in instantly.

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)

---

## Features

- 🪪 **Smart card reading** — Thai national ID card (บัตรประจำตัวประชาชน) via PC/SC reader; reads name, ID, DOB, photo, religion, address, and more
- ⌨️ **Manual entry fallback** — staff can type the 13-digit Thai ID if no reader is available
- 🚶 **Walk-in support** — attendees not on the pre-registered list can still check in with staff confirmation
- 📂 **CSV / Excel import** — import your attendee list from `.csv`, `.xlsx`, or `.xls` before the event
- 📊 **Attendance summary** — real-time stat cards, progress bar, searchable table, and CSV export
- 🌐 **Bilingual UI** — Thai and English, switchable at runtime
- 📦 **No dependencies to install** — ships as a self-contained installer (NSIS on Windows, DMG on macOS)

---

## Screenshots

> Check-in page, Attendance summary page, and CardPopup go here.

---

## Requirements

### Hardware
- USB smart card reader (PC/SC compatible — e.g., ACR38, ACR39, SCR3310)
- Thai national ID card

### System
| Platform | Requirement |
|---|---|
| macOS | macOS 11+ (Apple Silicon or Intel) |
| Windows | Windows 10+ (x64) |

> No additional runtime or driver installation required — PC/SC is built into both platforms.

---

## Installation

### Pre-built installer

Download the latest release from the [Releases](../../releases) page:

| Platform | File |
|---|---|
| Windows | `Attendance Checker Setup x.x.x.exe` |
| macOS | `Attendance Checker-x.x.x.dmg` |

**Windows**: Run the `.exe` installer. A desktop shortcut and Start Menu entry are created.  
**macOS**: Open the `.dmg`, drag the app to `/Applications`.

---

## Quick Start

1. **Launch the app**
2. **Create an event** on the Events page (name is required; date and description are optional)
3. **Import your attendee list** — click the upload icon next to the event and select a CSV or Excel file
4. **Select the event** from the dropdown in the top-left sidebar
5. **Go to Check-in** — insert a card into the reader to check in

---

## Attendee List Import Format

The import file must have one column containing a 13-digit Thai national ID. The next column is treated as the full name.

**CSV example** (`mockdata/attendees.csv`):
```
thai_id,full_name
1234567890123,นาย ชื่อ นามสกุล
9876543210987,นางสาว ชื่อ นามสกุล
```

- Header row is optional (auto-detected)
- Duplicate IDs are upserted (name is updated)
- Invalid IDs (not 13 digits) are skipped and reported

Example files are in the [`mockdata/`](mockdata/) directory.

---

## Development

### Prerequisites

- Node.js 20+
- npm 9+

### Setup

```bash
git clone <repo-url>
cd attendance-checker
npm install

# Rebuild native modules against Electron's Node version
npm run rebuild
```

### Run in development mode

```bash
npm run dev
```

Starts Vite (renderer) and Electron (main) concurrently with hot-reload.

### Build

```bash
npm run build       # Compile renderer (Vite) + main process (tsc)
```

### Package for distribution

```bash
npm run dist:mac    # → release/*.dmg
npm run dist:win    # → release/*.exe
```

### Tests

```bash
npm test
npm run test:coverage
```

> Tests automatically rebuild `better-sqlite3` against the standard Node version before running, then rebuild against Electron after.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Electron 33 |
| Renderer | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 |
| Database | better-sqlite3 (SQLite, bundled) |
| Smart card | pcsclite (PC/SC, bundled) |
| i18n | i18next + react-i18next |
| CSV | PapaParse |
| Excel | ExcelJS |
| Packaging | electron-builder |

---

## Project Structure

```
src/
├── main/           # Electron main process (Node.js)
│   ├── index.ts    # Entry point
│   ├── database.ts # SQLite helpers
│   ├── smartcard.ts# PC/SC + APDU reader
│   ├── preload.ts  # contextBridge → window.api
│   └── ipc/        # IPC handlers (events, attendees, checkins, smartcard)
├── renderer/       # React UI
│   ├── App.tsx     # Root layout + sidebar + AppContext
│   ├── pages/      # Events | CheckIn | Attendance
│   ├── components/ # CardPopup | ImportDialog
│   └── i18n/       # en.json | th.json
└── shared/
    └── types.ts    # Shared TypeScript interfaces
```

For detailed technical documentation see [`.context/version1/`](.context/version1/).

---

## License

MIT
