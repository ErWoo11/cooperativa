// ============================================================
// SUPERADMINISTRADOR - Lógica del panel de gestión
// ============================================================
// Este archivo se carga DESPUÉS de app.js y añade:
//   - Gestión de colegios (escuelas)
//   - Gestión de clases (vinculadas a un colegio)
//   - Gestión de responsables (admin de cada clase)
//   - Login del superadmin con contraseña
//
// Acceso: añade ?superadmin=1 a la URL
// ============================================================

// Estado del superadmin
let superadminState = {
  isLogged: false,
  schools: [],
  classes: [],
  currentView: "dashboard",
  currentSchoolId: null,
  unsubscribeSchools: null,
  unsubscribeClasses: null,
};

// ============================================================
// UTILIDADES PROPIAS DEL SUPERADMIN
// ============================================================

async function hashPassword(password) {
  const salt = "coop-superadmin-salt-v1";
  const data = new TextEncoder().encode(salt + password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPassword(password, hash) {
  const computed = await hashPassword(password);
  if (computed.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================
// SESIÓN SUPERADMIN (sessionStorage)
// ============================================================

function hasSuperadminSession() {
  try {
    return Boolean(sessionStorage.getItem("superadmin_session"));
  } catch {
    return false;
  }
}

function setSuperadminSession() {
  try { sessionStorage.setItem("superadmin_session", String(Date.now())); } catch {}
}

function clearSuperadminSession() {
  try { sessionStorage.removeItem("superadmin_session"); } catch {}
}

// ============================================================
// CAPA DE DATOS - SUPERADMIN CONFIG
// ============================================================

async function getSuperadminConfig() {
  // Si hay contraseña fijada en firebase-config.js, esa tiene prioridad
  if (window.SUPERADMIN_PASSWORD) {
    return {
      passwordHash: await hashPassword(window.SUPERADMIN_PASSWORD),
      isFixed: true,
    };
  }

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const snap = await getDoc(doc(window.firestore, "superadmin", "config"));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      passwordHash: data.passwordHash,
      isFixed: false,
      createdAt: data.createdAt?.toMillis?.() || Date.now(),
    };
  }

  // Modo demo
  try {
    const raw = localStorage.getItem("coop_superadmin_config");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function setSuperadminConfig(password) {
  const passwordHash = await hashPassword(password);
  const config = { passwordHash, isFixed: false, createdAt: Date.now() };

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await setDoc(doc(window.firestore, "superadmin", "config"), {
      passwordHash,
      createdAt: serverTimestamp(),
    });
  } else {
    localStorage.setItem("coop_superadmin_config", JSON.stringify(config));
    window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_superadmin_config" } }));
  }

  return config;
}

async function changeSuperadminPassword(oldPassword, newPassword) {
  const config = await getSuperadminConfig();
  if (!config) throw new Error("No hay configuración de superadmin todavía.");

  if (config.isFixed) {
    throw new Error("La contraseña está fijada en firebase-config.js. Para cambiarla, edita ese archivo.");
  }

  const ok = await verifyPassword(oldPassword, config.passwordHash);
  if (!ok) throw new Error("La contraseña actual no es correcta.");

  await setSuperadminConfig(newPassword);
}

// ============================================================
// CAPA DE DATOS - COLEGIOS
// ============================================================

async function getSchools() {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { collection, getDocs, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const snap = await getDocs(query(collection(window.firestore, "schools"), orderBy("name")));
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        id: d.id,
        name: data.name,
        address: data.address,
        city: data.city,
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
      });
    });
    return list;
  }

  // Demo
  try {
    return JSON.parse(localStorage.getItem("coop_schools") || "[]");
  } catch {
    return [];
  }
}

function subscribeToSchools(cb) {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    let unsub = null;
    import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
      const q = query(collection(window.firestore, "schools"), orderBy("name"));
      unsub = onSnapshot(q, (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name,
            address: data.address,
            city: data.city,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          });
        });
        cb(list);
      });
    });
    return () => unsub && unsub();
  }

  // Demo
  const fetch = () => {
    try {
      cb(JSON.parse(localStorage.getItem("coop_schools") || "[]"));
    } catch { cb([]); }
  };
  fetch();
  return window.subscribeDemo ? window.subscribeDemo("coop_schools", fetch) : () => {};
}

async function createSchool(data) {
  const school = {
    id: generateSchoolId(),
    name: data.name.trim(),
    address: (data.address || "").trim() || null,
    city: (data.city || "").trim() || null,
    createdAt: Date.now(),
  };

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const ref = await addDoc(collection(window.firestore, "schools"), {
      name: school.name,
      address: school.address,
      city: school.city,
      createdAt: serverTimestamp(),
    });
    school.id = ref.id;
  } else {
    const schools = await getSchools();
    schools.push(school);
    localStorage.setItem("coop_schools", JSON.stringify(schools));
    window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_schools" } }));
  }

  return school;
}

async function updateSchool(id, updates) {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await updateDoc(doc(window.firestore, "schools", id), updates);
    return;
  }

  const schools = await getSchools();
  const idx = schools.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error("Colegio no encontrado");
  schools[idx] = { ...schools[idx], ...updates };
  localStorage.setItem("coop_schools", JSON.stringify(schools));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_schools" } }));
}

async function deleteSchool(id) {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, deleteDoc, collection, getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    // Eliminar las clases asociadas
    const classesSnap = await getDocs(query(collection(window.firestore, "classes"), where("schoolId", "==", id)));
    for (const classDoc of classesSnap.docs) {
      // Eliminar transacciones de cada clase
      const txSnap = await getDocs(collection(window.firestore, "classes", classDoc.id, "transactions"));
      for (const txDoc of txSnap.docs) {
        await deleteDoc(txDoc.ref);
      }
      await deleteDoc(classDoc.ref);
    }
    await deleteDoc(doc(window.firestore, "schools", id));
    return;
  }

  // Demo: eliminar clases y transacciones asociadas
  const classes = await getAllClassesForSuperadmin();
  const schoolClasses = classes.filter((c) => c.schoolId === id);
  for (const c of schoolClasses) {
    localStorage.removeItem(`coop_transactions_${c.code}`);
    localStorage.removeItem(`coop_class_${c.code}`);
  }
  const schools = await getSchools();
  const filtered = schools.filter((s) => s.id !== id);
  localStorage.setItem("coop_schools", JSON.stringify(filtered));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_schools" } }));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_classes" } }));
}

function generateSchoolId() {
  return "sch_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ============================================================
// CAPA DE DATOS - CLASES (para superadmin)
// ============================================================

async function getAllClassesForSuperadmin() {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { collection, getDocs, orderBy, query } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const snap = await getDocs(query(collection(window.firestore, "classes"), orderBy("createdAt", "desc")));
    const list = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        code: d.id,
        name: data.name,
        schoolId: data.schoolId,
        schoolName: data.schoolName,
        year: data.year,
        currency: data.currency || "EUR",
        adminPinHash: data.adminPinHash,
        adminName: data.adminName,
        adminEmail: data.adminEmail,
        openingBalance: data.openingBalance || 0,
        createdAt: data.createdAt?.toMillis?.() || Date.now(),
        updatedAt: data.updatedAt?.toMillis?.(),
      });
    });
    return list;
  }

  // Demo: recuperar todas las clases guardadas
  const all = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("coop_class_")) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        all.push(data);
      } catch {}
    }
  }
  return all.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function subscribeToAllClasses(cb) {
  if (window.FIREBASE_HABILITADO && window.firestore) {
    let unsub = null;
    import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(({ collection, onSnapshot, query, orderBy }) => {
      const q = query(collection(window.firestore, "classes"), orderBy("createdAt", "desc"));
      unsub = onSnapshot(q, (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            code: d.id,
            name: data.name,
            schoolId: data.schoolId,
            schoolName: data.schoolName,
            year: data.year,
            currency: data.currency || "EUR",
            adminPinHash: data.adminPinHash,
            adminName: data.adminName,
            adminEmail: data.adminEmail,
            openingBalance: data.openingBalance || 0,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          });
        });
        cb(list);
      });
    });
    return () => unsub && unsub();
  }

  const fetch = () => { getAllClassesForSuperadmin().then(cb); };
  fetch();
  return window.subscribeDemo ? window.subscribeDemo("coop_classes_all", fetch) : () => {};
}

async function createClassAsSuperadmin(data) {
  // El superadmin puede crear clases y asignar un responsable + PIN
  const code = (data.code || generateCodePublic()).trim().toUpperCase();
  const adminPinHash = await hashPinPublic(data.adminPin);

  // Verificar código único
  const existing = await getClassPublic(code);
  if (existing) {
    throw new Error(`El código ${code} ya existe. Usa otro.`);
  }

  // Buscar info del colegio
  let schoolName = null;
  if (data.schoolId) {
    const schools = await getSchools();
    const school = schools.find((s) => s.id === data.schoolId);
    if (school) schoolName = school.name;
  }

  const classInfo = {
    code,
    name: data.name.trim(),
    schoolId: data.schoolId || null,
    schoolName,
    year: (data.year || "").trim() || null,
    currency: data.currency || "EUR",
    adminPinHash,
    adminName: (data.adminName || "").trim() || null,
    adminEmail: (data.adminEmail || "").trim() || null,
    openingBalance: data.openingBalance ? parseFloat(data.openingBalance) : 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await setDoc(doc(window.firestore, "classes", code), {
      ...classInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    localStorage.setItem(`coop_class_${code}`, JSON.stringify(classInfo));
    window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: `coop_class_${code}` } }));
    window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_classes_all" } }));
  }

  return classInfo;
}

async function updateClassAsSuperadmin(code, updates) {
  const normalized = code.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, updateDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await updateDoc(doc(window.firestore, "classes", normalized), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const existing = await getClassPublic(normalized);
  if (!existing) throw new Error("Clase no encontrada");
  const updated = { ...existing, ...updates, updatedAt: Date.now() };
  localStorage.setItem(`coop_class_${normalized}`, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: `coop_class_${normalized}` } }));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_classes_all" } }));
}

async function deleteClassAsSuperadmin(code) {
  const normalized = code.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && window.firestore) {
    const { doc, deleteDoc, collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    // Eliminar transacciones
    const txSnap = await getDocs(collection(window.firestore, "classes", normalized, "transactions"));
    for (const txDoc of txSnap.docs) {
      await deleteDoc(txDoc.ref);
    }
    await deleteDoc(doc(window.firestore, "classes", normalized));
    return;
  }

  localStorage.removeItem(`coop_class_${normalized}`);
  localStorage.removeItem(`coop_transactions_${normalized}`);
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: `coop_class_${normalized}` } }));
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key: "coop_classes_all" } }));
}

async function resetClassPin(code, newPin) {
  const normalized = code.trim().toUpperCase();
  if (newPin.length < 4) throw new Error("El PIN debe tener al menos 4 dígitos.");
  const adminPinHash = await hashPinPublic(newPin);
  await updateClassAsSuperadmin(normalized, { adminPinHash });
}

// Helpers (algunos ya existen en app.js pero los reexportamos por si acaso)
function generateCodePublic() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function hashPinPublic(pin) {
  const salt = "coop-2024-salt-v1";
  const data = new TextEncoder().encode(salt + pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getClassPublic(code) {
  if (window.getClass) return window.getClass(code);
  return null;
}

// ============================================================
// RENDER: LOGIN SUPERADMIN
// ============================================================

async function renderSuperadminLogin() {
  const config = await getSuperadminConfig();
  const isFirstTime = !config;

  document.body.innerHTML = `
    <div class="superadmin-page">
      <div class="superadmin-login-card">
        <div class="superadmin-login-icon">${ICONS_SA.shield}</div>
        <h1>Panel del Superadministrador</h1>
        <p class="superadmin-login-desc">
          ${isFirstTime
            ? "Es la primera vez que accedes. Crea una contraseña para proteger el panel. Guárdala en un lugar seguro."
            : "Introduce la contraseña para acceder al panel de gestión."
          }
        </p>

        <form id="sa-login-form" class="sa-form">
          ${isFirstTime ? `
            <div class="field">
              <label class="label" for="sa-pass1">Nueva contraseña</label>
              <input class="input" type="password" id="sa-pass1" placeholder="Mínimo 6 caracteres" minlength="6" required autofocus />
            </div>
            <div class="field">
              <label class="label" for="sa-pass2">Repetir contraseña</label>
              <input class="input" type="password" id="sa-pass2" placeholder="Repite la contraseña" minlength="6" required />
            </div>
          ` : `
            <div class="field">
              <label class="label" for="sa-pass">Contraseña</label>
              <input class="input" type="password" id="sa-pass" placeholder="Tu contraseña" required autofocus />
            </div>
          `}
          <button type="submit" class="btn btn-primary btn-block btn-lg">${isFirstTime ? "Crear contraseña y entrar" : "Entrar"}</button>
          <a href="?" class="sa-back-link">${ICONS_SA.arrowLeft} Volver al inicio</a>
        </form>
      </div>
    </div>
  `;

  document.getElementById("sa-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.textContent = "Verificando…";

    try {
      if (isFirstTime) {
        const p1 = document.getElementById("sa-pass1").value;
        const p2 = document.getElementById("sa-pass2").value;
        if (p1.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres.");
        if (p1 !== p2) throw new Error("Las contraseñas no coinciden.");
        await setSuperadminConfig(p1);
        setSuperadminSession();
        superadminState.isLogged = true;
        showToast("Contraseña creada", "Ya puedes gestionar colegios y clases.");
        renderSuperadminApp();
      } else {
        const pass = document.getElementById("sa-pass").value;
        const ok = await verifyPassword(pass, config.passwordHash);
        if (!ok) throw new Error("Contraseña incorrecta.");
        setSuperadminSession();
        superadminState.isLogged = true;
        renderSuperadminApp();
      }
    } catch (err) {
      showToast("Error", err.message, "error");
      btn.disabled = false;
      btn.textContent = isFirstTime ? "Crear contraseña y entrar" : "Entrar";
    }
  });
}

// ============================================================
// RENDER: APP SUPERADMIN
// ============================================================

async function renderSuperadminApp() {
  superadminState.isLogged = true;

  // Suscribirse a cambios
  if (superadminState.unsubscribeSchools) superadminState.unsubscribeSchools();
  if (superadminState.unsubscribeClasses) superadminState.unsubscribeClasses();

  superadminState.unsubscribeSchools = subscribeToSchools((schools) => {
    superadminState.schools = schools;
    if (superadminState.isLogged) updateSuperadminContent();
  });

  superadminState.unsubscribeClasses = subscribeToAllClasses((classes) => {
    superadminState.classes = classes;
    if (superadminState.isLogged) updateSuperadminContent();
  });

  renderSuperadminShell();
}

function renderSuperadminShell() {
  document.body.innerHTML = `
    <div class="superadmin-page">
      <header class="sa-header">
        <div class="container sa-header-inner">
          <div class="sa-header-left">
            <div class="sa-header-logo">${ICONS_SA.shield}</div>
            <div>
              <h1>Panel Superadmin</h1>
              <div class="sa-header-sub">Gestión de colegios, clases y responsables</div>
            </div>
          </div>
          <div class="sa-header-right">
            <button class="btn btn-outline btn-sm" onclick="saOpenChangePassword()">${ICONS_SA.key} Cambiar contraseña</button>
            <button class="btn btn-outline btn-sm" onclick="saGoDashboard()" id="sa-nav-dashboard">Dashboard</button>
            <button class="btn btn-outline btn-sm" onclick="saGoSchools()" id="sa-nav-schools">Colegios</button>
            <button class="btn btn-outline btn-sm" onclick="saGoAllClasses()" id="sa-nav-all-classes">Todas las clases</button>
            <button class="btn btn-ghost btn-sm" onclick="saLogout()" style="color: var(--rojo-600);">
              ${ICONS_SA.logout} Salir
            </button>
          </div>
        </div>
      </header>

      <main class="container sa-main">
        <div id="sa-content"></div>
      </main>

      <footer class="sa-footer">
        <div class="container">
          <div class="sa-footer-inner">
            <div>${window.FIREBASE_HABILITADO ? "Conectado a Firestore" : "Modo demo (datos locales)"}</div>
            <div>Panel del superadmin · No compartir acceso</div>
          </div>
        </div>
      </footer>

      <div class="modal-overlay" id="sa-modal-overlay"></div>
    </div>
  `;

  // Vista inicial = dashboard
  superadminState.currentView = "dashboard";
  updateSuperadminContent();
}

function updateSuperadminContent() {
  const content = document.getElementById("sa-content");
  if (!content) return;

  switch (superadminState.currentView) {
    case "dashboard":
      content.innerHTML = renderSADashboard();
      break;
    case "schools":
      content.innerHTML = renderSASchoolsList();
      break;
    case "school-classes":
      content.innerHTML = renderSASchoolClasses(superadminState.currentSchoolId);
      break;
    case "all-classes":
      content.innerHTML = renderSAAllClasses();
      break;
    default:
      content.innerHTML = renderSADashboard();
  }

  // Update nav active
  document.querySelectorAll(".sa-header .btn").forEach((b) => b.classList.remove("btn-active"));
  const navId = `sa-nav-${superadminState.currentView === "school-classes" ? "schools" : superadminState.currentView}`;
  const navBtn = document.getElementById(navId);
  if (navBtn) navBtn.classList.add("btn-active");
}

// ============================================================
// VISTA: DASHBOARD
// ============================================================

function renderSADashboard() {
  const { schools, classes } = superadminState;
  const totalClasses = classes.length;
  const totalSchools = schools.length;
  const orphanClasses = classes.filter((c) => !c.schoolId).length;

  return `
    <div class="sa-section">
      <h2 class="sa-section-title">Resumen general</h2>
      <div class="sa-stats-grid">
        <div class="sa-stat-card sa-stat-primary">
          <div class="sa-stat-icon">${ICONS_SA.building}</div>
          <div class="sa-stat-value">${totalSchools}</div>
          <div class="sa-stat-label">Colegio${totalSchools !== 1 ? "s" : ""} registrado${totalSchools !== 1 ? "s" : ""}</div>
        </div>
        <div class="sa-stat-card sa-stat-success">
          <div class="sa-stat-icon">${ICONS_SA.graduation}</div>
          <div class="sa-stat-value">${totalClasses}</div>
          <div class="sa-stat-label">Clase${totalClasses !== 1 ? "s" : ""} activa${totalClasses !== 1 ? "s" : ""}</div>
        </div>
        <div class="sa-stat-card sa-stat-warning">
          <div class="sa-stat-icon">${ICONS_SA.users}</div>
          <div class="sa-stat-value">${classes.filter((c) => c.adminName).length}</div>
          <div class="sa-stat-label">Responsables asignados</div>
        </div>
        <div class="sa-stat-card ${orphanClasses > 0 ? "sa-stat-danger" : "sa-stat-neutral"}">
          <div class="sa-stat-icon">${ICONS_SA.alert}</div>
          <div class="sa-stat-value">${orphanClasses}</div>
          <div class="sa-stat-label">Sin colegio asignado</div>
        </div>
      </div>
    </div>

    <div class="sa-quick-actions">
      <h3 class="sa-section-title">Acciones rápidas</h3>
      <div class="sa-actions-grid">
        <button class="sa-action-card" onclick="saOpenSchoolForm()">
          <div class="sa-action-icon">${ICONS_SA.plus}</div>
          <div class="sa-action-text">
            <div class="sa-action-title">Crear colegio</div>
            <div class="sa-action-desc">Registra un nuevo colegio en el sistema</div>
          </div>
        </button>
        <button class="sa-action-card" onclick="saOpenClassForm(null)">
          <div class="sa-action-icon">${ICONS_SA.plus}</div>
          <div class="sa-action-text">
            <div class="sa-action-title">Crear clase</div>
            <div class="sa-action-desc">Crea una clase y asigna un responsable y un PIN</div>
          </div>
        </button>
        <button class="sa-action-card" onclick="saGoSchools()">
          <div class="sa-action-icon">${ICONS_SA.building}</div>
          <div class="sa-action-text">
            <div class="sa-action-title">Ver colegios</div>
            <div class="sa-action-desc">Gestiona los colegios existentes</div>
          </div>
        </button>
        <button class="sa-action-card" onclick="saGoAllClasses()">
          <div class="sa-action-icon">${ICONS_SA.list}</div>
          <div class="sa-action-text">
            <div class="sa-action-title">Ver todas las clases</div>
            <div class="sa-action-desc">Consulta todas las clases de todos los colegios</div>
          </div>
        </button>
      </div>
    </div>

    ${schools.length > 0 ? `
      <div class="sa-section">
        <h3 class="sa-section-title">Colegios recientes</h3>
        <div class="sa-schools-grid">
          ${schools.slice(0, 6).map((s) => {
            const numClasses = classes.filter((c) => c.schoolId === s.id).length;
            return `
              <div class="sa-school-card" onclick="saGoSchoolClasses('${s.id}')">
                <div class="sa-school-card-header">
                  <div class="sa-school-icon">${ICONS_SA.building}</div>
                  <div class="sa-school-info">
                    <div class="sa-school-name">${escapeHtmlPublic(s.name)}</div>
                    <div class="sa-school-meta">${escapeHtmlPublic(s.city || "Sin ciudad")}</div>
                  </div>
                </div>
                <div class="sa-school-card-body">
                  <div class="sa-school-stat">
                    <span class="sa-school-stat-num">${numClasses}</span>
                    <span class="sa-school-stat-label">clase${numClasses !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    ` : `
      <div class="sa-empty-state">
        <div class="sa-empty-icon">${ICONS_SA.building}</div>
        <h3>No hay colegios todavía</h3>
        <p>Crea tu primer colegio para empezar a organizar las clases.</p>
        <button class="btn btn-primary" onclick="saOpenSchoolForm()">Crear primer colegio</button>
      </div>
    `}
  `;
}

// ============================================================
// VISTA: LISTA DE COLEGIOS
// ============================================================

function renderSASchoolsList() {
  const { schools, classes } = superadminState;

  if (schools.length === 0) {
    return `
      <div class="sa-section">
        <div class="sa-section-header">
          <h2 class="sa-section-title">Colegios</h2>
          <button class="btn btn-primary btn-sm" onclick="saOpenSchoolForm()">${ICONS_SA.plus} Crear colegio</button>
        </div>
        <div class="sa-empty-state">
          <div class="sa-empty-icon">${ICONS_SA.building}</div>
          <h3>Aún no hay colegios</h3>
          <p>Empieza creando tu primer colegio. Luego podrás añadir clases y asignar responsables.</p>
          <button class="btn btn-primary" onclick="saOpenSchoolForm()">Crear primer colegio</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="sa-section">
      <div class="sa-section-header">
        <h2 class="sa-section-title">Colegios (${schools.length})</h2>
        <button class="btn btn-primary btn-sm" onclick="saOpenSchoolForm()">${ICONS_SA.plus} Crear colegio</button>
      </div>
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Ciudad</th>
              <th>Dirección</th>
              <th>Clases</th>
              <th class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${schools.map((s) => {
              const numClasses = classes.filter((c) => c.schoolId === s.id).length;
              return `
                <tr>
                  <td>
                    <div class="sa-cell-strong">${escapeHtmlPublic(s.name)}</div>
                  </td>
                  <td>${escapeHtmlPublic(s.city || "—")}</td>
                  <td>${escapeHtmlPublic(s.address || "—")}</td>
                  <td><span class="badge badge-success">${numClasses}</span></td>
                  <td class="text-right">
                    <div class="sa-row-actions">
                      <button class="btn btn-outline btn-sm" onclick="saGoSchoolClasses('${s.id}')">Ver clases</button>
                      <button class="btn btn-ghost btn-sm" onclick="saOpenSchoolForm('${s.id}')">${ICONS_SA.pencil}</button>
                      <button class="btn btn-ghost btn-sm sa-danger-btn" onclick="saOpenDeleteSchool('${s.id}')">${ICONS_SA.trash}</button>
                    </div>
                  </td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================
// VISTA: CLASES DE UN COLEGIO
// ============================================================

function renderSASchoolClasses(schoolId) {
  const school = superadminState.schools.find((s) => s.id === schoolId);
  if (!school) {
    return `
      <div class="sa-section">
        <div class="sa-section-header">
          <h2 class="sa-section-title">Colegio no encontrado</h2>
          <button class="btn btn-outline btn-sm" onclick="saGoSchools()">Volver</button>
        </div>
        <p>El colegio que buscas ya no existe.</p>
      </div>
    `;
  }

  const schoolClasses = superadminState.classes.filter((c) => c.schoolId === schoolId);

  return `
    <div class="sa-section">
      <div class="sa-section-header">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="saGoSchools()" style="margin-bottom: 0.5rem;">${ICONS_SA.arrowLeft} Volver a colegios</button>
          <h2 class="sa-section-title">${escapeHtmlPublic(school.name)}</h2>
          <div class="sa-section-sub">${escapeHtmlPublic(school.address || "")}${school.city ? ` · ${escapeHtmlPublic(school.city)}` : ""} · ${schoolClasses.length} clase${schoolClasses.length !== 1 ? "s" : ""}</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="saOpenClassForm('${schoolId}')">${ICONS_SA.plus} Crear clase</button>
      </div>

      ${schoolClasses.length === 0 ? `
        <div class="sa-empty-state">
          <div class="sa-empty-icon">${ICONS_SA.graduation}</div>
          <h3>Este colegio no tiene clases</h3>
          <p>Crea la primera clase para este colegio y asígnale un responsable.</p>
          <button class="btn btn-primary" onclick="saOpenClassForm('${schoolId}')">Crear primera clase</button>
        </div>
      ` : `
        <div class="sa-table-wrap">
          <table class="sa-table">
            <thead>
              <tr>
                <th>Clase</th>
                <th>Código</th>
                <th>Curso</th>
                <th>Responsable</th>
                <th class="text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${schoolClasses.map((c) => renderSAClassRow(c)).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

// ============================================================
// VISTA: TODAS LAS CLASES
// ============================================================

function renderSAAllClasses() {
  const { classes, schools } = superadminState;

  if (classes.length === 0) {
    return `
      <div class="sa-section">
        <div class="sa-section-header">
          <h2 class="sa-section-title">Todas las clases</h2>
          <button class="btn btn-primary btn-sm" onclick="saOpenClassForm(null)">${ICONS_SA.plus} Crear clase</button>
        </div>
        <div class="sa-empty-state">
          <div class="sa-empty-icon">${ICONS_SA.graduation}</div>
          <h3>Aún no hay clases</h3>
          <p>Crea tu primera clase desde aquí o desde la página de un colegio.</p>
          <button class="btn btn-primary" onclick="saOpenClassForm(null)">Crear primera clase</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="sa-section">
      <div class="sa-section-header">
        <h2 class="sa-section-title">Todas las clases (${classes.length})</h2>
        <button class="btn btn-primary btn-sm" onclick="saOpenClassForm(null)">${ICONS_SA.plus} Crear clase</button>
      </div>
      <div class="sa-table-wrap">
        <table class="sa-table">
          <thead>
            <tr>
              <th>Clase</th>
              <th>Código</th>
              <th>Colegio</th>
              <th>Curso</th>
              <th>Responsable</th>
              <th class="text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${classes.map((c) => renderSAClassRow(c, true)).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderSAClassRow(c, showSchool = false) {
  return `
    <tr>
      <td><div class="sa-cell-strong">${escapeHtmlPublic(c.name)}</div></td>
      <td><span class="badge sa-code-badge">${c.code}</span></td>
      ${showSchool ? `<td>${escapeHtmlPublic(c.schoolName || "—")}</td>` : ""}
      <td>${escapeHtmlPublic(c.year || "—")}</td>
      <td>
        ${c.adminName ? `<div class="sa-cell-strong">${escapeHtmlPublic(c.adminName)}</div>${c.adminEmail ? `<div class="sa-cell-sub">${escapeHtmlPublic(c.adminEmail)}</div>` : ""}` : '<span class="sa-muted">Sin asignar</span>'}
      </td>
      <td class="text-right">
        <div class="sa-row-actions">
          <a class="btn btn-outline btn-sm" href="?c=${c.code}" target="_blank">Ver</a>
          <button class="btn btn-ghost btn-sm" onclick="saOpenClassForm(null, '${c.code}')" title="Editar">${ICONS_SA.pencil}</button>
          <button class="btn btn-ghost btn-sm" onclick="saOpenResetPin('${c.code}')" title="Resetear PIN">${ICONS_SA.key}</button>
          <button class="btn btn-ghost btn-sm sa-danger-btn" onclick="saOpenDeleteClass('${c.code}')" title="Eliminar">${ICONS_SA.trash}</button>
        </div>
      </td>
    </tr>
  `;
}

// ============================================================
// MODAL: CREAR / EDITAR COLEGIO
// ============================================================

function saOpenSchoolForm(schoolId = null) {
  const school = schoolId ? superadminState.schools.find((s) => s.id === schoolId) : null;
  const isEditing = Boolean(school);

  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal">
        <button class="modal-close" onclick="saCloseModal()">${ICONS_SA.x}</button>
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">${isEditing ? `${ICONS_SA.pencil} Editar colegio` : `${ICONS_SA.building} Crear colegio`}</h2>
          <p class="modal-description">${isEditing ? "Modifica los datos del colegio." : "Registra un nuevo colegio para organizar sus clases."}</p>
        </div>
        <div class="modal-body">
          <form id="sa-school-form">
            <div class="field">
              <label class="label" for="school-name">Nombre del colegio <span style="color: var(--rojo-600)">*</span></label>
              <input class="input" type="text" id="school-name" placeholder="p. ej. CEIP Miguel Hernández" value="${school ? escapeHtmlPublic(school.name) : ""}" required maxlength="100" autofocus />
            </div>
            <div class="field-row">
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="school-city">Ciudad</label>
                <input class="input" type="text" id="school-city" placeholder="p. ej. Madrid" value="${school ? escapeHtmlPublic(school.city || "") : ""}" maxlength="80" />
              </div>
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="school-address">Dirección</label>
                <input class="input" type="text" id="school-address" placeholder="p. ej. C/ Mayor 12" value="${school ? escapeHtmlPublic(school.address || "") : ""}" maxlength="120" />
              </div>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary" id="sa-school-submit">${isEditing ? "Guardar cambios" : "Crear colegio"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  document.getElementById("sa-school-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("school-name").value.trim();
    const city = document.getElementById("school-city").value.trim();
    const address = document.getElementById("school-address").value.trim();

    if (!name) { showToast("Falta el nombre", "Pon un nombre al colegio.", "error"); return; }

    const btn = document.getElementById("sa-school-submit");
    btn.disabled = true;
    btn.textContent = isEditing ? "Guardando…" : "Creando…";

    try {
      if (isEditing) {
        await updateSchool(schoolId, { name, city: city || null, address: address || null });
        showToast("Colegio actualizado", name);
      } else {
        await createSchool({ name, city, address });
        showToast("Colegio creado", name);
      }
      saCloseModal();
    } catch (err) {
      showToast("Error", err.message, "error");
      btn.disabled = false;
      btn.textContent = isEditing ? "Guardar cambios" : "Crear colegio";
    }
  });
}

// ============================================================
// MODAL: ELIMINAR COLEGIO
// ============================================================

async function saOpenDeleteSchool(schoolId) {
  const school = superadminState.schools.find((s) => s.id === schoolId);
  if (!school) return;
  const numClasses = superadminState.classes.filter((c) => c.schoolId === schoolId).length;

  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 28rem;">
      <div class="modal">
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title" style="color: var(--rojo-700);">${ICONS_SA.trash} Eliminar colegio</h2>
          <p class="modal-description">
            Vas a eliminar el colegio <strong>${escapeHtmlPublic(school.name)}</strong>${numClasses > 0 ? ` y sus <strong>${numClasses} clase${numClasses !== 1 ? "s" : ""}</strong> con todos sus movimientos.` : "."}
            <br>Esta acción <strong>no se puede deshacer</strong>.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="saConfirmDeleteSchool('${schoolId}')">${ICONS_SA.trash} Sí, eliminar</button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");
}

async function saConfirmDeleteSchool(schoolId) {
  try {
    await deleteSchool(schoolId);
    showToast("Colegio eliminado", "Se han borrado todas sus clases y movimientos.");
    saCloseModal();
  } catch (err) {
    showToast("Error", err.message, "error");
  }
}

// ============================================================
// MODAL: CREAR / EDITAR CLASE (CON RESPONSABLE Y PIN)
// ============================================================

function saOpenClassForm(schoolId = null, classCode = null) {
  const existingClass = classCode ? superadminState.classes.find((c) => c.code === classCode) : null;
  const isEditing = Boolean(existingClass);

  const schools = superadminState.schools;
  const currentSchoolId = schoolId || (existingClass && existingClass.schoolId) || (schools.length > 0 ? schools[0].id : "");

  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 32rem;">
      <div class="modal">
        <button class="modal-close" onclick="saCloseModal()">${ICONS_SA.x}</button>
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">${isEditing ? `${ICONS_SA.pencil} Editar clase` : `${ICONS_SA.graduation} Crear clase`}</h2>
          <p class="modal-description">${isEditing ? "Modifica los datos de la clase y del responsable." : "Crea una nueva clase y asigna un responsable. Se generará un código único."}</p>
        </div>
        <div class="modal-body">
          <form id="sa-class-form">
            <div class="field">
              <label class="label" for="class-name">Nombre de la clase <span style="color: var(--rojo-600)">*</span></label>
              <input class="input" type="text" id="class-name" placeholder="p. ej. 5º A - 2025/2026" value="${existingClass ? escapeHtmlPublic(existingClass.name) : ""}" required maxlength="80" autofocus />
            </div>

            <div class="field">
              <label class="label" for="class-school">Colegio</label>
              ${schools.length > 0 ? `
                <select class="select" id="class-school">
                  <option value="">— Sin colegio —</option>
                  ${schools.map((s) =>
                    `<option value="${s.id}" ${currentSchoolId === s.id ? "selected" : ""}>${escapeHtmlPublic(s.name)}</option>`
                  ).join("")}
                </select>
              ` : `
                <div class="sa-muted-box">No hay colegios. Crea uno primero o deja la clase sin colegio.</div>
              `}
            </div>

            <div class="field-row">
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="class-year">Curso escolar</label>
                <input class="input" type="text" id="class-year" placeholder="2025-2026" value="${existingClass ? escapeHtmlPublic(existingClass.year || "") : "2025-2026"}" maxlength="20" />
              </div>
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="class-currency">Moneda</label>
                <select class="select" id="class-currency">
                  ${Object.entries(MONEDAS).map(([code, sym]) =>
                    `<option value="${code}" ${existingClass && existingClass.currency === code ? "selected" : (!existingClass && code === "EUR" ? "selected" : "")}>${code} (${sym})</option>`
                  ).join("")}
                </select>
              </div>
            </div>

            ${!isEditing ? `
              <div class="field">
                <label class="label" for="class-opening">Saldo inicial (opcional)</label>
                <input class="input" type="number" step="0.01" min="0" inputmode="decimal" id="class-opening" placeholder="0,00" />
              </div>
            ` : ""}

            <div class="sa-form-section">
              <h3 class="sa-form-section-title">${ICONS_SA.user} Responsable de la clase</h3>
              <p class="sa-form-section-desc">La persona que gestionará los ingresos y gastos de esta clase con su PIN.</p>

              <div class="field-row">
                <div class="field" style="margin-bottom: 0;">
                  <label class="label" for="admin-name">Nombre del responsable</label>
                  <input class="input" type="text" id="admin-name" placeholder="p. ej. María (madre de Lucía)" value="${existingClass ? escapeHtmlPublic(existingClass.adminName || "") : ""}" maxlength="60" />
                </div>
                <div class="field" style="margin-bottom: 0;">
                  <label class="label" for="admin-email">Email del responsable</label>
                  <input class="input" type="email" id="admin-email" placeholder="maria@example.com" value="${existingClass ? escapeHtmlPublic(existingClass.adminEmail || "") : ""}" maxlength="120" />
                </div>
              </div>

              ${!isEditing ? `
                <div class="field" style="margin-bottom: 0; margin-top: 0.75rem;">
                  <label class="label" for="admin-pin">PIN del responsable <span style="color: var(--rojo-600)">*</span></label>
                  <input class="input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="admin-pin" placeholder="4-8 dígitos numéricos" required />
                  <p class="sa-help-text">El responsable usará este PIN para entrar al modo admin y gestionar movimientos.</p>
                </div>
              ` : `
                <div class="sa-info-box" style="margin-top: 0.75rem;">
                  ${ICONS_SA.info} El PIN del responsable no se muestra por seguridad. Para cambiarlo, usa el botón "Resetear PIN" en la lista de clases.
                </div>
              `}
            </div>

            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary" id="sa-class-submit">${isEditing ? "Guardar cambios" : "Crear clase"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  // Solo validar PIN numérico si existe
  const pinInput = document.getElementById("admin-pin");
  if (pinInput) {
    pinInput.addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "");
    });
  }

  document.getElementById("sa-class-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("class-name").value.trim();
    const schoolIdValue = document.getElementById("class-school") ? document.getElementById("class-school").value : null;
    const year = document.getElementById("class-year").value.trim();
    const currency = document.getElementById("class-currency").value;
    const adminName = document.getElementById("admin-name").value.trim();
    const adminEmail = document.getElementById("admin-email").value.trim();
    const opening = document.getElementById("class-opening");
    const adminPin = pinInput ? pinInput.value : "";

    if (!name) { showToast("Falta el nombre", "Pon un nombre a la clase.", "error"); return; }
    if (!isEditing && (!adminPin || adminPin.length < 4)) {
      showToast("PIN inválido", "El PIN debe tener al menos 4 dígitos.", "error");
      return;
    }

    const btn = document.getElementById("sa-class-submit");
    btn.disabled = true;
    btn.textContent = isEditing ? "Guardando…" : "Creando…";

    try {
      if (isEditing) {
        // Buscar nombre del colegio
        let schoolName = null;
        if (schoolIdValue) {
          const sch = schools.find((s) => s.id === schoolIdValue);
          if (sch) schoolName = sch.name;
        }
        await updateClassAsSuperadmin(classCode, {
          name, schoolId: schoolIdValue || null, schoolName,
          year: year || null, currency,
          adminName: adminName || null, adminEmail: adminEmail || null,
        });
        showToast("Clase actualizada", name);
      } else {
        const newClass = await createClassAsSuperadmin({
          name, schoolId: schoolIdValue || null,
          year, currency,
          adminName: adminName || null, adminEmail: adminEmail || null,
          openingBalance: opening ? parseFloat(opening.value.replace(",", ".")) : 0,
          adminPin,
        });
        showToast("Clase creada", `Código: ${newClass.code}`);
      }
      saCloseModal();
    } catch (err) {
      showToast("Error", err.message, "error");
      btn.disabled = false;
      btn.textContent = isEditing ? "Guardar cambios" : "Crear clase";
    }
  });
}

// ============================================================
// MODAL: ELIMINAR CLASE
// ============================================================

function saOpenDeleteClass(classCode) {
  const cls = superadminState.classes.find((c) => c.code === classCode);
  if (!cls) return;

  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 28rem;">
      <div class="modal">
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title" style="color: var(--rojo-700);">${ICONS_SA.trash} Eliminar clase</h2>
          <p class="modal-description">
            Vas a eliminar la clase <strong>${escapeHtmlPublic(cls.name)}</strong> (${cls.code})${cls.schoolName ? ` del colegio <strong>${escapeHtmlPublic(cls.schoolName)}</strong>` : ""} con todos sus movimientos registrados.
            <br>Esta acción <strong>no se puede deshacer</strong>.
          </p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
          <button class="btn btn-danger" onclick="saConfirmDeleteClass('${classCode}')">${ICONS_SA.trash} Sí, eliminar</button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");
}

async function saConfirmDeleteClass(classCode) {
  try {
    await deleteClassAsSuperadmin(classCode);
    showToast("Clase eliminada", "Se han borrado todos sus movimientos.");
    saCloseModal();
  } catch (err) {
    showToast("Error", err.message, "error");
  }
}

// ============================================================
// MODAL: RESETEAR PIN DE UNA CLASE
// ============================================================

function saOpenResetPin(classCode) {
  const cls = superadminState.classes.find((c) => c.code === classCode);
  if (!cls) return;

  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 28rem;">
      <div class="modal">
        <button class="modal-close" onclick="saCloseModal()">${ICONS_SA.x}</button>
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">${ICONS_SA.key} Resetear PIN de la clase</h2>
          <p class="modal-description">
            Asigna un nuevo PIN para la clase <strong>${escapeHtmlPublic(cls.name)}</strong> (${cls.code}). El responsable deberá usar este nuevo PIN para acceder al panel de administrador.
          </p>
        </div>
        <div class="modal-body">
          <form id="sa-reset-pin-form">
            <div class="field" style="margin-bottom: 0;">
              <label class="label" for="new-pin">Nuevo PIN (4-8 dígitos)</label>
              <input class="input input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="new-pin" placeholder="••••" required autofocus />
              <p class="sa-help-text">Recuerda comunicar el nuevo PIN al responsable.</p>
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Guardar nuevo PIN</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  document.getElementById("new-pin").addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  document.getElementById("sa-reset-pin-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const newPin = document.getElementById("new-pin").value;
    if (newPin.length < 4) {
      showToast("PIN demasiado corto", "Debe tener al menos 4 dígitos.", "error");
      return;
    }

    try {
      await resetClassPin(classCode, newPin);
      showToast("PIN actualizado", `Clase ${classCode}: nuevo PIN guardado.`);
      saCloseModal();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  });
}

// ============================================================
// MODAL: CAMBIAR CONTRASEÑA DEL SUPERADMIN
// ============================================================

function saOpenChangePassword() {
  const overlay = document.getElementById("sa-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 28rem;">
      <div class="modal">
        <button class="modal-close" onclick="saCloseModal()">${ICONS_SA.x}</button>
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">${ICONS_SA.key} Cambiar contraseña</h2>
          <p class="modal-description">Cambia la contraseña de acceso al panel del superadmin.</p>
        </div>
        <div class="modal-body">
          <form id="sa-change-pass-form">
            <div class="field">
              <label class="label" for="old-pass">Contraseña actual</label>
              <input class="input" type="password" id="old-pass" required autofocus />
            </div>
            <div class="field">
              <label class="label" for="new-pass">Nueva contraseña</label>
              <input class="input" type="password" id="new-pass" minlength="6" required placeholder="Mínimo 6 caracteres" />
            </div>
            <div class="field" style="margin-bottom: 0;">
              <label class="label" for="new-pass2">Repetir nueva contraseña</label>
              <input class="input" type="password" id="new-pass2" minlength="6" required />
            </div>
            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn btn-outline" onclick="saCloseModal()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Cambiar contraseña</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  document.getElementById("sa-change-pass-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const oldPass = document.getElementById("old-pass").value;
    const newPass = document.getElementById("new-pass").value;
    const newPass2 = document.getElementById("new-pass2").value;

    if (newPass.length < 6) { showToast("Demasiado corta", "La nueva contraseña debe tener al menos 6 caracteres.", "error"); return; }
    if (newPass !== newPass2) { showToast("No coinciden", "Las contraseñas nuevas no coinciden.", "error"); return; }

    try {
      await changeSuperadminPassword(oldPass, newPass);
      showToast("Contraseña cambiada", "Usa la nueva contraseña la próxima vez.");
      saCloseModal();
    } catch (err) {
      showToast("Error", err.message, "error");
    }
  });
}

// ============================================================
// HELPERS Y NAVEGACIÓN
// ============================================================

function escapeHtmlPublic(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function saCloseModal() {
  const overlay = document.getElementById("sa-modal-overlay");
  if (overlay) overlay.classList.remove("open");
}

function saGoDashboard() {
  superadminState.currentView = "dashboard";
  updateSuperadminContent();
}

function saGoSchools() {
  superadminState.currentView = "schools";
  updateSuperadminContent();
}

function saGoAllClasses() {
  superadminState.currentView = "all-classes";
  updateSuperadminContent();
}

function saGoSchoolClasses(schoolId) {
  superadminState.currentView = "school-classes";
  superadminState.currentSchoolId = schoolId;
  updateSuperadminContent();
}

async function saLogout() {
  if (!confirm("¿Cerrar sesión del panel superadmin?")) return;
  clearSuperadminSession();
  superadminState.isLogged = false;
  if (superadminState.unsubscribeSchools) superadminState.unsubscribeSchools();
  if (superadminState.unsubscribeClasses) superadminState.unsubscribeClasses();
  navigate("/");
}

// ============================================================
// ICONOS DEL SUPERADMIN
// ============================================================

const ICONS_SA = {
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  key: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  building: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/></svg>`,
  graduation: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1.912 1.912 0 0 0-.838-.838l-3.46-1.732-4.272-1.728a2.1 2.1 0 0 0-1.7 0l-4.27 1.728-3.46 1.732a1.912 1.912 0 0 0-.838.838"/><path d="M22 18 12 13 2 18l10 5 10-5Z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  user: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  list: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
  alert: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  info: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

// ============================================================
// INICIALIZACIÓN DEL SUPERADMIN
// ============================================================
// Esta función la llama app.js cuando la URL tiene ?superadmin=1
async function initSuperadmin() {
  // Hacer accesibles las funciones para onclick
  Object.assign(window, {
    saOpenSchoolForm, saOpenClassForm, saOpenDeleteSchool, saConfirmDeleteSchool,
    saOpenDeleteClass, saConfirmDeleteClass, saOpenResetPin, saOpenChangePassword,
    saCloseModal, saGoDashboard, saGoSchools, saGoAllClasses, saGoSchoolClasses,
    saLogout,
  });

  // Comprobar si ya hay sesión
  if (hasSuperadminSession()) {
    superadminState.isLogged = true;
    renderSuperadminApp();
  } else {
    await renderSuperadminLogin();
  }
}

// Hook para que app.js detecte la ruta ?superadmin=1
window.initSuperadmin = initSuperadmin;
