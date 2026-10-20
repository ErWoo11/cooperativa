// ============================================================
// COOPERATIVA ESCOLAR - Lógica de la aplicación
// HTML + CSS + JS puro, con Firestore (o modo demo)
// ============================================================

// Cargar Firebase desde CDN si está configurado
let firebaseApp = null;
let firestore = null;

if (window.FIREBASE_HABILITADO) {
  // Firebase v10+ desde CDN (ES module)
  // Lo importamos dinámicamente
  import(
    "https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js"
  ).then(async (firebaseAppModule) => {
    const firebaseAppInit = firebaseAppModule.initializeApp;
    firebaseApp = firebaseAppInit(window.FIREBASE_CONFIG);

    const firestoreModule = await import(
      "https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js"
    );
    firestore = firestoreModule.getFirestore(firebaseApp);

    // Avisar a la app que Firebase está listo
    document.dispatchEvent(new CustomEvent("firebase-ready"));
  }).catch((err) => {
    console.error("Error cargando Firebase:", err);
    showToast(
      "No se pudo cargar Firebase",
      "Verifica tu conexión a internet. Mientras tanto se usa el modo demo.",
      "warning"
    );
  });
}

// ============================================================
// CONSTANTES Y CONFIG
// ============================================================

const CATEGORIAS = {
  material: { label: "Material escolar", color: "#10b981" },
  actividad: { label: "Actividad / Excursión", color: "#0ea5e9" },
  fiesta: { label: "Fiesta / Celebración", color: "#f59e0b" },
  limpieza: { label: "Limpieza / Higiene", color: "#8b5cf6" },
  papeleria: { label: "Papelería", color: "#ec4899" },
  transporte: { label: "Transporte", color: "#14b8a6" },
  otros: { label: "Otros", color: "#64748b" },
};

const MONEDAS = {
  EUR: "€", USD: "$", MXN: "$", ARS: "$", COP: "$",
  PEN: "S/", GBP: "£", CHF: "CHF",
};

const MESES_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const DEMO_CODE = "DEMO24";

// ============================================================
// UTILIDADES
// ============================================================

function formatCurrency(amount, currency = "EUR") {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    const sym = MONEDAS[currency] || "";
    return `${sym}${amount.toFixed(2)}`;
  }
}

function formatDate(ts) {
  return new Date(ts).toLocaleDateString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });
}

function formatRelative(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);

  if (sec < 60) return "hace unos segundos";
  if (min < 60) return `hace ${min} min`;
  if (hr < 24) return `hace ${hr} h`;
  if (day < 7) return `hace ${day} días`;
  return formatDate(ts);
}

function toDateInputValue(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fromDateInputValue(value) {
  return new Date(value + "T12:00:00").getTime();
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

async function hashPin(pin) {
  const salt = "coop-2024-salt-v1";
  const data = new TextEncoder().encode(salt + pin);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function verifyPin(pin, hash) {
  const computed = await hashPin(pin);
  if (computed.length !== hash.length) return false;
  let result = 0;
  for (let i = 0; i < computed.length; i++) {
    result |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================
// TOAST
// ============================================================

function showToast(title, desc = "", type = "info") {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type === "info" ? "" : type}`;
  toast.innerHTML = `
    <div class="toast-title">${escapeHtml(title)}</div>
    ${desc ? `<div class="toast-desc">${escapeHtml(desc)}</div>` : ""}
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = "opacity 0.2s, transform 0.2s";
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// ============================================================
// CAPA DE DATOS (Firestore o localStorage)
// ============================================================

const DEMO_PREFIX = "coop_";

function getDemoItem(key) {
  try {
    const raw = localStorage.getItem(DEMO_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setDemoItem(key, value) {
  localStorage.setItem(DEMO_PREFIX + key, JSON.stringify(value));
  // Avisar a otros listeners
  window.dispatchEvent(new CustomEvent("coop-storage-change", { detail: { key } }));
}

// Suscripciones activas en modo demo
const demoListeners = new Map();

function notifyDemoListeners(pattern) {
  const set = demoListeners.get(pattern);
  if (set) set.forEach((cb) => cb());
}

function subscribeDemo(pattern, cb) {
  if (!demoListeners.has(pattern)) demoListeners.set(pattern, new Set());
  demoListeners.get(pattern).add(cb);

  const handler = (e) => {
    if (e.detail?.key?.includes(pattern) || pattern.startsWith("class_")) {
      cb();
    }
  };
  window.addEventListener("coop-storage-change", handler);
  window.addEventListener("storage", handler);

  return () => {
    demoListeners.get(pattern)?.delete(cb);
    window.removeEventListener("coop-storage-change", handler);
    window.removeEventListener("storage", handler);
  };
}

// ---------- API de clases ----------

async function getClass(code) {
  const normalized = code.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && firestore) {
    const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const snap = await getDoc(doc(firestore, "classes", normalized));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      code: normalized,
      name: data.name,
      school: data.school,
      year: data.year,
      currency: data.currency || "EUR",
      adminPinHash: data.adminPinHash,
      adminName: data.adminName,
      adminEmail: data.adminEmail,
      openingBalance: data.openingBalance || 0,
      createdAt: data.createdAt?.toMillis?.() || Date.now(),
      updatedAt: data.updatedAt?.toMillis?.(),
    };
  }

  return getDemoItem(`class_${normalized}`);
}

async function createClass(data) {
  const code = (data.code || generateCode()).trim().toUpperCase();
  const adminPinHash = await hashPin(data.adminPin);

  const classInfo = {
    code,
    name: data.name.trim(),
    school: (data.school || "").trim() || undefined,
    year: (data.year || "").trim() || undefined,
    currency: data.currency || "EUR",
    adminPinHash,
    adminName: data.adminName || undefined,
    adminEmail: data.adminEmail || undefined,
    openingBalance: data.openingBalance || 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const existing = await getClass(code);
  if (existing) {
    throw new Error(`El código ${code} ya existe. Prueba con otro.`);
  }

  if (window.FIREBASE_HABILITADO && firestore) {
    const { doc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await setDoc(doc(firestore, "classes", code), {
      ...classInfo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else {
    setDemoItem(`class_${code}`, classInfo);
    notifyDemoListeners(`class_${code}`);
  }

  return classInfo;
}

function subscribeToClass(code, cb) {
  const normalized = code.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && firestore) {
    let unsub = null;
    import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(({ doc, onSnapshot }) => {
      unsub = onSnapshot(doc(firestore, "classes", normalized), (snap) => {
        if (!snap.exists()) { cb(null); return; }
        const data = snap.data();
        cb({
          code: normalized,
          name: data.name,
          school: data.school,
          year: data.year,
          currency: data.currency || "EUR",
          adminPinHash: data.adminPinHash,
          adminName: data.adminName,
          adminEmail: data.adminEmail,
          openingBalance: data.openingBalance || 0,
          createdAt: data.createdAt?.toMillis?.() || Date.now(),
          updatedAt: data.updatedAt?.toMillis?.(),
        });
      }, () => cb(null));
    });
    return () => unsub && unsub();
  }

  const fetch = () => cb(getDemoItem(`class_${normalized}`));
  fetch();
  return subscribeDemo(`class_${normalized}`, fetch);
}

function subscribeToTransactions(classCode, cb) {
  const normalized = classCode.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && firestore) {
    let unsub = null;
    import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js").then(({ collection, query, orderBy, onSnapshot }) => {
      const q = query(
        collection(firestore, "classes", normalized, "transactions"),
        orderBy("date", "desc")
      );
      unsub = onSnapshot(q, (snap) => {
        const list = [];
        snap.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            classCode: normalized,
            type: data.type,
            amount: data.amount,
            description: data.description,
            category: data.category,
            date: data.date?.toMillis?.() || (data.createdAt?.toMillis?.() ?? Date.now()),
            notes: data.notes,
            createdBy: data.createdBy,
            createdAt: data.createdAt?.toMillis?.() || Date.now(),
          });
        });
        list.sort((a, b) => b.date - a.date);
        cb(list);
      }, () => cb([]));
    });
    return () => unsub && unsub();
  }

  const fetch = () => {
    const all = getDemoItem(`transactions_${normalized}`) || [];
    all.sort((a, b) => b.date - a.date);
    cb(all);
  };
  fetch();
  return subscribeDemo(`transactions_${normalized}`, fetch);
}

async function addTransaction(classCode, data) {
  const normalized = classCode.trim().toUpperCase();
  const id = generateId();
  const now = Date.now();

  const tx = {
    id,
    classCode: normalized,
    type: data.type,
    amount: Number(data.amount),
    description: data.description.trim(),
    category: data.category,
    date: data.date || now,
    notes: (data.notes || "").trim() || undefined,
    createdBy: data.createdBy,
    createdAt: now,
  };

  if (window.FIREBASE_HABILITADO && firestore) {
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await addDoc(collection(firestore, "classes", normalized, "transactions"), {
      ...tx,
      date: new Date(tx.date),
      createdAt: serverTimestamp(),
    });
  } else {
    const existing = getDemoItem(`transactions_${normalized}`) || [];
    existing.push(tx);
    setDemoItem(`transactions_${normalized}`, existing);
    notifyDemoListeners(`transactions_${normalized}`);
  }

  return tx;
}

async function updateTransaction(classCode, txId, updates) {
  const normalized = classCode.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && firestore) {
    const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    const payload = { ...updates };
    if (updates.date) payload.date = new Date(updates.date);
    await updateDoc(doc(firestore, "classes", normalized, "transactions", txId), payload);
    return;
  }

  const all = getDemoItem(`transactions_${normalized}`) || [];
  const idx = all.findIndex((t) => t.id === txId);
  if (idx === -1) throw new Error("Transacción no encontrada");
  all[idx] = { ...all[idx], ...updates };
  setDemoItem(`transactions_${normalized}`, all);
  notifyDemoListeners(`transactions_${normalized}`);
}

async function deleteTransaction(classCode, txId) {
  const normalized = classCode.trim().toUpperCase();

  if (window.FIREBASE_HABILITADO && firestore) {
    const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js");
    await deleteDoc(doc(firestore, "classes", normalized, "transactions", txId));
    return;
  }

  const all = getDemoItem(`transactions_${normalized}`) || [];
  const filtered = all.filter((t) => t.id !== txId);
  setDemoItem(`transactions_${normalized}`, filtered);
  notifyDemoListeners(`transactions_${normalized}`);
}

function computeStats(transactions, classInfo) {
  let totalIncome = classInfo?.openingBalance || 0;
  let totalExpense = 0;
  let incomeCount = 0;
  let expenseCount = 0;
  let lastTxAt = null;

  const byCategory = {};
  for (const k of Object.keys(CATEGORIAS)) byCategory[k] = 0;

  for (const t of transactions) {
    if (t.type === "income") {
      totalIncome += t.amount;
      incomeCount++;
    } else {
      totalExpense += t.amount;
      expenseCount++;
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
    if (!lastTxAt || t.date > lastTxAt) lastTxAt = t.date;
  }

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    transactionCount: transactions.length,
    incomeCount,
    expenseCount,
    byCategory,
    lastTxAt,
  };
}

// ============================================================
// SEMILLA DE DEMO
// ============================================================

async function ensureDemoClass() {
  if (window.FIREBASE_HABILITADO) return DEMO_CODE;

  const existing = await getClass(DEMO_CODE);
  if (existing) {
    const tx = getDemoItem(`transactions_${DEMO_CODE}`);
    if (tx && tx.length > 0) return DEMO_CODE;
  }

  const classInfo = await createClass({
    code: DEMO_CODE,
    name: "5º A - 2025/2026 (DEMO)",
    school: "CEIP Miguel Hernández",
    year: "2025-2026",
    currency: "EUR",
    adminName: "María (madre de Lucía)",
    adminEmail: "maria@example.com",
    openingBalance: 0,
    adminPin: "1234",
  });

  const now = Date.now();
  const DAY = 86400000;

  const samples = [
    { type: "income", amount: 350, description: "Aportación inicial familias (15 × 35€)", category: "otros", date: now - 30 * DAY, notes: "Aportación voluntaria de cada familia al inicio de curso", createdBy: "María (madre de Lucía)" },
    { type: "income", amount: 50, description: "Donación extra para la excursión", category: "otros", date: now - 14 * DAY, notes: "Aportación de la familia Pérez", createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 42.5, description: "Folios, rotuladores y cartulinas", category: "material", date: now - 28 * DAY, notes: "Comprado en papelería López · 2 lotes", createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 18, description: "Material de limpieza (toallitas, gel)", category: "limpieza", date: now - 21 * DAY, createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 65, description: "Tartas y globos - fiesta de Navidad", category: "fiesta", date: now - 10 * DAY, notes: "Pastelería Dulces · 2 tartas + decoración", createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 120, description: "Autobús - Museo de Ciencias", category: "transporte", date: now - 5 * DAY, notes: "Reserva para la excursión del 15 de noviembre", createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 35, description: "Entradas museo (8 niños × 4,50€)", category: "actividad", date: now - 4 * DAY, notes: "Museo de Ciencias - visita guiada", createdBy: "María (madre de Lucía)" },
    { type: "expense", amount: 22.4, description: "Tijeras, pegamento y gomas", category: "papeleria", date: now - 2 * DAY, notes: "Reposición de material de manualidades", createdBy: "María (madre de Lucía)" },
  ];

  for (const t of samples) {
    await addTransaction(classInfo.code, t);
  }

  return DEMO_CODE;
}

// ============================================================
// SESSION ADMIN
// ============================================================

function hasAdminSession(code) {
  try {
    return Boolean(sessionStorage.getItem(`admin_${code.toUpperCase()}`));
  } catch {
    return false;
  }
}

function setAdminSession(code) {
  try { sessionStorage.setItem(`admin_${code.toUpperCase()}`, String(Date.now())); } catch {}
}

function clearAdminSession(code) {
  try { sessionStorage.removeItem(`admin_${code.toUpperCase()}`); } catch {}
}

// ============================================================
// ROUTING
// ============================================================

function getQueryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    classCode: params.get("c") || "",
    isCreate: params.get("create") === "1",
  };
}

function navigate(path) {
  if (path.startsWith("?")) {
    const url = window.location.pathname + path;
    history.pushState({}, "", url);
  } else {
    history.pushState({}, "", path);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  handleRouteChange();
}

window.addEventListener("popstate", handleRouteChange);

function handleRouteChange() {
  const { classCode, isCreate } = getQueryParams();

  if (isCreate) {
    renderCreateClass();
  } else if (classCode) {
    renderPublicDashboard(classCode);
  } else {
    renderLanding();
  }
}

// ============================================================
// ICONOS (SVG inline)
// ============================================================

const ICONS = {
  arrowLeft: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>`,
  arrowRight: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`,
  wallet: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 1-2-2"/><path d="M16 12h.01"/></svg>`,
  piggyBank: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5c-1.5 0-2.8 1.4-2.8 3.1 0 1.3.7 2.4 1.7 2.9-.2.6-.5 1.1-.9 1.6-.6.7-1.5 1.2-2.5 1.4-1.6.3-3.4-.1-5-1.4-.4-.3-.9-.4-1.4-.4H7.5c-.4 0-.8.2-1 .5-.3.4-.4.9-.3 1.4l.2 1.2c.2.7.7 1.3 1.4 1.6.4.2.7.6.7 1.1V21h3v-1.4c0-.3.3-.6.6-.6h2.8c.3 0 .6.3.6.6V21h3v-3c0-.3.1-.6.3-.8.7-.7 1.1-1.7 1.1-2.8 0-1.3-.6-2.5-1.5-3.4.5-.4.8-1 .8-1.6 0-.7-.5-1.3-1.2-1.4.3-.6.7-1.2 1.2-1.5.4-.3 1-.5 1.5-.5h1V5z"/></svg>`,
  trendingUp: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 7h6v6"/><path d="m22 7-8.5 8.5-5-5L2 17"/></svg>`,
  trendingDown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/></svg>`,
  receipt: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h8"/></svg>`,
  share: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>`,
  shield: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/></svg>`,
  shieldCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  lock: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  graduation: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.42 10.922a1.912 1.912 0 0 0-.838-.838l-3.46-1.732-4.272-1.728a2.1 2.1 0 0 0-1.7 0l-4.27 1.728-3.46 1.732a1.912 1.912 0 0 0-.838.838"/><path d="M22 18 12 13 2 18l10 5 10-5Z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  plus: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>`,
  pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
  checkCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`,
  checkBig: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  users: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  search: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  barChart: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg>`,
  list: `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>`,
  arrowUpCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 4-4 4 4"/><path d="M12 16V8"/></svg>`,
  arrowDownCircle: `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m8 12 4 4 4-4"/><path d="M12 8v8"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  eyeOff: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="M2 2l20 20"/></svg>`,
  sparkles: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/></svg>`,
  filter: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>`,
};

// ============================================================
// RENDER: LANDING
// ============================================================

function renderLanding() {
  document.body.innerHTML = `
    <div class="page">
      <header class="hero">
        <div class="container hero-inner">
          <div>
            <div class="hero-pill">
              ${ICONS.sparkles}
              Cooperativa escolar · Transparente y compartida
            </div>
            <h1 class="hero-title">
              La caja de la clase,<br>
              <span class="hero-title-accent">visible para todas las familias</span>
            </h1>
            <p class="hero-subtitle">
              Lleva el control del fondo común de la clase: aportaciones anuales
              de las familias, compras de material, fiestas, excursiones… Todo
              registrado y disponible para que cualquier padre pueda consultarlo
              en tiempo real.
            </p>
            <div class="hero-features">
              <div class="hero-feature">${ICONS.checkCircle} Sin registros ni cuentas</div>
              <div class="hero-feature">${ICONS.checkCircle} Acceso por código</div>
              <div class="hero-feature">${ICONS.checkCircle} Multi-clase</div>
            </div>
          </div>

          <div class="access-card">
            <h2>${ICONS.graduation} Acceder a una clase</h2>
            <p>Introduce el código de 6 caracteres que te ha compartido el coordinador de la clase.</p>
            <form id="enter-form" class="access-form">
              <input
                type="text"
                id="code-input"
                class="input input-code"
                placeholder="p. ej. K7M2X9"
                maxlength="8"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="submit" class="btn btn-primary btn-lg btn-block" id="enter-btn">
                Entrar ${ICONS.arrowRight}
              </button>
              <div class="access-links">
                <a href="#" id="create-link">¿Aún no existe? Crear</a>
                <span id="demo-area">
                  <a href="#" id="demo-link">Ver ejemplo →</a>
                </span>
              </div>
            </form>
          </div>
        </div>
      </header>

      <main class="main">
        <section class="container features-section">
          <h2 class="features-title">Una herramienta pensada para las cooperativas de clase</h2>
          <p class="features-subtitle">
            Las familias aportan una cantidad al inicio del curso para
            cubrir gastos comunes. Aquí todas pueden ver, sin fisuras,
            en qué se gasta cada euro.
          </p>
          <div class="features-grid" id="features-grid"></div>

          <div class="cta-section">
            <div class="cta-card">
              <div style="color: var(--verde-700)">${ICONS.trendingUp.replace('width="16" height="16"', 'width="32" height="32"')}</div>
              <div class="cta-text-block">
                <div class="cta-title">¿Tienes que llevar la caja de la clase de tu hijo/a?</div>
                <div class="cta-subtitle">Crea la clase en menos de un minuto y comparte el código.</div>
              </div>
              <button class="btn btn-success" id="cta-create-btn">
                Crear clase ${ICONS.arrowRight}
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer class="app-footer">
        <div class="container app-footer-inner">
          <div>Cooperativa Escolar · Hecho con HTML, CSS y Firestore</div>
          <div id="mode-indicator">${window.FIREBASE_HABILITADO ? "Conectado a Firestore" : "Modo demo (datos locales)"}</div>
        </div>
      </footer>
    </div>
  `;

  // Render features
  const features = [
    { icon: ICONS.wallet, title: "Caja transparente", desc: "Saldo, ingresos y gastos siempre visibles para todas las familias." },
    { icon: ICONS.barChart, title: "Gráficas claras", desc: "Distribución por categoría y evolución mensual de un vistazo." },
    { icon: ICONS.users, title: "Para toda la clase", desc: "Comparte un enlace y cualquier padre podrá consultar en cualquier momento." },
    { icon: ICONS.shield, title: "Gestión por PIN", desc: "Solo quien tenga el PIN de administrador puede añadir o editar movimientos." },
  ];
  document.getElementById("features-grid").innerHTML = features.map((f) => `
    <div class="feature-card">
      <div class="feature-icon">${f.icon}</div>
      <h3>${f.title}</h3>
      <p>${f.desc}</p>
    </div>
  `).join("");

  // Handlers
  const codeInput = document.getElementById("code-input");
  codeInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase();
  });

  document.getElementById("enter-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const code = codeInput.value.trim();
    if (!code) return;
    const btn = document.getElementById("enter-btn");
    btn.disabled = true;
    btn.innerHTML = "Buscando clase…";
    try {
      const found = await getClass(code);
      if (!found) {
        showToast("Código no encontrado", `No existe ninguna clase con el código "${code.toUpperCase()}".`, "error");
        btn.disabled = false;
        btn.innerHTML = `Entrar ${ICONS.arrowRight}`;
        return;
      }
      navigate(`?c=${encodeURIComponent(code.toUpperCase())}`);
    } catch (err) {
      showToast("Error", err.message || "No se pudo verificar el código.", "error");
      btn.disabled = false;
      btn.innerHTML = `Entrar ${ICONS.arrowRight}`;
    }
  });

  document.getElementById("create-link").addEventListener("click", (e) => {
    e.preventDefault();
    navigate("/?create=1");
  });

  document.getElementById("cta-create-btn").addEventListener("click", () => {
    navigate("/?create=1");
  });

  const demoArea = document.getElementById("demo-area");
  document.getElementById("demo-link").addEventListener("click", async (e) => {
    e.preventDefault();
    demoArea.innerHTML = `<span class="text-slate-500 text-xs">Cargando ejemplo…</span>`;
    try {
      const code = await ensureDemoClass();
      showToast("Clase de demostración cargada", "PIN de administrador: 1234");
      navigate(`?c=${code}`);
    } catch (err) {
      showToast("No se pudo cargar el demo", err.message, "error");
      demoArea.innerHTML = `<a href="#" id="demo-link">Ver ejemplo →</a>`;
      bindDemoLink();
    }
  });
}

// ============================================================
// RENDER: CREATE CLASS
// ============================================================

function renderCreateClass() {
  document.body.innerHTML = `
    <div class="page">
      <header class="page-header">
        <div class="container page-header-inner">
          <button class="icon-btn" id="back-btn">${ICONS.arrowLeft}</button>
          <div>
            <h1>Crear nueva clase</h1>
            <div class="page-header-sub">Configura la cooperativa escolar en menos de un minuto</div>
          </div>
        </div>
      </header>

      <main class="main container" style="padding-top: 1.5rem; padding-bottom: 2rem;">
        <div class="card">
          <div class="card-header">
            <div class="badge badge-success mb-2" style="display: inline-flex; align-items: center; gap: 0.25rem;">
              ${ICONS.sparkles} SaaS multi-clase
            </div>
            <h2 class="card-title">Datos de la clase</h2>
            <p class="card-description">
              Cada clase recibe un código único de 6 caracteres que podrán usar
              todas las familias para consultar el estado del fondo común.
            </p>
          </div>
          <div class="card-body">
            <form id="create-form">
              <div class="field">
                <label class="label" for="name">Nombre de la clase <span style="color: var(--rojo-600)">*</span></label>
                <input class="input" type="text" id="name" placeholder="p. ej. 5º A - 2025/2026" maxlength="80" required />
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="label" for="school">Colegio (opcional)</label>
                  <input class="input" type="text" id="school" placeholder="p. ej. CEIP Miguel Hernández" maxlength="80" />
                </div>
                <div class="field">
                  <label class="label" for="year">Curso escolar</label>
                  <input class="input" type="text" id="year" placeholder="2025-2026" maxlength="20" value="2025-2026" />
                </div>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="label" for="currency">Moneda</label>
                  <select class="select" id="currency">
                    ${Object.entries(MONEDAS).map(([code, sym]) =>
                      `<option value="${code}">${code} (${sym})</option>`
                    ).join("")}
                  </select>
                </div>
                <div class="field">
                  <label class="label" for="opening">Saldo inicial (opcional)</label>
                  <input class="input" type="number" step="0.01" min="0" inputmode="decimal" id="opening" placeholder="0,00" />
                </div>
              </div>

              <div class="field-row">
                <div class="field">
                  <label class="label" for="adminName">Tu nombre (opcional)</label>
                  <input class="input" type="text" id="adminName" placeholder="p. ej. María (madre de Lucía)" maxlength="60" />
                </div>
                <div class="field">
                  <label class="label" for="adminEmail">Tu email (opcional)</label>
                  <input class="input" type="email" id="adminEmail" placeholder="para recuperar el PIN si lo pierdes" maxlength="120" />
                </div>
              </div>

              <div class="form-section">
                <h3>${ICONS.lock} PIN de administrador</h3>
                <p>Con este PIN podrás añadir, editar y eliminar movimientos. Las familias solo verán el estado del fondo.</p>
                <div class="field-row">
                  <div class="field" style="margin-bottom: 0;">
                    <label class="label" for="pin">PIN (4-8 dígitos)</label>
                    <div style="position: relative;">
                      <input class="input input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="pin" placeholder="••••" required />
                      <button type="button" class="icon-btn" id="toggle-pin" style="position: absolute; right: 0.5rem; top: 50%; transform: translateY(-50%);">${ICONS.eye}</button>
                    </div>
                  </div>
                  <div class="field" style="margin-bottom: 0;">
                    <label class="label" for="pinConfirm">Confirmar PIN</label>
                    <input class="input input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="pinConfirm" placeholder="••••" required />
                  </div>
                </div>
              </div>

              <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
                <button type="button" class="btn btn-outline" id="cancel-btn">Cancelar</button>
                <button type="submit" class="btn btn-success" id="submit-btn">Crear clase y obtener código</button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  `;

  document.getElementById("back-btn").addEventListener("click", () => navigate("/"));
  document.getElementById("cancel-btn").addEventListener("click", () => navigate("/"));

  const pinInput = document.getElementById("pin");
  const pinConfirmInput = document.getElementById("pinConfirm");
  let showPin = false;
  document.getElementById("toggle-pin").addEventListener("click", () => {
    showPin = !showPin;
    pinInput.type = showPin ? "text" : "password";
    pinConfirmInput.type = showPin ? "text" : "password";
  });

  pinInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
  pinConfirmInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  document.getElementById("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("name").value.trim();
    const school = document.getElementById("school").value.trim();
    const year = document.getElementById("year").value.trim();
    const currency = document.getElementById("currency").value;
    const adminName = document.getElementById("adminName").value.trim();
    const adminEmail = document.getElementById("adminEmail").value.trim();
    const opening = document.getElementById("opening").value;
    const pin = document.getElementById("pin").value;
    const pinConfirm = document.getElementById("pinConfirm").value;

    if (!name) { showToast("Falta el nombre", "Pon un nombre a la clase, p. ej. '5º A - 2025'.", "error"); return; }
    if (pin.length < 4) { showToast("PIN demasiado corto", "El PIN debe tener al menos 4 dígitos.", "error"); return; }
    if (pin !== pinConfirm) { showToast("Los PIN no coinciden", "Comprueba que has escrito el mismo PIN dos veces.", "error"); return; }

    const submitBtn = document.getElementById("submit-btn");
    submitBtn.disabled = true;
    submitBtn.innerHTML = "Creando clase…";

    try {
      const created = await createClass({
        name, school: school || undefined, year: year || undefined,
        currency, adminName: adminName || undefined, adminEmail: adminEmail || undefined,
        openingBalance: opening ? parseFloat(opening.replace(",", ".")) : 0,
        adminPin: pin,
      });
      renderSuccessScreen(created);
      showToast("¡Clase creada!", `Código ${created.code} · Ya puedes compartirla.`);
    } catch (err) {
      showToast("No se pudo crear", err.message || "Error inesperado.", "error");
      submitBtn.disabled = false;
      submitBtn.innerHTML = "Crear clase y obtener código";
    }
  });
}

function renderSuccessScreen(classInfo) {
  const shareUrl = `${window.location.origin}${window.location.pathname}?c=${classInfo.code}`;

  document.body.innerHTML = `
    <div class="success-screen">
      <div class="success-card">
        <div class="success-icon">${ICONS.checkBig}</div>
        <h2>¡Clase creada!</h2>
        <p class="description">Ya puedes compartir el siguiente código con las familias de la clase.</p>

        <div class="code-box">
          <div class="code-label">Código de la clase</div>
          <div class="code-value">${classInfo.code}</div>
        </div>

        <div>
          <label class="label">Enlace para compartir con las familias</label>
          <div class="link-box">
            <input class="link-input" type="text" readonly id="share-url" value="${shareUrl}" />
            <button class="btn btn-outline" id="copy-link-btn">${ICONS.copy}</button>
          </div>
        </div>

        <div class="warning-box">
          <strong>Importante:</strong> guarda tu PIN en un lugar seguro. Si lo pierdes, no podrás editar o eliminar movimientos (aunque siempre podrás verlos).
        </div>

        <div class="field-row" style="margin-bottom: 0;">
          <button class="btn btn-outline" id="back-btn">${ICONS.arrowLeft} Inicio</button>
          <button class="btn btn-success" id="view-btn">Ver la clase</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("share-url").addEventListener("click", (e) => e.target.select());

  document.getElementById("copy-link-btn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Enlace copiado", "Pégalo donde quieras: WhatsApp, email…");
    } catch {
      showToast("No se pudo copiar", "Copia el enlace manualmente.", "error");
    }
  });

  document.getElementById("back-btn").addEventListener("click", () => navigate("/"));
  document.getElementById("view-btn").addEventListener("click", () => navigate(`?c=${classInfo.code}`));
}

// ============================================================
// RENDER: PUBLIC DASHBOARD
// ============================================================

let dashboardState = {
  classInfo: null,
  transactions: [],
  isAdmin: false,
  unsubscribeClass: null,
  unsubscribeTx: null,
  filters: { search: "", type: "all", category: "all" },
  chartCategory: null,
  chartTrend: null,
  editingTx: null,
};

function renderPublicDashboard(code) {
  document.body.innerHTML = `
    <div class="page">
      <div id="dashboard-loading" class="loading-screen">
        <div class="spinner spinner-lg"></div>
        <p>Cargando la clase…</p>
      </div>

      <div id="dashboard-content" class="hidden">
        <header class="app-header" id="header"></header>

        <main class="main container" style="padding-top: 1rem; padding-bottom: 1.5rem;">
          <div id="alert-area"></div>
          <div id="stats-area"></div>
          <div id="sticky-action" class="hidden"></div>

          <div class="tabs">
            <div class="tab-list">
              <button class="tab active" id="tab-list">${ICONS.list} Movimientos</button>
              <button class="tab" id="tab-charts">${ICONS.barChart} Gráficas</button>
            </div>
            <button class="btn btn-success btn-sm hide-mobile" id="add-btn-desktop">
              ${ICONS.plus} Añadir movimiento
            </button>
          </div>

          <div id="tab-content-list" class="tab-content active"></div>
          <div id="tab-content-charts" class="tab-content"></div>
        </main>

        <footer class="app-footer" id="footer"></footer>
      </div>

      <div class="modal-overlay" id="admin-modal-overlay"></div>
      <div class="modal-overlay" id="tx-modal-overlay"></div>
      <div class="modal-overlay" id="share-modal-overlay"></div>
      <div class="modal-overlay" id="delete-modal-overlay"></div>
    </div>
  `;

  // Inicializar suscripciones
  dashboardState.isAdmin = hasAdminSession(code);
  dashboardState.unsubscribeClass = subscribeToClass(code, (info) => {
    dashboardState.classInfo = info;
    if (!info) {
      document.getElementById("dashboard-loading").classList.add("hidden");
      document.getElementById("dashboard-content").classList.add("hidden");
      renderClassNotFound();
      return;
    }
    document.getElementById("dashboard-loading").classList.add("hidden");
    document.getElementById("dashboard-content").classList.remove("hidden");
    updateDashboard();
  });

  dashboardState.unsubscribeTx = subscribeToTransactions(code, (list) => {
    dashboardState.transactions = list;
    if (dashboardState.classInfo) updateDashboard();
  });

  // Setup tab handlers
  document.getElementById("tab-list").addEventListener("click", () => {
    document.getElementById("tab-list").classList.add("active");
    document.getElementById("tab-charts").classList.remove("active");
    document.getElementById("tab-content-list").classList.add("active");
    document.getElementById("tab-content-charts").classList.remove("active");
  });

  document.getElementById("tab-charts").addEventListener("click", () => {
    document.getElementById("tab-charts").classList.add("active");
    document.getElementById("tab-list").classList.remove("active");
    document.getElementById("tab-content-charts").classList.add("active");
    document.getElementById("tab-content-list").classList.remove("active");
    // Render charts después de que se muestre
    setTimeout(() => renderCharts(), 50);
  });

  // Cleanup on navigate away
  window.addEventListener("coop:cleanup", () => {
    if (dashboardState.unsubscribeClass) dashboardState.unsubscribeClass();
    if (dashboardState.unsubscribeTx) dashboardState.unsubscribeTx();
    if (dashboardState.chartCategory) dashboardState.chartCategory.destroy();
    if (dashboardState.chartTrend) dashboardState.chartTrend.destroy();
    dashboardState = { classInfo: null, transactions: [], isAdmin: false, unsubscribeClass: null, unsubscribeTx: null, filters: { search: "", type: "all", category: "all" }, chartCategory: null, chartTrend: null, editingTx: null };
  }, { once: true });
}

function renderClassNotFound() {
  document.body.innerHTML = `
    <div class="success-screen">
      <div class="success-card">
        <div class="success-icon" style="background-color: var(--rojo-100); color: var(--rojo-700);">${ICONS.lock}</div>
        <h2>Clase no encontrada</h2>
        <p class="description">El código que has introducido no existe. Comprueba que sea correcto.</p>
        <button class="btn btn-primary" onclick="navigate('/')">Volver al inicio</button>
      </div>
    </div>
  `;
}

function updateDashboard() {
  const { classInfo, transactions, isAdmin } = dashboardState;
  const stats = computeStats(transactions, classInfo);

  // Header
  document.getElementById("header").innerHTML = `
    <div class="container app-header-inner">
      <div class="header-left">
        <button class="icon-btn" onclick="navigate('/')">${ICONS.arrowLeft}</button>
        <div class="header-logo">${ICONS.graduation}</div>
        <div class="header-text">
          <h1>${escapeHtml(classInfo.name)}</h1>
          <div class="header-code">
            <span class="code-tag">${classInfo.code}</span>
            ${classInfo.school ? `<span class="hide-mobile">· ${escapeHtml(classInfo.school)}</span>` : ""}
            ${classInfo.year ? `<span class="hide-mobile">· ${escapeHtml(classInfo.year)}</span>` : ""}
          </div>
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-outline btn-sm" onclick="openShareModal()">
          ${ICONS.share}<span class="hide-mobile"> Compartir</span>
        </button>
        ${isAdmin ? `
          <span class="badge badge-success">${ICONS.shieldCheck} Admin</span>
          <button class="icon-btn" onclick="handleAdminLogout()" title="Salir del modo administrador">${ICONS.logout}</button>
        ` : `
          <button class="btn btn-outline btn-sm" onclick="openAdminLogin()">
            ${ICONS.shield}<span class="hide-mobile"> Soy admin</span>
          </button>
        `}
      </div>
    </div>
  `;

  // Alert
  const alertArea = document.getElementById("alert-area");
  if (!window.FIREBASE_HABILITADO) {
    alertArea.innerHTML = `
      <div class="alert alert-warning">
        ${ICONS.eye}
        <div>
          <div class="alert-title">Modo demostración</div>
          <div class="alert-text">Estás viendo la app con datos locales en este navegador. Para que las familias accedan en tiempo real, configura tu proyecto de Firebase en <code>firebase-config.js</code>.</div>
        </div>
      </div>
    `;
  } else {
    alertArea.innerHTML = "";
  }

  // Stats
  document.getElementById("stats-area").innerHTML = renderStats(stats, classInfo);

  // Sticky action bar (mobile)
  if (isAdmin) {
    document.getElementById("sticky-action").className = "sticky-action-bar";
    document.getElementById("sticky-action").innerHTML = `
      <button class="btn btn-success btn-block" onclick="openTransactionForm()">
        ${ICONS.plus} Nuevo movimiento
      </button>
    `;
    document.getElementById("add-btn-desktop").classList.remove("hidden");
  } else {
    document.getElementById("sticky-action").className = "hidden";
    document.getElementById("add-btn-desktop").classList.add("hidden");
  }

  // Add button
  const addBtn = document.getElementById("add-btn-desktop");
  if (addBtn) {
    addBtn.onclick = () => openTransactionForm();
  }

  // Tab content list
  renderTransactionList();

  // Footer
  document.getElementById("footer").innerHTML = `
    <div class="container app-footer-inner">
      <div class="app-footer-left">
        ${classInfo.year ? `Curso ${escapeHtml(classInfo.year)}` : "Cooperativa escolar"}
        ${classInfo.adminName ? ` · Coordinado por ${escapeHtml(classInfo.adminName)}` : ""}
      </div>
      <div class="app-footer-left">
        ${isAdmin ? `${ICONS.shieldCheck}<span>Modo administrador</span>` : `${ICONS.eye}<span>Vista pública</span>`}
      </div>
    </div>
  `;

  // Si estamos en tab de gráficas, actualizarlas
  if (document.getElementById("tab-content-charts").classList.contains("active")) {
    renderCharts();
  }
}

function renderStats(stats, classInfo) {
  const currency = classInfo.currency || "EUR";
  const balancePositive = stats.balance >= 0;

  return `
    <div class="stats-grid">
      <div class="stat-card stat-card-balance">
        <div class="stat-header">
          <div class="stat-label">${ICONS.wallet} Saldo disponible</div>
          ${ICONS.piggyBank}
        </div>
        <div class="stat-value">${formatCurrency(stats.balance, currency)}</div>
        <div class="stat-sub">${balancePositive ? "Fondos disponibles para gastos" : "Atención: saldo negativo"}</div>
      </div>

      <div class="stat-card stat-card-income">
        <div class="stat-header">
          <div class="stat-label">${ICONS.trendingUp} Ingresos</div>
          <div class="stat-icon">${ICONS.trendingUp}</div>
        </div>
        <div class="stat-value" style="color: var(--verde-700);">${formatCurrency(stats.totalIncome, currency)}</div>
        <div class="stat-sub">${stats.incomeCount} aportación${stats.incomeCount !== 1 ? "es" : ""}${classInfo.openingBalance ? " · incluye saldo inicial" : ""}</div>
      </div>

      <div class="stat-card stat-card-expense">
        <div class="stat-header">
          <div class="stat-label">${ICONS.trendingDown} Gastos</div>
          <div class="stat-icon">${ICONS.trendingDown}</div>
        </div>
        <div class="stat-value" style="color: var(--rojo-700);">${formatCurrency(stats.totalExpense, currency)}</div>
        <div class="stat-sub">${stats.expenseCount} movimiento${stats.expenseCount !== 1 ? "s" : ""} registrado${stats.expenseCount !== 1 ? "s" : ""}</div>
      </div>

      <div class="stat-card stat-card-count">
        <div class="stat-header">
          <div class="stat-label">${ICONS.receipt} Movimientos</div>
          <div class="stat-icon">${ICONS.receipt}</div>
        </div>
        <div class="stat-value" style="color: var(--slate-700);">${stats.transactionCount}</div>
        <div class="stat-sub">${stats.lastTxAt ? `Último: ${formatRelative(stats.lastTxAt)}` : "Sin movimientos todavía"}</div>
      </div>
    </div>
  `;
}

function renderTransactionList() {
  const { transactions, classInfo, isAdmin, filters } = dashboardState;
  const container = document.getElementById("tab-content-list");

  if (transactions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.receipt}</div>
        <h3>Aún no hay movimientos</h3>
        <p>Cuando se registre el primer ingreso o gasto, aparecerá aquí con toda la información: fecha, concepto, categoría y cantidad.</p>
      </div>
    `;
    return;
  }

  // Filters
  const filtered = transactions.filter((t) => {
    if (filters.type !== "all" && t.type !== filters.type) return false;
    if (filters.category !== "all" && t.category !== filters.category) return false;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!t.description.toLowerCase().includes(q) &&
          !(CATEGORIAS[t.category]?.label || "").toLowerCase().includes(q) &&
          !(t.notes || "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const currency = classInfo.currency || "EUR";

  let html = `
    <div class="filters">
      <div class="search-wrap">
        <div class="search-icon">${ICONS.search}</div>
        <input class="input search-input" type="text" id="search-input"
               placeholder="Buscar por concepto, categoría o nota…"
               value="${escapeHtml(filters.search)}" />
      </div>
      <select class="filter-select" id="type-filter">
        <option value="all" ${filters.type === "all" ? "selected" : ""}>Todos los tipos</option>
        <option value="income" ${filters.type === "income" ? "selected" : ""}>Ingresos</option>
        <option value="expense" ${filters.type === "expense" ? "selected" : ""}>Gastos</option>
      </select>
      <select class="filter-select" id="category-filter">
        <option value="all" ${filters.category === "all" ? "selected" : ""}>Todas las categorías</option>
        ${Object.entries(CATEGORIAS).map(([key, c]) =>
          `<option value="${key}" ${filters.category === key ? "selected" : ""}>${c.label}</option>`
        ).join("")}
      </select>
    </div>
    <div class="text-xs text-slate-500" style="padding: 0 0.25rem; margin-bottom: 0.75rem;">
      Mostrando ${filtered.length} de ${transactions.length} movimientos
    </div>
  `;

  if (filtered.length === 0) {
    html += `
      <div class="card card-body" style="text-align: center; font-size: 0.875rem; color: var(--slate-500);">
        No hay movimientos que coincidan con los filtros seleccionados.
      </div>
    `;
  } else {
    html += `<div class="tx-list">`;
    for (const t of filtered) {
      const isIncome = t.type === "income";
      const color = isIncome ? "#10b981" : (CATEGORIAS[t.category]?.color || "#64748b");
      html += `
        <div class="tx-item">
          <div class="tx-icon" style="background-color: ${color};">
            ${isIncome ? ICONS.arrowUpCircle : ICONS.arrowDownCircle}
          </div>
          <div class="tx-content">
            <div class="tx-row">
              <div class="tx-main">
                <div class="tx-title">${escapeHtml(t.description)}</div>
                <div class="tx-meta">
                  <span class="badge" style="color: ${isIncome ? "#047857" : color}; border-color: ${isIncome ? "#a7f3d0" : color + "55"}; background-color: ${isIncome ? "#ecfdf5" : color + "11"};">
                    ${isIncome ? "Ingreso" : (CATEGORIAS[t.category]?.label || "Otros")}
                  </span>
                  <span class="tx-meta-text">${formatDate(t.date)} · ${formatTime(t.date)}</span>
                  ${t.createdBy ? `<span class="tx-meta-text hide-mobile">· por ${escapeHtml(t.createdBy)}</span>` : ""}
                </div>
                ${t.notes ? `<div class="tx-notes">${escapeHtml(t.notes)}</div>` : ""}
              </div>
              <div class="tx-amount ${t.type}">${isIncome ? "+" : "−"}${formatCurrency(t.amount, currency)}</div>
            </div>
            ${isAdmin ? `
              <div class="tx-actions">
                <button class="btn btn-ghost btn-sm" onclick="openTransactionForm('${t.id}')">
                  ${ICONS.pencil} Editar
                </button>
                <button class="btn btn-ghost btn-sm" style="color: var(--rojo-600);" onclick="openDeleteModal('${t.id}')">
                  ${ICONS.trash} Eliminar
                </button>
              </div>
            ` : ""}
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  container.innerHTML = html;

  // Bind filter handlers
  document.getElementById("search-input").addEventListener("input", (e) => {
    dashboardState.filters.search = e.target.value;
    renderTransactionList();
    document.getElementById("search-input").focus();
  });

  document.getElementById("type-filter").addEventListener("change", (e) => {
    dashboardState.filters.type = e.target.value;
    renderTransactionList();
  });

  document.getElementById("category-filter").addEventListener("change", (e) => {
    dashboardState.filters.category = e.target.value;
    renderTransactionList();
  });
}

// ============================================================
// CHARTS (Chart.js from CDN)
// ============================================================

function renderCharts() {
  if (typeof Chart === "undefined") {
    // Chart.js no cargado, intentamos cargarlo
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js";
    script.onload = () => renderCharts();
    document.head.appendChild(script);
    return;
  }

  const { transactions, classInfo } = dashboardState;
  const stats = computeStats(transactions, classInfo);
  const currency = classInfo.currency || "EUR";

  // Destruir charts anteriores
  if (dashboardState.chartCategory) dashboardState.chartCategory.destroy();
  if (dashboardState.chartTrend) dashboardState.chartTrend.destroy();

  const container = document.getElementById("tab-content-charts");

  // Preparar datos de categoría
  const catData = Object.entries(stats.byCategory)
    .filter(([_, v]) => v > 0)
    .map(([key, value]) => ({
      label: CATEGORIAS[key]?.label || key,
      value: Number(value.toFixed(2)),
      color: CATEGORIAS[key]?.color || "#64748b",
    }))
    .sort((a, b) => b.value - a.value);

  // Preparar datos mensuales
  const buckets = {};
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    buckets[key] = { income: 0, expense: 0 };
  }
  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
    if (buckets[key]) {
      if (t.type === "income") buckets[key].income += t.amount;
      else buckets[key].expense += t.amount;
    }
  }
  const monthlyData = Object.entries(buckets).map(([key, v]) => {
    const [y, m] = key.split("-");
    return {
      month: MESES_ES[Number(m)] + " " + y.slice(2),
      income: Number(v.income.toFixed(2)),
      expense: Number(v.expense.toFixed(2)),
    };
  });

  const hasCategoryData = catData.length > 0;
  const hasMonthlyData = monthlyData.some((d) => d.income > 0 || d.expense > 0);

  if (!hasCategoryData && !hasMonthlyData) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${ICONS.barChart}</div>
        <h3>Suficientes datos para mostrar gráficas</h3>
        <p>Las gráficas aparecerán cuando se hayan registrado algunos movimientos.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="charts-grid">
      ${hasCategoryData ? `
        <div class="chart-card">
          <h3>Gastos por categoría</h3>
          <div class="chart-sub">Distribución del total gastado (${formatCurrency(stats.totalExpense, currency)})</div>
          <div class="chart-canvas-wrap">
            <canvas id="chart-category"></canvas>
          </div>
        </div>
      ` : ""}
      ${hasMonthlyData ? `
        <div class="chart-card">
          <h3>Evolución mensual</h3>
          <div class="chart-sub">Ingresos y gastos de los últimos 12 meses</div>
          <div class="chart-canvas-wrap">
            <canvas id="chart-trend"></canvas>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  // Pie chart
  if (hasCategoryData) {
    const ctx = document.getElementById("chart-category");
    dashboardState.chartCategory = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: catData.map((d) => d.label),
        datasets: [{
          data: catData.map((d) => d.value),
          backgroundColor: catData.map((d) => d.color),
          borderColor: "#ffffff",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: { font: { size: 11 }, color: "#475569" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${formatCurrency(ctx.parsed, currency)}`,
            },
          },
        },
      },
    });
  }

  // Bar chart
  if (hasMonthlyData) {
    const ctx = document.getElementById("chart-trend");
    dashboardState.chartTrend = new Chart(ctx, {
      type: "bar",
      data: {
        labels: monthlyData.map((d) => d.month),
        datasets: [
          {
            label: "Ingresos",
            data: monthlyData.map((d) => d.income),
            backgroundColor: "#10b981",
            borderRadius: 4,
            maxBarThickness: 32,
          },
          {
            label: "Gastos",
            data: monthlyData.map((d) => d.expense),
            backgroundColor: "#f43f5e",
            borderRadius: 4,
            maxBarThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "top",
            labels: { font: { size: 11 }, color: "#475569" },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y, currency)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: "#64748b" },
          },
          y: {
            grid: { color: "#e2e8f0" },
            ticks: {
              font: { size: 11 },
              color: "#64748b",
              callback: (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v),
            },
          },
        },
      },
    });
  }
}

// ============================================================
// MODAL: SHARE
// ============================================================

function openShareModal() {
  const { classInfo } = dashboardState;
  if (!classInfo) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?c=${classInfo.code}`;

  const overlay = document.getElementById("share-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal">
        <button class="modal-close" onclick="closeShareModal()">${ICONS.x}</button>
        <div class="modal-header">
          <div class="modal-icon-wrap">${ICONS.share}</div>
          <h2 class="modal-title">Compartir acceso a la clase</h2>
          <p class="modal-description">Las familias solo podrán ver el estado del fondo y los movimientos. Para editar necesitan el PIN de administrador.</p>
        </div>
        <div class="modal-body">
          <div class="mb-3">
            <div class="label">Código de la clase</div>
            <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--slate-50); border: 1px solid var(--slate-200); border-radius: var(--radius-md); padding: 0.75rem;">
              <div class="font-mono" style="flex: 1; font-size: 1.5rem; font-weight: 700; letter-spacing: 0.2em; color: var(--slate-800); text-align: center;">${classInfo.code}</div>
              <button class="btn btn-outline btn-sm" onclick="copyCodeToClipboard('${classInfo.code}')">${ICONS.copy}</button>
            </div>
          </div>
          <div class="mb-3">
            <div class="label">Enlace directo</div>
            <div class="link-box">
              <input class="link-input" type="text" readonly id="share-url-modal" value="${shareUrl}" />
              <button class="btn btn-outline btn-sm" onclick="copyLinkToClipboard()">${ICONS.copy}</button>
            </div>
          </div>
          <button class="btn btn-block" style="background-color: #25D366; color: white;" onclick="shareWhatsApp()">
            ${ICONS.users} Compartir por WhatsApp
          </button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");
}

function closeShareModal() {
  document.getElementById("share-modal-overlay").classList.remove("open");
}

function copyCodeToClipboard(code) {
  navigator.clipboard.writeText(code).then(() => {
    showToast("Código copiado", `Código: ${code}`);
  }).catch(() => {
    showToast("No se pudo copiar", "Copia el código manualmente.", "error");
  });
}

function copyLinkToClipboard() {
  const input = document.getElementById("share-url-modal");
  const url = input.value;
  navigator.clipboard.writeText(url).then(() => {
    showToast("Enlace copiado", "Compártelo con las familias del grupo de WhatsApp.");
  }).catch(() => {
    input.select();
    showToast("No se pudo copiar", "Copia el enlace manualmente (Ctrl+C).", "error");
  });
}

function shareWhatsApp() {
  const { classInfo } = dashboardState;
  if (!classInfo) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?c=${classInfo.code}`;
  const text = `💰 Cooperativa de la clase ${classInfo.name}${classInfo.school ? ` (${classInfo.school})` : ""}${classInfo.year ? ` · Curso ${classInfo.year}` : ""}\n\nConsulta en qué se gasta el fondo común aquí:\n${shareUrl}\n\nCódigo de acceso: ${classInfo.code}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

// ============================================================
// MODAL: ADMIN LOGIN
// ============================================================

function openAdminLogin() {
  const overlay = document.getElementById("admin-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container">
      <div class="modal">
        <button class="modal-close" onclick="closeAdminLogin()">${ICONS.x}</button>
        <div class="modal-header">
          <div class="modal-icon-wrap">${ICONS.lock}</div>
          <h2 class="modal-title">${ICONS.shield} Acceso de administrador</h2>
          <p class="modal-description">Introduce el PIN de 4 dígitos que elegiste al crear la clase <strong>${escapeHtml(dashboardState.classInfo.name)}</strong>.</p>
        </div>
        <div class="modal-body">
          <form id="admin-login-form">
            <input class="input input-pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" id="admin-pin" placeholder="••••" autofocus />
            <div style="display: flex; gap: 0.5rem; margin-top: 1rem; justify-content: center;">
              <button type="button" class="btn btn-outline" onclick="closeAdminLogin()">Cancelar</button>
              <button type="submit" class="btn btn-primary">Entrar</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  const pinInput = document.getElementById("admin-pin");
  pinInput.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });

  document.getElementById("admin-login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const pin = pinInput.value;
    if (!pin) return;
    const ok = await verifyPin(pin, dashboardState.classInfo.adminPinHash);
    if (ok) {
      setAdminSession(dashboardState.classInfo.code);
      dashboardState.isAdmin = true;
      closeAdminLogin();
      updateDashboard();
      showToast("Acceso concedido", "Ahora puedes gestionar los movimientos de la clase.");
    } else {
      showToast("PIN incorrecto", "El PIN introducido no es válido. Inténtalo de nuevo.", "error");
      pinInput.value = "";
      pinInput.focus();
    }
  });
}

function closeAdminLogin() {
  document.getElementById("admin-modal-overlay").classList.remove("open");
}

function handleAdminLogout() {
  clearAdminSession(dashboardState.classInfo.code);
  dashboardState.isAdmin = false;
  updateDashboard();
  showToast("Sesión cerrada", "Ya no estás en modo administrador.");
}

// ============================================================
// MODAL: TRANSACTION FORM
// ============================================================

function openTransactionForm(txId) {
  let editingTx = null;
  if (txId) {
    editingTx = dashboardState.transactions.find((t) => t.id === txId);
    if (!editingTx) return;
  }
  dashboardState.editingTx = editingTx;
  const isEditing = Boolean(editingTx);

  const { classInfo } = dashboardState;
  const currency = classInfo.currency || "EUR";
  const sym = MONEDAS[currency] || "";

  const type = editingTx?.type || "expense";
  const amount = editingTx?.amount || "";
  const description = editingTx?.description || "";
  const category = editingTx?.category || "material";
  const date = editingTx ? toDateInputValue(editingTx.date) : toDateInputValue(Date.now());
  const notes = editingTx?.notes || "";

  const overlay = document.getElementById("tx-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 32rem;">
      <div class="modal">
        <button class="modal-close" onclick="closeTransactionForm()">${ICONS.x}</button>
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">${isEditing ? `${ICONS.pencil} Editar movimiento` : `${ICONS.plus} Nuevo movimiento`}</h2>
          <p class="modal-description">${isEditing ? "Modifica los detalles del movimiento existente." : "Registra un ingreso (aportación de padres) o un gasto (compra de material, actividad, etc.)."}</p>
        </div>
        <div class="modal-body">
          <form id="tx-form">
            <div class="field">
              <div class="label">Tipo de movimiento</div>
              <div class="type-tabs" id="type-tabs">
                <button type="button" class="type-tab ${type === "expense" ? "active-expense" : ""}" data-type="expense">Gasto</button>
                <button type="button" class="type-tab ${type === "income" ? "active-income" : ""}" data-type="income">Ingreso</button>
              </div>
            </div>

            <div class="field-row">
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="amount">Importe</label>
                <div class="amount-wrap">
                  <input class="input amount-input" type="number" step="0.01" min="0" inputmode="decimal" id="amount" placeholder="0,00" value="${amount || ""}" required />
                  <div class="amount-suffix">${sym}</div>
                </div>
              </div>
              <div class="field" style="margin-bottom: 0;">
                <label class="label" for="date">Fecha</label>
                <input class="input" type="date" id="date" value="${date}" required />
              </div>
            </div>

            <div class="field">
              <label class="label" for="description">Concepto</label>
              <input class="input" type="text" id="description" placeholder="${type === "income" ? "p. ej. Aportación mensual padres" : "p. ej. Compra de folios y rotuladores"}" value="${escapeHtml(description)}" required maxlength="120" />
            </div>

            <div class="field">
              <label class="label" for="category">Categoría</label>
              <select class="select" id="category">
                ${Object.entries(CATEGORIAS).map(([key, c]) =>
                  `<option value="${key}" ${category === key ? "selected" : ""}>${c.label}</option>`
                ).join("")}
              </select>
            </div>

            <div class="field" style="margin-bottom: 0;">
              <label class="label" for="notes">Notas <span style="color: var(--slate-400); font-weight: 400;">(opcional)</span></label>
              <textarea class="textarea" id="notes" placeholder="Detalles adicionales: quién lo compró, dónde, número de factura…" maxlength="500">${escapeHtml(notes)}</textarea>
            </div>

            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
              <button type="button" class="btn btn-outline" onclick="closeTransactionForm()">Cancelar</button>
              <button type="submit" class="btn" id="tx-submit" style="background-color: ${type === "income" ? "var(--verde-600)" : "var(--rojo-600)"}; color: white;">
                ${isEditing ? "Guardar cambios" : (type === "income" ? "Registrar ingreso" : "Registrar gasto")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");

  let currentType = type;
  const typeTabs = document.getElementById("type-tabs");
  typeTabs.querySelectorAll(".type-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      currentType = tab.dataset.type;
      typeTabs.querySelectorAll(".type-tab").forEach((t) => {
        t.classList.remove("active-expense", "active-income");
      });
      tab.classList.add(currentType === "expense" ? "active-expense" : "active-income");
      // Actualizar botón submit
      const submitBtn = document.getElementById("tx-submit");
      submitBtn.style.backgroundColor = currentType === "income" ? "var(--verde-600)" : "var(--rojo-600)";
      submitBtn.textContent = isEditing ? "Guardar cambios" : (currentType === "income" ? "Registrar ingreso" : "Registrar gasto");
      // Actualizar placeholder descripción
      document.getElementById("description").placeholder = currentType === "income" ? "p. ej. Aportación mensual padres" : "p. ej. Compra de folios y rotuladores";
    });
  });

  document.getElementById("tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById("amount").value.replace(",", "."));
    const description = document.getElementById("description").value.trim();
    const category = document.getElementById("category").value;
    const date = fromDateInputValue(document.getElementById("date").value);
    const notes = document.getElementById("notes").value.trim();

    if (!amount || amount <= 0) {
      showToast("Cantidad inválida", "Introduce un número mayor que 0.", "error");
      return;
    }
    if (!description) {
      showToast("Concepto requerido", "Describe el movimiento en pocas palabras.", "error");
      return;
    }

    const submitBtn = document.getElementById("tx-submit");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando…";

    try {
      if (isEditing && dashboardState.editingTx) {
        await updateTransaction(classInfo.code, dashboardState.editingTx.id, {
          type: currentType,
          amount, description, category, date,
          notes: notes || undefined,
        });
        showToast("Movimiento actualizado", "Los cambios se han guardado correctamente.");
      } else {
        await addTransaction(classInfo.code, {
          type: currentType,
          amount, description, category, date,
          notes: notes || undefined,
          createdBy: classInfo.adminName,
        });
        showToast(
          currentType === "income" ? "Ingreso registrado" : "Gasto registrado",
          `${description} · ${amount.toFixed(2)} ${sym}`
        );
      }
      closeTransactionForm();
    } catch (err) {
      showToast("Error al guardar", err.message || "Error inesperado.", "error");
      submitBtn.disabled = false;
      submitBtn.textContent = isEditing ? "Guardar cambios" : (currentType === "income" ? "Registrar ingreso" : "Registrar gasto");
    }
  });
}

function closeTransactionForm() {
  document.getElementById("tx-modal-overlay").classList.remove("open");
  dashboardState.editingTx = null;
}

// ============================================================
// MODAL: DELETE CONFIRMATION
// ============================================================

function openDeleteModal(txId) {
  const tx = dashboardState.transactions.find((t) => t.id === txId);
  if (!tx) return;

  const { classInfo } = dashboardState;
  const currency = classInfo.currency || "EUR";

  const overlay = document.getElementById("delete-modal-overlay");
  overlay.innerHTML = `
    <div class="modal-container" style="max-width: 28rem;">
      <div class="modal">
        <div class="modal-header" style="text-align: left;">
          <h2 class="modal-title">¿Eliminar este movimiento?</h2>
          <p class="modal-description">
            Se eliminará el ${tx.type === "income" ? "ingreso" : "gasto"} <strong>"${escapeHtml(tx.description)}"</strong> de <strong>${tx.amount.toFixed(2)} ${currency}</strong>. Esta acción no se puede deshacer.
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline" onclick="closeDeleteModal()">Cancelar</button>
          <button type="button" class="btn btn-danger" onclick="confirmDelete('${tx.id}')">
            ${ICONS.trash} Sí, eliminar
          </button>
        </div>
      </div>
    </div>
  `;
  overlay.classList.add("open");
}

function closeDeleteModal() {
  document.getElementById("delete-modal-overlay").classList.remove("open");
}

async function confirmDelete(txId) {
  const { classInfo, transactions } = dashboardState;
  const tx = transactions.find((t) => t.id === txId);
  if (!tx) return;
  try {
    await deleteTransaction(classInfo.code, txId);
    showToast("Movimiento eliminado", tx.description);
    closeDeleteModal();
  } catch (err) {
    showToast("No se pudo eliminar", err.message || "Error inesperado.", "error");
  }
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

function init() {
  // Si Firebase está configurado pero aún no cargado, esperar
  if (window.FIREBASE_HABILITADO && !firestore) {
    document.addEventListener("firebase-ready", handleRouteChange, { once: true });
    // Por si acaso Firebase falla, mostrar landing tras 3s
    setTimeout(() => {
      if (!firestore) handleRouteChange();
    }, 3000);
  } else {
    handleRouteChange();
  }
}

// Exponer funciones para onclick handlers
window.navigate = navigate;
window.openShareModal = openShareModal;
window.closeShareModal = closeShareModal;
window.copyCodeToClipboard = copyCodeToClipboard;
window.copyLinkToClipboard = copyLinkToClipboard;
window.shareWhatsApp = shareWhatsApp;
window.openAdminLogin = openAdminLogin;
window.closeAdminLogin = closeAdminLogin;
window.handleAdminLogout = handleAdminLogout;
window.openTransactionForm = openTransactionForm;
window.closeTransactionForm = closeTransactionForm;
window.openDeleteModal = openDeleteModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;

// Arrancar
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
