import os
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from flask_sqlalchemy import SQLAlchemy
from marshmallow import Schema, ValidationError, fields, validate

# --- Configuração básica ---
BASE_DIR     = os.path.abspath(os.path.dirname(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, '..', 'frontend'))
DB_PATH      = os.path.join(BASE_DIR, 'users.db')

app = Flask(
    __name__,
    static_folder=FRONTEND_DIR,
    static_url_path='',
    template_folder=FRONTEND_DIR
)

# --- Segurança de cookies e CORS ---
app.secret_key = os.getenv('SECRET_KEY', 'substitua_por_um_valor_forte_em_producao')

# Em produção, force Secure; em dev (HTTP), desabilita para que o cookie seja enviado
if os.getenv('FLASK_ENV') == 'production':
    app.config['SESSION_COOKIE_SECURE'] = True
else:
    app.config['SESSION_COOKIE_SECURE'] = False

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
CORS(app, supports_credentials=True)

# --- SQLAlchemy ---
app.config['SQLALCHEMY_DATABASE_URI']        = f"sqlite:///{DB_PATH}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# --- Modelos ---
class User(db.Model):
    __tablename__ = 'users'
    id       = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(30), unique=True, nullable=False)
    password = db.Column(db.String(128), nullable=False)
    role     = db.Column(db.String(10), nullable=False, default='user')

# --- Schemas Marshmallow ---
class UserSchema(Schema):
    username = fields.Str(required=True, validate=validate.Length(min=3, max=30))
    password = fields.Str(required=True, validate=validate.Length(min=6))
    role     = fields.Str(validate=validate.OneOf(['user', 'admin']), load_default='user')

user_schema = UserSchema()

# --- Decorators ---
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('username'):
            return jsonify({'message': 'Login requerido'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if session.get('role') != 'admin':
            return jsonify({'message': 'Permissão negada'}), 403
        return f(*args, **kwargs)
    return decorated

# --- Rotas públicas ---
@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json() or {}
        creds = user_schema.load(data, partial=('role',))
    except ValidationError as err:
        return jsonify(err.messages), 400
    except Exception:
        return jsonify({'message': 'Erro no servidor'}), 500

    user = User.query.filter_by(username=creds['username']).first()
    if not user or not check_password_hash(user.password, creds['password']):
        return jsonify({'message': 'Usuário ou senha inválidos'}), 401

    session['username'] = user.username
    session['role']     = user.role
    return jsonify({'message': 'Login bem-sucedido', 'role': user.role})


@app.route('/logout', methods=['POST'])
@login_required
def logout():
    session.clear()
    return jsonify({'message': 'Logout realizado com sucesso'})

# --- Rotas Admin / Usuários ---
@app.route('/users', methods=['GET'])
@login_required
@admin_required
def list_users():
    users = User.query.with_entities(User.username, User.role).all()
    return jsonify([{'username': u.username, 'role': u.role} for u in users])


@app.route('/users', methods=['POST'])
@login_required
@admin_required
def create_user():
    try:
        data = request.get_json() or {}
        data = user_schema.load(data)
    except ValidationError as err:
        return jsonify(err.messages), 400
    except Exception:
        return jsonify({'message': 'Erro no servidor'}), 500

    if User.query.filter_by(username=data['username']).first():
        return jsonify({'message': 'Usuário já existe'}), 400

    try:
        new_user = User(
            username=data['username'],
            password=generate_password_hash(data['password']),
            role=data['role']
        )
        db.session.add(new_user)
        db.session.commit()
        return jsonify({'message': 'Usuário criado com sucesso'}), 201
    except Exception as e:
        app.logger.error(f'Erro ao criar usuário: {e}')
        db.session.rollback()
        return jsonify({'message': 'Erro no servidor'}), 500


@app.route('/users/<username>', methods=['DELETE'])
@login_required
@admin_required
def delete_user(username):
    if username == 'admin' or username == session.get('username'):
        return jsonify({'message': 'Operação não permitida'}), 403

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({'message': 'Usuário não encontrado'}), 404

    try:
        db.session.delete(user)
        db.session.commit()
        return jsonify({'message': 'Usuário removido com sucesso'})
    except Exception as e:
        app.logger.error(f'Erro ao remover usuário: {e}')
        db.session.rollback()
        return jsonify({'message': 'Erro no servidor'}), 500


# --- Bootstrap e run ---
if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        if not User.query.filter_by(username='admin').first():
            admin_pw = os.getenv('ADMIN_PASSWORD', '123456')
            admin = User(
                username='admin',
                password=generate_password_hash(admin_pw),
                role='admin'
            )
            db.session.add(admin)
            db.session.commit()
    # Debug habilitado somente se não for produção
    app.run(host='0.0.0.0', port=8080, debug=(os.getenv('FLASK_ENV')!='production'))
