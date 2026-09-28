import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Missing root element');
}

const page = new URLSearchParams(location.search).get('page');
const Page = page === 'monsters'
  ? (await import('./MonsterPage')).MonsterPage
  : page === 'items'
    ? (await import('./ItemPage')).ItemPage
    : await loadMapPage();

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);

async function loadMapPage() {
  return (await import('./App')).App;
}
