import { WebGPUContext } from './src/gpu/WebGPUContext.js';
import { AVBDSolver } from './src/gpu/AVBDSolver.js';
import { Overlay } from './src/ui/Overlay.js';

const gpu = new WebGPUContext();
let solver = null;
let overlay = null;
let isRunning = false;
let lastTime = 0;

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
    // We don't have a status element anymore in the same way, 
    // but Overlay might create one or we can just log.
    console.log('Initializing...');

    try {
        await gpu.init('simCanvas');
        console.log('WebGPU Initialized');

        solver = new AVBDSolver(gpu);
        await solver.init();

        // Initialize UI Overlay
        overlay = new Overlay(solver, mouse);

        console.log('Simulation Running');

        // Input Handling
        setupInput();

        // Resize handling
        window.addEventListener('resize', () => {
            gpu.resize();
            solver.updateParams();
        });
        gpu.resize();

        // Start loop
        isRunning = true;
        requestAnimationFrame(loop);

    } catch (error) {
        console.error(error);
        document.body.innerHTML += `<div style="color:red; padding:20px">Error: ${error.message}</div>`;
    }
}

function setupInput() {
    const canvas = document.getElementById('simCanvas');

    // Mouse Events
    // Mouse Events
    // Move move/up to window to handle drags outside canvas/over UI
    window.addEventListener('mousemove', (e) => {
        mouse.prevX = mouse.x;
        mouse.prevY = mouse.y;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.dx = mouse.x - mouse.prevX;
        mouse.dy = mouse.y - mouse.prevY;
        updateMouseVisual();
    });

    canvas.addEventListener('mousedown', (e) => {
        mouse.isDown = true;
        mouse.button = e.button;
        e.preventDefault();
    });

    window.addEventListener('mouseup', () => mouse.isDown = false);

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'r') {
            if (solver) solver.initParticles(overlay ? overlay.currentScene : 'grid');
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

function loop(timestamp) {
    if (!isRunning) return;

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;

    // Physics & Render
    if (solver) {
        solver.update(Math.min(dt, 0.1), mouse);
    }

    requestAnimationFrame(loop);
}

// Start
init();
