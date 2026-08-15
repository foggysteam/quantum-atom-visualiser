import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('missing #root element');

// StrictMode is deliberately NOT used here.
//
// In development it double-invokes effects: mount, unmount, mount again. For
// ordinary components that is a useful bug detector, but this app creates a
// WebGL2 context in a mount effect, and a canvas only ever hands out ONE
// context. The second getContext('webgl2') call returns the same object we just
// disposed, so the renderer would silently come back attached to a dead
// context. The failure looks like a blank screen with no error, which is a
// miserable thing to debug.
createRoot(container).render(<App />);
