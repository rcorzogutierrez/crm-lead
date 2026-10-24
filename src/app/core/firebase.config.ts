import { FirebaseOptions } from 'firebase/app';

/**
 * Configuración web pública de Firebase (no es un secreto: la seguridad
 * la dan las reglas de Firestore y los dominios autorizados de Auth).
 */
export const firebaseConfig: FirebaseOptions = {
  apiKey: 'AIzaSyDvoQA1dVyLSKAC3FswfX3YgTpoP0KWXi4',
  authDomain: 'crm-lead-follow-up.firebaseapp.com',
  projectId: 'crm-lead-follow-up',
  storageBucket: 'crm-lead-follow-up.firebasestorage.app',
  messagingSenderId: '446590405591',
  appId: '1:446590405591:web:ac80104d9fb702d4aa1992',
  measurementId: 'G-G1C7CSE4RH',
};
