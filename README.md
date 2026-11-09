# FTC Scout

Offline match-scouting web app for FIRST Tech Challenge, set up for **BIOBUZZ (2026-2027)**.
No server, no Wi-Fi, no accounts: each device keeps its own data and devices share it by
**QR code**. It installs to the home screen of iPads, Android tablets and phones and runs
with no network.

Why QR codes: Competition Manual rule **E301** bans teams from running their own Wi-Fi
(including phone hotspots) and **Bluetooth** at the venue.

## How it works at an event

- **Scouts** (4 devices, one per schedule slot: Red 1, Red 2, Blue 1, Blue 2). Each scout
  picks a slot once. The header fills itself from the schedule, e.g. `Q12 · Blue 1 · Team 14523`.
  Red 1 is just the first red team listed for the match, not a place on the field, so scouts
  find their robot by **team number**. Fill in the form, tap **Save & show QR**, let the hub
  scan it, then tap **Next match**. ◀ ▶ step through matches, and opening a saved match edits it.
  The team box can be overridden for replays, surrogates and playoffs.
- **Hub** (one device, a tablet or laptop with a camera):
  - **Scan**: scan scouts' codes. Scanning twice is harmless. An edited record replaces the older copy.
  - **Coverage**: a match × slot grid showing what's scouted, what's missing, and where the team differs from the schedule.
  - **Teams**: per-team averages and sortable rankings, search by number, name or notes, and per-match detail.
  - **Schedule**: load the schedule, then show it as a QR code for scouts to scan.
  - **Data**: JSON backup, CSV for spreadsheets, and merging backups from other devices.

- **Hub + Scout** (the hub device, when its operator also scouts a slot): pick this on the
  home screen. **Hub ▶** in the scout toolbar and **Scout ▶** in the hub header switch screens
  with one tap. Matches you save go straight into the hub's data with no QR step, and the
  scout side uses the hub's schedule directly. Scout during the match, then switch to Hub
  between matches to scan the other scouts.

Scouts that fall behind can open **Saved → Show all as one code** to send everything at once.
Large data is split into several codes that cycle automatically (`Part 1 of 3`); keep the
hub camera pointed until all parts are in.

### Schedule

1. **Before the event (with internet):** on the hub, open Schedule, enter the season
   (kickoff year: BIOBUZZ = `2026`) and the event code, then tap **Download from FTCScout**.
   This loads quals once the event has published them, plus team names.
2. **Or type it:** one match per line, `red1 red2 blue1 blue2`. A leading match number or
   label is optional (`M-3 …` for playoffs), and `*` after a team number marks a surrogate.
3. **Or import a file** made by `tools/fetch-ftc-api.py` (see below).
4. Tap **Show QR**. Each scout opens **Schedule** on their device and scans it.
5. If the schedule changes, load or edit it again. The hub bumps the version number, and
   scouts rescan to get the new one; they ignore versions they already have.
6. **Playoffs:** load them later the same way (download again, or type them with Level =
   Playoff). Scouts then get a Quals / Playoffs switch.

## Running it

It's plain HTML/JS with no build step.

```bash
cd D:\Users\Phil\GitHub\FTC-Scout
python -m http.server 8080
```

Open http://localhost:8080. The camera works on `localhost`. On other devices the camera
and offline install need **HTTPS**, so for tablets host it on HTTPS. The easiest option is
GitHub Pages: push this folder to a GitHub repo, then go to Settings → Pages → deploy from
the `main` branch root. The app uses relative paths, so it works under `/<repo>/`.

### Installing on devices (do this on Wi-Fi before the event)

- **iPad / iPhone (Safari):** open the site → Share → **Add to Home Screen**. Open it once
  from the icon while online.
- **Android (Chrome):** open the site → menu → **Install app** (or Add to Home screen).
- After installing, open each mode once and allow the camera when asked.

Then test with Wi-Fi off. Everything except the FTCScout download works offline.

### Updating the app

Bump `VERSION` in `sw.js` whenever you change any file. Installed devices pick up the update
the next time they open the app online. Reopen it a second time to load the new version.

### Backups (important on iPads)

iOS can clear a web app's storage after a period without use. The app asks the browser to
keep its data (the Data tab shows whether that was granted), but you should still:
download a hub backup (**Data → Download backup**) after each session and copy it somewhere
safe. Scouts can also download their own backup from ⚙.

## Changing the game

The form, point estimates and summary columns come from
[`js/config/biobuzz-2026.js`](js/config/biobuzz-2026.js). Next season, copy it, edit the
fields, and change the import in `js/records.js`. Field ids go into every QR code, so keep
them short. Also add the new file to the list in `sw.js`.

The BIOBUZZ fields follow Competition Manual TU08, Table 10-2:

| Achievement | AUTO | TELEOP |
|---|---|---|
| LEAVE | 3 | – |
| PARK (in LOADING ZONE) | 5 | 5 |
| HIVE TIP | 20 | 20 |
| POLLEN/NECTAR left in upward CELL (end of match) | – | 2 |
| Bottom NECTAR bonus | – | 5 |
| POLLEN/NECTAR in owned FLOWER (last 60 s) | – | 2 |
| POLLEN/NECTAR in GARDEN | – | 1 |
| Fouls (to opponent) | minor 5, major 20 | |

RP thresholds for regular events: SWARM ≥ 16 LEAVE+PARK points, POLLINATOR 1 ≥ 4 TIPS,
POLLINATOR 2 ≥ 7 TIPS.

"Est pts" is a per-robot estimate. Tips are credited to the robot whose launch completed
them, FLOWER points assume the alliance owned that FLOWER, and the CELL-contents and
bottom-NECTAR bonuses (alliance end state) aren't scouted.

## Schedule data sources (findings, Nov 2026)

**FTC Events API** (`https://ftc-api.firstinspires.org/v2.0`, the official source)
- Access: register at https://ftc-events.firstinspires.org/services/API (needs a valid email
  for confirmation). You get a username and token. Free, but non-commercial use only.
- Auth: HTTP Basic, `Authorization: Basic base64(username:token)`. The server answers
  `401` with `WWW-Authenticate: Basic realm="FTC Events API"`. `GET /v2.0` reports `currentSeason: 2026`.
- Endpoints used by the script: `/{season}/schedule/{eventCode}?tournamentLevel=qual|playoff`,
  `/{season}/teams?eventCode=…` (paged), and `/{season}/events?eventCode=…`. The docs at
  https://ftc-events.firstinspires.org/api-docs are rendered client-side and I couldn't read
  them, so these paths follow the long-standing v2.0 layout and haven't been run with a real token yet.
- **Browser access: no.** Responses carry no `Access-Control-Allow-Origin` header, and the
  CORS preflight (`OPTIONS`) returns HTTP 500. A web page can't call the API, and putting the
  token in the app would expose it anyway. Use `tools/fetch-ftc-api.py` on a laptop instead:
  ```bash
  set FTC_API_USER=yourname
  set FTC_API_KEY=your-token
  python tools/fetch-ftc-api.py 2026 USTXHOQ1
  ```
  Then use hub → Schedule → **Import FTC API JSON file**.

**FTCScout API** (`https://api.ftcscout.org/graphql`, community, mirrors FIRST data)
- Public, no key, and **CORS is allowed** (tested), so the hub downloads straight from the
  browser. This is the **Download from FTCScout** button. It was tested on BIOBUZZ event
  `AUBRQ1` (26 quals, 7 playoff matches). Playoff labels look like `M-3` (double elimination)
  or `F-1` (finals).

**FTC Live (the scoring software at events)**
- The only public definition is a stub on the official scorekeeper wiki
  (https://github.com/FIRST-Tech-Challenge/scorekeeper/wiki/API-Documentation). It points to
  Swagger docs served by the scoring PC itself at `http://localhost/swagger-docs/`. To see
  the endpoints, install FTC Live from the scorekeeper releases and open that page. Teams
  can't reach the scoring PC's network at events, so the app doesn't use it.

## Files

```
index.html, css/app.css     page shell and styles
js/app.js                   home screen, routing, service worker registration
js/scout.js, js/hub.js      the two modes
js/schedule.js              schedule parsing, compact QR format, FTCScout / FTC API import
js/records.js               record format, point estimates, team summaries, CSV
js/qr.js                    QR drawing, camera scanning, multi-part codes
js/db.js                    IndexedDB storage
js/config/biobuzz-2026.js   this season's form
sw.js, manifest.webmanifest offline cache and install info
vendor/                     qrcode-generator 1.4.4 (MIT), jsQR 1.4.0 (Apache-2.0)
tools/fetch-ftc-api.py      optional FTC Events API download (needs your token)
```

QR format: `FS1|kind|msgId|part|parts|data`, where kind `R` = record(s) and `S` = schedule.
A record id is `device-event-match-slot`, and merging keeps the copy with the newest edit time.
