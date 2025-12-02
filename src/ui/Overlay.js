export class Overlay {
    constructor(solver, mouse) {
        this.solver = solver;
        this.mouse = mouse;
        this.container = document.getElementById('ui-container');
        this.isHidden = false;
        this.currentScene = 'grid';
        this.showPauseOverlay = true;
        this.init();
        this.setupKeyboardListener();
    }

    init() {
        this.container.innerHTML = '';
        this.createStyles();
        this.createControls();
        this.createStatsOverlay();
        this.createPauseOverlay();
        this.createToast();
        this.makePanelsDraggable();
        this.makePanelsCollapsable();
        this.startStatsLoop();
    }

    createStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .ui-panel {
                cursor: move;
                user-select: none;
                position: relative;
                width: 300px;
                max-width: 100%;
                background: rgba(20, 20, 30, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 15px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                font-family: 'Inter', sans-serif;
            }
            .ui-panel h2 {
                margin: 0 0 15px 0;
                font-size: 24px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 1px;
                color: white;
            }
            .gpu-text {
                background-clip: text;
                -webkit-background-clip: text;
                color: transparent;
                background-image: linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet);
                background-size: 200% auto;
                animation: shine 20s ease-in-out infinite alternate;
            }
            @keyframes shine {
                to {
                    background-position: 100% center;
                }
            }
            .control-section {
                margin-bottom: 10px;
            }
            .control-section.collapsed .control-row,
            .control-section.collapsed select,
            .control-section.collapsed button,
            .control-section.collapsed .scene-selector,
            .control-section.collapsed .custom-select {
                display: none !important;
            }
            .ui-panel h3 {
                cursor: pointer;
                position: relative;
                padding-right: 25px;
                margin-top: 5px;
                margin-bottom: 10px;
                font-size: 14px;
                color: #aaa;
                text-transform: uppercase;
                letter-spacing: 1px;
                border-bottom: 1px solid rgba(255,255,255,0.1);
                padding-bottom: 5px;
            }
            .ui-panel h3::after {
                content: '▼';
                position: absolute;
                right: 5px;
                font-size: 0.8em;
                transition: transform 0.2s;
            }
            .control-section.collapsed h3::after {
                transform: rotate(-90deg);
            }
            .control-row {
                margin-bottom: 10px;
                font-size: 14px;
                color: #ddd;
            }
            .control-row label {
                display: flex;
                justify-content: space-between;
                margin-bottom: 4px;
            }
            .control-row input[type=range] {
                width: 100%;
                cursor: pointer;
            }
            .action-btn {
                width: 100%;
                padding: 10px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: white;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 15px;
                transition: background 0.2s;
            }
            .action-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }
            #ui-container.hidden {
                display: none !important;
            }
            .toggle-ui-btn {
                background: transparent;
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: white;
                cursor: pointer;
                border-radius: 4px;
                font-size: 12px;
                padding: 6px 12px;
                transition: background 0.2s;
            }
            .toggle-ui-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .stats-overlay {
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(0, 0, 0, 0.5);
                padding: 8px 12px;
                border-radius: 6px;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                color: #0f0;
                pointer-events: none;
                z-index: 9999;
                line-height: 1.4;
                text-align: right;
            }
            .stats-overlay.hidden {
                display: none;
            }
            .scene-selector {
                width: 100%;
                padding: 8px;
                background: rgba(30, 30, 40, 0.8);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: white;
                border-radius: 4px;
                margin-bottom: 15px;
                cursor: pointer;
                font-size: 14px;
            }
            .scene-selector:hover {
                background: rgba(40, 40, 50, 0.9);
            }
            .custom-select {
                position: relative;
                width: 100%;
                font-family: 'Inter', sans-serif;
            }
            .select-selected {
                background-color: #333;
                color: white;
                padding: 8px 10px;
                border: 1px solid #555;
                border-radius: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .select-selected:after {
                content: "";
                width: 0;
                height: 0;
                border: 6px solid transparent;
                border-color: #fff transparent transparent transparent;
            }
            .select-selected.select-arrow-active:after {
                border-color: transparent transparent #fff transparent;
                top: 7px;
            }
            .select-items {
                position: absolute;
                background-color: #222;
                top: 100%;
                left: 0;
                right: 0;
                z-index: 99;
                border: 1px solid #555;
                border-radius: 4px;
                max-height: 300px;
                overflow-y: auto;
            }
            .select-hide {
                display: none;
            }
            .select-items div {
                color: #ffffff;
                padding: 8px 10px;
                cursor: pointer;
                border-bottom: 1px solid #333;
                display: flex;
                align-items: center;
            }
            .select-items div:hover {
                background-color: #444;
                color: white !important;
            }
            .gradient-preview {
                width: 20px;
                height: 20px;
                border-radius: 50%;
                margin-right: 10px;
                display: inline-block;
                border: 1px solid rgba(255,255,255,0.3);
            }
            #btn-reset:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
            }
            .select-selected:hover {
                background-color: rgba(40, 40, 50, 0.9);
            }
            .modal-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 1000;
                backdrop-filter: blur(5px);
            }
            .modal-content {
                background: linear-gradient(145deg, #1a1a2e 0%, #16213e 100%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 16px;
                padding: 40px;
                max-width: 600px;
                width: 90%;
                color: white;
                box-shadow: 0 20px 50px rgba(0,0,0,0.6);
                position: relative;
                font-family: 'Inter', sans-serif;
                text-align: center;
            }
            .modal-title {
                font-size: 36px;
                margin-bottom: 10px;
                font-weight: 800;
                background: linear-gradient(90deg, #fff, #4facfe);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                letter-spacing: -1px;
            }
            .modal-subtitle {
                font-size: 16px;
                color: rgba(255, 255, 255, 0.6);
                margin-bottom: 30px;
            }
            .keybind-table {
                width: 100%;
                border-collapse: collapse;
                margin: 20px 0;
                text-align: left;
                background: rgba(255, 255, 255, 0.03);
                border-radius: 8px;
                overflow: hidden;
            }
            .keybind-table td {
                padding: 12px 20px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }
            .keybind-table tr:last-child td {
                border-bottom: none;
            }
            .keybind-key {
                background: rgba(255, 255, 255, 0.1);
                padding: 4px 10px;
                border-radius: 6px;
                font-family: monospace;
                font-weight: bold;
                color: #4facfe;
                font-size: 14px;
                display: inline-block;
                min-width: 80px;
                text-align: center;
            }
            .pause-overlay {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.6);
                padding: 20px 40px;
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                color: white;
                font-size: 32px;
                font-weight: 800;
                letter-spacing: 4px;
                text-transform: uppercase;
                pointer-events: none;
                z-index: 2000;
                backdrop-filter: blur(4px);
                opacity: 0;
                transition: opacity 0.2s;
            }
            .pause-overlay.visible {
                opacity: 1;
            }
            .toast-notification {
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: rgba(20, 20, 30, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: white;
                padding: 12px 24px;
                border-radius: 30px;
                font-size: 14px;
                z-index: 3000;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 5px 15px rgba(0,0,0,0.5);
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .toast-notification.visible {
                transform: translateX(-50%) translateY(0);
            }
            .toast-icon {
                color: #4facfe;
                font-size: 18px;
            }
            .modal-close-btn {
                position: absolute;
                top: 20px;
                left: 20px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                color: rgba(255, 255, 255, 0.7);
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                font-size: 18px;
                line-height: 1;
                padding: 0;
            }
            .modal-close-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                transform: scale(1.1);
            }
            .donate-btn {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                color: white;
                padding: 12px 30px;
                border-radius: 25px;
                text-decoration: none;
                font-size: 16px;
                font-weight: 600;
                transition: transform 0.2s, box-shadow 0.2s;
                display: inline-block;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            .donate-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.4);
            }
        `;
        document.head.appendChild(style);
    }

    createControls() {
        const panel = document.createElement('div');
        panel.className = 'ui-panel';
        panel.innerHTML = `
            <h2 id="app-logo">FreeBalls<span class="gpu-text">WEB</span> <span style="font-size: 0.4em; opacity: 0.5; vertical-align: bottom; margin-bottom: 4px; display: inline-block;">v1.0</span></h2>
            <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                <button id="btn-about" class="toggle-ui-btn" style="flex: 1;">About</button>
                <button id="btn-hide-ui" class="toggle-ui-btn" style="flex: 1;">Hide UI</button>
            </div>
            
            <div class="control-section">
                <h3>Scene</h3>
                <select id="scene-select" class="scene-selector">
                    <option value="grid">Grid</option>
                    <option value="galton">Galton Board</option>
                    <option value="fountain">Fountain</option>
                    <option value="fireworks">Fireworks</option>
                    <option value="wave">Wave</option>
                    <option value="lattice">Lattice</option>
                    <option value="chaos">Chaos</option>
                    <option value="collision">Collision</option>
                </select>
                
                <div class="control-row">
                    <label>Color Scheme</label>
                    <div class="custom-select" id="custom-color-select">
                        <!-- Custom Dropdown -->
                    </div>
                </div>
            </div>

            <div class="control-section">
                <h3>Controls</h3>
                 <!-- Controls moved to specific sections -->
                 <div class="control-row">
                    <label>Simulation Speed <span id="val-speed">1.0</span></label>
                    <input type="range" id="inp-speed" min="0.1" max="2.0" step="0.1" value="1.0" />
                </div>
                <div class="control-row">
                    <label>Show Pause Overlay <input type="checkbox" id="chk-pause-overlay" checked /></label>
                </div>
            </div>
            
            <div class="control-section">
                <h3>Physics</h3>
                <div class="control-row">
                    <label>Gravity <span id="val-gravity">4</span></label>
                    <input type="range" id="inp-gravity" min="0" max="20" step="0.1" value="4" />
                </div>
                <div class="control-row">
                    <label>Restitution <span id="val-restitution">0.8</span></label>
                    <input type="range" id="inp-restitution" min="0" max="1.5" step="0.05" value="0.8" />
                </div>
                <div class="control-row">
                    <label>Damping <span id="val-damping">0.999</span></label>
                    <input type="range" id="inp-damping" min="0.9" max="1.0" step="0.001" value="0.999" />
                </div>
                <div class="control-row">
                    <label>Substeps <span id="val-substeps">32</span></label>
                    <input type="range" id="inp-substeps" min="1" max="64" step="1" value="32" />
                </div>
            </div>

            <div class="control-section">
                <h3>Particles</h3>
                <div class="control-row">
                    <label>Max Balls <span id="val-count">4000</span></label>
                    <input type="range" id="inp-count" min="100" max="100000" step="100" value="4000" />
                </div>
                <div class="control-row">
                    <label>Ball Radius <span id="val-ball-radius">10</span></label>
                    <input type="range" id="inp-ball-radius" min="1" max="30" step="0.5" value="10" />
                </div>
            </div>

            <div class="control-section">
                <h3>Interaction</h3>
                <div class="control-row">
                    <label>Mouse Power <span id="val-mouse-power">250</span></label>
                    <input type="range" id="inp-mouse-power" min="0" max="1000" step="10" value="250" />
                </div>
                <div class="control-row">
                    <label>Mouse Radius <span id="val-mouse-radius">200</span></label>
                    <input type="range" id="inp-mouse-radius" min="50" max="600" step="10" value="200" />
                </div>
            </div>



            <div class="control-section collapsed">
                <h3>Render</h3>
                <div class="control-row">
                    <label>Bloom <input type="checkbox" id="chk-bloom" checked /></label>
                </div>
                <div class="control-row">
                    <label>Anti-aliasing <input type="checkbox" id="chk-aa" checked /></label>
                </div>
                <div class="control-row">
                    <label>Bloom Strength <span id="val-bloom-strength">0.2</span></label>
                    <input type="range" id="inp-bloom-strength" min="0" max="3" step="0.1" value="0.2" />
                </div>
                <div class="control-row">
                    <label>Bloom Radius <span id="val-bloom-radius">0.2</span></label>
                    <input type="range" id="inp-bloom-radius" min="0.1" max="2.0" step="0.1" value="0.2" />
                </div>
                <div class="control-row">
                    <label>Bloom Threshold <span id="val-bloom-thresh">0.9</span></label>
                    <input type="range" id="inp-bloom-thresh" min="0" max="1.0" step="0.1" value="0.9" />
                </div>

            </div>
            <button id="btn-reset" class="action-btn">Reset Simulation</button>
        `;
        this.container.appendChild(panel);

        // Hide Button Logic
        const btnHide = document.getElementById('btn-hide-ui');
        if (btnHide) {
            btnHide.addEventListener('click', () => {
                this.toggleUI();
            });
        }

        // Initialize Custom Dropdown
        this.initCustomDropdown();

        // Scene selector
        const sceneSelect = document.getElementById('scene-select');
        if (sceneSelect) {
            sceneSelect.addEventListener('change', (e) => {
                this.currentScene = e.target.value;
                this.solver.initParticles(this.currentScene);
                this.updateActiveScenePanel();
            });
        }

        // Active Scene Panel
        this.createActiveScenePanel();
        this.updateActiveScenePanel();

        // Controls
        this.bindSlider('inp-speed', 'val-speed', v => {
            this.solver.simSpeed = parseFloat(v);
        });

        const chkPause = document.getElementById('chk-pause-overlay');
        if (chkPause) {
            chkPause.addEventListener('change', (e) => {
                this.showPauseOverlay = e.target.checked;
                // If currently paused, update visibility immediately
                if (this.solver.paused) {
                    this.togglePauseOverlay(this.showPauseOverlay);
                } else {
                    this.togglePauseOverlay(false);
                }
            });
        }

        // Physics Bindings
        this.bindSlider('inp-gravity', 'val-gravity', v => this.solver.gravity = parseFloat(v));
        this.bindSlider('inp-restitution', 'val-restitution', v => this.solver.restitution = parseFloat(v));
        this.bindSlider('inp-damping', 'val-damping', v => this.solver.damping = parseFloat(v));
        this.bindSlider('inp-substeps', 'val-substeps', v => this.solver.substeps = parseInt(v));

        // Interaction Bindings
        this.bindSlider('inp-mouse-power', 'val-mouse-power', v => this.solver.mousePower = parseFloat(v));
        this.bindSlider('inp-mouse-radius', 'val-mouse-radius', v => this.solver.mouseRadius = parseFloat(v));

        this.bindSlider('inp-count', 'val-count', v => {
            const count = parseInt(v);
            if (this.currentScene === 'grid') {
                this.solver.particleCount = count;
                this.solver.initParticles('grid');
            } else {
                this.solver.setParticleCount(count);
            }
        });

        this.bindSlider('inp-ball-radius', 'val-ball-radius', v => {
            const r = parseFloat(v);

            // Dynamic Max Count Logic
            // Prevent impossible scenes by limiting max count based on ball size.
            // Area = Width * Height. Ball Area = PI * r^2.
            // Packing factor ~0.5 for loose movement.
            const area = window.innerWidth * window.innerHeight;
            const ballArea = Math.PI * r * r;
            const maxSafeCount = Math.floor((area * 0.5) / ballArea);

            // Update Slider Max
            const countSlider = document.getElementById('inp-count');
            countSlider.max = Math.min(300000, maxSafeCount); // Cap at 300k

            // Clamp current value if needed
            if (parseInt(countSlider.value) > countSlider.max) {
                countSlider.value = countSlider.max;
                document.getElementById('val-count').textContent = countSlider.max;
                this.solver.particleCount = parseInt(countSlider.max);
            }

            // Real-time update for ALL scenes (as requested)
            this.solver.ballRadius = r;
            this.solver.cellSize = Math.max(20, r * 2.5);
            // No reset called. Solver.update handles the radius change.
        });
        this.bindSlider('inp-rate', 'val-rate', v => this.solver.spawnRate = parseFloat(v));

        // Interaction Bindings (Mouse)
        this.bindSlider('inp-mouse-power', 'val-mouse-power', v => {
            this.solver.mousePower = parseFloat(v);
            this.solver.updateParams();
        });
        this.bindSlider('inp-mouse-radius', 'val-mouse-radius', v => {
            this.solver.mouseRadius = parseFloat(v);
            this.solver.updateParams();
        });

        // Render Bindings
        const chkBloom = document.getElementById('chk-bloom');
        if (chkBloom) {
            chkBloom.addEventListener('change', (e) => {
                this.solver.bloomEnabled = e.target.checked;
                this.solver.updateParams();
            });
        }
        const chkAA = document.getElementById('chk-aa');
        if (chkAA) {
            chkAA.addEventListener('change', (e) => {
                this.solver.aaEnabled = e.target.checked;
                this.solver.updateParams();
            });
        }
        this.bindSlider('inp-bloom-strength', 'val-bloom-strength', v => {
            this.solver.bloomStrength = parseFloat(v);
            this.solver.updateParams();
        });
        this.bindSlider('inp-bloom-radius', 'val-bloom-radius', v => {
            this.solver.bloomRadius = parseFloat(v);
            this.solver.updateParams();
        });
        this.bindSlider('inp-bloom-thresh', 'val-bloom-thresh', v => {
            this.solver.bloomThreshold = parseFloat(v);
            this.solver.updateParams();
        });

        const btnReset = document.getElementById('btn-reset');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                this.solver.initParticles(this.currentScene);
            });
        }

        // About Button
        const btnAbout = document.getElementById('btn-about');
        if (btnAbout) {
            btnAbout.addEventListener('click', () => {
                this.createAboutModal();
            });
        }

        // Show Landing Page on Load
        this.createLandingPage();

        // Trigger initial update for ball radius to set max count
        const radiusInput = document.getElementById('inp-ball-radius');
        if (radiusInput) {
            radiusInput.dispatchEvent(new Event('input'));
        }

        // Set initial particle count slider to match solver default (if needed)
        // Or better, update solver to match slider default (20000)
        // The slider is at 20000 by default HTML.
        this.solver.particleCount = 4000;
    }

    createLandingPage() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-title">FreeBalls Web</div>
                <div class="modal-subtitle">High-Performance WebGPU Physics Playground</div>
                
                <div class="modal-body">
                    <table class="keybind-table">
                        <tr>
                            <td><span class="keybind-key">Left Click</span></td>
                            <td>Attract Particles</td>
                        </tr>
                        <tr>
                            <td><span class="keybind-key">Right Click</span></td>
                            <td>Repel Particles</td>
                        </tr>
                        <tr>
                            <td><span class="keybind-key">Scroll</span></td>
                            <td>Adjust Interaction Radius</td>
                        </tr>
                        <tr>
                            <td><span class="keybind-key">Space</span></td>
                            <td>Pause / Resume Simulation</td>
                        </tr>
                        <tr>
                            <td><span class="keybind-key">R</span></td>
                            <td>Reset Simulation</td>
                        </tr>
                        <tr>
                            <td><span class="keybind-key">Esc / H</span></td>
                            <td>Toggle Hide UI</td>
                        </tr>
                    </table>

                    <div style="margin-top: 30px;">
                        <button class="action-btn" id="btn-start-sim">Start Simulation</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => modal.remove();
        modal.querySelector('.modal-close')?.addEventListener('click', close);
        modal.querySelector('#btn-start-sim')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    }

    createAboutModal() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <button class="modal-close-btn">&times;</button>
                <div class="modal-title" style="margin-top: 10px;">About FreeBalls<span style="color: #4facfe;">GPU</span> <span style="font-size: 0.6em; opacity: 0.7;">v1.0</span></div>
                <div class="modal-body" style="line-height: 1.6; color: rgba(255,255,255,0.9);">
                    <p style="font-size: 18px; margin-bottom: 20px;"><strong>FreeBallsGPU</strong> is a physics playground that pushes the limits of your browser.</p>
                    
                    <p>By leveraging <strong>WebGPU</strong> and the <strong>AVBD</strong> (Augmented Vertex Block Descent) algorithm, this app simulates up to hundreds of thousands of interacting particles entirely on the GPU.</p>

                    <hr style="border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 25px 0;">

                    <p>Inspired by the original <a href="https://play.google.com/store/apps/details?id=free.balls3&hl=en_US" target="_blank" style="color: #4facfe; text-decoration: none; border-bottom: 1px dotted #4facfe;">FreeBalls</a> by <a href="https://gitlab.com/freemanzlat" target="_blank" style="color: #4facfe; text-decoration: none; border-bottom: 1px dotted #4facfe;">Ivan Maklyakov</a>.</p>

                    <p>
                        The physics engine is based on the paper 
                        <a href="https://graphics.cs.utah.edu/research/projects/avbd/" target="_blank" style="color: #4facfe; text-decoration: none; border-bottom: 1px dotted #4facfe;">Augmented Vertex Block Descent</a>.
                    </p>

                    <p style="font-size: 14px; opacity: 0.6; margin-top: 25px;">
                        This project is <strong>Open Source</strong>. 
                        <a href="https://github.com/HypeLights/freeballsweb" target="_blank" style="color: #4facfe; text-decoration: none; border-bottom: 1px dotted #4facfe;">View Source Code</a>
                    </p>

                    <div style="margin-top: 40px; text-align: center; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.05);">
                        <p style="margin-bottom: 15px; font-size: 15px; opacity: 0.8; font-style: italic;">To support more projects like this consider donating</p>
                        <a href="https://ko-fi.com/brendansapp" target="_blank" class="donate-btn">
                            ☕ Donate
                        </a>
                    </div>
                </div>
            </div>
            `;

        document.body.appendChild(modal);

        // Close Logic
        const close = () => modal.remove();
        modal.querySelector('.modal-close-btn').addEventListener('click', close);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) close();
        });
    }


    initCustomDropdown() {
        const schemes = [
            { name: 'Rainbow', value: 'rainbow', color: 'linear-gradient(45deg, red, orange, yellow, green, blue, indigo, violet)' },
            { name: 'Sunset', value: 'sunset', color: 'linear-gradient(45deg, #2d0a46, #b4283c, #ff6400, #ffdc32)' },
            { name: 'Ocean', value: 'ocean', color: 'linear-gradient(45deg, #000a3c, #0064c8, #00c8ff, #c8f0ff)' },
            { name: 'Forest', value: 'forest', color: 'linear-gradient(45deg, #0a280a, #1e7828, #64c832, #c8dc64)' },
            { name: 'Plasma', value: 'plasma', color: 'linear-gradient(45deg, #0d0887, #9c179e, #ed7953, #f0f921)' },
            { name: 'Viridis', value: 'viridis', color: 'linear-gradient(45deg, #440154, #31688e, #35b779, #fde725)' },
            { name: 'Neon', value: 'neon', color: 'linear-gradient(45deg, #ff0080, #00ffff, #00ff00)' },
            { name: 'Pastel', value: 'pastel', color: 'linear-gradient(45deg, #ffb3ba, #baffc9, #bae1ff)' },
            { name: 'Cool', value: 'cool', color: 'linear-gradient(45deg, #0032c8, #00c8ff, #9632ff)' },
            { name: 'Warm', value: 'warm', color: 'linear-gradient(45deg, #c80000, #ff6400, #ffff00)' },
            { name: 'Fire', value: 'fire', color: 'linear-gradient(45deg, black, red, yellow, white)' },
            { name: 'Ice', value: 'ice', color: 'linear-gradient(45deg, white, cyan, blue, navy)' },
            { name: 'Earth', value: 'earth', color: 'linear-gradient(45deg, #643200, #326400, #003200)' },
            { name: 'Berry', value: 'berry', color: 'linear-gradient(45deg, purple, magenta, pink)' },
            { name: 'Gold', value: 'gold', color: 'linear-gradient(45deg, #645000, gold, #ffff96)' },
            { name: 'Grayscale', value: 'grayscale', color: 'linear-gradient(45deg, black, white)' },
            { name: 'Synthwave', value: 'synthwave', color: 'linear-gradient(45deg, #280050, magenta, cyan)' },
            { name: 'Cotton Candy', value: 'cotton_candy', color: 'linear-gradient(45deg, pink, lightblue)' },
            { name: 'Midnight', value: 'midnight', color: 'linear-gradient(45deg, black, navy, #191970)' },
            { name: 'Coffee', value: 'coffee', color: 'linear-gradient(45deg, #321400, #643214, #c8b496)' },
            { name: 'Mint', value: 'mint', color: 'linear-gradient(45deg, #003214, #64ffb4, white)' },
            { name: 'Lava', value: 'lava', color: 'linear-gradient(45deg, #140000, #c80000, #ff6400)' },
            { name: 'Sky', value: 'sky', color: 'linear-gradient(45deg, #0064c8, skyblue, white)' },
            { name: 'Cherry', value: 'cherry', color: 'linear-gradient(45deg, #640000, red, pink)' },
            { name: 'Lemon Lime', value: 'lemon_lime', color: 'linear-gradient(45deg, green, yellow)' },
            { name: 'Ultraviolet', value: 'ultraviolet', color: 'linear-gradient(45deg, black, #6400c8, #c864ff)' },
            { name: 'Dawn', value: 'dawn', color: 'linear-gradient(45deg, #ff6432, #ff96c8, #6496ff)' },
            { name: 'Dusk', value: 'dusk', color: 'linear-gradient(45deg, #323296, #643264, #c86432)' },
            { name: 'Matrix', value: 'matrix', color: 'linear-gradient(45deg, black, green, #96ff96)' },
            { name: 'Christmas', value: 'candy', color: 'repeating-linear-gradient(45deg, red, red 10px, white 10px, white 20px)' }
        ];

        const container = document.getElementById('custom-color-select');
        const logo = document.getElementById('app-logo');

        // Selected Item
        const selected = document.createElement('div');
        selected.className = 'select-selected';
        selected.innerHTML = `<span class="gradient-preview" style="background: ${schemes[0].color}"></span> ${schemes[0].name}`;
        container.appendChild(selected);

        // Items List
        const items = document.createElement('div');
        items.className = 'select-items select-hide';

        schemes.forEach(scheme => {
            const item = document.createElement('div');
            item.innerHTML = `<span class="gradient-preview" style="background: ${scheme.color}"></span> ${scheme.name}`;
            item.addEventListener('click', () => {
                selected.innerHTML = `<span class="gradient-preview" style="background: ${scheme.color}"></span> ${scheme.name}`;
                items.classList.add('select-hide');
                selected.classList.remove('select-arrow-active');
                this.solver.setColorScheme(scheme.value);

                // Update Logo
                const gpuText = logo ? logo.querySelector('.gpu-text') : null;
                if (gpuText) {
                    gpuText.style.backgroundImage = scheme.color;
                }
            });
            items.appendChild(item);
        });
        container.appendChild(items);

        // Toggle
        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            items.classList.toggle('select-hide');
            selected.classList.toggle('select-arrow-active');
        });

        // Close on click outside
        document.addEventListener('click', (e) => {
            if (!container.contains(e.target)) {
                items.classList.add('select-hide');
                selected.classList.remove('select-arrow-active');
            }
        });
    }

    createActiveScenePanel() {
        // Find the main UI panel
        const uiPanel = this.container.querySelector('.ui-panel');
        if (!uiPanel) {
            return;
        }

        // Insert after the scene selector section
        // We look for the section containing the scene selector
        const sceneSection = uiPanel.querySelector('.control-section');

        const activePanel = document.createElement('div');
        activePanel.id = 'active-scene-panel';
        activePanel.className = 'control-section';
        activePanel.style.display = 'none'; // Hidden by default
        activePanel.innerHTML = `<h3>Active Scene Settings</h3><div id="active-scene-content"></div>`;

        if (sceneSection) {
            // Insert after the first control section (Scene)
            sceneSection.parentNode.insertBefore(activePanel, sceneSection.nextSibling);
        } else {
            // Fallback: Append to UI panel
            uiPanel.appendChild(activePanel);
        }
    }

    updateActiveScenePanel() {
        const panel = document.getElementById('active-scene-panel');
        const content = document.getElementById('active-scene-content');
        if (!panel || !content) {
            return;
        }

        content.innerHTML = '';

        // Update Ball Count Label
        const countInput = document.getElementById('inp-count');
        if (countInput) {
            const label = countInput.parentElement.querySelector('label');
            if (label && label.firstChild) {
                label.firstChild.textContent = (this.currentScene === 'grid') ? 'Ball Count ' : 'Max Balls ';
            }
        }

        // SYNC: Update Global Sliders to match Solver state
        // This ensures that if a scene (like Fireworks) changes defaults in init(), the UI reflects it.
        const radiusInput = document.getElementById('inp-ball-radius');
        const radiusVal = document.getElementById('val-ball-radius');
        if (radiusInput && radiusVal) {
            radiusInput.value = this.solver.ballRadius;
            radiusVal.textContent = this.solver.ballRadius;
            // Trigger the slider's input event so that dependent logic (like Max Balls limit) runs
            radiusInput.dispatchEvent(new Event('input'));
        }

        // Sync Physics Sliders
        const gravityInput = document.getElementById('inp-gravity');
        const gravityVal = document.getElementById('val-gravity');
        if (gravityInput && gravityVal) {
            gravityInput.value = this.solver.gravity;
            gravityVal.textContent = this.solver.gravity;
        }

        const restitutionInput = document.getElementById('inp-restitution');
        const restitutionVal = document.getElementById('val-restitution');
        if (restitutionInput && restitutionVal) {
            restitutionInput.value = this.solver.restitution;
            restitutionVal.textContent = this.solver.restitution;
        }

        const dampingInput = document.getElementById('inp-damping');
        const dampingVal = document.getElementById('val-damping');
        if (dampingInput && dampingVal) {
            dampingInput.value = this.solver.damping;
            dampingVal.textContent = this.solver.damping;
        }

        const substepsInput = document.getElementById('inp-substeps');
        const substepsVal = document.getElementById('val-substeps');
        if (substepsInput && substepsVal) {
            substepsInput.value = this.solver.substeps;
            substepsVal.textContent = this.solver.substeps;
        }

        if (this.currentScene === 'galton') {
            panel.style.display = 'block';

            // 1. Spawner Distance
            const distRow = document.createElement('div');
            distRow.className = 'control-row';
            distRow.innerHTML = `
                <label>Spawner Spread <span id="val-galton-dist">${this.solver.galtonSpawnerDistance || 100}</span></label>
                <input type="range" id="inp-galton-dist" min="0" max="400" step="10" value="${this.solver.galtonSpawnerDistance || 100}" />
            `;
            content.appendChild(distRow);

            // 2. Peg Size
            const pegRow = document.createElement('div');
            pegRow.className = 'control-row';
            pegRow.innerHTML = `
                <label>Peg Size <span id="val-galton-peg">${this.solver.galtonPegSize || 3}</span></label>
                <input type="range" id="inp-galton-peg" min="1" max="10" step="0.5" value="${this.solver.galtonPegSize || 3}" />
            `;
            content.appendChild(pegRow);

            // 3. Spawn Rate (Specific to Galton)
            const rateRow = document.createElement('div');
            rateRow.className = 'control-row';
            rateRow.innerHTML = `
                <label>Spawn Rate <span id="val-galton-rate">${this.solver.galtonSpawnRate || 5}</span></label>
                <input type="range" id="inp-galton-rate" min="1" max="50" step="1" value="${this.solver.galtonSpawnRate || 5}" />
            `;
            content.appendChild(rateRow);

            // 4. Bucket Spacing (Galton only)
            const bucketRow = document.createElement('div');
            bucketRow.className = 'control-row';
            bucketRow.innerHTML = `
                <label>Bucket Spacing <span id="val-galton-bucket">${this.solver.galtonBucketSpacing || 40}</span></label>
                <input type="range" id="inp-galton-bucket" min="20" max="100" step="5" value="${this.solver.galtonBucketSpacing || 40}" />
            `;
            content.appendChild(bucketRow);

            // 5. Bucket Height (Galton only)
            const heightRow = document.createElement('div');
            heightRow.className = 'control-row';
            heightRow.innerHTML = `
                <label>Bucket Height <span id="val-galton-height">${this.solver.galtonBucketHeight || Math.floor(window.innerHeight * 0.4)}</span></label>
                <input type="range" id="inp-galton-height" min="100" max="${window.innerHeight - 200}" step="10" value="${this.solver.galtonBucketHeight || Math.floor(window.innerHeight * 0.4)}" />
            `;
            content.appendChild(heightRow);

            // Bindings
            this.bindSlider('inp-galton-dist', 'val-galton-dist', v => {
                this.solver.galtonSpawnerDistance = parseFloat(v);
            });

            this.bindSlider('inp-galton-peg', 'val-galton-peg', v => {
                this.solver.galtonPegSize = parseFloat(v);
                // Real-time update handled in solver.update
            });

            this.bindSlider('inp-galton-rate', 'val-galton-rate', v => {
                this.solver.galtonSpawnRate = parseFloat(v);
            });

            this.bindSlider('inp-galton-bucket', 'val-galton-bucket', v => {
                this.solver.galtonBucketSpacing = parseFloat(v);
                this.solver.initParticles('galton');
            });

            this.bindSlider('inp-galton-height', 'val-galton-height', v => {
                this.solver.galtonBucketHeight = parseFloat(v);
                this.solver.initParticles('galton');
            });

        } else if (this.currentScene === 'planetary') {
            panel.style.display = 'block';

            // 1. Sun Gravity
            const gravRow = document.createElement('div');
            gravRow.className = 'control-row';
            gravRow.innerHTML = `
                <label>Sun Gravity <span id="val-pl-grav">${this.solver.blackHoleGravity || 2.0}</span></label>
                <input type="range" id="inp-pl-grav" min="0.1" max="10.0" step="0.1" value="${this.solver.blackHoleGravity || 2.0}" />
            `;
            content.appendChild(gravRow);

            // 2. Swirl Speed
            const swirlRow = document.createElement('div');
            swirlRow.className = 'control-row';
            swirlRow.innerHTML = `
                <label>Swirl Speed <span id="val-pl-swirl">${this.solver.blackHoleSwirl || 0.0}</span></label>
                <input type="range" id="inp-pl-swirl" min="-5.0" max="5.0" step="0.1" value="${this.solver.blackHoleSwirl || 0.0}" />
            `;
            content.appendChild(swirlRow);

            // 3. Ball Variance
            const varRow = document.createElement('div');
            varRow.className = 'control-row';
            varRow.innerHTML = `
                <label>Ball Size Variance <span id="val-pl-var">${this.solver.planetaryBallVariance || 0.5}</span></label>
                <input type="range" id="inp-pl-var" min="0.0" max="1.0" step="0.1" value="${this.solver.planetaryBallVariance || 0.5}" />
            `;
            content.appendChild(varRow);

            // Bindings
            this.bindSlider('inp-pl-grav', 'val-pl-grav', v => this.solver.blackHoleGravity = parseFloat(v));
            this.bindSlider('inp-pl-swirl', 'val-pl-swirl', v => this.solver.blackHoleSwirl = parseFloat(v));
            this.bindSlider('inp-pl-var', 'val-pl-var', v => {
                this.solver.planetaryBallVariance = parseFloat(v);
                // Re-init to apply size variance? Or just let next reset handle it?
                // User might expect immediate effect. But re-init resets positions.
                // Let's just update the value. User can reset if they want new sizes.
            });

        } else if (this.currentScene === 'fireworks') {
            panel.style.display = 'block';

            // 1. Spawn Rate
            const rateRow = document.createElement('div');
            rateRow.className = 'control-row';
            rateRow.innerHTML = `
                <label>Spawn Rate <span id="val-fw-rate">${this.solver.fireworksSpawnRate || 3.0}</span></label>
                <input type="range" id="inp-fw-rate" min="0.1" max="20.0" step="0.1" value="${this.solver.fireworksSpawnRate || 3.0}" />
            `;
            content.appendChild(rateRow);

            // 2. Ball Count (Explosion Size)
            const countRow = document.createElement('div');
            countRow.className = 'control-row';
            countRow.innerHTML = `
                <label>Ball Count <span id="val-fw-count">${this.solver.fireworksExplosionSize || 100}</span></label>
                <input type="range" id="inp-fw-count" min="10" max="5000" step="10" value="${this.solver.fireworksExplosionSize || 100}" />
            `;
            content.appendChild(countRow);

            // 3. Rocket Speed
            const speedRow = document.createElement('div');
            speedRow.className = 'control-row';
            speedRow.innerHTML = `
                <label>Rocket Speed <span id="val-fw-speed">${this.solver.fireworksRocketSpeed || 2.2}</span></label>
                <input type="range" id="inp-fw-speed" min="0.5" max="3.0" step="0.1" value="${this.solver.fireworksRocketSpeed || 2.2}" />
            `;
            content.appendChild(speedRow);

            // Bindings
            this.bindSlider('inp-fw-rate', 'val-fw-rate', v => this.solver.fireworksSpawnRate = parseFloat(v));
            this.bindSlider('inp-fw-count', 'val-fw-count', v => this.solver.fireworksExplosionSize = parseInt(v)); // Ensure int for count
            this.bindSlider('inp-fw-speed', 'val-fw-speed', v => this.solver.fireworksRocketSpeed = parseFloat(v));

        } else if (this.currentScene === 'fountain') {
            panel.style.display = 'block';

            // 1. Spawn Rate
            const rateRow = document.createElement('div');
            rateRow.className = 'control-row';
            rateRow.innerHTML = `
                <label>Spawn Rate <span id="val-fn-rate">${this.solver.fountainSpawnRate || 500}</span></label>
                <input type="range" id="inp-fn-rate" min="10" max="10000" step="10" value="${this.solver.fountainSpawnRate || 500}" />
            `;
            content.appendChild(rateRow);

            this.bindSlider('inp-fn-rate', 'val-fn-rate', v => this.solver.fountainSpawnRate = parseFloat(v));

        } else if (this.currentScene === 'wave') {
            panel.style.display = 'block';

            // 0. Wave Mode Selector
            const modeRow = document.createElement('div');
            modeRow.className = 'control-row';
            modeRow.innerHTML = `
                <label>Wave Mode</label>
                <select id="sel-wv-mode" class="scene-selector" style="margin-bottom: 10px;">
                    <option value="ocean">Ocean Waves</option>
                    <option value="ripple">Ripple Effect</option>
                    <option value="sound">Sound Waves</option>
                    <option value="interference" selected>Interference</option>
                </select>
            `;
            content.appendChild(modeRow);

            // 0.5 Particle Density Control
            const densityRow = document.createElement('div');
            densityRow.className = 'control-row';
            densityRow.innerHTML = `
                <label>Particle Density <span id="val-wv-density">10</span></label>
                <input type="range" id="inp-wv-density" min="1" max="50" step="1" value="10" />
            `;
            content.appendChild(densityRow);

            // Sync mode selector with current scene state
            const modeSelect = document.getElementById('sel-wv-mode');
            if (modeSelect && this.solver.currentSceneObject && this.solver.currentSceneObject.waveMode) {
                modeSelect.value = this.solver.currentSceneObject.waveMode;
            }

            // Sync density with current scene state
            const densityInput = document.getElementById('inp-wv-density');
            const densityValue = document.getElementById('val-wv-density');
            if (densityInput && this.solver.currentSceneObject && this.solver.currentSceneObject.particleDensity !== undefined) {
                densityInput.value = this.solver.currentSceneObject.particleDensity;
                densityValue.textContent = this.solver.currentSceneObject.particleDensity;
            }

            // 1. Wave Amplitude
            const ampRow = document.createElement('div');
            ampRow.className = 'control-row';
            ampRow.innerHTML = `
                <label>Wave Height <span id="val-wv-amp">200</span></label>
                <input type="range" id="inp-wv-amp" min="50" max="600" step="10" value="200" />
            `;
            content.appendChild(ampRow);

            // 2. Wave Speed
            const speedRow = document.createElement('div');
            speedRow.className = 'control-row';
            speedRow.innerHTML = `
                <label>Wave Speed <span id="val-wv-speed">2.0</span></label>
                <input type="range" id="inp-wv-speed" min="0.1" max="8.0" step="0.1" value="2.0" />
            `;
            content.appendChild(speedRow);

            // 3. Wave Frequency
            const freqRow = document.createElement('div');
            freqRow.className = 'control-row';
            freqRow.innerHTML = `
                <label>Wave Frequency <span id="val-wv-freq">3.0</span></label>
                <input type="range" id="inp-wv-freq" min="0.5" max="10.0" step="0.5" value="3.0" />
            `;
            content.appendChild(freqRow);

            // Mode selector binding (already declared above, just add listener)
            if (modeSelect) {
                modeSelect.addEventListener('change', (e) => {
                    if (this.solver.currentSceneObject && this.solver.currentSceneObject.waveMode !== undefined) {
                        this.solver.currentSceneObject.waveMode = e.target.value;
                    }
                });
            }

            // Density binding - updates max balls and reinits scene
            this.bindSlider('inp-wv-density', 'val-wv-density', v => {
                if (this.solver.currentSceneObject && this.solver.currentSceneObject.particleDensity !== undefined) {
                    this.solver.currentSceneObject.particleDensity = parseInt(v);

                    // Calculate required particle count for new density
                    const gridSize = Math.floor(20 + (parseInt(v) - 1) * 4.2);
                    const requiredParticles = gridSize * gridSize;

                    // Update max balls to accommodate new density
                    if (requiredParticles > this.solver.particleCount) {
                        this.solver.particleCount = Math.min(requiredParticles, 100000); // Cap at 100K
                        // Update the max balls slider if it exists
                        const maxBallsSlider = document.getElementById('inp-max-balls');
                        const maxBallsValue = document.getElementById('val-max-balls');
                        if (maxBallsSlider && maxBallsValue) {
                            maxBallsSlider.value = this.solver.particleCount;
                            maxBallsValue.textContent = this.solver.particleCount;
                        }
                    }

                    this.solver.initParticles('wave'); // Reinit with new density
                }
            });

            // Bindings - These update the scene object's properties
            this.bindSlider('inp-wv-amp', 'val-wv-amp', v => {
                if (this.solver.currentSceneObject && this.solver.currentSceneObject.waveAmplitude !== undefined) {
                    this.solver.currentSceneObject.waveAmplitude = parseFloat(v);
                }
            });
            this.bindSlider('inp-wv-speed', 'val-wv-speed', v => {
                if (this.solver.currentSceneObject && this.solver.currentSceneObject.waveSpeed !== undefined) {
                    this.solver.currentSceneObject.waveSpeed = parseFloat(v);
                }
            });
            this.bindSlider('inp-wv-freq', 'val-wv-freq', v => {
                if (this.solver.currentSceneObject && this.solver.currentSceneObject.waveFrequency !== undefined) {
                    this.solver.currentSceneObject.waveFrequency = parseFloat(v);
                }
            });

        } else if (this.currentScene === 'collision') {
            panel.style.display = 'block';

            // Mixer Press-and-Hold Button
            const buttonRow = document.createElement('div');
            buttonRow.className = 'control-row';
            buttonRow.innerHTML = `
                <label>Mixer Control</label>
                <button id="btn-mixer-hold" class="action-btn" style="
                    background: linear-gradient(135deg, rgba(79, 172, 254, 0.2) 0%, rgba(142, 45, 226, 0.2) 100%);
                    border: 2px solid rgba(79, 172, 254, 0.4);
                    transition: all 0.1s ease;
                    user-select: none;
                    -webkit-user-select: none;
                    margin-top: 5px;
                ">Hold to Mix</button>
            `;
            content.appendChild(buttonRow);

            // Mixer Mode Selector
            const modeRow = document.createElement('div');
            modeRow.className = 'control-row';
            modeRow.innerHTML = `
                <label>Mixer Mode</label>
                <select id="sel-mixer-mode" class="scene-selector" style="margin-bottom: 10px;">
                    <option value="vortex" selected>Vortex</option>
                    <option value="vertical">Vertical Shear</option>
                    <option value="horizontal">Horizontal Shear</option>
                    <option value="chaos">Turbulence</option>
                    <option value="corners">Corner Rotation</option>
                </select>
            `;
            content.appendChild(modeRow);

            // Mixer Power Slider
            const powerRow = document.createElement('div');
            powerRow.className = 'control-row';
            powerRow.innerHTML = `
                <label>Mix Power <span id="val-mixer-power">3000</span></label>
                <input type="range" id="inp-mixer-power" min="100" max="5000" step="100" value="3000" />
            `;
            content.appendChild(powerRow);

            // Get the button element and set up press-and-hold behavior
            const mixerButton = document.getElementById('btn-mixer-hold');
            const mixerModeSelect = document.getElementById('sel-mixer-mode');

            // Active state styling
            const setButtonActive = (active) => {
                if (!mixerButton) return;
                if (active) {
                    mixerButton.style.background = 'linear-gradient(135deg, rgba(79, 172, 254, 0.6) 0%, rgba(142, 45, 226, 0.6) 100%)';
                    mixerButton.style.borderColor = 'rgba(79, 172, 254, 1.0)';
                    mixerButton.style.boxShadow = '0 0 20px rgba(79, 172, 254, 0.5)';
                    mixerButton.textContent = 'Mixing...';
                } else {
                    mixerButton.style.background = 'linear-gradient(135deg, rgba(79, 172, 254, 0.2) 0%, rgba(142, 45, 226, 0.2) 100%)';
                    mixerButton.style.borderColor = 'rgba(79, 172, 254, 0.4)';
                    mixerButton.style.boxShadow = 'none';
                    mixerButton.textContent = 'Hold to Mix';
                }
            };

            // Mouse events
            if (mixerButton && this.solver.currentSceneObject) {
                mixerButton.addEventListener('mousedown', () => {
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = true;
                        setButtonActive(true);
                    }
                });

                mixerButton.addEventListener('mouseup', () => {
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = false;
                        setButtonActive(false);
                    }
                });

                mixerButton.addEventListener('mouseleave', () => {
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = false;
                        setButtonActive(false);
                    }
                });

                // Touch events for mobile
                mixerButton.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = true;
                        setButtonActive(true);
                    }
                });

                mixerButton.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = false;
                        setButtonActive(false);
                    }
                });

                mixerButton.addEventListener('touchcancel', (e) => {
                    e.preventDefault();
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerEnabled = false;
                        setButtonActive(false);
                    }
                });
            }

            // Mixer mode selector binding
            if (mixerModeSelect && this.solver.currentSceneObject) {
                if (this.solver.currentSceneObject.mixerMode) {
                    mixerModeSelect.value = this.solver.currentSceneObject.mixerMode;
                }
                mixerModeSelect.addEventListener('change', (e) => {
                    if (this.solver.currentSceneObject) {
                        this.solver.currentSceneObject.mixerMode = e.target.value;
                    }
                });
            }

            // Mixer power slider binding
            this.bindSlider('inp-mixer-power', 'val-mixer-power', v => {
                if (this.solver.currentSceneObject) {
                    this.solver.currentSceneObject.mixerPower = parseFloat(v);
                }
            });

            // Sync mixer power display with current scene value
            const mixerPowerInput = document.getElementById('inp-mixer-power');
            const mixerPowerValue = document.getElementById('val-mixer-power');
            if (mixerPowerInput && mixerPowerValue && this.solver.currentSceneObject) {
                const currentPower = this.solver.currentSceneObject.mixerPower || 3000;
                mixerPowerInput.value = currentPower;
                mixerPowerValue.textContent = currentPower;
            }

        } else {
            panel.style.display = 'none';
        }
    }

    createStatsOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'stats-overlay';
        overlay.className = 'stats-overlay';
        overlay.innerHTML = `
            <div>FPS: <span id="stat-fps">0</span> <span style="color: #888; font-size: 10px;">(<span id="stat-ms">0</span>ms)</span></div>
            <div>Balls: <span id="stat-count">0</span></div>
        `;
        this.container.appendChild(overlay);
    }

    createPauseOverlay() {
        const pauseEl = document.createElement('div');
        pauseEl.id = 'pause-overlay';
        pauseEl.className = 'pause-overlay';
        pauseEl.innerText = 'PAUSED';
        document.body.appendChild(pauseEl);
    }

    togglePauseOverlay(visible) {
        const el = document.getElementById('pause-overlay');
        if (el) {
            if (visible) el.classList.add('visible');
            else el.classList.remove('visible');
        }
    }

    createToast() {
        const toast = document.createElement('div');
        toast.id = 'ui-toast';
        toast.className = 'toast-notification';
        toast.innerHTML = `<span class="toast-icon">ℹ</span> <span id="toast-message">Message</span>`;
        document.body.appendChild(toast);
    }

    showToast(message, duration = 3000) {
        const toast = document.getElementById('ui-toast');
        const msgEl = document.getElementById('toast-message');
        if (toast && msgEl) {
            msgEl.innerText = message;
            toast.classList.add('visible');

            if (this.toastTimeout) clearTimeout(this.toastTimeout);
            this.toastTimeout = setTimeout(() => {
                toast.classList.remove('visible');
            }, duration);
        }
    }

    makePanelsDraggable() {
        const panels = this.container.querySelectorAll('.ui-panel');
        panels.forEach(panel => {
            let isDragging = false;
            let currentX, currentY, initialX, initialY;

            const dragStart = (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' ||
                    e.target.tagName === 'SELECT') return;

                initialX = e.clientX - (panel.offsetLeft || 0);
                initialY = e.clientY - (panel.offsetTop || 0);
                isDragging = true;
                panel.style.position = 'absolute';
            };

            const drag = (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    panel.style.left = currentX + 'px';
                    panel.style.top = currentY + 'px';
                }
            };

            const dragEnd = () => {
                isDragging = false;
            };

            panel.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
        });
    }

    makePanelsCollapsable() {
        const headers = this.container.querySelectorAll('.ui-panel h3');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                header.parentElement.classList.toggle('collapsed');
            });
        });
    }

    toggleUI() {
        this.isHidden = !this.isHidden;
        const statsOverlay = document.getElementById('stats-overlay');

        if (this.isHidden) {
            this.container.classList.add('hidden');
            if (statsOverlay) statsOverlay.classList.add('hidden');
            this.showToast("Press 'ESC' or 'H' to show controls");
        } else {
            this.container.classList.remove('hidden');
            if (statsOverlay) statsOverlay.classList.remove('hidden');
        }
    }

    setupKeyboardListener() {
        document.addEventListener('keydown', (e) => {
            // Check for open modals
            const openModal = document.querySelector('.modal-overlay');

            if (e.key === 'Escape') {
                if (openModal) {
                    openModal.remove();
                } else {
                    this.toggleUI();
                }
            } else if (e.key.toLowerCase() === 'h') {
                this.toggleUI();
            } else if (e.code === 'Space') {
                e.preventDefault(); // Stop scrolling or button clicking
                if (document.activeElement) {
                    document.activeElement.blur(); // Remove focus from UI elements
                }

                if (this.solver) {
                    this.solver.paused = !this.solver.paused;
                    if (this.showPauseOverlay) {
                        this.togglePauseOverlay(this.solver.paused);
                    }
                }
            }
        });
    }

    bindSlider(id, valId, callback) {
        const el = document.getElementById(id);
        const valEl = document.getElementById(valId);
        if (el && valEl) {
            el.addEventListener('input', (e) => {
                valEl.textContent = e.target.value;
                callback(e.target.value);
            });
        }
    }

    startStatsLoop() {
        const fpsEl = document.getElementById('stat-fps');
        const countEl = document.getElementById('stat-count');

        let lastTime = performance.now();
        let frames = 0;

        const loop = () => {
            const now = performance.now();
            frames++;

            if (now >= lastTime + 1) {
                const fps = Math.round((frames * 1000) / (now - lastTime));
                const ms = (1000 / fps).toFixed(2);

                if (fpsEl) fpsEl.textContent = fps;
                const msEl = document.getElementById('stat-ms');
                if (msEl) msEl.textContent = ms;

                if (countEl) {
                    // For Galton scene, show only emitted (mobile) balls.
                    // For Grid/Chaos, show total particle count
                    const count = this.solver ? this.solver.emittedCount : 0;
                    countEl.innerHTML = `${count.toLocaleString()} <span style="font-size: 10px; color: #888;">(Mobile)</span>`
                };


                lastTime = now;
                frames = 0;
            }

            requestAnimationFrame(loop);
        };
        loop();
    }
}
