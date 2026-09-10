import { getApps, initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore, initializeFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

/**
 * Configuração pública do Firebase Web App do TESOURARIA AM NOVO.
 *
 * Este projeto é dedicado exclusivamente ao aplicativo AM NOVO,
 * mantendo Auth, Firestore, Storage e Hosting isolados do MM, FM e
 * dos demais projetos Firebase.
 *
 * As variáveis VITE_* podem sobrescrever os valores abaixo quando
 * desejarmos usar outro ambiente no futuro.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBPthrlMSV3zYD-XtPaAR__t1bmhuoqhG8',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'tesouraria-am-novo.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tesouraria-am-novo',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tesouraria-am-novo.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '341455572788',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:341455572788:web:1765c9855d86ac70df5f61',
}

export const firebaseApp = getApps()[0] ?? initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)

// Os controles financeiros possuem metadados opcionais por parcela
// (aprovação, baixa, usuário responsável). O Firestore deve ignorar campos
// opcionais ainda não preenchidos, sem transformar isso em erro de gravação.
let firestoreDb
try {
  firestoreDb = initializeFirestore(firebaseApp, { ignoreUndefinedProperties: true })
} catch {
  firestoreDb = getFirestore(firebaseApp)
}
export const db = firestoreDb

export const storage = getStorage(firebaseApp)
export const firebaseProjectId = firebaseConfig.projectId
