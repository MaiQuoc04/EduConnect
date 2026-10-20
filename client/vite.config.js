import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development, /api and /socket.io are forwarded to the Express server on port 5000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
  },
});
