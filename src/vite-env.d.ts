// vite-env.d.ts

/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Add your variable here
    readonly VITE_HELIUS_API_KEY: string
    readonly VITE_EXCHANGERATE_API_KEY: string 
  
    // Add any other VITE_ variables you might define later
    // readonly VITE_SOME_OTHER_VAR: string
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
