#!/usr/bin/env python3
"""Brik Sales Hub, GitHub copy: rebuild the database export from this session's own log.

The scheduled task reads the Hub's database with ArtifactData "list" (no out_dir: that option is
refused for this Hub). This script then finds those results in the session's log and writes each
document as <out>/<collection>/<doc_id>.json holding only its data object, which is the layout
tools/seal.mjs expects. Nothing is retyped by hand, so no number or name can drift.

  python3 tools/dbexport.py --out db [--logs "<glob>" ...]

Only units, profiles, weekly, agenda, town and game are exported. pitch, bounties and events hold
client names and notes and are never written, even if they appear in the log.
If the same document was read more than once, the highest version wins.
The output folder is a readable copy: it is ignored by git and must never be committed.
"""
import argparse, glob, json, os, re, sys

ALLOWED = ("units", "profiles", "weekly", "agenda", "town", "game")
NEEDED = ("game", "town", "units")
HEAD = re.compile(r'(\d+) documents? from collection "([^"]+)":')


def tool_result_texts(path):
    with open(path, encoding="utf-8", errors="replace") as f:
        for line in f:
            if "BEGIN ARTIFACT DB" not in line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            content = (rec.get("message") or {}).get("content")
            if not isinstance(content, list):
                continue
            for block in content:
                if not isinstance(block, dict) or block.get("type") != "tool_result":
                    continue
                c = block.get("content")
                parts = [c] if isinstance(c, str) else [p.get("text", "") for p in c or [] if isinstance(p, dict)]
                for t in parts:
                    if isinstance(t, str) and "BEGIN ARTIFACT DB" in t:
                        yield t


def parse(text):
    """Yield (collection, doc) for every document in one ArtifactData result."""
    lines = text.splitlines()
    col = None
    inside = False
    for ln in lines:
        m = HEAD.search(ln)
        if m and not inside:
            col = m.group(2)
            continue
        if ln.startswith("=== BEGIN ARTIFACT DB"):
            inside = True
            continue
        if ln.startswith("=== END ARTIFACT DB"):
            inside = False
            continue
        if inside and col and ln.startswith("{"):
            try:
                d = json.loads(ln)
            except ValueError:
                sys.exit(f"dbexport: a {col} document in the log is not valid JSON; not exporting a broken copy")
            if isinstance(d, dict) and "id" in d and "data" in d:
                yield col, d


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--logs", nargs="*", default=[os.path.expanduser("~/.claude/projects/**/*.jsonl")])
    a = ap.parse_args()

    files = sorted({f for g in a.logs for f in glob.glob(g, recursive=True)})
    if not files:
        sys.exit("dbexport: no session logs found")
    best = {}
    for f in files:
        for t in tool_result_texts(f):
            for col, d in parse(t):
                if col not in ALLOWED:
                    continue
                key = (col, d["id"])
                if key not in best or (d.get("version") or 0) >= (best[key].get("version") or 0):
                    best[key] = d
    seen = {c for c, _ in best}
    missing = [c for c in NEEDED if c not in seen]
    if missing:
        sys.exit("dbexport: the log has no " + ", ".join(missing) + "; list those collections first")
    if os.path.exists(a.out) and os.listdir(a.out):
        sys.exit(f"dbexport: {a.out} is not empty; start from an empty folder")
    counts = {}
    for (col, did), d in sorted(best.items()):
        os.makedirs(os.path.join(a.out, col), exist_ok=True)
        with open(os.path.join(a.out, col, did + ".json"), "w", encoding="utf-8") as fh:
            json.dump(d["data"], fh, ensure_ascii=False, separators=(",", ":"))
        counts[col] = counts.get(col, 0) + 1
    print("exported " + ", ".join(f"{c} {counts.get(c, 0)}" for c in ALLOWED))
    for c in ALLOWED:
        if c not in counts:
            print(f"note: no {c} documents in the log (fine if that collection is empty)")


if __name__ == "__main__":
    main()
