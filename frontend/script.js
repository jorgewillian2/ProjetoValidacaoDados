(() => {
  // URL da sua planilha
  const SHEET_URL     = 'https://api.sheetbest.com/sheets/SUA_CHAVE_AQUI';

  // Referências de elementos
  const loginForm     = document.getElementById('login-form');
  const loginError    = document.getElementById('login-error');
  const loginCard     = document.getElementById('login');
  const logoutButton  = document.getElementById('logout-button');
  const main          = document.getElementById('main');

  const addForm       = document.getElementById('add-form');
  const searchInput   = document.getElementById('search-input');
  const searchButton  = document.getElementById('search-button');

  const openImport    = document.getElementById('open-import');
  const importModal   = document.getElementById('import-modal');
  const closeImport   = document.getElementById('close-import');
  const dropArea      = document.getElementById('drop-area');
  const fileInput     = document.getElementById('import-file');
  const submitImport  = document.getElementById('submit-import');

  const editModal     = document.getElementById('edit-modal');
  const editForm      = document.getElementById('edit-form');
  const cancelEdit    = document.getElementById('cancel-edit');

  const toggleDataBtn = document.getElementById('toggle-data');
  const dataContainer = document.getElementById('data-container');

  // Spinner global
  const spinner = document.createElement('div');
  spinner.id = 'global-spinner';
  spinner.className = 'spinner hidden';
  document.body.appendChild(spinner);
  const showSpinner = () => spinner.classList.remove('hidden');
  const hideSpinner = () => spinner.classList.add('hidden');

  let editingIndex    = null;
  let selectedFile    = null;
  let dadosCarregados = [];

  document.addEventListener('DOMContentLoaded', () => {
    loginForm.addEventListener('submit', onLogin);
    logoutButton.addEventListener('click', onLogout);

    addForm.addEventListener('submit', onAdd);
    searchButton.addEventListener('click', debounce(filterClientTable, 300));
    searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') filterClientTable(); });

    initImportModal();
    initEditModal();
    document.getElementById('user-form').addEventListener('submit', onAddUser);

    toggleDataBtn.addEventListener('click', () => {
      if (dataContainer.style.display === 'none') {
        dataContainer.style.display = '';
        toggleDataBtn.textContent = 'Ocultar Dados';
      } else {
        dataContainer.style.display = 'none';
        toggleDataBtn.textContent = 'Mostrar Dados';
      }
    });

    if (sessionStorage.getItem('user')) {
      showMain();
    }
  });

  // Debounce utility
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // ─── Handlers de Login ────────────────────────────
  async function onLogin(e) {
    e.preventDefault();
    const btn = loginForm.querySelector('button[type=submit]');
    btn.disabled = true;
    showSpinner();
    try {
      const { username, password } = Object.fromEntries(new FormData(loginForm));
      const res = await fetch('/login', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erro no login');
      sessionStorage.setItem('user', username);
      sessionStorage.setItem('role', data.role);
      showMain();
    } catch(err) {
      loginError.textContent = err.message;
    } finally {
      btn.disabled = false;
      hideSpinner();
    }
  }

  function onLogout() {
    fetch('/logout', { method: 'POST', credentials: 'include' })
      .finally(() => {
        sessionStorage.clear();
        location.reload();
      });
  }

  // ─── Mostra/Oculta Telas ──────────────────────────
  function showMain() {
    loginCard.style.display = 'none';
    main.style.display      = 'block';
    if (sessionStorage.getItem('role') === 'admin') {
      document.getElementById('admin-panel').style.display = 'block';
      loadUsers();
    }
    loadData();
  }

  // ─── Usuários (Admin) ───────────────────────────
  async function loadUsers() {
    showSpinner();
    try {
      const res = await fetch('/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Falha ao listar usuários');
      const users = await res.json();
      const tbody = document.querySelector('#user-table tbody');
      tbody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.username}</td>
          <td>${u.role}</td>
          <td><button onclick="deleteUser('${u.username}')">Excluir</button></td>
        `;
        tbody.appendChild(tr);
      });
    } catch(err) {
      alert(err.message);
    } finally {
      hideSpinner();
    }
  }

  async function onAddUser(e) {
    e.preventDefault();
    const btn      = document.querySelector('#user-form button[type=submit]');
    const errorDiv = document.getElementById('user-error');
    errorDiv.textContent = '';
    btn.disabled = true;
    showSpinner();

    try {
      const data = Object.fromEntries(new FormData(e.target));
      const res  = await fetch('/users', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify(data)
      });

      const payload = await res.json();

      if (!res.ok) {
        console.error('Erro ao criar usuário:', payload);
        if (payload && typeof payload === 'object' && !payload.message) {
          const msgs = Object.entries(payload).map(
            ([field, msg]) => `${field}: ${ Array.isArray(msg) ? msg.join(', ') : msg }`
          );
          errorDiv.textContent = msgs.join(' — ');
        } else {
          errorDiv.textContent = payload.message || JSON.stringify(payload);
        }
        return;
      }

      e.target.reset();
      loadUsers();
    } catch (err) {
      console.error('Erro desconhecido ao criar usuário', err);
      errorDiv.textContent = 'Erro desconhecido ao criar usuário';
    } finally {
      btn.disabled = false;
      hideSpinner();
    }
  }

  window.deleteUser = async function(username) {
    if (!confirm('Confirmar exclusão de usuário?')) return;
    showSpinner();
    try {
      const res = await fetch(`/users/${username}`, {
        method:      'DELETE',
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Falha ao remover usuário');
      loadUsers();
    } catch(err) {
      alert(err.message);
    } finally {
      hideSpinner();
    }
  };

  // ─── Operações de Cliente ────────────────────────
  async function loadData() {
    showSpinner();
    try {
      const res = await fetch(SHEET_URL);
      if (!res.ok) throw new Error('Falha ao carregar dados');
      const data = await res.json();
      dadosCarregados = data;
      const tbody = document.querySelector('#data-table tbody');
      tbody.innerHTML = '';
      data.forEach((row,i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${row['Nome Completo']||''}</td>
          <td>${row['CPF']||''}</td>
          <td>${row['Numero']||''}</td>
          <td>
            <button class="btn-editar" onclick="openEditModal(${i})">Editar</button>
            <button onclick="deleteRow(${i})">Excluir</button>
          </td>`;
        tbody.appendChild(tr);
      });
    } catch(err) {
      alert(err.message);
    } finally {
      hideSpinner();
    }
  }

  async function onAdd(e) {
    e.preventDefault();
    const btn = addForm.querySelector('button[type=submit]');
    btn.disabled = true;
    showSpinner();
    try {
      const data = Object.fromEntries(new FormData(addForm));
      const res = await fetch(SHEET_URL, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error('Erro ao adicionar cliente');
      addForm.reset();
      loadData();
    } catch(err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      hideSpinner();
    }
  }

  window.deleteRow = async function(i) {
    if (!confirm('Confirmar exclusão?')) return;
    showSpinner();
    try {
      const res = await fetch(`${SHEET_URL}/${i}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      loadData();
    } catch(err) {
      alert(err.message);
    } finally {
      hideSpinner();
    }
  };

  function filterClientTable() {
    const v = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('#data-table tbody tr').forEach(tr => {
      const text = Array.from(tr.children).slice(0,3)
        .map(td=>td.textContent.toLowerCase())
        .join(' ');
      tr.style.display = text.includes(v) ? '' : 'none';
    });
  }

  // ─── Importação de Excel ─────────────────────────
  function initImportModal() {
    openImport.addEventListener('click', () => importModal.style.display = 'flex');
    closeImport.addEventListener('click', resetImportModal);
    ['dragenter','dragover'].forEach(ev =>
      dropArea.addEventListener(ev, e=>{e.preventDefault();dropArea.classList.add('dragover');})
    );
    ['dragleave','drop'].forEach(ev =>
      dropArea.addEventListener(ev, e=>{e.preventDefault();dropArea.classList.remove('dragover');})
    );
    dropArea.addEventListener('drop', e=> handleImportFile(e.dataTransfer.files[0]));
    dropArea.addEventListener('click', () => fileInput.click());
    document.getElementById('click-upload')
      .addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => handleImportFile(fileInput.files[0]));
    submitImport.addEventListener('click', processImport);
  }

  function handleImportFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx','xls'].includes(ext)) { alert('Formato inválido'); return; }
    selectedFile = file;
    dropArea.innerHTML = `<p>Arquivo: ${file.name}</p>`;
    submitImport.disabled = false;
  }

  async function processImport() {
    if (!selectedFile) return;
    submitImport.disabled = true;
    showSpinner();
    try {
      const reader = new FileReader();
      reader.onload = async evt => {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const required = ['Nome Completo','CPF','Numero'];
        if (!rows.length || !required.every(c=>rows[0].hasOwnProperty(c)))
          throw new Error('Template inválido');
        for (const row of rows) {
          const res = await fetch(SHEET_URL, {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify(row)
          });
          if (!res.ok) throw new Error('Erro na importação');
        }
        loadData();
        resetImportModal();
      };
      reader.readAsArrayBuffer(selectedFile);
    } catch(err) {
      alert(err.message);
      submitImport.disabled = false;
    } finally {
      hideSpinner();
    }
  }

  function resetImportModal() {
    importModal.style.display = 'none';
    dropArea.innerHTML = `
      <p>Arraste o arquivo aqui, ou
      <span id="click-upload">clicar para selecionar</span></p>`;
    fileInput.value = '';
    selectedFile = null;
    submitImport.disabled = true;
  }

  // ─── Edição de Clientes ─────────────────────────
  function initEditModal() {
    cancelEdit.addEventListener('click', () => {
      editModal.style.display = 'none';
      editingIndex = null;
    });
    editForm.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = editForm.querySelector('button[type=submit]');
      btn.disabled = true;
      showSpinner();
      try {
        const updated = {
          'Nome Completo': document.getElementById('edit-nome').value,
          'CPF':           document.getElementById('edit-cpf').value,
          'Numero':        document.getElementById('edit-numero').value
        };
        let res = await fetch(`${SHEET_URL}/${editingIndex}`, { method:'DELETE' });
        if (!res.ok) throw new Error('Falha ao atualizar');
        res = await fetch(SHEET_URL, {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(updated)
        });
        if (!res.ok) throw new Error('Falha ao criar nova versão');
        editModal.style.display = 'none';
        loadData();
      } catch(err) {
        alert(err.message);
      } finally {
        btn.disabled = false;
        hideSpinner();
      }
    });
  }

  window.openEditModal = function(index) {
    editingIndex = index;
    const row = dadosCarregados[index];
    document.getElementById('edit-index').value  = index;
    document.getElementById('edit-nome').value   = row['Nome Completo'];
    document.getElementById('edit-cpf').value    = row['CPF'];
    document.getElementById('edit-numero').value = row['Numero'];
    editModal.style.display = 'flex';
  };

})();
