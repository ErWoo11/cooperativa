// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
//
// Esta es la ÚNICA parte que tienes que tocar para que la app
// funcione de verdad (que todas las familias vean los datos
// desde sus móviles en tiempo real).
//
// Mientras estas variables estén vacías, la app funciona en
// "modo demo" usando el almacenamiento del navegador.
//
// CÓMO CONSEGUIR TUS CLAVES:
//   1. Entra en https://console.firebase.google.com
//   2. Crea un proyecto nuevo (gratis)
//   3. Build → Firestore Database → Crear base de datos
//   4. En la página principal del proyecto, pulsa "</>" (Web)
//   5. Te mostrará un código con tus claves. Cópialas aquí abajo.
//
// IMPORTANTE: respeta las comillas y las comas. Si pegas las
// claves con un formato raro (comillas tipográficas " ", falta
// de comas...), la app no arrancará.
//
// ============================================================

// Inicializamos como objetos vacíos por seguridad
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyCi63uULiZMehJNQAeowl_s51qbz0zKvys",
  authDomain: "cooperativa-67101.firebaseapp.com",
  projectId: "cooperativa-67101",
  storageBucket: "cooperativa-67101.firebasestorage.app",
  messagingSenderId: "1067140503135",
  appId: "1:1067140503135:web:953681dbda919b0872edea"
};

// ============================================================
// CONFIGURACIÓN DEL SUPERADMINISTRADOR
// ============================================================
//
// - Si SUPERADMIN_PASSWORD está VACÍO: la PRIMERA vez que
//   entres al panel superadmin (?superadmin=1), se te pedirá
//   crear una contraseña.
// - Si prefieres fijar una desde aquí, ponla en esta variable.
//
// Acceso: añade ?superadmin=1 a la URL, p. ej.:
//   http://localhost:8000/?superadmin=1
// ============================================================

var SUPERADMIN_PASSWORD = "";

// ============================================================
// NO TOCAR NADA DE AQUÍ PARA ABAJO
// ============================================================

// Hacer disponibles en window lo antes posible (por si la
// configuración de arriba falla, app.js puede detectarlo).
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.SUPERADMIN_PASSWORD = SUPERADMIN_PASSWORD;

// Detectar si Firebase está habilitado de forma segura.
// Usamos try/catch para que la app no rompa aunque los valores
// sean undefined, null o de tipo inesperado.
var FIREBASE_HABILITADO = false;
try {
  var cfg = FIREBASE_CONFIG || {};
  var apiKey = String(cfg.apiKey || "").trim();
  var projectId = String(cfg.projectId || "").trim();
  var appId = String(cfg.appId || "").trim();

  FIREBASE_HABILITADO =
    apiKey.length > 0 &&
    projectId.length > 0 &&
    appId.length > 0 &&
    !apiKey.startsWith("your-") &&
    !projectId.startsWith("your-");
} catch (err) {
  // Si algo falla, nos quedamos en modo demo
  FIREBASE_HABILITADO = false;
  console.error("Error leyendo FIREBASE_CONFIG:", err);
}

window.FIREBASE_HABILITADO = FIREBASE_HABILITADO;

// Mensaje informativo en la consola para que sepas en qué modo estás
if (FIREBASE_HABILITADO) {
  console.log(
    "%c✓ Cooperativa Escolar · Modo Firebase",
    "color: #047857; font-weight: bold;"
  );
} else {
  console.log(
    "%c● Cooperativa Escolar · Modo demo (datos locales)",
    "color: #b45309; font-weight: bold;"
  );
  console.log(
    "Para activar Firebase: rellena FIREBASE_CONFIG en firebase-config.js"
  );
}
