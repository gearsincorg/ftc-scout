#!/usr/bin/env python3
"""Download an event's schedule and teams from the official FTC Events API.

The FTC Events API needs a personal username + token (HTTP Basic auth) and does
not allow browser calls (no CORS), so the hub web app can't call it directly.
Run this on a laptop with internet, then load the output on the hub:
Schedule tab -> "Import FTC API JSON file".

Usually you don't need this: the hub's "Download from FTCScout" button works
without a key. Use this script if FTCScout is behind or down.

Setup: register at https://ftc-events.firstinspires.org/services/API, then
    set FTC_API_USER=yourname         (PowerShell: $env:FTC_API_USER="yourname")
    set FTC_API_KEY=your-token
Usage:
    python tools/fetch-ftc-api.py 2026 USTXHOQ1  [-o USTXHOQ1-schedule.json]

Season is the kickoff year (BIOBUZZ = 2026). Never put the token in the web app.
Note: written against the v2.0 API docs; only the auth handshake was tested
without a token, so check the first run's output.
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request

BASE = "https://ftc-api.firstinspires.org/v2.0"


def get(path, auth):
    req = urllib.request.Request(BASE + path, headers={"Authorization": "Basic " + auth, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code == 401:
            sys.exit("401 Unauthorized: check FTC_API_USER / FTC_API_KEY")
        if e.code == 404:
            return None
        raise


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("season", type=int, help="kickoff year, e.g. 2026 for BIOBUZZ")
    ap.add_argument("event", help="event code, e.g. USTXHOQ1")
    ap.add_argument("-o", "--out", help="output file (default: <EVENT>-schedule.json)")
    a = ap.parse_args()

    user, key = os.environ.get("FTC_API_USER"), os.environ.get("FTC_API_KEY")
    if not user or not key:
        sys.exit("Set FTC_API_USER and FTC_API_KEY first (see the top of this file).")
    auth = base64.b64encode(f"{user}:{key}".encode()).decode()
    code = a.event.upper()

    events = get(f"/{a.season}/events?eventCode={code}", auth) or {}
    name = (events.get("events") or [{}])[0].get("name", "")

    teams, page = [], 1
    while True:
        t = get(f"/{a.season}/teams?eventCode={code}&page={page}", auth) or {}
        teams += t.get("teams", [])
        if page >= t.get("pageTotal", 1):
            break
        page += 1

    qual = get(f"/{a.season}/schedule/{code}?tournamentLevel=qual", auth) or {"schedule": []}
    playoff = get(f"/{a.season}/schedule/{code}?tournamentLevel=playoff", auth) or {"schedule": []}

    out = {
        "event": code, "name": name, "season": a.season,
        "teams": [{"teamNumber": t.get("teamNumber"), "nameShort": t.get("nameShort")} for t in teams],
        "qual": qual, "playoff": playoff,
    }
    path = a.out or f"{code}-schedule.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"{name or code}: {len(teams)} teams, {len(qual.get('schedule', []))} qual and "
          f"{len(playoff.get('schedule', []))} playoff matches -> {path}")


if __name__ == "__main__":
    main()
