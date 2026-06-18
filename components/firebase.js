// --- firebase.jsx ---
// Firebase initialization. Exposes `db` and `auth` as global variables.
// MUST be loaded FIRST in index.html — all other components depend on these globals.
// No import/export — CDN Babel global scope.
// Firebase SDK is loaded via CDN <script> tags in index.html before this file.

const firebaseConfig = {
    apiKey: "AIzaSyDzt2Pbx_OyzuKbJbxuxHDv0sT-2Kc4WJo",
    authDomain: "student-os-56.firebaseapp.com",
    databaseURL: "https://student-os-56-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "student-os-56",
    storageBucket: "student-os-56.firebasestorage.app",
    messagingSenderId: "48316901068",
    appId: "1:48316901068:web:a5ffa0834604ee93204469",
    measurementId: "G-3WTE9PD3YC"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// --- Global singletons used by ALL components ---
const db = firebase.database();
const auth = firebase.auth();
