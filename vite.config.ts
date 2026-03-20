import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  // Serve assets from the original Resources folder during development.
  // When publishing as a standalone repo, copy PacManX/Resources/ into public/.
  publicDir: path.resolve(__dirname, 'public/'),
});
