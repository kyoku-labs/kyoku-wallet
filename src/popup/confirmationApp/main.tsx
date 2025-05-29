// src/popup/confirmationApp/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import ConfirmationApp from './confirmationApp';
import '../../styles/index.css'; 
import '../../i18n/i18n'; 

const rootElement = document.getElementById('confirmation-root');
if (!rootElement) {
  document.body.innerHTML = '<div style="color:red;padding:20px;">Error: Confirmation root element (#confirmation-root) not found.</div>';
  throw new Error("Failed to find the root element for confirmation popup (#confirmation-root)");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ConfirmationApp />
  </React.StrictMode>
);