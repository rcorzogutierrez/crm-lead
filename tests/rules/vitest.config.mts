import { defineConfig } from 'vitest/config';

// Pruebas de firestore.rules contra el emulador de Firestore.
// Se lanzan con `npm run test:rules`, que arranca el emulador y corre esto dentro.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    // Todas las pruebas comparten un emulador y lo limpian entre casos: en serie.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});
