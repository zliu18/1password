"""Prepare the specifically authorized signer-name update; never install or run it."""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TARGET = Path(r"C:\Program Files (x86)\1Password 4\Agile1pAgent.exe")
ORIGINAL_HASH = "17bf9760cb97ec3b76db46b2f502645d2a539edd858b5484ae336727eff5c948"
CANDIDATE_HASH = "968235499fbea066c979ac3c4a8a663e46ea7026a5c6a0ab2316fb5d3be22857"
OFFSET = 0x31A404
OLD, NEW = b"Google Inc", b"Google LLC"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def save_verified(path, data, expected):
    if path.exists():
        if digest(path.read_bytes()) != expected:
            raise SystemExit(f"Refusing to overwrite a different existing artifact: {path.name}")
    else:
        with path.open("xb") as stream:
            stream.write(data)
    if digest(path.read_bytes()) != expected:
        raise SystemExit(f"Saved artifact hash mismatch: {path.name}")


original = TARGET.read_bytes()
if digest(original) != ORIGINAL_HASH:
    raise SystemExit("Installed Helper changed; refusing to reuse audited offsets.")
if original.count(OLD) != 1 or original[OFFSET:OFFSET + len(OLD)] != OLD:
    raise SystemExit("Original signer literal mismatch.")
candidate = original[:OFFSET] + NEW + original[OFFSET + len(OLD):]
if len(candidate) != len(original) or digest(candidate) != CANDIDATE_HASH:
    raise SystemExit("Candidate identity mismatch.")
changed = [i for i, (a, b) in enumerate(zip(original, candidate)) if a != b]
if changed != [OFFSET + 7, OFFSET + 8, OFFSET + 9]:
    raise SystemExit("Unexpected byte differences.")

backup = ROOT / "Agile1pAgent.original.exe"
patched = ROOT / "Agile1pAgent.GoogleLLC.exe"
save_verified(backup, original, ORIGINAL_HASH)
save_verified(patched, candidate, CANDIDATE_HASH)
result = {
    "prepared_at_utc": datetime.now(timezone.utc).isoformat(),
    "installed_target": str(TARGET),
    "backup": str(backup),
    "candidate": str(patched),
    "original_sha256": ORIGINAL_HASH,
    "candidate_sha256": CANDIDATE_HASH,
    "size_bytes": len(original),
    "literal_file_offset": hex(OFFSET),
    "old_literal": OLD.decode(),
    "new_literal": NEW.decode(),
    "changed_byte_offsets": [hex(i) for i in changed],
    "all_other_bytes_unchanged": True,
    "helper_vendor_authenticode_invalidated_by_candidate": True,
    "installed_helper_modified": False,
}
(ROOT / "helper-candidate-verification.json").write_text(
    json.dumps(result, indent=2) + "\n", encoding="utf-8"
)
print(json.dumps(result, indent=2))
