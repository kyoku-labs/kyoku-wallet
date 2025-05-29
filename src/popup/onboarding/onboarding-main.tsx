// src/popup/onboarding/onboarding-main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import OnboardingApp from './OnboardingApp';
import '../../i18n/i18n'; 

ReactDOM.createRoot(document.getElementById('onboarding-root')!).render(
  <React.StrictMode>
    <OnboardingApp />
  </React.StrictMode>
);