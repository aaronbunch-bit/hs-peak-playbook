#!/usr/bin/env python3
"""Replace seed facts from an HS Peak Playbook Looker CSV (multi-week)."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = ROOT / "src/data/seed.json"

MANAGER_ALIASES = {"angie damon": "Angela Damon"}
NAME_ALIASES = {"Jennifer Babcock": "Jenn Babcock"}


def pct(raw: str) -> float | None:
    t = (raw or "").strip()
    if not t:
        return None
    if t.endswith("%"):
        return round(float(t[:-1].replace(",", "")) / 100, 4)
    n = float(t.replace(",", ""))
    return round(n / 100, 4) if n > 1 else n


def count(raw: str) -> int:
    t = (raw or "").replace(",", "").strip()
    if not t:
        return 0
    return int(float(t))


def main() -> None:
    if len(sys.argv) < 2:
        print("usage: ingest-looker-playbook.py path/to/HS-Peak-Playbook.csv")
        sys.exit(1)
    csv_path = Path(sys.argv[1])
    seed = json.loads(SEED.read_text())
    old_levels = {r["name"]: r.get("level") for r in seed.get("roster", [])}
    for src, dest in NAME_ALIASES.items():
        if src in old_levels and dest not in old_levels:
            old_levels[dest] = old_levels[src]

    with csv_path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    body = rows[2:] if rows and "HS-STEM" in ",".join(rows[0]) else rows

    facts = []
    latest_manager: dict[str, str | None] = {}
    for r in body:
        if len(r) < 11 or not r[0].strip() or not r[2].strip():
            continue
        week = r[0].strip()[:10]
        name = r[2].strip()
        manager = (r[3] or "").strip() or None
        if manager:
            manager = MANAGER_ALIASES.get(manager.lower(), manager)
        facts.append(
            {
                "week": week,
                "superGroup": (r[1] or "").strip() or None,
                "name": name,
                "manager": manager,
                "hsCc90": count(r[4]),
                "hsPgc": pct(r[5]),
                "hsMix": pct(r[6]),
                "k12Cc90": count(r[7]),
                "k12Pgc": pct(r[8]),
                "k12Mix": pct(r[9]),
                "totalPgc": pct(r[10]),
            }
        )
        latest_manager[name] = manager

    roster = [
        {"name": name, "level": old_levels.get(name), "manager": latest_manager[name]}
        for name in sorted(latest_manager)
    ]
    name_set = set(latest_manager)
    focus = []
    for e in seed.get("focusLog", []):
        rep = NAME_ALIASES.get(e.get("rep", ""), e.get("rep"))
        if rep in name_set:
            focus.append({**e, "rep": rep})

    seed = {
        "source": f"Looker HS Peak Playbook ({csv_path.name}); Total pGC = Supergroup",
        "targetPgc": seed.get("targetPgc", 0.2),
        "improvePts": seed.get("improvePts", 0.03),
        "degradePts": seed.get("degradePts", -0.03),
        "roster": roster,
        "facts": facts,
        "focusLog": focus,
    }
    SEED.write_text(json.dumps(seed, indent=2) + "\n")
    weeks = sorted({f["week"] for f in facts}, reverse=True)
    print(f"weeks {weeks}")
    print(f"reps {len(roster)} facts {len(facts)}")


if __name__ == "__main__":
    main()
