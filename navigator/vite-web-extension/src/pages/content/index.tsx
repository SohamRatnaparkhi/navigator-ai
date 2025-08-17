import { createRoot } from 'react-dom/client';
import './style.css' 
import { isValidUrl } from '../../utils/dom';

const div = document.createElement('div');
div.id = '__root';
document.body.appendChild(div);

const rootContainer = document.querySelector('#__root');
if (!rootContainer) throw new Error("Can't find Content root element");
const root = createRoot(rootContainer);
root.render(
  <div className='absolute bottom-0 left-0 text-xs text-black bg-amber-400 z-50'  >
    content script <span className='your-class'>loaded</span>
  </div>
);

try {
  console.log('content script loaded');
  console.log('content: current url valid?', isValidUrl(location.href));
} catch (e) {
  console.error(e);
}
