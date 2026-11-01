import { defineConfig } from 'vitest/config';

// `npm test`: lógica pura. `npm run test:emulator`: transacción contra el emulador de Firestore.
export default defineConfig({
  test: {
    include: [process.env['FIRESTORE_EMULATOR_HOST'] ? 'src/**/*.{spec,emulator.test}.ts' : 'src/**/*.spec.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
