#!/bin/zsh
set -euo pipefail

APP='/Applications/1Password 6.app'
FRAMEWORK="$APP/Contents/Frameworks/OnePasswordCore.framework"
BINARY="$FRAMEWORK/Versions/A/OnePasswordCore"
CHROME='/Applications/Google Chrome.app'
EXPECTED_SHA256='12046e585020fae2b69ac77b844583b3e9726082b9691a3848a1d876099f637d'
OLD='Developer ID Application: Google, Inc. (EQHXZ8M8AV)")'
NEW='Developer ID Application: Google LLC (EQHXZ8M8AV)")  '

mode="${1:---audit}"
work_dir=''
backup=''
rollback_needed=0

cleanup() {
  local exit_code=$?
  trap - EXIT
  if [[ "$rollback_needed" == '1' && -n "$backup" && -d "$backup/OnePasswordCore.framework" ]]; then
    print -u2 -- "Apply failed; restoring the original framework from backup..."
    /usr/bin/sudo /usr/bin/ditto "$backup/OnePasswordCore.framework" "$FRAMEWORK" || \
      print -u2 -- "AUTOMATIC ROLLBACK FAILED. Restore manually from: $backup/OnePasswordCore.framework"
  fi
  if [[ -n "$work_dir" && "$work_dir" == /private/tmp/onepassword6-chrome157.* ]]; then
    /bin/rm -rf -- "$work_dir"
  fi
  exit "$exit_code"
}

trap cleanup EXIT

fail() {
  print -u2 -- "ERROR: $*"
  exit 1
}

sha256() {
  /usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}'
}

count_bytes() {
  /usr/bin/ruby -e 'data=File.binread(ARGV[0]); puts data.scan(ARGV[1]).length' "$1" "$2"
}

[[ -d "$APP" ]] || fail "1Password 6.app was not found."
[[ -f "$BINARY" ]] || fail "OnePasswordCore binary was not found."
[[ -d "$CHROME" ]] || fail "Google Chrome.app was not found."
[[ "$mode" == '--audit' || "$mode" == '--apply' ]] || fail "Usage: $0 [--audit|--apply]"

actual_sha256="$(sha256 "$BINARY")"
original_owner="$(/usr/bin/stat -f '%Su' "$BINARY")"
original_group="$(/usr/bin/stat -f '%Sg' "$BINARY")"
old_count="$(count_bytes "$BINARY" "$OLD")"
new_count="$(count_bytes "$BINARY" "$NEW")"

print -- "1PasswordCore SHA-256: $actual_sha256"
print -- "Expected original SHA-256: $EXPECTED_SHA256"
print -- "Old signer clauses: $old_count"
print -- "Patched signer clauses: $new_count"
print -- ""

if [[ "$actual_sha256" == "$EXPECTED_SHA256" ]]; then
  [[ "$old_count" == '2' && "$new_count" == '0' ]] || fail "Unexpected signer-clause layout."
  state='original'
elif [[ "$old_count" == '0' && "$new_count" == '2' ]]; then
  state='already-patched'
else
  fail "Unknown or partially modified OnePasswordCore. Refusing to continue."
fi

print -- "Detected state: $state"
print -- "Chrome requirement remains constrained to:"
print -- "  anchor apple generic"
print -- "  identifier com.google.Chrome"
print -- "  certificate CN Developer ID Application: Google LLC (EQHXZ8M8AV)"

if [[ "$mode" == '--audit' ]]; then
  print -- ""
  print -- "Audit complete. No files were changed."
  print -- "Run with --apply only after closing 1Password 6 and 1Password mini."
  exit 0
fi

[[ "$state" == 'original' ]] || fail "The framework is already patched."

if /usr/bin/pgrep -if '1Password 6.app|onepassword4-helper|OnePasswordNativeMessageHost' >/dev/null 2>&1; then
  fail "1Password 6, 1Password mini, or its Native Message Host is running. Quit it before applying."
fi

work_dir="$(/usr/bin/mktemp -d /private/tmp/onepassword6-chrome157.XXXXXX)"
candidate="$work_dir/OnePasswordCore"
/bin/cp -p "$BINARY" "$candidate"

/usr/bin/ruby -e '
  path, old_value, new_value = ARGV
  abort "replacement length mismatch" unless old_value.bytesize == new_value.bytesize
  data = File.binread(path)
  abort "unexpected replacement count" unless data.scan(old_value).length == 2
  patched = data.gsub(old_value, new_value)
  abort "binary size changed" unless patched.bytesize == data.bytesize
  File.binwrite(path, patched)
' "$candidate" "$OLD" "$NEW"

[[ "$(count_bytes "$candidate" "$OLD")" == '0' ]] || fail "Old signer clauses remain in candidate."
[[ "$(count_bytes "$candidate" "$NEW")" == '2' ]] || fail "Candidate does not contain two patched clauses."
[[ "$(/usr/bin/stat -f '%z' "$candidate")" == "$(/usr/bin/stat -f '%z' "$BINARY")" ]] || fail "Candidate size changed."

# Validate the exact updated stable-Chrome requirement against the installed Chrome.
requirement="$(/usr/bin/strings -a "$candidate" | /usr/bin/grep -m1 '^anchor apple generic and ((identifier com.google.Chrome ' || true)"
[[ -n "$requirement" ]] || fail "Could not extract the patched Chrome requirement."
/usr/bin/printf '%s' "$requirement" | /usr/bin/csreq -r- -b "$work_dir/chrome-requirement.csreq" \
  || fail "Patched Chrome requirement is not valid requirement syntax. Nothing was changed."
/usr/bin/codesign --verify -R="$requirement" "$CHROME" \
  || fail "Installed Chrome does not satisfy the patched requirement. Nothing was changed."

backup_root="$HOME/Library/Application Support/1Password 6 MV3 Repair Backups"
timestamp="$(/bin/date '+%Y%m%d-%H%M%S')"
backup="$backup_root/$timestamp"
/bin/mkdir -p "$backup"
/usr/bin/ditto "$FRAMEWORK" "$backup/OnePasswordCore.framework"
print -- "Backup created: $backup/OnePasswordCore.framework"

print -- "The next step modifies only OnePasswordCore.framework and requires administrator approval."
print -n -- "Type APPLY to continue: "
read confirmation
[[ "$confirmation" == 'APPLY' ]] || fail "Cancelled. Backup was retained; the application was not changed."

rollback_needed=1
/usr/bin/sudo /bin/cp -p "$candidate" "$BINARY"
/usr/bin/sudo /usr/sbin/chown "$original_owner:$original_group" "$BINARY"
/usr/bin/sudo /usr/bin/codesign --force --sign - "$FRAMEWORK"

[[ "$(count_bytes "$BINARY" "$OLD")" == '0' ]] || fail "Post-install verification failed: old clauses remain."
[[ "$(count_bytes "$BINARY" "$NEW")" == '2' ]] || fail "Post-install verification failed: patched clauses are missing."
rollback_needed=0

print -- ""
print -- "Patch applied. Do not run codesign --deep on 1Password 6.app."
print -- "Backup: $backup/OnePasswordCore.framework"
print -- "Restart 1Password 6, then reload the isolated Chrome extension."
print -- "If rollback is needed, stop 1Password and restore the entire framework from that backup."
