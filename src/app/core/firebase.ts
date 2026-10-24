import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  setPersistence,
  signInWithCredential,
} from 'firebase/auth';
import {
  Firestore,
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { environment } from '../../environments/environment';
import { firebaseConfig } from './firebase.config';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('FIREBASE_APP');
export const AUTH = new InjectionToken<Auth>('FIREBASE_AUTH');
export const FIRESTORE = new InjectionToken<Firestore>('FIRESTORE');

/** Inicializa Firebase una sola vez y expone Auth y Firestore por DI. */
export function provideFirebase(): EnvironmentProviders {
  const emulated = environment.useEmulators;
  // En el emulador usamos un proyecto "demo-" para que nada toque la nube.
  const app = initializeApp(emulated ? { ...firebaseConfig, projectId: 'demo-crm-lead' } : firebaseConfig);
  const auth = getAuth(app);
  auth.languageCode = 'es';
  void setPersistence(auth, browserLocalPersistence);
  const db = initializeFirestore(
    app,
    emulated
      ? {}
      : {
          // Caché offline: la app sigue funcionando sin conexión y sincroniza al volver.
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        },
  );
  if (emulated) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    // Solo en el emulador: login sin popup para pruebas automatizadas.
    (window as unknown as Record<string, unknown>)['__emulatorSignIn'] = (email: string, name: string) =>
      signInWithCredential(
        auth,
        GoogleAuthProvider.credential(JSON.stringify({ sub: email, email, name, email_verified: true })),
      );
  }

  return makeEnvironmentProviders([
    { provide: FIREBASE_APP, useValue: app },
    { provide: AUTH, useValue: auth },
    { provide: FIRESTORE, useValue: db },
  ]);
}
