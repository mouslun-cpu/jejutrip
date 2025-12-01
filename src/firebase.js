// src/firebase.js

// 1. 引入必要的 Firebase 功能
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // 我們手動加入了這個，為了用資料庫

// 2. 您的專屬設定
const firebaseConfig = {
    apiKey: "AIzaSyA6cdAoNHfl-zXXfKmt3HhYsIz1TYb_k5I",
    authDomain: "jeju-trip-app.firebaseapp.com",
    projectId: "jeju-trip-app",
    storageBucket: "jeju-trip-app.firebasestorage.app",
    messagingSenderId: "457144403596",
    appId: "1:457144403596:web:6a9c770d170c97c8d35da9",
    measurementId: "G-FN64LZ1GMM"
};

// 3. 初始化 Firebase
const app = initializeApp(firebaseConfig);

// 4. 初始化並匯出資料庫 (這步最重要，讓 App.vue 可以讀到資料庫)
const db = getFirestore(app);

export { db };