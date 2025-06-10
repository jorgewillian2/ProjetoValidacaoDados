const SHEET_URL = 'https://api.sheetbest.com/sheets/6ce493a0-f0f3-403e-b910-cda5b3b9608c';
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const main = document.getElementById("main");
const loginCard = document.getElementById("login");
const logoutButton = document.getElementById("logout-button");

const user = sessionStorage.getItem("user");
if (user) showMain();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = e.target.username.value;
  const password = e.target.password.value;

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
    loginError.textContent = data.message || "Erro ao fazer login.";
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.clear();
  location.reload();
});

function showMain() {
  loginCard.style.display = "none";
  main.style.display = "block";

  if (sessionStorage.getItem("role") === "admin") {
    document.getElementById("admin-panel").style.display = "block";
    loadUsers();
  }

  loadData();
}

document.getElementById("add-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target));
  await fetch(SHEET_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  e.target.reset();
  loadData();
});

async function loadData() {
  const res = await fetch(SHEET_URL);
  const data = await res.json();
  const tbody = document.querySelector("#data-table tbody");
  tbody.innerHTML = "";

  data.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row["Nome Completo"] || ""}</td>
      <td>${row["CPF"] || ""}</td>
      <td>${row["Numero"] || ""}</td>
      <td><button onclick="deleteRow(${index})">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteRow(index) {
  await fetch(`${SHEET_URL}/${index}`, { method: "DELETE" });
  loadData();
}

document.getElementById("upload-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const file = e.target.file.files[0];
  if (!file) return alert("Selecione um arquivo Excel.");

  const reader = new FileReader();
  reader.onload = async function (e) {
    const workbook = XLSX.read(e.target.result, { type: "binary" });
    const sheetName = workbook.SheetNames[0];
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

    // Validação do modelo
    const requiredColumns = ["Nome Completo", "CPF", "Numero"];
    const isValid = requiredColumns.every(col => Object.keys(data[0]).includes(col));

    if (!isValid) {
      alert("Modelo inválido. Use colunas: 'Nome Completo', 'CPF', 'Numero'.");
      return;
    }

    for (const row of data) {
      await fetch(SHEET_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row)
      });
    }

    loadData();
  };
  reader.readAsBinaryString(file);
});

document.getElementById("user-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  await fetch("/users", {
    method: "POST",
    body: new URLSearchParams(form)
  });
  e.target.reset();
  loadUsers();
});

async function loadUsers() {
  const res = await fetch("/users");
  const users = await res.json();
  const tbody = document.querySelector("#user-table tbody");
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td><button onclick="deleteUser('${user.username}')">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteUser(username) {
  await fetch(`/users/${username}`, { method: "DELETE" });
  loadUsers();
}
