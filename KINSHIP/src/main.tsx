import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { openIndexedDbStore } from '@/persistence/indexeddb-store';
import '@/app/styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('KINSHIP could not find the page root.');

if (typeof indexedDB === 'undefined') {
  root.innerHTML = '<p class="boot">This browser does not provide IndexedDB, so KINSHIP cannot keep an archive here.</p>';
} else {
  createRoot(root).render(
    <StrictMode>
      <App store={openIndexedDbStore()} />
    </StrictMode>,
  );
}
