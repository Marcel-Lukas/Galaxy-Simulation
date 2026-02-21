import * as THREE from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GalaxySimulation } from './galaxy.js';
import { GalaxyUI } from './ui.js';

// Configuration
const config = {
  starCount: 500000,
  rotationSpeed: 0.12,
  spiralTightness: 1.5,
  mouseForce: 6.0,
  mouseRadius: 5.0,
  galaxyRadius: 13.0,
  galaxyThickness: 6,
  armCount: 2,
  armWidth: 2.25,
  randomness: 1.85,
  particleSize: 0.04,
  starBrightness: 0.3,
  denseStarColor: '#1885ff',
  sparseStarColor: '#ffb28a',
  bloomStrength: 0.2,
  bloomRadius: 0.2,
  bloomThreshold: 0.1,
  cloudCount: 5000,
  cloudSize: 2.2,
  cloudOpacity: 0.01,
  cloudTintColor: '#ffdace',
  skybox: 'default'
};

// Persisted settings (safe approach for WebGL2 fallback):
// If WebGPU is unavailable, resizing GPU buffers at runtime can break Transform Feedback.
// We therefore store starCount in localStorage and reload the page to apply it.
const STARCOUNT_STORAGE_KEY = 'galaxy.starCount';
{
  const raw = sessionStorage.getItem(STARCOUNT_STORAGE_KEY);
  const parsed = raw != null ? Number(raw) : NaN;
  if (Number.isFinite(parsed)) {
    // keep within UI limits and align with step=1000
    const clamped = Math.min(1_000_000, Math.max(1000, Math.round(parsed / 1000) * 1000));
    config.starCount = clamped;
  }
}

let backgroundStars = 7777;

// --- Scene Setup ---
const scene = new THREE.Scene();


/* ===========================
   SKYBOX MANAGEMENT
=========================== */

const skyboxes = {
  default: [
    './skybox/skybox_front.webp', // +X
    './skybox/skybox_back.webp',  // -X
    './skybox/skybox_up.webp',    // +Y
    './skybox/skybox_down.webp',  // -Y
    './skybox/skybox_right.webp', // +Z
    './skybox/skybox_left.webp',  // -Z
  ],
  darkSpace: [
    './skybox/space_ft.webp',
    './skybox/space_bk.webp',
    './skybox/space_up.webp',
    './skybox/space_dn.webp',
    './skybox/space_rt.webp',
    './skybox/space_lf.webp',
  ],
  asteroids: [
    './skybox/asteroids_ft.webp',
    './skybox/asteroids_bk.webp',
    './skybox/asteroids_up.webp',
    './skybox/asteroids_dn.webp',
    './skybox/asteroids_rt.webp',
    './skybox/asteroids_lf.webp',
  ],
  nebula: [
    './skybox/nebulae_ft.webp',
    './skybox/nebulae_bk.webp',
    './skybox/nebulae_up.webp',
    './skybox/nebulae_dn.webp',
    './skybox/nebulae_rt.webp',
    './skybox/nebulae_lf.webp',
  ],
  
};

const cubeLoader = new THREE.CubeTextureLoader();
const loadedSkyboxes = {};

function setSkybox(type) {
  if (!skyboxes[type]) {
    console.warn(`Skybox "${type}" not found`);
    return;
  }

  if (!loadedSkyboxes[type]) {
    const texture = cubeLoader.load(skyboxes[type]);
    texture.colorSpace = THREE.SRGBColorSpace;
    loadedSkyboxes[type] = texture;
  }

  scene.background = loadedSkyboxes[type];
  config.skybox = type;
}


/* ===========================
   CAMERA & RENDERER
=========================== */

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 12, 17);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);


/* ===========================
   CONTROLS
=========================== */

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 5;
controls.maxDistance = 30;
controls.target.set(0, -2, 0);


/* ===========================
   POST PROCESSING
=========================== */

let postProcessing = null;
let bloomPassNode = null;

function setupBloom() {
  if (!postProcessing) return;

  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode();

  bloomPassNode = bloom(scenePassColor);
  bloomPassNode.threshold.value = config.bloomThreshold;
  bloomPassNode.strength.value = config.bloomStrength;
  bloomPassNode.radius.value = config.bloomRadius;

  postProcessing.outputNode = scenePassColor.add(bloomPassNode);
}


/* ===========================
   MOUSE TRACKING
=========================== */

const mouse3D = new THREE.Vector3(0, 0, 0);
const raycaster = new THREE.Raycaster();
const intersectionPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
let mousePressed = false;

window.addEventListener('mousedown', () => mousePressed = true);
window.addEventListener('mouseup', () => mousePressed = false);
window.addEventListener('mousemove', (event) => {
  const mouse = new THREE.Vector2(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);
  raycaster.ray.intersectPlane(intersectionPlane, mouse3D);
});


/* ===========================
   BACKGROUND STARS
=========================== */

function createStarryBackground(scene, count = backgroundStars) {
  const starGeometry = new THREE.BufferGeometry();
  const starPositions = new Float32Array(count * 3);
  const starColors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const radius = 150 + Math.random() * 50;

    starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
    starPositions[i * 3 + 2] = radius * Math.cos(phi);

    const color = 0.8 + Math.random() * 0.2;
    starColors[i * 3] = color;
    starColors[i * 3 + 1] = color;
    starColors[i * 3 + 2] = color;
  }

  starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute('color', new THREE.BufferAttribute(starColors, 3));

  const starMaterial = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.5,
    sizeAttenuation: true
  });

  const stars = new THREE.Points(starGeometry, starMaterial);
  scene.add(stars);
  return stars;
}


/* ===========================
   GALAXY INIT
=========================== */

const textureLoader = new THREE.TextureLoader();
const cloudTexture = textureLoader.load('cloud.png');

const galaxySimulation = new GalaxySimulation(scene, config, cloudTexture);
galaxySimulation.createGalaxySystem();
galaxySimulation.createClouds();

createStarryBackground(scene);


/* ===========================
   UI SETUP
=========================== */

const ui = new GalaxyUI(config, {
  skyboxKeys: Object.keys(skyboxes),

  onUniformChange: (key, value) => galaxySimulation.updateUniforms({ [key]: value }),
  onBloomChange: (property, value) => {
    if (bloomPassNode) bloomPassNode[property].value = value;
  },
  onStarCountChange: (newCount) => {
    // Safe approach for WebGL2 fallback: persist and reload instead of resizing TF buffers live.
    const next = Math.min(1_000_000, Math.max(1000, Math.round(Number(newCount) / 1000) * 1000));
    sessionStorage.setItem(STARCOUNT_STORAGE_KEY, String(next));

    // Optional: update UI text immediately (before reload)
    document.getElementById('star-count').textContent = next.toLocaleString();

    // Reload to apply the new starCount cleanly.
    // Using location.reload() keeps the same URL and avoids cache issues.
    location.reload();
  },
  onCloudCountChange: (newCount) => {
    galaxySimulation.updateUniforms({ cloudCount: newCount });
    galaxySimulation.createClouds();
  },
  onCloudTintChange: (color) => {
    galaxySimulation.updateUniforms({ cloudTintColor: color });
    galaxySimulation.createClouds();
  },
  onRegenerate: () => {
    galaxySimulation.updateUniforms(config);
    galaxySimulation.createClouds();
    galaxySimulation.regenerate();
  },

  onSkyboxChange: (type) => {
    setSkybox(type);
  }
});


/* ===========================
   FPS COUNTER
=========================== */

let frameCount = 0;
let lastTime = performance.now();
let fps = 60;

function updateFPS() {
  frameCount++;
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  if (deltaTime >= 1000) {
    fps = Math.round((frameCount * 1000) / deltaTime);
    frameCount = 0;
    lastTime = currentTime;
    document.getElementById('fps').textContent = fps;
    ui.updateFPS(fps);
  }
}


/* ===========================
   ANIMATION LOOP
=========================== */

let lastFrameTime = performance.now();

async function animate() {
  requestAnimationFrame(animate);
  const currentTime = performance.now();
  const deltaTime = Math.min((currentTime - lastFrameTime) / 1000, 0.033);
  lastFrameTime = currentTime;

  controls.update();
  await galaxySimulation.update(renderer, deltaTime, mouse3D, mousePressed);

  if (postProcessing) {
    postProcessing.render();
  } else {
    renderer.render(scene, camera);
  }

  updateFPS();
}


/* ===========================
   RESIZE
=========================== */

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


/* ===========================
   INITIALIZATION
=========================== */

renderer.init().then(() => {
  postProcessing = new THREE.PostProcessing(renderer);
  setupBloom();
  ui.setBloomNode(bloomPassNode);

  document.getElementById('star-count').textContent =
    config.starCount.toLocaleString();

  setSkybox(config.skybox); // initial

  animate();
}).catch(err => {
  console.error('Failed to initialize renderer:', err);
});

