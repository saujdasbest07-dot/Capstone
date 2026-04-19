// ── Firebase Configuration ──────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyB32zfiUjjVW2e1r_NQ2uHnMo3vpmIiPJI",
  authDomain: "capstone-67404.firebaseapp.com",
  databaseURL: "https://capstone-67404-default-rtdb.firebaseio.com",
  projectId: "capstone-67404",
  storageBucket: "capstone-67404.firebasestorage.app",
  messagingSenderId: "652399277007",
  appId: "1:652399277007:web:6008926199a95cf9cf18ba",
  measurementId: "G-CCTZP1XGF2"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
