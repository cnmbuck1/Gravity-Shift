"""Revoke the Apple Development certificates that earlier CI runs created.

Each upload run signs the archive with automatic signing, which makes a new "Apple Development:
Created via API" certificate whose private key only ever lives on that throwaway Mac. GitHub's
Intel Macs all look like the same machine to Apple, so from the second run on Xcode finds "its"
certificate, has no private key for it, and stops with "Revoke certificate: Your account already has
an Apple Development signing certificate for this machine". Revoking those CI-made certificates first
lets each run create a fresh one. Certificates made any other way (Xcode on your own Mac,
distribution certificates) are left alone.

Usage: python revoke_ci_dev_certs.py <AuthKey.p8> <key id> <issuer id>
"""
import json
import sys
import time
import urllib.request

import jwt  # PyJWT, with cryptography for ES256

API = "https://api.appstoreconnect.apple.com/v1"


def token(key_path: str, key_id: str, issuer: str) -> str:
    now = int(time.time())
    with open(key_path) as f:
        key = f.read()
    return jwt.encode({"iss": issuer, "iat": now, "exp": now + 600, "aud": "appstoreconnect-v1"},
                      key, algorithm="ES256", headers={"kid": key_id, "typ": "JWT"})


def call(method: str, url: str, tok: str):
    req = urllib.request.Request(url, method=method, headers={"Authorization": f"Bearer {tok}"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read()
        return json.loads(body) if body else None


def main() -> int:
    key_path, key_id, issuer = sys.argv[1:4]
    tok = token(key_path, key_id, issuer)
    certs = call("GET", f"{API}/certificates?filter[certificateType]=DEVELOPMENT,IOS_DEVELOPMENT&limit=200", tok)["data"]
    ci = [c for c in certs if "Created via API" in (c["attributes"].get("name") or "") + (c["attributes"].get("displayName") or "")]
    print(f"{len(certs)} development certificate(s), {len(ci)} made by CI")
    for c in ci:
        a = c["attributes"]
        call("DELETE", f"{API}/certificates/{c['id']}", tok)
        print(f"Revoked {a.get('displayName') or a.get('name')} (expires {a.get('expirationDate')})")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # never block the upload on this tidy-up step
        print(f"::warning::Could not revoke old CI certificates: {e}")
        sys.exit(0)
