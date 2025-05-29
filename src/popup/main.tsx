// src/popup/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css'; 
import MainPopupApp from './MainPopupApp'; 
import { SolanaProvider } from '../context/SolanaContext'; 
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../i18n/i18n'; 
import i18n from '../i18n/i18n';

// Configure React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 20, // How long data is considered fresh (20 seconds)
      refetchOnWindowFocus: false, // Don't refetch just because popup regained focus
      retry: 1, // Retry failed queries once
    },
  },
});

// --- Helius API Key Check (Optional but recommended) ---
const HELIUS_API_KEY = import.meta.env.VITE_HELIUS_API_KEY;

if (!HELIUS_API_KEY) {
  //  console.error("[POPUP MAIN] WARNING: Helius API key not found in environment variables! Public RPCs will be used as fallback.");
}
// --- End Helius Check ---


const rootElement = document.getElementById('root');
if (!rootElement) {
    // Attempt to use i18n instance for the error message if available, otherwise fallback to English
    const errorText = i18n.isInitialized ? i18n.t('main.errors.rootNotFound') : 'Error: Root element not found. Cannot render application.';
    document.body.innerHTML = `<div style="color: red; padding: 20px;">${errorText}</div>`;
    throw new Error("Failed to find the root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SolanaProvider>
        <MainPopupApp />
      </SolanaProvider>
    </QueryClientProvider>
  </StrictMode>
);