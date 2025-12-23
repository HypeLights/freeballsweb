import { Overlay } from './src/ui/Overlay.js';
import { SolverProxy } from './src/worker/SolverProxy.js';

let worker = null;
let solverProxy = null;
let overlay = null;

// Mouse State
const mouse = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    dx: 0,
    dy: 0,
    isDown: false,
    button: 0, // 0: Left, 1: Middle, 2: Right
    radius: 200,
    power: 200
};

async function init() {
    console.log('Initializing Main Thread...');

    const canvas = document.getElementById('simCanvas');

    // Create Worker
    worker = new Worker('./src/worker/simulationWorker.js', { type: 'module' });

    // Create Solver Proxy
    solverProxy = new SolverProxy(worker);
    solverProxy.init();

    // Transfer Control to Worker
    const offscreen = canvas.transferControlToOffscreen();

    worker.postMessage({
        type: 'INIT',
        payload: {
            canvas: offscreen,
            width: window.innerWidth,
            height: window.innerHeight
        }
    }, [offscreen]);

    // Initialize UI Overlay
    overlay = new Overlay(solverProxy, mouse);

    console.log('UI Initialized');

    // Input Handling
    setupInput(canvas);

    // Resize handling
    window.addEventListener('resize', () => {
        worker.postMessage({
            type: 'RESIZE',
            payload: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        });
    });

    // Listen for stats from worker
    worker.onmessage = (e) => {
        const { type, payload } = e.data;
        if (type === 'STATS') {
            if (solverProxy) solverProxy.updateStats(payload);
        } else if (type === 'PARAMS_SYNC') {
            if (solverProxy) {
                Object.assign(solverProxy._params, payload);
            }
            if (overlay) {
                overlay.updateAllSliders();
            }
        }
    };
}

function setupInput(canvas) {
    // Mouse Events
    window.addEventListener('mousemove', (e) => {
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.dx = mouse.x - mouse.prevX;
        mouse.dy = mouse.y - mouse.prevY;

        updateMouseVisual();

        // Send to Worker
        worker.postMessage({
            type: 'UPDATE_MOUSE',
            payload: mouse
        });
    });

    // Note: mousedown/up on canvas might not fire if canvas is offscreen? 
    // Actually, DOM events still fire on the canvas ELEMENT even if context is offscreen.
    canvas.addEventListener('mousedown', (e) => {
        mouse.isDown = true;
        mouse.button = e.button;
        e.preventDefault();
        worker.postMessage({ type: 'UPDATE_MOUSE', payload: mouse });
    });

    window.addEventListener('mouseup', () => {
        mouse.isDown = false;
        worker.postMessage({ type: 'UPDATE_MOUSE', payload: mouse });
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'r') {
            if (solverProxy) solverProxy.initParticles(overlay ? overlay.currentScene : 'grid');
        }

    });

    // Prevent context menu (Right Click)
    canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        return false;
    });

    // Scroll to change radius
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * -20;
        mouse.radius = Math.max(50, Math.min(600, mouse.radius + delta));

        // Sync with Solver and UI
        if (solverProxy) {
            solverProxy.mouseRadius = mouse.radius;

            // Update UI Slider
            const slider = document.getElementById('inp-mouse-radius');
            const label = document.getElementById('val-mouse-radius');
            if (slider && label) {
                slider.value = mouse.radius;
                label.textContent = mouse.radius;
            }
        }

        updateMouseVisual();
        showRadiusFeedback();
    }, { passive: false });
}

// Visual Feedback for Mouse Radius
let feedbackTimeout;
function showRadiusFeedback() {
    let feedback = document.getElementById('radiusFeedback');
    if (!feedback) {
        feedback = document.createElement('div');
        feedback.id = 'radiusFeedback';
        feedback.style.position = 'absolute';
        feedback.style.pointerEvents = 'none';
        feedback.style.border = '2px solid rgba(255, 255, 255, 0.5)';
        feedback.style.borderRadius = '50%';
        feedback.style.transform = 'translate(-50%, -50%)';
        feedback.style.transition = 'opacity 0.5s';
        document.body.appendChild(feedback);
    }

    feedback.style.width = (mouse.radius * 2) + 'px';
    feedback.style.height = (mouse.radius * 2) + 'px';
    feedback.style.left = mouse.x + 'px';
    feedback.style.top = mouse.y + 'px';
    feedback.style.opacity = '1';

    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
        feedback.style.opacity = '0';
    }, 1000);
}

function updateMouseVisual() {
    const feedback = document.getElementById('radiusFeedback');
    if (feedback && feedback.style.opacity !== '0') {
        feedback.style.left = mouse.x + 'px';
        feedback.style.top = mouse.y + 'px';
        feedback.style.width = (mouse.radius * 2) + 'px';
        feedback.style.height = (mouse.radius * 2) + 'px';
    }
}

// Start
init();

