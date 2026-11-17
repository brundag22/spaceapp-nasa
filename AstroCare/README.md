# AstroCare | Mission Health Console

A presentation-ready astronaut-health monitoring demo built from the attached AstroCare Hackathon Prompts. AstroCare combines a React/TypeScript mission console, a Node.js/Express API, project-managed MySQL persistence, authenticated STOMP-compatible WebSockets, and server-generated PDF reports. The Java/Spring implementation requested in the source brief was replaced with the user-approved React and Node stack; the product behaviors are retained.

> **Simulation and safety boundary:** all crew, baseline profiles, live values, pathology flags, markers, and reports in this demo are synthetic. The thresholds in `server/src/services/rules.ts` are demonstration rules—not NASA-calibrated values, medical decision support, or a diagnosis. The SOS action creates an in-app event and Flight Surgeon notification; it does not contact flight control, emergency services, or any external system. Do not use this prototype for clinical decisions.

## Mission-console capabilities

- **Role-aware login:** a Flight Surgeon can view the seeded crew, set demonstration modes, review alerts, add/resolve anatomical markers, and export a report. An Astronaut can view only their linked profile and submit an in-app SOS.
- **Live synthetic telemetry:** heart rate, SpO₂, systolic/diastolic BP, core temperature, respiratory rate, ECG Lead II samples, EVA suit pressure, and ionizing radiation are persisted and streamed on a two-second cadence.
- **Four simulator modes:** `NORMAL`, `WARNING`, `CRITICAL`, and `EVA_STRAIN` produce changing synthetic values and rule-engine flags.
- **Interactive medical console:** searchable crew roster, clickable vital cards with historical graphs, a real-time cardiovascular chart, ECG waveform, theme toggle, active alert rail, and interactive SVG anatomy map. Open flags illuminate their associated anatomy zones; Surgeon notes are saved as persistent markers.
- **Synthetic SOS and PDF:** SOS creates a persisted emergency event and Flight Surgeon notification. PDF export includes recent vitals, open rule-engine flags, and anatomical markers, and carries a prominent demo-only disclaimer.

## Demo accounts

These shared, seeded credentials are for demonstration only. Do not reuse them for real services or store sensitive data in the demo.

| Role / crew | Email | Password |
| --- | --- | --- |
| Flight Surgeon | `surgeon@astrocare.demo` | `FlightDoc!26` |
| Astronaut · AC-01 · Mara Chen | `astronaut@astrocare.demo` | `OrbitCrew!26` |
| Astronaut · AC-02 · Eli Navarro | `eli@astrocare.demo` | `OrbitCrew!26` |
| Astronaut · AC-03 · Nia Okafor | `nia@astrocare.demo` | `OrbitCrew!26` |

## Run the project

The API requires `DATABASE_URL`. In this managed Webdev project, the server and MySQL capabilities supply it at runtime; development and published instances share the same project database. The app applies versioned SQL migrations and idempotent seed data at startup. If running outside the managed environment, provide a compatible MySQL DSN yourself; no local database is bundled.

Requirements: Node.js 22 and npm 10.9.9 (pinned in `package.json`), plus a reachable MySQL database.

```bash
npm ci
npm run dev
```

Vite serves the UI on port **3000** and proxies `/api`, `/_app`, and `/ws` to the Express API on port **3001**. Open the project’s Webdev Preview. The in-app session cookie is `astrocare_session`; public HTTPS Preview uses `SameSite=None; Secure` for its embedded context. A local plain-HTTP browser may reject that secure cookie, so use the hosted HTTPS Preview for the reliable login demonstration.

Useful commands:

```bash
npm run typecheck  # check client and server TypeScript
npm run build      # compile Vite client and Node server
NODE_ENV=production PORT=3000 npm start # serve the built UI and API, with DATABASE_URL available
```

The production Dockerfile installs from the committed npm lockfile, builds the client and server, then serves both from the Node listener. `PORT` is honored (default `3000`). Readiness is `GET /_app/health`, an unauthenticated JSON response. The database-backed scheduler takes a MySQL advisory lock so overlapping application processes do not each start a telemetry writer. Scenario readings derive from a stable seeded baseline, so returning to `NORMAL` clears the preset’s synthetic extremes.

## Data, security, and system integration

The SQL migration defines normalized, indexed tables for users/roles, crew and missions, vital signs, simulator state, alerts, anatomy markers, emergency events, medical history, notifications, and sessions. Seed passwords are BCrypt-hashed; seed insertion is idempotent and does not replace later crew edits. `DATABASE_URL` is read only by the server at runtime and is never bundled into the browser.

The browser and API are served from the **same origin**. There is no separate browser CORS allowlist to coordinate: Vite proxies API and WebSocket traffic during development, and Express serves the built Vite assets and API from one origin in production. The `/ws` endpoint validates the session cookie and authorizes each topic subscription. Cookie-authenticated writes after login require the returned CSRF token in the `X-CSRF-Token` header. Astronaut roles cannot view another astronaut’s health record or invoke Flight Surgeon simulation controls.

### REST API

Except for login and the health route, requests require an authenticated session. Mutating requests use JSON and require `X-CSRF-Token`.

| Method and path | Purpose / response |
| --- | --- |
| `POST /api/auth/login` | JSON `{ "email": "...", "password": "..." }`; returns `{ user, csrfToken }` and sets the session cookie. |
| `GET /api/auth/me` | Returns the current `{ user, csrfToken }` for an active session. |
| `POST /api/auth/logout` | Ends the session; requires CSRF. |
| `GET /api/astronauts` | Returns `{ astronauts }`; Surgeon sees the roster, Astronaut sees only their own linked crew profile. |
| `GET /api/health/latest/{astronautId}` | Returns `{ reading, alerts, markers }` for an authorized crew record. |
| `GET /api/health/history/{astronautId}?limit=120` | Returns `{ readings }`; the bounded sample limit is 1–500 (default 120). |
| `GET /api/health/alerts/{astronautId}` | Returns active rule-engine flags for an authorized crew record. |
| `POST /api/demo/simulate` | Surgeon-only JSON `{ "astronautId": 1, "mode": "WARNING" }`; mode is `NORMAL`, `WARNING`, `CRITICAL`, or `EVA_STRAIN`. |
| `GET /api/anatomy/markers?astronautId={id}` | Returns `{ markers }`; an Astronaut is restricted to their own markers. |
| `POST /api/anatomy/markers` | Surgeon-only JSON `{ astronautId, bodyZone, coordX, coordY, severity, clinicalNote }`; persists a marker and history entry. `bodyZone` is one of `CRANIAL_OCULAR`, `THORACIC_CARDIAC`, `THORACIC_CHEST`, `PULMONARY`, `PERIPHERAL_SUIT`, or `ABDOMEN`; `coordX`/`coordY` are 0–100; `severity` is `YELLOW`, `ORANGE`, or `RED`. |
| `PATCH /api/anatomy/markers/{markerId}` | Surgeon-only JSON `{ "resolved": true }` resolves or reopens a marker. |
| `POST /api/emergency/sos` | Astronaut-only JSON `{ "message": "..." }` (optional); returns a persisted event labelled `In-app demo dispatch` and notifies Flight Surgeons. |
| `GET /api/notifications` | Returns the authenticated user’s inbox. |
| `POST /api/notifications/{notificationId}/read` | Marks one of the authenticated user’s notifications read. |
| `POST /api/emergency/{eventId}/acknowledge` | Surgeon acknowledges a received in-app demo SOS. |
| `GET /api/reports/pdf/{astronautId}` | Authorized user downloads a generated PDF telemetry and pathology demo report. |
| `GET /_app/health` | Unauthenticated readiness JSON; returns HTTP 200 when the API handler is live. |

Errors use a JSON `{ error, code }` response; submitted payloads are validated. The demo authentication API applies rate limiting to login attempts. This is a hackathon demonstration rather than a production identity service.

### WebSocket / STOMP-compatible stream

Connect to the same-origin **`/ws`** endpoint using the authenticated `astrocare_session` cookie, send a STOMP 1.2 `CONNECT`, then subscribe to the authorized topic for the selected crew member:

- `/topic/telemetry/{astronautId}` — JSON `MESSAGE` body with `{ type: "TELEMETRY", reading, severity, mode, alerts, astronaut }`.
- `/topic/alerts/{astronautId}` — current alert summary.
- `/topic/notifications/{userId}` — Surgeon notification events, including health flags and synthetic SOS events.

Telemetry `reading` includes `heartRate`, `spo2`, `systolicBp`, `diastolicBp`, `coreTemperatureC`, `respiratoryRate`, `ecgLeadIi` (sample array), `evaSuitPressurePsi`, `radiationMsvH`, auxiliary ocular/fluid-shift demo indicators, `recordedAt`, and `mode`. Severity labels are `GREEN`, `YELLOW`, `ORANGE`, and `RED`. The frontend uses `@stomp/stompjs`; the browser-facing socket path remains relative so the Vite proxy and hosted Preview can route it.

### Rule-engine boundaries and NASA OSDR provenance

The server’s code-defined demo rules can flag low SpO₂, heart-rate trend/strain, low EVA suit pressure, radiation-rate spikes, thermal-stress values, and a synthetic SANS/cephalic-fluid-shift pattern. The `DEMO_THRESHOLDS` object in `server/src/services/rules.ts` is adjustable in code for demonstrations; there is no runtime clinical threshold editor. These values are not sourced clinical thresholds and must not be represented as NASA-calibrated.

| Signal | Current demonstration rule |
| --- | --- |
| SpO₂ | Below 94%: yellow; below 90%: red. |
| Heart rate | Above 112 or below 52 bpm: yellow; above 135 or below 45 bpm: red. |
| EVA suit pressure | Below 3.3 PSI: orange; below 2.4 PSI: red. |
| Radiation rate | Above 0.9 mSv/h: orange. |
| Core temperature | At or above 37.8 °C: yellow; at or above 38.4 °C: red. |
| Synthetic SANS pattern | Cephalic shift index at or above 0.72 or ocular misalignment at or above 1.8°: orange (red in `CRITICAL` mode). |

NASA’s official OSDR Inspiration4 inventory describes processed biological samples and states that private raw records require application and board approval. A peer-reviewed Inspiration4 report discusses selected-period heart rate, heart-rate variability, and blood oxygen data; it does not provide a validated continuous stream for every AstroCare field. The demo does not ingest or claim access to individual Inspiration4 data. Full source notes and citations are in [`OSDR-NOTES.md`](OSDR-NOTES.md).

## Three-minute presentation script

1. **0:00–0:25 — Surgeon login:** sign in as `surgeon@astrocare.demo`; point out the role badge, synthetic-data banner, crew roster, and mission status.
2. **0:25–0:55 — Live cockpit:** select AC-01 or AC-02, show the two-second stream, click a vital card to open its historical graph, and point out the ECG Lead II waveform and dual-axis chart.
3. **0:55–1:25 — Simulator:** activate `WARNING`, then `CRITICAL` or `EVA_STRAIN`. Show that the readings, severity-coded rule flags, and associated anatomy zones change together. State that these are demonstration flags, not diagnoses.
4. **1:25–1:50 — Marker workflow:** select a highlighted body zone, choose severity, add a short clinical note, save it, and show the persisted marker and history entry; resolve the marker.
5. **1:50–2:25 — Astronaut and SOS:** sign out, sign in as AC-01 with `astronaut@astrocare.demo`, show the self-only cockpit, and press the one-click SOS. State clearly that it is only an in-app demo event.
6. **2:25–2:45 — Surgeon inbox:** sign in as the Flight Surgeon and show the SOS notification and acknowledgement flow.
7. **2:45–3:00 — Report and safety:** export the PDF, point out the synthetic-data disclaimer, and close by noting the OSDR data limitations and non-clinical/non-dispatch boundary.

## Project structure

```text
client/src/                 React mission console, role views, charts, anatomy, API client
client/public/              SPA entry metadata, route manifest, orbit-pulse SVG favicon
server/src/auth/            Password login, persisted sessions, CSRF and role checks
server/src/controllers/     Crew, telemetry, anatomy, simulation, SOS, and PDF endpoints
server/src/db/              MySQL pool, versioned migrations, and idempotent demo seed
server/src/services/        Synthetic telemetry generator and demonstration rule engine
server/src/realtime/        Authenticated STOMP-compatible WebSocket endpoint and broadcasts
server/sql/                 Normalized initial MySQL schema
Dockerfile                  Production build and same-origin Node serving
plan.md / TODO.md           Approved requirements and delivered outcomes
OSDR-NOTES.md               NASA OSDR/Inspiration4 source notes and limitations
```
