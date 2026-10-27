"""Prepare chart-command tables only after a consistent, verified SQLite backup.

Explicit opt-in CLI; importing this module never changes a database. Keep the
backup directory outside every Git checkout. This does not enable the feature.
"""

import argparse
import sqlite3
import sys
import uuid
from contextlib import closing
from datetime import UTC, datetime, timezone
from pathlib import Path


def migrate(database: Path, backup_dir: Path):
    database = database.resolve(strict=True)
    backup_dir = backup_dir.resolve()
    if not database.is_file():
        raise ValueError("Choose the existing OpenAlgo SQLite database file")
    if any((parent / ".git").exists() for parent in (backup_dir, *backup_dir.parents)):
        raise ValueError("Database backups must remain outside Git checkouts")
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup = backup_dir / f"chart-commands-before-{stamp}-{uuid.uuid4().hex[:8]}.db"
    # Reserve a unique destination rather than overwrite a previous backup.
    with backup.open("xb"):
        pass
    with closing(sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=5)) as source:
        with closing(sqlite3.connect(backup, timeout=5)) as target:
            source.backup(target, pages=128, sleep=0.05)
            if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity verification failed; schema was not changed")
    from sqlalchemy.engine import URL

    from database.chart_commands_db import CommandLedger
    from database.engine_factory import create_db_engine

    engine = create_db_engine(
        URL.create("sqlite", database=str(database)).render_as_string(hide_password=False)
    )
    try:
        book = CommandLedger(engine)
        book.init_db()
        if not book.ready():
            raise RuntimeError("Chart-command schema verification failed; backup retained")
    finally:
        engine.dispose()
    return backup


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--backup-dir", required=True, type=Path)
    args = parser.parse_args()
    saved = migrate(args.database, args.backup_dir)
    print(f"Chart-command tables prepared. Consistent backup: {saved}")
    print("Feature remains disabled; complete release verification before activation.")
