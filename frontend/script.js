// frontend/script.js

// URL da sua planilha
const SHEET_URL = 'https://api.sheetbest.com/sheets/SUA_CHAVE_AQUI';

// Referências de elementos
const loginForm    = document.getElementById("login-form");
const loginError   = document.getElementById("login-error");
const loginCard    = document.getElementById("login");
const logoutButton = document.getElementById("logout-button");
const main         = document.getElementById("main");

const addForm      = document.getElementById("add-form");
const searchInput  = document.getElementById("search-input");
const searchButton = document.getElementById("search-button");

const openImport   = document.getElementById('open-import');
const importModal  = document.getElementById('import-modal');
const closeImport  = document.getElementById('close-import');
const dropArea     = document.getElementById('drop-area');
const fileInput    = document.getElementById('import-file');
const submitImport = document.getElementById('submit-import');

const editModal    = document.getElementById('edit-modal');
const editForm     = document.getElementById('edit-form');
const cancelEdit   = document.getElementById('cancel-edit');

let editingIndex = null;
let selectedFile = null;

// Inicialização
;(function init() {
  // Login/logout
  loginForm.addEventListener("submit", onLogin);
  logoutButton.addEventListener("click", onLogout);

  // Operações de cliente
  addForm.addEventListener("submit", onAdd);
  searchButton.addEventListener("click", filterClientTable);
  searchInput.addEventListener("keyup", e => { if (e.key === "Enter") filterClientTable(); });

  // Importação Excel
  initImportModal();

  // Edição de clientes
  initEditModal();

  // Gerenciamento de usuários
  document.getElementById("user-form").addEventListener("submit", onAddUser);

  // Se já logado, mostra main
  if (sessionStorage.getItem("user")) {
    showMain();
  }
})();

// ─── Handlers de Login ─────────────────────────────────
async function onLogin(e) {
  e.preventDefault();
  const { username, password } = Object.fromEntries(new FormData(loginForm));
  try {
    const res = await fetch("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok) {
      sessionStorage.setItem("user", username);
      sessionStorage.setItem("role", data.role);
      showMain();
    } else {
      loginError.textContent = data.message || "Usuário ou senha inválidos.";
    }
  } catch(err) {
    console.error(err);
    loginError.textContent = "Erro de conexão.";
  }
}

function onLogout() {
  sessionStorage.clear();
  location.reload();
}

// ─── Mostra/Oculta Telas ───────────────────────────────
function showMain() {
  loginCard.style.display = "none";
  main.style.display      = "block";
  if (sessionStorage.getItem("role") === "admin") {
    document.getElementById("admin-panel").style.display = "block";
    loadUsers();
  }
  loadData();
}

// ─── Operações de Cliente ──────────────────────────────
async function loadData() {
  try {
    const res = await fetch(SHEET_URL);
    const data = await res.json();
    const tbody = document.querySelector("#data-table tbody");
    tbody.innerHTML = "";
    data.forEach((row, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${row["Nome Completo"]||""}</td>
        <td>${row["CPF"]||""}</td>
        <td>${row["Numero"]||""}</td>
        <td>
          <button class="btn-editar" onclick="openEditModal(${i})">Editar</button>
          <button onclick="deleteRow(${i})">Excluir</button>
        </td>`;
      tbody.appendChild(tr);
    });
  } catch(err) {
    console.error("loadData:", err);
  }
}

async function onAdd(e) {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(addForm));
  await fetch(SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  addForm.reset();
  loadData();
}

window.deleteRow = async function(i) {
  await fetch(`${SHEET_URL}/${i}`, { method: "DELETE" });
  loadData();
}

// ─── Busca ──────────────────────────────────────────────
function filterClientTable() {
  const v = searchInput.value.toLowerCase().trim();
  document.querySelectorAll("#data-table tbody tr").forEach(tr => {
    const text = Array.from(tr.children).slice(0,3)
      .map(td => td.textContent.toLowerCase()).join(" ");
    tr.style.display = text.includes(v) ? "" : "none";
  });
}

// ─── Importação de Excel ───────────────────────────────
function initImportModal() {
  openImport.addEventListener("click", () => importModal.style.display = "flex");
  closeImport.addEventListener("click", resetImportModal);

  ["dragenter","dragover"].forEach(ev =>
    dropArea.addEventListener(ev, e => { e.preventDefault(); dropArea.classList.add("dragover"); })
  );
  ["dragleave","drop"].forEach(ev =>
    dropArea.addEventListener(ev, e => { e.preventDefault(); dropArea.classList.remove("dragover"); })
  );
  dropArea.addEventListener("drop", e => handleImportFile(e.dataTransfer.files[0]));
  dropArea.addEventListener("click", () => fileInput.click());
  document.getElementById("click-upload").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleImportFile(fileInput.files[0]));
  submitImport.addEventListener("click", processImport);
}

function handleImportFile(file) {
  if (!file) return;
  const ext = file.name.split(".").pop().toLowerCase();
  if (!["xlsx","xls"].includes(ext)) {
    alert("Formato inválido. Use .xlsx ou .xls"); return;
  }
  selectedFile = file;
  dropArea.innerHTML = `<p>Arquivo: ${file.name}</p>`;
  submitImport.disabled = false;
}

async function processImport() {
  if (!selectedFile) return;
  const reader = new FileReader();
  reader.onload = async evt => {
    const data = new Uint8Array(evt.target.result);
    const wb   = XLSX.read(data, { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
    const required = ["Nome Completo","CPF","Numero"];
    if (!rows.length || !required.every(c=>rows[0].hasOwnProperty(c))) {
      alert("Modelo inválido. Use o template."); return;
    }
    for (const row of rows) {
      await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify(row)
      });
    }
    loadData();
    resetImportModal();
  };
  reader.readAsArrayBuffer(selectedFile);
}

function resetImportModal() {
  importModal.style.display = "none";
  dropArea.innerHTML = '<p>Arraste o arquivo aqui, ou <span id="click-upload">clicar para selecionar</span></p>';
  fileInput.value     = "";
  selectedFile        = null;
  submitImport.disabled = true;
}

// ─── Edição de Clientes ────────────────────────────────
function initEditModal() {
  cancelEdit.addEventListener("click", () => {
    editModal.style.display = "none";
    editingIndex = null;
  });
  editForm.addEventListener("submit", async e => {
    e.preventDefault();
    const updated = {
      "Nome Completo": document.getElementById("edit-nome").value,
      "CPF": document.getElementById("edit-cpf").value,
      "Numero": document.getElementById("edit-numero").value
    };
    await fetch(`${SHEET_URL}/${editingIndex}`, { method: "DELETE" });
    await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(updated)
    });
    editModal.style.display = "none";
    loadData();
  });
}

window.openEditModal = function(index) {
  const row = dadosCarregados[index];
  document.getElementById("edit-index").value = index;
  document.getElementById("edit-nome").value = row["Nome Completo"];
  document.getElementById("edit-cpf").value = row["CPF"];
  document.getElementById("edit-numero").value = row["Numero"];

  document.getElementById("edit-modal").style.display = "flex";
};


// ─── Usuários (Admin) ────────────────────────────────
async function onAddUser(e) {
  e.preventDefault();
  await fetch("/users", {
    method: "POST",
    body: new URLSearchParams(new FormData(e.target))
  });
  e.target.reset();
  loadUsers();
}

async function loadUsers() {
  const users = await (await fetch("/users")).json();
  const tbody = document.querySelector("#user-table tbody");
  tbody.innerHTML = "";
  users.forEach(u => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.username}</td>
      <td>${u.role}</td>
      <td><button onclick="deleteUser('${u.username}')">Excluir</button></td>`;
    tbody.appendChild(tr);
  });
}

window.deleteUser = async function(username) {
  await fetch(`/users/${username}`, { method: "DELETE" });
  loadUsers();
}
