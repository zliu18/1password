"""Read-only audit of the observed 1Password 4 browser signer mismatch.

Requires capstone and pefile in ../analysis-deps. It never writes an EXE,
loads target code, changes processes, or inspects vault/storage data.
"""

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "analysis-deps"))
import capstone
import pefile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("output", nargs="?", type=Path)
parser.add_argument("--target", type=Path,
                    default=Path(r"C:\Program Files (x86)\1Password 4\Agile1pAgent.exe"),
                    help="Use the original backup after installing the patch; its original hash is still required.")
args = parser.parse_args()
TARGET = args.target
EXPECTED_HASH = "17bf9760cb97ec3b76db46b2f502645d2a539edd858b5484ae336727eff5c948"
OFFSET = 0x31A404
OLD = b"Google Inc"
NEW = b"Google LLC"

data = TARGET.read_bytes()
digest = hashlib.sha256(data).hexdigest()
if digest != EXPECTED_HASH:
    raise SystemExit("Helper identity changed; refusing to reuse audited offsets.")
if data[OFFSET : OFFSET + len(OLD)] != OLD or data.count(OLD) != 1:
    raise SystemExit("Unexpected original signer literal.")

pe = pefile.PE(data=data)
base = pe.OPTIONAL_HEADER.ImageBase
imports = {
    item.address: (item.name or b"ordinal").decode()
    for entry in pe.DIRECTORY_ENTRY_IMPORT
    for item in entry.imports
}
decoder = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)

ranges = [
    ("native-client-identification", 0x740940, 0x740B1A),
    ("browser-signer-classification", 0x71AED0, 0x71AFE5),
    ("windows-trust-verification", 0x619C30, 0x619CE7),
    ("signer-certificate-simple-name", 0x619D74, 0x619F62),
    ("signer-name-comparison", 0x619F64, 0x619FC5),
]
decoded = []
for label, start, end in ranges:
    body = pe.get_data(start - base, end - start)
    instructions = []
    for address, size, mnemonic, operands in decoder.disasm_lite(body, start):
        row = {"address": hex(address), "size": size, "mnemonic": mnemonic, "operands": operands}
        if mnemonic == "call" and operands.startswith("0x"):
            destination = int(operands, 16)
            stub = pe.get_data(destination - base, 6)
            if stub[:2] == b"\xff\x25":
                name = imports.get(struct.unpack("<I", stub[2:6])[0])
                if name:
                    row["import"] = name
        instructions.append(row)
    decoded.append({"label": label, "start": hex(start), "end_exclusive": hex(end),
                    "sha256": hashlib.sha256(body).hexdigest(), "instructions": instructions})

# Calculate a proposed result in memory only. No candidate executable is created.
proposed = data[:OFFSET] + NEW + data[OFFSET + len(OLD) :]
assert len(OLD) == len(NEW) and len(proposed) == len(data)

result = {
    "authority": "ordinary-shell-static-analysis",
    "target": str(TARGET),
    "sha256": digest,
    "image_base": hex(base),
    "tools": {"capstone": capstone.__version__, "pefile": pefile.__version__},
    "proposed_literal_change": {
        "file_offset": hex(OFFSET), "virtual_address": hex(base + pe.get_rva_from_offset(OFFSET)),
        "old": OLD.decode(), "new": NEW.decode(), "length": len(OLD),
        "in_memory_candidate_sha256": hashlib.sha256(proposed).hexdigest(),
        "candidate_file_written": False,
        "would_invalidate_helper_authenticode_signature": True,
    },
    "code_ranges": decoded,
    "limitations": [
        "Static disassembly and current Chrome certificate metadata establish the old signer-name mismatch.",
        "No helper code or proposed executable was run. No claim of functional patch success is made.",
        "Reported ranges are analyst-selected static byte ranges; complete call-graph coverage is not claimed.",
        "The audited input is not modified. Changing its signed text invalidates its vendor signature.",
    ],
}
rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
if args.output:
    args.output.write_text(rendered, encoding="utf-8")
else:
    print(rendered, end="")
