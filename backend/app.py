from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import jwt
import datetime
import os
import sqlite3
import pandas as pd
import requests

# ============ CONFIG ============

from dotenv import load_dotenv
load_dotenv()

APP_ROOT = os.path.dirname(__file__)
DB_PATH = os.path.join(APP_ROOT, 'users.db')

SHEETBEST_URL = os.getenv("SHEETBEST_URL")
SECRET_KEY = os.getenv("SECRET_KEY", "sollo-secret")

app = Flask(__name__)
CORS(app)

# ============ BANCO DE DADOS ============

def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin','user'))
            )
        """)
        conn.commit()

        # cria admin padrão se não existir
        cursor.execute("SELECT * FROM users WHERE username = 'admin'")
        if not cursor.fetchone():
            cursor.execute("""
                INSERT INTO users (username, password_hash, role)
                VALUES (?, ?, ?)
            """, ('admin', generate_password_hash('admin123'), 'admin'))
            conn.commit()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ============ JWT ============

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if "Authorization" in request.headers:
            token = request.headers["Authorization"].split(" ")[1]
        if not token:
            return jsonify({"message": "Token ausente"}), 401
        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
            g.user = data
        except Exception:
            return jsonify({"message": "Token inválido"}), 401
        return f(*args, **kwargs)
    return decorated

# ============ ROTAS FRONTEND ============

@app.route("/")
def index():
    return send_from_directory("../frontend", "index.html")

@app.route("/<path:path>")
def frontend_files(path):
    return send_from_directory("../frontend", path)

# ============ LOGIN ============

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE username = ?", (username,))
    user = cursor.fetchone()
    conn.close()

    if user and check_password_hash(user["password_hash"], password):
        token = jwt.encode({
            "username": user["username"],
            "role": user["role"],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=2)
        }, SECRET_KEY, algorithm="HS256")
        return jsonify({"token": token, "role": user["role"]})
    return jsonify({"message": "Credenciais inválidas"}), 401

# ============ CRUD DE USUÁRIOS ============

@app.route("/usuarios", methods=["GET"])
@token_required
def listar_usuarios():
    if g.user["role"] != "admin":
        return jsonify({"message": "Acesso negado"}), 403
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role FROM users")
    users = [dict(u) for u in cursor.fetchall()]
    conn.close()
    return jsonify(users)

@app.route("/usuarios", methods=["POST"])
@token_required
def criar_usuario():
    if g.user["role"] != "admin":
        return jsonify({"message": "Acesso negado"}), 403

    data = request.json
    username = data.get("username")
    senha = data.get("password")
    role = data.get("role")

    if not all([username, senha, role]):
        return jsonify({"message": "Dados incompletos"}), 400

    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO users (username, password_hash, role)
            VALUES (?, ?, ?)
        """, (username, generate_password_hash(senha), role))
        conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"message": "Usuário já existe"}), 400
    finally:
        conn.close()

    return jsonify({"message": "Usuário criado"}), 201

@app.route("/usuarios/<int:id>", methods=["PATCH"])
@token_required
def editar_usuario(id):
    if g.user["role"] != "admin":
        return jsonify({"message": "Acesso negado"}), 403

    data = request.json
    conn = get_db()
    cursor = conn.cursor()

    if "password" in data:
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?",
                       (generate_password_hash(data["password"]), id))
    if "role" in data:
        cursor.execute("UPDATE users SET role = ? WHERE id = ?", (data["role"], id))

    conn.commit()
    conn.close()
    return jsonify({"message": "Usuário atualizado"})

@app.route("/usuarios/<int:id>", methods=["DELETE"])
@token_required
def deletar_usuario(id):
    if g.user["role"] != "admin":
        return jsonify({"message": "Acesso negado"}), 403
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Usuário excluído"})

# ============ ROTAS SHEETBEST ============

@app.route("/records", methods=["GET"])
@token_required
def listar():
    r = requests.get(SHEETBEST_URL)
    return jsonify(r.json())

@app.route("/records", methods=["POST"])
@token_required
def adicionar():
    r = requests.post(SHEETBEST_URL, json=request.json)
    return jsonify(r.json())

@app.route("/records/<int:index>", methods=["PATCH"])
@token_required
def editar(index):
    r = requests.patch(f"{SHEETBEST_URL}/{index}", json=request.json)
    return jsonify(r.json())

@app.route("/records/<int:index>", methods=["DELETE"])
@token_required
def excluir(index):
    if g.user["role"] != "admin":
        return jsonify({"message": "Apenas admin pode excluir"}), 403
    r = requests.delete(f"{SHEETBEST_URL}/{index}")
    return jsonify(r.json())

@app.route("/upload", methods=["POST"])
@token_required
def upload():
    if "file" not in request.files:
        return jsonify({"message": "Arquivo ausente"}), 400
    file = request.files["file"]
    df = pd.read_excel(file)
    records = df.to_dict(orient="records")
    success = 0
    for rec in records:
        r = requests.post(SHEETBEST_URL, json=rec)
        if r.ok:
            success += 1
    return jsonify({"message": f"{success} registros adicionados"})

# ============ INÍCIO DO APP ============

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=8080)
