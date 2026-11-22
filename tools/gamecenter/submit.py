"""Add Gravitor's Game Center leaderboards, sets and achievements to an App Review submission.

App Store Connect's website has no bulk "Add for Review" for Game Center, and the first batch must
go in the same submission as the app version. This finds each component's version that hasn't
been reviewed yet and adds it to the app's open (draft) iOS review submission.

Modes:
  probe          read only: prints the review submissions and what the API returns for one
                 set, leaderboard and achievement, so we can see the shapes before changing anything
  add            dry run: lists what it would add
  add --apply    adds them (at most --limit, default 200: Apple's per-submission cap)
  --waiting      also allow a submission that is already Waiting for Review

Usage: python submit.py <AuthKey.p8> <key id> <issuer id> <mode> [--apply] [--limit N]
Run from GitHub: Actions -> "Submit Game Center for review".
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from setup import Asc, BUNDLE_ID, rel  # noqa: E402

V2 = "https://api.appstoreconnect.apple.com/v2"
V1 = "https://api.appstoreconnect.apple.com/v1"

# (label, v1 list under gameCenterDetails, v2 resource, version resource type, review item relationship key)
KINDS = [
    ("set", "gameCenterLeaderboardSets", "gameCenterLeaderboardSets", "gameCenterLeaderboardSetVersions", "gameCenterLeaderboardSetVersion"),
    ("achievement", "gameCenterAchievements", "gameCenterAchievements", "gameCenterAchievementVersions", "gameCenterAchievementVersion"),
    ("leaderboard", "gameCenterLeaderboards", "gameCenterLeaderboards", "gameCenterLeaderboardVersions", "gameCenterLeaderboardVersion"),
]


def show(label, fn):
    try:
        res = fn()
        print(f"--- {label}: OK\n{json.dumps(res, indent=1)[:2500]}")
        return res
    except RuntimeError as e:
        print(f"--- {label}: {e}"[:1200])
        return None


def versions(asc: Asc, v2_kind: str, id_: str):
    return asc.call("GET", f"{V2}/{v2_kind}/{id_}/versions")


def main() -> int:
    key_path, key_id, issuer, mode = sys.argv[1:5]
    apply = "--apply" in sys.argv
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else 200
    asc = Asc(key_path, key_id, issuer)

    app_id = asc.call("GET", f"/apps?filter[bundleId]={BUNDLE_ID}")["data"][0]["id"]
    detail_id = asc.call("GET", f"/apps/{app_id}/gameCenterDetail")["data"]["id"]
    subs = asc.call("GET", f"/reviewSubmissions?filter[app]={app_id}&filter[platform]=IOS&limit=20")["data"]
    print("Review submissions:")
    for s in subs:
        print(f"  {s['id']}  state={s['attributes'].get('state')}  submitted={s['attributes'].get('submittedDate')}")

    if mode == "probe":
        for s in subs[:3]:
            show(f"items of submission {s['id']}", lambda: asc.call("GET", f"/reviewSubmissions/{s['id']}/items?limit=50"))
        show("gameCenterAppVersions of detail", lambda: asc.call("GET", f"/gameCenterDetails/{detail_id}/gameCenterAppVersions"))
        for label, v1_list, v2_kind, _, _ in KINDS:
            first = asc.call("GET", f"/gameCenterDetails/{detail_id}/{v1_list}?limit=1")["data"]
            if not first:
                print(f"--- no {label}s")
                continue
            x = first[0]
            print(f"=== {label} {x['attributes'].get('vendorIdentifier')} id={x['id']}")
            show(f"v1 {label}", lambda: asc.call("GET", f"/{v1_list}/{x['id']}"))
            show(f"v2 {label}", lambda: asc.call("GET", f"{V2}/{v2_kind}/{x['id']}"))
            show(f"v2 {label} versions", lambda: versions(asc, v2_kind, x["id"]))
        return 0

    if mode == "swap":
        # swap --out <leaderboard vendorId> --in <leaderboard vendorId>: frees a slot in a full draft.
        out_vid = sys.argv[sys.argv.index("--out") + 1]
        in_vid = sys.argv[sys.argv.index("--in") + 1]
        sub_id = [s for s in subs if s["attributes"].get("state") == "READY_FOR_REVIEW"][0]["id"]
        boards = {x["attributes"]["vendorIdentifier"]: x["id"] for x in asc.all(f"/gameCenterDetails/{detail_id}/gameCenterLeaderboards?limit=200")}
        out_ver = versions(asc, "gameCenterLeaderboards", boards[out_vid])["data"][0]["id"]
        in_ver = versions(asc, "gameCenterLeaderboards", boards[in_vid])["data"][0]["id"]
        url = f"/reviewSubmissions/{sub_id}/items?limit=200&include=gameCenterLeaderboardVersion"
        item = None
        while url and not item:
            page = asc.call("GET", url)
            for it in page["data"]:
                d = (it.get("relationships", {}).get("gameCenterLeaderboardVersion") or {}).get("data")
                if d and d["id"] == out_ver:
                    item = it["id"]
            url = page.get("links", {}).get("next")
        if not item:
            print(f"::error::{out_vid} is not in submission {sub_id}")
            return 1
        print(f"Removing {out_vid} (item {item}), adding {in_vid}" + ("" if apply else " (dry run)"))
        if apply:
            asc.call("DELETE", f"/reviewSubmissionItems/{item}")
            asc.call("POST", "/reviewSubmissionItems", {"data": {
                "type": "reviewSubmissionItems",
                "relationships": {"reviewSubmission": rel("reviewSubmissions", sub_id),
                                  "gameCenterLeaderboardVersion": rel("gameCenterLeaderboardVersions", in_ver)}}})
            print("Done")
        return 0

    if mode != "add":
        print(f"::error::Unknown mode {mode}")
        return 1

    ok_states = ("READY_FOR_REVIEW", "WAITING_FOR_REVIEW") if "--waiting" in sys.argv else ("READY_FOR_REVIEW",)
    drafts = [s for s in subs if s["attributes"].get("state") in ok_states]
    if not drafts:
        print("::error::No draft (not yet submitted) iOS review submission. Remove 1.1.0 from review in App Store Connect first.")
        return 1
    sub_id = drafts[0]["id"]
    print(f"Adding to draft submission {sub_id}" + ("" if apply else " (dry run)"))

    added, failures = 0, 0
    for label, v1_list, v2_kind, ver_type, rel_key in KINDS:
        items = asc.all(f"/gameCenterDetails/{detail_id}/{v1_list}?limit=200")
        print(f"{label}s: {len(items)}")
        for x in items:
            if added >= limit:
                print(f"Reached the limit of {limit}; run again for the rest after this submission.")
                return 1 if failures else 0
            vid = x["attributes"].get("vendorIdentifier")
            vers = versions(asc, v2_kind, x["id"])["data"]
            todo = [v for v in vers if v["attributes"].get("state") not in ("LIVE", "ACCEPTED", "WAITING_FOR_REVIEW", "IN_REVIEW")]
            if not todo:
                print(f"  = {vid} (nothing to submit)")
                continue
            v = todo[0]
            print(f"  + {vid}  version {v['id']} state={v['attributes'].get('state')}")
            if apply:
                try:
                    asc.call("POST", "/reviewSubmissionItems", {"data": {
                        "type": "reviewSubmissionItems",
                        "relationships": {"reviewSubmission": rel("reviewSubmissions", sub_id),
                                          rel_key: rel(ver_type, v["id"])}}})
                except RuntimeError as e:
                    failures += 1
                    print(f"::warning::{vid}: {e}")
                    if failures >= 3 and added == 0:
                        print("::error::First adds all failed; stopping.")
                        return 1
                    continue
            added += 1
    print(f"Done: {added} {'added' if apply else 'would be added'}, {failures} failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
