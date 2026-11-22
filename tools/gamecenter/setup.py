"""Create Gravitor's Game Center leaderboards, leaderboard sets and achievements in App Store Connect.

Reads tools/gamecenter/catalog.json (written from src/gamecenter/catalog.ts, see
tests/gamecenter.test.ts) and creates whatever App Store Connect doesn't have yet, matched by ID
(vendorIdentifier), each with an English (U.S.) name. Achievements get their badge from
tools/gamecenter/badges/<id after "gravitor.ach.">.png. Anything that already exists is left
alone, so running it again is safe.

Dry run by default: it only prints what it would create. Add --apply to create it.

Usage: python setup.py <AuthKey.p8> <key id> <issuer id> [--apply]
Run from GitHub: Actions -> "Set up Game Center" (uses the same App Store Connect key as TestFlight).
"""
import datetime
import json
import os
import sys
import time
import urllib.error
import urllib.request

import jwt  # PyJWT, with cryptography for ES256

API = "https://api.appstoreconnect.apple.com/v1"
BUNDLE_ID = "Com.cnmbuckstudios.gravitor"
LOCALE = "en-US"
HERE = os.path.dirname(os.path.abspath(__file__))


class Asc:
    def __init__(self, key_path: str, key_id: str, issuer: str):
        with open(key_path) as f:
            self.key = f.read()
        self.key_id, self.issuer = key_id, issuer
        self.tok, self.tok_at = "", 0.0

    def token(self) -> str:
        if time.time() - self.tok_at > 900:
            now = int(time.time())
            self.tok = jwt.encode({"iss": self.issuer, "iat": now, "exp": now + 1200, "aud": "appstoreconnect-v1"},
                                  self.key, algorithm="ES256", headers={"kid": self.key_id, "typ": "JWT"})
            self.tok_at = time.time()
        return self.tok

    def call(self, method: str, path: str, body=None):
        url = path if path.startswith("http") else API + path
        data = json.dumps(body).encode() if body is not None else None
        for attempt in range(4):
            req = urllib.request.Request(url, data=data, method=method, headers={
                "Authorization": f"Bearer {self.token()}", "Content-Type": "application/json"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    raw = r.read()
                    return json.loads(raw) if raw else None
            except urllib.error.HTTPError as e:
                text = e.read().decode(errors="replace")
                if e.code in (429, 500, 502, 503) and attempt < 3:
                    time.sleep(2 ** attempt * 3)
                    continue
                raise RuntimeError(f"{method} {path}: HTTP {e.code} {text[:800]}") from None

    def all(self, path: str):
        out, url = [], path
        while url:
            page = self.call("GET", url)
            out += page.get("data", [])
            url = page.get("links", {}).get("next")
        return out


def rel(kind: str, id_: str):
    return {"data": {"type": kind, "id": id_}}


def next_monday(start: str) -> str:
    """The recurring board's first start: the catalog's Monday, or the next Monday 00:00 UTC if that has passed."""
    t = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    while t < now:
        t += datetime.timedelta(days=7)
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


def upload_badge(asc: Asc, loc_id: str, path: str):
    size = os.path.getsize(path)
    res = asc.call("POST", "/gameCenterAchievementImages", {"data": {
        "type": "gameCenterAchievementImages",
        "attributes": {"fileName": os.path.basename(path), "fileSize": size},
        "relationships": {"gameCenterAchievementLocalization": rel("gameCenterAchievementLocalizations", loc_id)}}})
    image = res["data"]
    with open(path, "rb") as f:
        blob = f.read()
    for op in image["attributes"].get("uploadOperations") or []:
        part = blob[op["offset"]:op["offset"] + op["length"]]
        headers = {h["name"]: h["value"] for h in op.get("requestHeaders") or []}
        urllib.request.urlopen(urllib.request.Request(op["url"], data=part, method=op["method"], headers=headers), timeout=120).read()
    asc.call("PATCH", f"/gameCenterAchievementImages/{image['id']}", {"data": {
        "type": "gameCenterAchievementImages", "id": image["id"], "attributes": {"uploaded": True}}})


def main() -> int:
    key_path, key_id, issuer = sys.argv[1:4]
    apply = "--apply" in sys.argv
    with open(os.path.join(HERE, "catalog.json")) as f:
        catalog = json.load(f)
    asc = Asc(key_path, key_id, issuer)
    print("APPLYING CHANGES" if apply else "Dry run (add --apply to create)")

    apps = asc.call("GET", f"/apps?filter[bundleId]={BUNDLE_ID}")["data"]
    if not apps:
        print(f"::error::No App Store Connect app with bundle ID {BUNDLE_ID}")
        return 1
    app_id = apps[0]["id"]
    try:
        detail = asc.call("GET", f"/apps/{app_id}/gameCenterDetail")["data"]
    except RuntimeError as e:
        if "404" not in str(e):
            raise
        detail = None
    if not detail:
        print("Turning on Game Center for the app")
        if not apply:
            print(f"Would create {len(catalog['boards'])} leaderboards, {len(catalog['sets'])} sets, {len(catalog['achievements'])} achievements")
            return 0
        detail = asc.call("POST", "/gameCenterDetails", {"data": {
            "type": "gameCenterDetails", "relationships": {"app": rel("apps", app_id)}}})["data"]
    detail_id = detail["id"]

    def existing(kind: str):
        return {x["attributes"]["vendorIdentifier"]: x["id"] for x in asc.all(f"/gameCenterDetails/{detail_id}/{kind}?limit=200")}

    failures = 0

    # Leaderboard sets come first: an app may only have 100 leaderboards until it uses sets, and
    # with sets every leaderboard is created inside its set (up to 500).
    have = existing("gameCenterLeaderboardSets")
    set_ids = dict(have)
    todo = [s for s in catalog["sets"] if s["id"] not in have]
    print(f"Leaderboard sets: {len(have)} exist, {len(todo)} to create")
    for s in todo:
        print(f"  + {s['id']}  {s['name']}  ({len(s['boards'])} leaderboards)")
        if not apply:
            continue
        try:
            st = asc.call("POST", "/gameCenterLeaderboardSets", {"data": {
                "type": "gameCenterLeaderboardSets",
                "attributes": {"referenceName": s["name"][:64], "vendorIdentifier": s["id"]},
                "relationships": {"gameCenterDetail": rel("gameCenterDetails", detail_id)}}})["data"]
            set_ids[s["id"]] = st["id"]
            asc.call("POST", "/gameCenterLeaderboardSetLocalizations", {"data": {
                "type": "gameCenterLeaderboardSetLocalizations", "attributes": {"locale": LOCALE, "name": s["name"][:64]},
                "relationships": {"gameCenterLeaderboardSet": rel("gameCenterLeaderboardSets", st["id"])}}})
        except RuntimeError as e:
            failures += 1
            print(f"::warning::{s['id']}: {e}")
    set_of = {b: s["id"] for s in catalog["sets"] for b in s["boards"]}

    # Leaderboards
    have = existing("gameCenterLeaderboards")
    board_ids = dict(have)

    # Leaderboards made before their set existed join it first, so the 100-leaderboard limit
    # for apps without sets no longer applies when the rest are created.
    for s in catalog["sets"]:
        sid = set_ids.get(s["id"])
        if not sid:
            continue
        inside = {x["id"] for x in asc.all(f"/gameCenterLeaderboardSets/{sid}/relationships/gameCenterLeaderboards?limit=200")}
        missing = [board_ids[i] for i in s["boards"] if i in board_ids and board_ids[i] not in inside]
        if not missing:
            continue
        print(f"  {s['id']}: adding {len(missing)} existing leaderboard(s)")
        if not apply:
            continue
        try:
            asc.call("POST", f"/gameCenterLeaderboardSets/{sid}/relationships/gameCenterLeaderboards",
                     {"data": [{"type": "gameCenterLeaderboards", "id": i} for i in missing]})
        except RuntimeError as e:
            failures += 1
            print(f"::warning::{s['id']} members: {e}")

    todo = [b for b in catalog["boards"] if b["id"] not in have]
    print(f"Leaderboards: {len(have)} exist, {len(todo)} to create")
    for b in todo:
        attrs = {
            "referenceName": b["name"][:64], "vendorIdentifier": b["id"], "defaultFormatter": b["format"],
            "submissionType": "BEST_SCORE", "scoreSortType": b["sort"],
        }
        if b.get("recurring"):
            attrs.update({"recurrenceStartDate": next_monday(b["recurring"]["start"]),
                          "recurrenceDuration": f"P{b['recurring']['days']}DT0H0M0S", "recurrenceRule": "FREQ=WEEKLY;INTERVAL=1"})
        print(f"  + {b['id']}  {b['name']}" + (f"  (restarts weekly from {attrs['recurrenceStartDate']})" if b.get("recurring") else ""))
        if not apply:
            continue
        home = set_ids.get(set_of.get(b["id"], ""))
        try:
            # Inside its set, the leaderboard takes the app's Game Center from the set.
            relationships = ({"gameCenterLeaderboardSets": {"data": [{"type": "gameCenterLeaderboardSets", "id": home}]}}
                             if home else {"gameCenterDetail": rel("gameCenterDetails", detail_id)})
            try:
                lb = asc.call("POST", "/gameCenterLeaderboards", {"data": {
                    "type": "gameCenterLeaderboards", "attributes": attrs, "relationships": relationships}})["data"]
            except RuntimeError as e:
                if not home or "RELATIONSHIP" not in str(e):
                    raise
                relationships["gameCenterDetail"] = rel("gameCenterDetails", detail_id)
                lb = asc.call("POST", "/gameCenterLeaderboards", {"data": {
                    "type": "gameCenterLeaderboards", "attributes": attrs, "relationships": relationships}})["data"]
            board_ids[b["id"]] = lb["id"]
            asc.call("POST", "/gameCenterLeaderboardLocalizations", {"data": {
                "type": "gameCenterLeaderboardLocalizations", "attributes": {"locale": LOCALE, "name": b["name"][:64]},
                "relationships": {"gameCenterLeaderboard": rel("gameCenterLeaderboards", lb["id"])}}})
        except RuntimeError as e:
            failures += 1
            print(f"::warning::{b['id']}: {e}")

    # Achievements
    have = existing("gameCenterAchievements")
    todo = [a for a in catalog["achievements"] if a["id"] not in have]
    print(f"Achievements: {len(have)} exist, {len(todo)} to create")
    for a in todo:
        badge = os.path.join(HERE, "badges", a["id"].split(".")[-1] + ".png")
        print(f"  + {a['id']}  {a['name']} ({a['points']} pts){'' if os.path.exists(badge) else '  [no badge image!]'}")
        if not apply:
            continue
        try:
            ach = asc.call("POST", "/gameCenterAchievements", {"data": {
                "type": "gameCenterAchievements",
                "attributes": {"referenceName": a["name"][:64], "vendorIdentifier": a["id"], "points": a["points"],
                               "showBeforeEarned": True, "repeatable": False},
                "relationships": {"gameCenterDetail": rel("gameCenterDetails", detail_id)}}})["data"]
            loc = asc.call("POST", "/gameCenterAchievementLocalizations", {"data": {
                "type": "gameCenterAchievementLocalizations",
                "attributes": {"locale": LOCALE, "name": a["name"][:64], "beforeEarnedDescription": a["goal"][:255],
                               "afterEarnedDescription": a["earned"][:255]},
                "relationships": {"gameCenterAchievement": rel("gameCenterAchievements", ach["id"])}}})["data"]
            if os.path.exists(badge):
                upload_badge(asc, loc["id"], badge)
        except RuntimeError as e:
            failures += 1
            print(f"::warning::{a['id']}: {e}")

    if failures:
        print(f"::error::{failures} item(s) failed (see warnings above). Fix and run again: existing items are skipped.")
        return 1
    print("Done." if apply else "Dry run done. Nothing was changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
