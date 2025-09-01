// main.js
import { setupClientSideRouting } from './spaRouter.js';
import './browserOps.js'; // Ensure browserOps is loaded first
import { setupReactiveDebugConsole } from './debugTools.js';

// Initialize Tailwind custom theme config (for CDN builds)
window.tailwind = window.tailwind || {};
tailwind.config = {
    theme: {
        extend: {
            colors: {
                'primary': '#17183B',       // Midnight Blue
                'primary-lighter': '#2C2D50',
                'secondary': '#FF7733',     // Ember Orange
                'accent': '#FF5C0A',        // Lava Orange
                'dawn-white': '#FFFBFF',
                'tertiary': '#0E402D',
                'steel-gray': '#2C2D50',
                'light-gray': '#EAEAEAEA',
                'soft-yellow': '#FFF4E5',
                'coral-pink': '#FFA48C',
            },
            fontFamily: {
                heading: ['Poppins', 'Inter', 'sans-serif'],
                body: ['Roboto', 'Open Sans', 'sans-serif'],
                code: ['Fira Code', 'monospace'],
            },
        }
    }
};

// Initialize SPA routing and dev tools after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    setupClientSideRouting();
    setupReactiveDebugConsole();
});
