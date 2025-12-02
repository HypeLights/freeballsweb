# FreeBallsGPU

![Version](https://img.shields.io/badge/version-1.0-blue.svg)
![WebGPU](https://img.shields.io/badge/WebGPU-Enabled-green.svg)
![License](https://img.shields.io/badge/license-MIT-orange.svg)

**FreeBallsGPU** is a high-performance, GPU-accelerated physics simulation running in the browser. Built with **WebGPU** and the **Augmented Vertex Block Descent (AVBD)** algorithm, it simulates tens of thousands of interacting particles in real-time with soft-body dynamics and friction.

> **Note**: This application requires a browser with WebGPU support (e.g., Chrome 113+, Edge, or Firefox Nightly).

## Features

### Massive Scale Simulation
- Simulate **up to 100,000+ particles** at 60 FPS.
- All physics calculations (collision, constraints, integration) run entirely on the GPU via Compute Shaders.

### Interactive Scenes
Explore a variety of pre-built scenes designed to showcase different physics properties:
- **Grid**: Grid formation spawned particles.
- **Galton Board**: A probability machine where thousands of balls cascade through pegs into dynamically spaced buckets.
- **Chaos**: Random spawned particles.
- **Lattice**: Lattice formation spawned particles.
- **Fireworks**: Spawn rockets that explode into particles beautifully.
- **Fountain**: A continuous stream of particles like a fountain.
- **Collision**: Different types of collisions and forces.
- **Wave**: A demonstration of types of wave propagation using particles.

### Visuals
- **Bloom**: Post-processing glow effects.
- **Anti-Aliasing**: Smooth edge rendering.
- **Color Schemes**: Includes 20+ presets such as Rainbow, Sunset, Neon, and Synthwave.

### Real-Time Controls
Adjust simulation parameters during runtime:
- **Physics**: Gravity, Restitution (bounciness), Damping (air resistance), and Substeps.
- **Interaction**: Mouse controls to Attract (Left Click) or Repel (Right Click) particles.
- **Rendering**: Toggle Bloom, adjust strength/radius, and switch color modes.

## Getting Started

### Prerequisites
- A modern web browser with **WebGPU** enabled.
- [Node.js](https://nodejs.org/) (optional, for local development).

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/HypeLights/freeballsweb.git
   cd freeballsweb
   ```

2. **Run locally (using npx)**
   You can serve the files using any static file server.
   ```bash
   npx serve .
   ```

3. **Open in Browser**
   Navigate to `http://localhost:3000` (or the port shown in your terminal).

## The Tech Stack

- **JavaScript (ES6+)**: Core application logic and UI.
- **WebGPU API**: Graphics and compute API for the web.
- **WGSL (WebGPU Shading Language)**: Compute shaders for the physics solver.
- **AVBD Algorithm**: Physics solver combining position-based dynamics with variational integrators.

## Credits & Inspiration

- **Original Inspiration**: [FreeBalls](https://play.google.com/store/apps/details?id=free.balls3&hl=en_US) by [Ivan Maklyakov](https://gitlab.com/freemanzlat).
- **Physics Algorithm**: Based on the paper [Augmented Vertex Block Descent](https://graphics.cs.utah.edu/research/projects/avbd/) by the Utah Graphics Lab.
- **Development**: Created by **Brendan Sapp**.

## License

This project is licensed under the MIT License - see the [MIT License.md](MIT%20License.md) file for details.
