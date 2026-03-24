"""
Migration 001: Add presentations table
Created: 2026-03-24
"""

import sqlite3
import os
from pathlib import Path


MIGRATION_ID = "001"
MIGRATION_NAME = "add_presentations_table"


def up(db_path: str) -> None:
    """Create the presentations table."""
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()

        # Check if table already exists
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='presentations'"
        )
        if cur.fetchone():
            print(f"[{MIGRATION_ID}] Table 'presentations' already exists, skipping.")
            return

        cur.executescript("""
            CREATE TABLE presentations (
                id          TEXT PRIMARY KEY,
                project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                topic       TEXT NOT NULL DEFAULT '',
                title       TEXT NOT NULL,
                subtitle    TEXT NOT NULL DEFAULT '',
                slides      TEXT NOT NULL DEFAULT '[]',
                template    TEXT NOT NULL DEFAULT 'professional',
                created_at  DATETIME NOT NULL DEFAULT (datetime('now')),
                updated_at  DATETIME NOT NULL DEFAULT (datetime('now'))
            );

            CREATE INDEX idx_presentations_project_id
                ON presentations(project_id);
        """)

        conn.commit()
        print(f"[{MIGRATION_ID}] Created table 'presentations' successfully.")
    finally:
        conn.close()


def down(db_path: str) -> None:
    """Drop the presentations table."""
    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("DROP TABLE IF EXISTS presentations")
        conn.commit()
        print(f"[{MIGRATION_ID}] Dropped table 'presentations'.")
    finally:
        conn.close()


if __name__ == "__main__":
    import sys

    db_path = os.environ.get(
        "DATABASE_PATH",
        str(Path(__file__).parents[3] / "data" / "assistant.db"),
    )

    action = sys.argv[1] if len(sys.argv) > 1 else "up"
    if action == "up":
        up(db_path)
    elif action == "down":
        down(db_path)
    else:
        print(f"Unknown action: {action}. Use 'up' or 'down'.")
        sys.exit(1)
