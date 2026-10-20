// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
//
// Esta es la ÚNICA parte que tienes que tocar para que la app
// funcione de verdad (que todas las familias vean los datos
// desde sus móviles en tiempo real).
//
// Mientras estas variables estén vacías, la app funciona en
// "modo demo" usando el almacenamiento del navegador (perfecto
// para probar, pero los datos NO se comparten entre familias).
//
// CÓMO CONSEGUIR TUS CLAVES:
//   1. Entra en https://console.firebase.google.com
//   2. Crea un proyecto nuevo (gratis) → nombre: "cooperativa-clase"
//   3. En el menú de la izquierda, baja hasta "Build" → "Firestore Database"
//      → "Crear base de datos" → "Modo de producción" → elige una región
//   4. En la página principal del proyecto, pulsa el icono "</>" (Web)
//      para añadir una aplicación web. Pon "cooperativa" como nombre.
//   5. Te mostrará un código con tus claves. Cópialas aquí abajo.
//
// ============================================================

const firebaseConfig = {
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
// El superadmin es quien crea los colegios, las clases y
// asigna a los responsables (admin de cada clase).
//
// - Si SUPERADMIN_PASSWORD está VACÍO: la PRIMERA vez que
//   entres al panel superadmin (?superadmin=1), se te pedirá
//   crear una contraseña. Esa contraseña se guardará hasheada.
// - Si prefieres fijar una contraseña desde aquí, ponla en
//   SUPERADMIN_PASSWORD y se usará esa (sin posibilidad de
//   cambiarla desde el panel).
//
// Acceso al panel: añade ?superadmin=1 a la URL, p. ej.:
//   http://localhost:8000/?superadmin=1
//
// ============================================================

const SUPERADMIN_PASSWORD = "";

// ============================================================
// NO TOCAR NADA DE AQUÍ PARA ABAJO
// ============================================================

// Si TODAS las claves están vacías, modo demo activado.
const FIREBASE_HABILITADO =
  FIREBASE_CONFIG.apiKey &&
  FIREBASE_CONFIG.projectId &&
  FIREBASE_CONFIG.appId &&
  !FIREBASE_CONFIG.apiKey.startsWith("your-");

// Exportar para uso global
window.FIREBASE_CONFIG = FIREBASE_CONFIG;
window.FIREBASE_HABILITADO = FIREBASE_HABILITADO;
window.SUPERADMIN_PASSWORD = SUPERADMIN_PASSWORD;
