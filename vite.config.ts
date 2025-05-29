// vite.config.ts
import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default defineConfig(({ mode }): UserConfig => {
  const isDevelopment = mode === 'development';
  console.log(`Vite: Building for mode "${mode}". Development optimizations: ${isDevelopment}`);

  return {
    plugins: [
      react(),
      nodePolyfills({
        protocolImports: true,
        // globals: { Buffer: true, process: true }, // Enable if needed by specific deps
        exclude: ['vm'], // <-- THIS IS THE ADDED LINE
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,

      minify: isDevelopment ? false : 'esbuild',
      sourcemap: isDevelopment ? 'inline' : false,

      rollupOptions: {
        input: {
          // Main UI HTML entry points (usually in /public or project root)
          popup: resolve(__dirname, 'index.html'),
          onboarding: resolve(__dirname, 'onboarding.html'),
          // Confirmation UI HTML entry point (user stated it's in /src root)
          confirmationUI: resolve(__dirname, 'confirmation.html'), // Adjusted path

          // Core extension script entry points (TypeScript files)
          background: resolve(__dirname, 'src/background/index.ts'),
          contentScript: resolve(__dirname, 'src/contentScript/index.ts'),
          injectedScript: resolve(__dirname, 'src/injectedScript/index.ts'),
        },
        output: {
          // Control output file names
          entryFileNames: (chunkInfo) => {
            const { name } = chunkInfo;
            // Specific names for critical extension scripts
            if (name === 'background') return 'background.js';
            if (name === 'contentScript') return 'contentScript.js';
            if (name === 'injectedScript') return 'injected.js';

            // For HTML-linked JS (popup, onboarding, confirmationUI)
            if (isDevelopment) {
              if (name.includes('popup/main')) return `assets/popup-main.js`;
              if (name.includes('onboarding/onboarding-main')) return `assets/onboarding-main.js`;
              if (name.includes('confirmationApp/main')) return `assets/confirmation-main.js`;
            }
            // Default naming for other JS chunks (hashed for production)
            return isDevelopment ? 'assets/[name].js' : 'assets/[name]-[hash].js';
          },
          chunkFileNames: isDevelopment ? 'assets/[name].js' : 'assets/[name]-[hash].js',
          assetFileNames: isDevelopment ? 'assets/[name].[ext]' : 'assets/[name]-[hash].[ext]',
        },
        // OPTIONAL: If excluding 'vm' causes runtime issues and you need to suppress the warning
        // onwarn(warning, warn) {
        //   if (warning.code === 'EVAL' && warning.id?.includes('node_modules/vm-browserify')) {
        //     return; // Suppress eval warning for vm-browserify
        //   }
        //   warn(warning); // Propagate other warnings
        // },
      },
      target: 'esnext',
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      '__DEVELOPMENT__': JSON.stringify(isDevelopment),
    },
    server: {
      port: 3000, // For Vite's dev server, not directly used for extension loading
    },
  };
});