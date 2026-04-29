"""
app.py — Serveur Flask principal
API REST pour l'application IA-Cam

Routes :
  GET  /                      → Sert le frontend (index.html)
  GET  /api/responses         → Liste toutes les réponses
  POST /api/responses         → Enregistre une nouvelle réponse
  GET  /api/stats             → Statistiques agrégées (pour les graphiques)
  GET  /api/responses/<id>    → Une réponse spécifique
  DELETE /api/responses       → Efface toutes les réponses
"""

from flask import Flask, jsonify, request, render_template, abort
from flask_cors import CORS
import threading, time, requests, os
import database as db

# ── INITIALISATION ─────────────────────────────────────────────
app = Flask(
    __name__,
    static_folder="static",
    template_folder="templates"
)
CORS(app)  # Autorise les requêtes cross-origin (utile en dev)

# Initialiser la BDD au démarrage
db.init_db()


# ── ROUTE PRINCIPALE : sert le frontend ────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── API : RÉPONSES ─────────────────────────────────────────────

@app.route("/api/responses", methods=["GET"])
def list_responses():
    """Retourne toutes les réponses au format JSON."""
    responses = db.get_all_responses()
    return jsonify({
        "success": True,
        "count": len(responses),
        "data": responses
    })


@app.route("/api/responses", methods=["POST"])
def create_response():
    """
    Enregistre une nouvelle réponse.
    Attend un JSON avec les champs du formulaire.
    """
    payload = request.get_json(silent=True)
    if not payload:
        return jsonify({"success": False, "error": "Corps JSON manquant"}), 400

    # ── Validation des champs obligatoires ──
    required = [
        "age", "universite", "filiere", "niveau_etudes",
        "score_academique", "connaissance_ia", "frequence_usage",
        "outils", "contexte_usage", "autonomie_sans_ia", "impact_notes"
    ]
    missing = [f for f in required if f not in payload]
    if missing:
        return jsonify({
            "success": False,
            "error": f"Champs manquants : {', '.join(missing)}"
        }), 422

    # ── Validation des types et plages ──
    errors = []
    age = payload.get("age")
    if not isinstance(age, int) or not (16 <= age <= 40):
        errors.append("L'âge doit être un entier entre 16 et 40.")

    for field in ["score_academique", "connaissance_ia", "frequence_usage", "autonomie_sans_ia"]:
        val = payload.get(field)
        if not isinstance(val, int) or not (1 <= val <= 5):
            errors.append(f"'{field}' doit être entre 1 et 5.")

    if payload.get("impact_notes") not in [-2, -1, 0, 1, 2]:
        errors.append("'impact_notes' doit être entre -2 et 2.")

    if not isinstance(payload.get("outils"), list) or len(payload["outils"]) == 0:
        errors.append("'outils' doit être une liste non vide.")

    if errors:
        return jsonify({"success": False, "errors": errors}), 422

    # ── Insertion ──
    try:
        new_record = db.insert_response(payload)
        return jsonify({
            "success": True,
            "message": "Réponse enregistrée avec succès.",
            "data": new_record
        }), 201
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/api/responses/<int:response_id>", methods=["GET"])
def get_response(response_id):
    """Retourne une réponse spécifique par son ID."""
    record = db.get_response_by_id(response_id)
    if not record:
        return jsonify({"success": False, "error": "Réponse introuvable"}), 404
    return jsonify({"success": True, "data": record})


@app.route("/api/responses", methods=["DELETE"])
def clear_responses():
    """Efface toutes les réponses de la base de données."""
    deleted = db.delete_all_responses()
    return jsonify({
        "success": True,
        "message": f"{deleted} réponse(s) supprimée(s)."
    })


# ── API : STATISTIQUES ─────────────────────────────────────────

@app.route("/api/stats", methods=["GET"])
def get_stats():
    """
    Retourne les statistiques agrégées calculées côté Python/SQL.
    Le frontend n'a plus besoin de calculer quoi que ce soit.
    """
    stats = db.get_stats()
    
    # Calcul du top outil (nécessite de lire les outils)
    if stats.get("total", 0) > 0:
        all_responses = db.get_all_responses()
        tool_counts = {}
        for r in all_responses:
            for tool in r.get("outils", []):
                tool_counts[tool] = tool_counts.get(tool, 0) + 1
        
        stats["top_tool"] = max(tool_counts, key=tool_counts.get) if tool_counts else None
        stats["tools_distribution"] = dict(
            sorted(tool_counts.items(), key=lambda x: x[1], reverse=True)
        )
    else:
        stats["top_tool"] = None
        stats["tools_distribution"] = {}

    return jsonify({"success": True, "data": stats})


# ── GESTION DES ERREURS ────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    return jsonify({"success": False, "error": "Route introuvable"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"success": False, "error": "Méthode non autorisée"}), 405

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"success": False, "error": "Erreur interne du serveur"}), 500

# ── PING AUTOMATIQUEMENT ─────────────────────────────────────────────

def keep_alive():
    """Thread qui ping l'app elle-même toutes les 10 minutes."""
    # On attend 30s au démarrage que le serveur soit prêt
    time.sleep(30)
    url = os.environ.get("https://boukala-bonoko-franck-gabriel-24g2765.onrender.com/", "")
    if not url:
        return  # Ne ping rien en local
    while True:
        try:
            requests.get(f"{url}/api/stats", timeout=10)
            print("🔁 Keep-alive ping OK")
        except Exception as e:
            print(f"⚠️ Keep-alive raté : {e}")
        time.sleep(600)  # 10 minutes

# Démarre le thread en arrière-plan (daemon=True → s'arrête avec Flask)
threading.Thread(target=keep_alive, daemon=True).start()

# ── POINT D'ENTRÉE ─────────────────────────────────────────────
if __name__ == "__main__":
    print("━" * 50)
    print("🚀  Serveur IA-Cam démarré")
    print("🌐  Ouvrez : http://localhost:5000")
    print("📊  API    : http://localhost:5000/api/stats")
    print("━" * 50)
    app.run(debug=True, host="0.0.0.0", port=5000)
