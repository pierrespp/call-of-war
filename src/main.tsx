import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ImageProvider } from '@/src/core/contexts/ImageContext';
import { MapProvider } from '@/src/core/contexts/MapContext';
import { AuthProvider } from '@/src/features/auth/contexts/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ImageProvider>
        <MapProvider>
          <App />
        </MapProvider>
      </ImageProvider>
    </AuthProvider>
  </StrictMode>,
);
