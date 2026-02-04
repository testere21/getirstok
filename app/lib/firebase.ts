import {
  initializeApp,
  getApps,
  type FirebaseApp,
  type FirebaseOptions,
} from "firebase/app";
import {
  getFirestore,
  collection,
  type Firestore,
  type CollectionReference,
} from "firebase/firestore";
import { STOCK_ITEMS_COLLECTION } from "./types";

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Firebase config kontrolü - development modunda uyarı göster
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
  const missingConfigs = Object.entries(firebaseConfig)
    .filter(([_, value]) => !value)
    .map(([key]) => key);
  
  if (missingConfigs.length > 0) {
    console.warn(
      "⚠️ Firebase config eksik! Şu değerler tanımlı değil:",
      missingConfigs.join(", ")
    );
    console.warn(
      "📝 Lütfen .env.local dosyasında Firebase config değerlerini tanımlayın."
    );
  } else {
    console.log("✅ Firebase config yüklendi:", {
      projectId: firebaseConfig.projectId,
      apiKey: firebaseConfig.apiKey ? `${firebaseConfig.apiKey.substring(0, 10)}...` : "YOK",
    });
  }
}

let app: FirebaseApp;
if (getApps().length > 0) {
  app = getApps()[0] as FirebaseApp;
} else {
  try {
    app = initializeApp(firebaseConfig);
  } catch (error) {
    console.error("❌ Firebase initialize hatası:", error);
    throw error;
  }
}

export const db: Firestore = getFirestore(app);

// Not: IndexedDB persistence bazı durumlarda IndexedDB transaction hatalarına neden olabiliyor
// Bu yüzden şimdilik devre dışı bırakıldı. Gelecekte daha güvenli bir şekilde etkinleştirilebilir.
// Firestore'un kendi cache mekanizması zaten var ve ilk yükleme için yeterli olmalı.

export const stockItemsCollectionRef: CollectionReference = collection(
  db,
  STOCK_ITEMS_COLLECTION
);
