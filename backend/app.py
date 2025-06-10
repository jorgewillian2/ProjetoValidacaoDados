import os
import sqlite3
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
DB_PATH = os.path.join(BASE_DIR, 'users.db')

app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path='',
    template_folder=FRONTEND_DIR
)
app.secret_key = 'segredo123'
CORS(app)

# =====================
# Inicialização do banco
# =====================
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL
        )
    ''')
    conn.commit()

    # Cria usuário padrão admin:123456 se não existir
    cursor.execute("SELECT * FROM users WHERE username = ?", ("admin",))
    if not cursor.fetchone():
        cursor.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            ("admin", generate_password_hash("123456"), "admin")
        )
        conn.commit()

    conn.close()

# =====================
# Rotas 
# =====================
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route("/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    password = data.get("password")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT password, role FROM users WHERE username = ?", (username,))
    result = cursor.fetchone()
    conn.close()

    if result and check_password_hash(result[0], password):
        session["username"] = username
        return jsonify({"message": "Login bem-sucedido", "role": result[1]})
    else:
        return jsonify({"message": "Usuário ou senha inválidos"}), 401

@app.route("/users", methods=["GET", "POST"])
def users():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    if request.method == "GET":
        cursor.execute("SELECT username, role FROM users")
        data = [{"username": row[0], "role": row[1]} for row in cursor.fetchall()]
        conn.close()
        return jsonify(data)

    data = request.form
    username = data.get("username")
    password = data.get("password")
    role = data.get("role", "user")

    if not username or not password:
        return jsonify({"message": "Campos obrigatórios"}), 400

    try:
        cursor.execute(
            "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
            (username, generate_password_hash(password), role)
        )
        conn.commit()
        return jsonify({"message": "Usuário criado com sucesso"}), 201
    except sqlite3.IntegrityError:
        return jsonify({"message": "Usuário já existe"}), 400
    finally:
        conn.close()

@app.route("/users/<username>", methods=["DELETE"])
def delete_user(username):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE username = ?", (username,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Usuário removido com sucesso"})

@app.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logout realizado com sucesso"})

# =====================
# Inicializa DB e roda app
# =====================
if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=8080, debug=True)
