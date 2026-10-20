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
