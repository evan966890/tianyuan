#!/usr/bin/env python3
from __future__ import annotations

import shutil
from pathlib import Path

PATCHED = 'const msgType = fileType === "opus" ? "audio" : fileType === "mp4" ? "media" : "file";'
LEGACY_PATTERNS = [
    'const msgType = fileType === "mp4" ? "media" : "file";',
    'const msgType=fileType==="mp4"?"media":"file";',
]

TARGETS = [
    Path("/opt/homebrew/lib/node_modules/openclaw/extensions/feishu/src/media.ts"),
    Path.home() / "Library/Application Support/ClawMom/runtime/2026.3.8/node_modules/openclaw/extensions/feishu/src/media.ts",
]


def patch_file(target: Path) -> str:
    if not target.exists():
        return f"skip {target} (missing)"

    content = target.read_text(encoding="utf-8")
    if PATCHED in content:
        return f"ok   {target} (already patched)"

    for legacy in LEGACY_PATTERNS:
        if legacy in content:
            backup = target.with_suffix(target.suffix + ".bak")
            shutil.copy2(target, backup)
            target.write_text(content.replace(legacy, PATCHED), encoding="utf-8")
            return f"fix  {target} (backup: {backup})"

    return f"skip {target} (pattern not found)"


def main() -> None:
    for target in TARGETS:
        print(patch_file(target))


if __name__ == "__main__":
    main()
