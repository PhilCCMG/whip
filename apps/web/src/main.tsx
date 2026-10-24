import '@fontsource-variable/archivo/wdth.css';
import '@fontsource-variable/inter';
import './styles.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { applySettings, useSettingsStore } from './stores/settings-store';

applySettings(useSettingsStore.getState());

const root = document.getElementById('root');
if (!root) throw new Error('#root element missing');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
