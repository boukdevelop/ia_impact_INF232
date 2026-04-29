"""
database.py — Supporte PostgreSQL (production) et SQLite (local)
"""
import os, json

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL:
    import psycopg2, psycopg2.extras
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    def get_connection():
        return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    PH = "%s"
    IS_PG = True
else:
    import sqlite3
    from pathlib import Path
    DB_PATH = Path(__file__).parent / "iacam.db"
    def get_connection():
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn
    PH = "?"
    IS_PG = False


def init_db():
    conn = get_connection()
    if IS_PG:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS responses (
                id SERIAL PRIMARY KEY, pseudo TEXT DEFAULT 'Anonyme',
                age INTEGER NOT NULL, universite TEXT NOT NULL,
                filiere TEXT NOT NULL, niveau_etudes TEXT NOT NULL,
                score_academique INTEGER NOT NULL, connaissance_ia INTEGER NOT NULL,
                frequence_usage INTEGER NOT NULL, outils TEXT NOT NULL,
                contexte_usage TEXT NOT NULL, autonomie_sans_ia INTEGER NOT NULL,
                impact_notes INTEGER NOT NULL, remarque TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit(); cur.close()
    else:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT, pseudo TEXT DEFAULT 'Anonyme',
                age INTEGER NOT NULL, universite TEXT NOT NULL,
                filiere TEXT NOT NULL, niveau_etudes TEXT NOT NULL,
                score_academique INTEGER NOT NULL, connaissance_ia INTEGER NOT NULL,
                frequence_usage INTEGER NOT NULL, outils TEXT NOT NULL,
                contexte_usage TEXT NOT NULL, autonomie_sans_ia INTEGER NOT NULL,
                impact_notes INTEGER NOT NULL, remarque TEXT DEFAULT '',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP)""")
        conn.commit()
    conn.close()
    print(f"✅ BDD initialisée ({'PostgreSQL' if IS_PG else 'SQLite'})")


def _exec(sql, params=(), one=True, write=False):
    conn = get_connection()
    if IS_PG:
        cur = conn.cursor()
        cur.execute(sql, params)
        if write:
            conn.commit()
            last_id = cur.fetchone()["id"] if "RETURNING" in sql else cur.rowcount
            cur.close(); conn.close()
            return last_id
        result = cur.fetchone() if one else cur.fetchall()
        cur.close(); conn.close()
        return [dict(r) for r in result] if not one else (dict(result) if result else None)
    else:
        cur = conn.execute(sql, params)
        if write:
            conn.commit()
            last_id = cur.lastrowid if "INSERT" in sql else cur.rowcount
            conn.close(); return last_id
        rows = cur.fetchone() if one else cur.fetchall()
        conn.close()
        if not one: return [dict(r) for r in rows]
        return dict(rows) if rows else None


def insert_response(data):
    outils = json.dumps(data.get("outils", []), ensure_ascii=False)
    vals = (data.get("pseudo","Anonyme"), data["age"], data["universite"],
            data["filiere"], data["niveau_etudes"], data["score_academique"],
            data["connaissance_ia"], data["frequence_usage"], outils,
            data["contexte_usage"], data["autonomie_sans_ia"],
            data["impact_notes"], data.get("remarque",""))
    ph = ",".join([PH]*13)
    ret = " RETURNING id" if IS_PG else ""
    new_id = _exec(f"INSERT INTO responses (pseudo,age,universite,filiere,niveau_etudes,score_academique,connaissance_ia,frequence_usage,outils,contexte_usage,autonomie_sans_ia,impact_notes,remarque) VALUES ({ph}){ret}", vals, write=True)
    return get_response_by_id(new_id)


def get_response_by_id(rid):
    row = _exec(f"SELECT * FROM responses WHERE id={PH}", (rid,))
    return _fix(row) if row else None


def get_all_responses():
    rows = _exec("SELECT * FROM responses ORDER BY created_at DESC", one=False)
    return [_fix(r) for r in rows]


def get_stats():
    def s(sql): return _exec(sql)
    total = s("SELECT COUNT(*) as c FROM responses")
    if not total: return {"total": 0}
    total = total["c"]
    if total == 0: return {"total": 0}
    avg_u  = float(s("SELECT ROUND(AVG(frequence_usage)::numeric,2) as v FROM responses")["v"] if IS_PG else s("SELECT ROUND(AVG(frequence_usage),2) as v FROM responses")["v"])
    avg_a  = float(s("SELECT ROUND(AVG(autonomie_sans_ia)::numeric,2) as v FROM responses")["v"] if IS_PG else s("SELECT ROUND(AVG(autonomie_sans_ia),2) as v FROM responses")["v"])
    dep    = s("SELECT COUNT(*) as c FROM responses WHERE frequence_usage>=4 AND autonomie_sans_ia<=2")["c"]
    aug    = s("SELECT COUNT(*) as c FROM responses WHERE frequence_usage>=4 AND autonomie_sans_ia>=4")["c"]
    ind    = s("SELECT COUNT(*) as c FROM responses WHERE frequence_usage<=2 AND autonomie_sans_ia>=4")["c"]
    univs  = _exec("SELECT universite, ROUND(AVG(frequence_usage)::numeric,2) as avg_u, COUNT(*) as cnt FROM responses GROUP BY universite ORDER BY avg_u DESC" if IS_PG else "SELECT universite, ROUND(AVG(frequence_usage),2) as avg_u, COUNT(*) as cnt FROM responses GROUP BY universite ORDER BY avg_u DESC", one=False)
    impacts= _exec("SELECT niveau_etudes, impact_notes, COUNT(*) as cnt FROM responses GROUP BY niveau_etudes, impact_notes", one=False)
    scat   = _exec("SELECT score_academique as x, frequence_usage as y FROM responses", one=False)
    return {
        "total": total, "avg_usage": avg_u, "avg_autonomy": avg_a,
        "pct_dependants": round((dep/total)*100),
        "profils": {"ia_dependants":dep,"augmented":aug,"independent":ind,"mixed":total-dep-aug-ind},
        "by_universite": [{"universite":r["universite"],"avg_usage":float(r["avg_u"]),"count":r["cnt"]} for r in univs],
        "impact_by_niveau": [{"niveau":r["niveau_etudes"],"impact":r["impact_notes"],"count":r["cnt"]} for r in impacts],
        "scatter": [{"x":r["x"],"y":r["y"]} for r in scat]
    }


def delete_all_responses():
    return _exec("DELETE FROM responses", write=True)


def _fix(d):
    if isinstance(d.get("outils"), str):
        try: d["outils"] = json.loads(d["outils"])
        except: d["outils"] = []
    return d