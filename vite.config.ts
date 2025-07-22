// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/mt4_to_Pinescript_b/', // <-- ¡IMPORTANTE! Cambia esto.
});