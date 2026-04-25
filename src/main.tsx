import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ImageProvider } from './contexts/ImageContext.tsx';
import { MapProvider } from './contexts/MapContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ImageProvider>
      <MapProvider>
        <App />
      </MapProvider>
    </ImageProvider>
  </StrictMode>,
);
