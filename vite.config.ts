import { defineConfig } from 'vite';

export default defineConfig({
  // Assets live in public/ (Vite default).
  // On GitHub Actions the base is set to the repo sub-path so asset URLs resolve correctly.
  base: process.env.GITHUB_ACTIONS ? '/PacManXWeb/' : '/',
});
