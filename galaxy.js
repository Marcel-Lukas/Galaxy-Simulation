/**
 * Galaxy Simulation - Main Orchestrator
 *
 * This module contains the main GalaxySimulation class that manages:
 * - Uniform initialization and updates
 * - Star particle system creation and physics
 * - Cloud particle system to simulate dust
 * - WebGPU compute shader execution
 */

import * as THREE from 'three/webgpu';
import {
  uniform,
  instancedArray,
  instanceIndex,
  vec3,
  vec4,
  float,
  Fn,
  mix,
  length,
  sin,
  cos,
  uv,
  smoothstep,
  texture
} from 'three/tsl';

import {
  hash,
  applyDifferentialRotation,
  applyMouseForce,
  applySpringForce
} from './helpers.js';

export class GalaxySimulation {
  constructor(scene, config, cloudTexture = null) {
    this.scene = scene;
    this.config = config;
    this.COUNT = config.starCount;
    this.cloudTexture = cloudTexture;

    // Storage buffers
    this.spawnPositionBuffer = null;
    this.originalPositionBuffer = null;
    this.velocityBuffer = null;
    this.densityFactorBuffer = null;

    // Compute shaders
    this.computeInit = null;
    this.computeUpdate = null;
    this.cloudInit = null;
    this.cloudUpdate = null;

    // Scene objects
    this.galaxy = null;
    this.cloudPlane = null;

    // Initialize uniforms organized by category
    this.initializeUniforms(config);

    // State
    this.initialized = false;
    this.cloudInitialized = false;
  }

  initializeUniforms(config) {
    this.uniforms = {
      compute: {
        time: uniform(0),
        deltaTime: uniform(0.016),
        mouse: uniform(new THREE.Vector3(0, 0, 0)),
        mouseActive: uniform(0.0),
        mouseForce: uniform(config.mouseForce),
        mouseRadius: uniform(config.mouseRadius),
        rotationSpeed: uniform(config.rotationSpeed)
      },

      galaxy: {
        radius: uniform(config.galaxyRadius),
        thickness: uniform(config.galaxyThickness || 0.1),
        spiralTightness: uniform(config.spiralTightness),
        armCount: uniform(config.armCount),
        armWidth: uniform(config.armWidth),
        randomness: uniform(config.randomness)
      },

      visual: {
        particleSize: uniform(config.particleSize),
        cloudSize: uniform(config.cloudSize),
        cloudOpacity: uniform(config.cloudOpacity !== undefined ? config.cloudOpacity : 0.5),
        starBrightness: uniform(config.starBrightness !== undefined ? config.starBrightness : 1.0),
        denseStarColor: uniform(new THREE.Color(config.denseStarColor || '#99ccff')),
        sparseStarColor: uniform(new THREE.Color(config.sparseStarColor || '#ffb380')),
        cloudTintColor: uniform(new THREE.Color(config.cloudTintColor || '#6ba8cc'))
      }
    };
  }

  createGalaxySystem() {
    // Clean up old galaxy
    if (this.galaxy) {
      this.scene.remove(this.galaxy);
      if (this.galaxy.material) this.galaxy.material.dispose();
    }

    // Create storage buffers for star particles
    this.spawnPositionBuffer = instancedArray(this.COUNT, 'vec3');
    this.originalPositionBuffer = instancedArray(this.COUNT, 'vec3');
    this.velocityBuffer = instancedArray(this.COUNT, 'vec3');
    this.densityFactorBuffer = instancedArray(this.COUNT, 'float');

    this.computeInit = Fn(() => {
      const idx = instanceIndex;
      const seed = idx.toFloat();

      const radius = hash(seed.add(1)).pow(0.5).mul(this.uniforms.galaxy.radius);
      const normalizedRadius = radius.div(this.uniforms.galaxy.radius);

      const armIndex = hash(seed.add(2)).mul(this.uniforms.galaxy.armCount).floor();
      const armAngle = armIndex.mul(6.28318).div(this.uniforms.galaxy.armCount);

      const spiralAngle = normalizedRadius.mul(this.uniforms.galaxy.spiralTightness).mul(6.28318);

      const angleOffset = hash(seed.add(3)).sub(0.5).mul(this.uniforms.galaxy.randomness);
      const radiusOffset = hash(seed.add(4)).sub(0.5).mul(this.uniforms.galaxy.armWidth);

      const angle = armAngle.add(spiralAngle).add(angleOffset);
      const offsetRadius = radius.add(radiusOffset);

      const x = cos(angle).mul(offsetRadius);
      const z = sin(angle).mul(offsetRadius);

      const thicknessFactor = float(1.0).sub(normalizedRadius).add(0.2);
      const y = hash(seed.add(5)).sub(0.5).mul(this.uniforms.galaxy.thickness).mul(thicknessFactor);

      const position = vec3(x, y, z);

      this.spawnPositionBuffer.element(idx).assign(position);
      this.originalPositionBuffer.element(idx).assign(position);

      const orbitalSpeed = float(1.0).div(offsetRadius.add(0.5)).mul(5.0);
      const vx = sin(angle).mul(orbitalSpeed).negate();
      const vz = cos(angle).mul(orbitalSpeed);
      this.velocityBuffer.element(idx).assign(vec3(vx, 0, vz));

      const radialSparsity = radiusOffset.abs().div(this.uniforms.galaxy.armWidth.mul(0.5).add(0.01));
      const angularSparsity = angleOffset.abs().div(this.uniforms.galaxy.randomness.mul(0.5).add(0.01));
      const sparsityFactor = radialSparsity.add(angularSparsity).mul(0.5).min(1.0);

      this.densityFactorBuffer.element(idx).assign(sparsityFactor);
    })().compute(this.COUNT);

    this.computeUpdate = Fn(() => {
      const idx = instanceIndex;
      const position = this.spawnPositionBuffer.element(idx).toVar();
      const originalPos = this.originalPositionBuffer.element(idx);

      const rotatedPos = applyDifferentialRotation(
        position,
        this.uniforms.compute.rotationSpeed,
        this.uniforms.compute.deltaTime
      );
      position.assign(rotatedPos);

      const rotatedOriginal = applyDifferentialRotation(
        originalPos,
        this.uniforms.compute.rotationSpeed,
        this.uniforms.compute.deltaTime
      );
      this.originalPositionBuffer.element(idx).assign(rotatedOriginal);

      const mouseForce = applyMouseForce(
        position,
        this.uniforms.compute.mouse,
        this.uniforms.compute.mouseActive,
        this.uniforms.compute.mouseForce,
        this.uniforms.compute.mouseRadius,
        this.uniforms.compute.deltaTime
      );
      position.addAssign(mouseForce);

      const springForce = applySpringForce(
        position,
        rotatedOriginal,
        float(2.0),
        this.uniforms.compute.deltaTime
      );
      position.addAssign(springForce);

      this.spawnPositionBuffer.element(idx).assign(position);
    })().compute(this.COUNT);

    const spriteMaterial = new THREE.SpriteNodeMaterial();
    spriteMaterial.transparent = false;
    spriteMaterial.depthWrite = false;
    spriteMaterial.blending = THREE.AdditiveBlending;

    const starPos = this.spawnPositionBuffer.toAttribute();
    const densityFactor = this.densityFactorBuffer.toAttribute();

    const circleShape = Fn(() => {
      const center = uv().sub(0.5).mul(2.0);
      const dist = length(center);
      const alpha = smoothstep(1.0, 0.0, dist).mul(smoothstep(1.0, 0.3, dist));
      return alpha;
    })();

    const starColorNode = mix(
      vec3(this.uniforms.visual.denseStarColor),
      vec3(this.uniforms.visual.sparseStarColor),
      densityFactor
    ).mul(this.uniforms.visual.starBrightness);

    spriteMaterial.positionNode = starPos;
    spriteMaterial.colorNode = vec4(starColorNode.x, starColorNode.y, starColorNode.z, float(1.0));
    spriteMaterial.opacityNode = circleShape;
    spriteMaterial.scaleNode = this.uniforms.visual.particleSize;

    this.galaxy = new THREE.Sprite(spriteMaterial);
    this.galaxy.count = this.COUNT;
    this.galaxy.frustumCulled = false;

    this.scene.add(this.galaxy);
  }

  createClouds() {
    if (this.cloudPlane) {
      this.scene.remove(this.cloudPlane);
      if (this.cloudPlane.material) this.cloudPlane.material.dispose();
    }

    const CLOUD_COUNT = this.config.cloudCount;

    const cloudPositionBuffer = instancedArray(CLOUD_COUNT, 'vec3');
    const cloudOriginalPositionBuffer = instancedArray(CLOUD_COUNT, 'vec3');

    // WebGL2 fallback uses Transform Feedback for compute.
    // Many implementations only support 4 separate TF outputs.
    // Pack (color.rgb + size) into one vec4 to reduce TF outputs.
    const cloudColorSizeBuffer = instancedArray(CLOUD_COUNT, 'vec4');

    const cloudRotationBuffer = instancedArray(CLOUD_COUNT, 'float');

    this.cloudInit = Fn(() => {
      const idx = instanceIndex;
      const seed = idx.toFloat().add(10000);

      const radius = hash(seed.add(1)).pow(0.7).mul(this.uniforms.galaxy.radius);
      const normalizedRadius = radius.div(this.uniforms.galaxy.radius);

      const armIndex = hash(seed.add(2)).mul(this.uniforms.galaxy.armCount).floor();
      const armAngle = armIndex.mul(6.28318).div(this.uniforms.galaxy.armCount);

      const spiralAngle = normalizedRadius.mul(this.uniforms.galaxy.spiralTightness).mul(6.28318);

      const angleOffset = hash(seed.add(3)).sub(0.5).mul(this.uniforms.galaxy.randomness);
      const radiusOffset = hash(seed.add(4)).sub(0.5).mul(this.uniforms.galaxy.armWidth);

      const angle = armAngle.add(spiralAngle).add(angleOffset);
      const offsetRadius = radius.add(radiusOffset);

      const x = cos(angle).mul(offsetRadius);
      const z = sin(angle).mul(offsetRadius);

      const thicknessFactor = float(1.0).sub(normalizedRadius).add(0.15);
      const y = hash(seed.add(5)).sub(0.5).mul(this.uniforms.galaxy.thickness).mul(thicknessFactor);

      const position = vec3(x, y, z);

      cloudPositionBuffer.element(idx).assign(position);
      cloudOriginalPositionBuffer.element(idx).assign(position);

      const tintColor = vec3(this.uniforms.visual.cloudTintColor);
      const cloudColor = tintColor.mul(float(1.0).sub(normalizedRadius.mul(0.3)));

      const densityFactor = float(1.0).sub(normalizedRadius.mul(0.5));
      const size = hash(seed.add(6)).mul(0.5).add(0.7).mul(densityFactor);

      // Pack color (rgb) + size into one vec4 output
      cloudColorSizeBuffer.element(idx).assign(vec4(cloudColor.x, cloudColor.y, cloudColor.z, size));

      const rotation = hash(seed.add(7)).mul(6.28318);
      cloudRotationBuffer.element(idx).assign(rotation);
    })().compute(CLOUD_COUNT);

    this.cloudUpdate = Fn(() => {
      const idx = instanceIndex;
      const position = cloudPositionBuffer.element(idx).toVar();
      const originalPos = cloudOriginalPositionBuffer.element(idx);

      const rotatedPos = applyDifferentialRotation(
        position,
        this.uniforms.compute.rotationSpeed,
        this.uniforms.compute.deltaTime
      );
      position.assign(rotatedPos);

      const rotatedOriginal = applyDifferentialRotation(
        originalPos,
        this.uniforms.compute.rotationSpeed,
        this.uniforms.compute.deltaTime
      );
      cloudOriginalPositionBuffer.element(idx).assign(rotatedOriginal);

      const mouseForce = applyMouseForce(
        position,
        this.uniforms.compute.mouse,
        this.uniforms.compute.mouseActive,
        this.uniforms.compute.mouseForce,
        this.uniforms.compute.mouseRadius,
        this.uniforms.compute.deltaTime
      );
      position.addAssign(mouseForce);

      const springForce = applySpringForce(
        position,
        rotatedOriginal,
        float(1.0),
        this.uniforms.compute.deltaTime
      );
      position.addAssign(springForce);

      cloudPositionBuffer.element(idx).assign(position);
    })().compute(CLOUD_COUNT);

    this.cloudCount = CLOUD_COUNT;

    const cloudMaterial = new THREE.SpriteNodeMaterial();
    cloudMaterial.transparent = true;
    cloudMaterial.depthWrite = false;
    cloudMaterial.blending = THREE.AdditiveBlending;

    const cloudPos = cloudPositionBuffer.toAttribute();
    const cloudColorSize = cloudColorSizeBuffer.toAttribute();
    const cloudRotation = cloudRotationBuffer.toAttribute();

    cloudMaterial.positionNode = cloudPos;
    cloudMaterial.colorNode = vec4(cloudColorSize.x, cloudColorSize.y, cloudColorSize.z, float(1.0));
    cloudMaterial.scaleNode = cloudColorSize.w.mul(this.uniforms.visual.cloudSize);
    cloudMaterial.rotationNode = cloudRotation;

    if (this.cloudTexture) {
      const cloudTextureNode = texture(this.cloudTexture, uv());
      cloudMaterial.opacityNode = cloudTextureNode.a.mul(this.uniforms.visual.cloudOpacity);
    } else {
      cloudMaterial.opacityNode = this.uniforms.visual.cloudOpacity;
    }

    this.cloudPlane = new THREE.Sprite(cloudMaterial);
    this.cloudPlane.count = CLOUD_COUNT;
    this.cloudPlane.frustumCulled = false;
    this.cloudPlane.renderOrder = -1;

    this.scene.add(this.cloudPlane);
    this.cloudInitialized = false;
  }

  updateStarCount(newCount) {
    this.COUNT = newCount;
    this.config.starCount = newCount;
    this.createGalaxySystem();
    this.initialized = false;
  }

  updateUniforms(configUpdate) {
    if (configUpdate.galaxyRadius !== undefined)
      this.uniforms.galaxy.radius.value = configUpdate.galaxyRadius;
    if (configUpdate.galaxyThickness !== undefined)
      this.uniforms.galaxy.thickness.value = configUpdate.galaxyThickness;
    if (configUpdate.spiralTightness !== undefined)
      this.uniforms.galaxy.spiralTightness.value = configUpdate.spiralTightness;
    if (configUpdate.armCount !== undefined)
      this.uniforms.galaxy.armCount.value = configUpdate.armCount;
    if (configUpdate.armWidth !== undefined)
      this.uniforms.galaxy.armWidth.value = configUpdate.armWidth;
    if (configUpdate.randomness !== undefined)
      this.uniforms.galaxy.randomness.value = configUpdate.randomness;

    if (configUpdate.rotationSpeed !== undefined)
      this.uniforms.compute.rotationSpeed.value = configUpdate.rotationSpeed;
    if (configUpdate.mouseForce !== undefined)
      this.uniforms.compute.mouseForce.value = configUpdate.mouseForce;
    if (configUpdate.mouseRadius !== undefined)
      this.uniforms.compute.mouseRadius.value = configUpdate.mouseRadius;

    if (configUpdate.particleSize !== undefined)
      this.uniforms.visual.particleSize.value = configUpdate.particleSize;
    if (configUpdate.cloudSize !== undefined)
      this.uniforms.visual.cloudSize.value = configUpdate.cloudSize;
    if (configUpdate.cloudOpacity !== undefined)
      this.uniforms.visual.cloudOpacity.value = configUpdate.cloudOpacity;
    if (configUpdate.starBrightness !== undefined)
      this.uniforms.visual.starBrightness.value = configUpdate.starBrightness;
    if (configUpdate.denseStarColor !== undefined)
      this.uniforms.visual.denseStarColor.value.set(configUpdate.denseStarColor);
    if (configUpdate.sparseStarColor !== undefined)
      this.uniforms.visual.sparseStarColor.value.set(configUpdate.sparseStarColor);
    if (configUpdate.cloudTintColor !== undefined)
      this.uniforms.visual.cloudTintColor.value.set(configUpdate.cloudTintColor);

    if (configUpdate.cloudCount !== undefined) {
      this.config.cloudCount = configUpdate.cloudCount;
    }
  }

  async update(renderer, deltaTime, mouse3D, mousePressed) {
    if (!this.initialized) {
      await renderer.computeAsync(this.computeInit);
      this.initialized = true;
    }

    if (!this.cloudInitialized && this.cloudInit) {
      await renderer.computeAsync(this.cloudInit);
      this.cloudInitialized = true;
    }

    this.uniforms.compute.time.value += deltaTime;
    this.uniforms.compute.deltaTime.value = deltaTime;
    this.uniforms.compute.mouse.value.copy(mouse3D);
    this.uniforms.compute.mouseActive.value = mousePressed ? 1.0 : 0.0;

    await renderer.computeAsync(this.computeUpdate);

    if (this.cloudUpdate) {
      await renderer.computeAsync(this.cloudUpdate);
    }
  }

  regenerate() {
    this.initialized = false;
    this.cloudInitialized = false;
  }
}

