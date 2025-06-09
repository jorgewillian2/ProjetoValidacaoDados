let token = "";
let role = "";

document.getElementById("login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const [username, password] = [...e.target.elements].map(i => i.value);
  const res = await fetch("/login", {
    method: "POST",
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (res.ok) {
    token = data.token;
    role = data.role;
    document.getElementById("login").style.display = "none";
    document.getElementById("main").style.display = "block";
    if (role === "admin") document.getElementById("admin-panel").style.display = "block";
    loadData();
    if (role === "admin") loadUsers();
  } else {
    document.getElementById("login-error").innerText = data.message || "Erro ao logar";
  }
});

async function loadData() {
  const res = await fetch("/records", { headers: { 'Authorization': 'Bearer ' + token } });
  const data = await res.json();
  const tbody = document.querySelector("#data-table tbody");
  tbody.innerHTML = "";

  data.forEach((row, index) => {
    const tr = document.createElement("tr");

    ["Nome Completo", "CPF", "Numero"].forEach(field => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.value = row[field] || "";
      input.onchange = () => updateRecord(index, { [field]: input.value });
      td.appendChild(input);
      tr.appendChild(td);
    });

    const tdActions = document.createElement("td");
    if (role === "admin") {
      const del = document.createElement("button");
      del.innerText = "Excluir";
      del.onclick = () => deleteRecord(index);
      tdActions.appendChild(del);
    }
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });
}

async function updateRecord(index, data) {
  await fetch(`/records/${index}`, {
    method: "PATCH",
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

async function deleteRecord(index) {
  await fetch(`/records/${index}`, {
    method: "DELETE",
    headers: { 'Authorization': 'Bearer ' + token }
  });
  loadData();
}

document.getElementById("add-form").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  await fetch("/records", {
    method: "POST",
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  e.target.reset();
  loadData();
});

document.getElementById("upload-form").addEventListener("submit", async e => {
  e.preventDefault();
  const formData = new FormData(e.target);
  await fetch("/upload", {
    method: "POST",
    headers: { 'Authorization': 'Bearer ' + token },
    body: formData
  });
  e.target.reset();
  loadData();
});

async function loadUsers() {
  const res = await fetch("/usuarios", {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const data = await res.json();
  const tbody = document.querySelector("#user-table tbody");
  tbody.innerHTML = "";

  data.forEach(user => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td><button onclick="deleteUser(${user.id})">Excluir</button></td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteUser(id) {
  await fetch(`/usuarios/${id}`, {
    method: "DELETE",
    headers: { 'Authorization': 'Bearer ' + token }
  });
  loadUsers();
}

document.getElementById("user-form").addEventListener("submit", async e => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  await fetch("/usuarios", {
    method: "POST",
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  e.target.reset();
  loadUsers();
});


