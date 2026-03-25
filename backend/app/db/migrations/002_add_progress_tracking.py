"""Migration 002: Add progress tracking tables"""
import sqlite3
import os

DB_PATH = os.environ.get("DATABASE_URL", "data/app.db").replace("sqlite:///", "")


def up():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    # Add is_milestone column to tasks (ignore if already exists)
    try:
        cur.execute("ALTER TABLE tasks ADD COLUMN is_milestone BOOLEAN DEFAULT 0 NOT NULL")
    except sqlite3.OperationalError:
        pass  # column already exists
    cur.execute("""CREATE TABLE IF NOT EXISTS project_notification_settings (
        id TEXT PRIMARY KEY,
        project_id TEXT UNIQUE NOT NULL,
        summary_schedule TEXT DEFAULT 'off',
        created_at TEXT,
        updated_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE)""")
    cur.execute("""CREATE TABLE IF NOT EXISTS notification_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT,
        project_id TEXT,
        notification_type TEXT NOT NULL,
        sent_date TEXT NOT NULL,
        created_at TEXT,
        UNIQUE(task_id, notification_type, sent_date))""")
    conn.commit()
    conn.close()
    print("Migration 002 up: done")


def down():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DROP TABLE IF EXISTS notification_logs")
    conn.execute("DROP TABLE IF EXISTS project_notification_settings")
    conn.commit()
    conn.close()
    print("Migration 002 down: done")


if __name__ == "__main__":
    up()
