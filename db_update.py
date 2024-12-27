import sqlite3
from contextlib import contextmanager

DATABASE_PATH = "flux_logs.db"

@contextmanager
def get_db_connection(db_path=DATABASE_PATH):
    conn = sqlite3.connect(db_path)
    try:
        yield conn
    finally:
        conn.close()

def column_exists(cursor, table_name, column_name):
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = [info[1] for info in cursor.fetchall()]
    return column_name in columns

def update_database():
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Erstellen oder aktualisieren Sie die Tabelle 'pictures'
        try:
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS pictures (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    fullpath TEXT,
                    filename TEXT,
                    timestamp TEXT,
                    album_id INTEGER,
                    category_id INTEGER,
                    aspect_ratio TEXT,
                    inference_steps INTEGER,
                    lora_scale REAL,
                    strength REAL,
                    guidance REAL,
                    quality INTEGER,
                    FOREIGN KEY (album_id) REFERENCES albums(id),
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                )
            """)
            print("Tabelle 'pictures' wurde erfolgreich erstellt.")
        except sqlite3.OperationalError as e:
            print(f"Fehler beim Erstellen der Tabelle 'pictures': {e}")

        # Neue Felder zur Tabelle 'pictures' hinzufügen, falls sie noch nicht existieren
        new_fields = [
            ("fullpath", "TEXT"),
            ("filename", "TEXT"),
            ("aspect_ratio", "TEXT"),
            ("inference_steps", "INTEGER"),
            ("lora_scale", "REAL"),
            ("strength", "REAL"),
            ("guidance", "REAL"),
            ("quality", "INTEGER")
        ]

        for field_name, field_type in new_fields:
            if not column_exists(cursor, "pictures", field_name):
                try:
                    cursor.execute(f"ALTER TABLE pictures ADD COLUMN {field_name} {field_type}")
                    print(f"Feld '{field_name}' wurde erfolgreich hinzugefügt.")
                except sqlite3.OperationalError as e:
                    print(f"Fehler beim Hinzufügen des Feldes '{field_name}': {e}")
            else:
                print(f"Feld '{field_name}' existiert bereits.")

        conn.commit()

if __name__ == "__main__":
    update_database()