import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Register PWA service worker for offline app shell & background audio readiness
try {
  registerSW({
    immediate: false,
    onRegisterError: () => {
      // Ignore SW registration failure inside restricted WebViews
    },
  });
} catch {
  // Ignore SW errors in restricted environments
}

createRoot(document.getElementById('root')!).render(<App />);
