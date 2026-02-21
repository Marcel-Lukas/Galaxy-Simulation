# Galaxy Simulation

A galaxy simulation with WebGPU, Three.js, and TSL (Three.js Shading Language). Experience an interactive spiral galaxy with up to 1,000,000 particles and freely customizable parameters. The application is optimized for the Chrome browser and requires corresponding GPU performance. It therefore runs significantly better on more powerful hardware, especially on mobile devices. The number of stars can be individually increased or decreased, and an integrated FPS display is also available.

## Live Demo

<https://galaxy-simulation.marcel-lukas.com>  
Note: Not suitable for weak GPU hardware and more suitable for browsers on PCs.

## Technologies

- **Three.js (WebGPU)** - 3D rendering engine with WebGPU backend
- **TSL** - Three.js Shading Language for GPU compute shaders
- **Vite** - Fast build tool and dev server
- **Tweakpane** - UI controls for parameter adjustment

##  Requirements

- A browser with WebGPU support (Chrome 113+, Edge 113+, or other compatible browsers)
- GPU with WebGPU capabilities

##  Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```
