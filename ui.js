import { Pane } from 'tweakpane';

/**
 * GalaxyUI
 * --------
 * Diese Klasse kapselt die komplette UI-Logik:
 * - Tweakpane (Slider, Color Picker etc.)
 * - HUD-Buttons (Info, Controls, Skybox)
 * - Skybox-Cycling inkl. Anzeige der aktuellen Nummer im HTML
 *
 * Wichtig:
 * - Die UI kennt KEINE Three.js-Details
 * - Alle Aktionen laufen über Callbacks → saubere Trennung von UI & Rendering
 */
export class GalaxyUI {
  constructor(config, callbacks) {
    /**
     * Zentrale Config (wird von main.js gehalten)
     * Änderungen hier wirken sich direkt auf die Simulation aus
     */
    this.config = config;

    /**
     * Callback-Schnittstelle nach außen (main.js)
     * z. B. onUniformChange, onSkyboxChange, onRegenerate, ...
     */
    this.callbacks = callbacks;

    /**
     * Tweakpane-Instanz (rechte Control-Leiste)
     */
    this.pane = new Pane({ title: '🌌 Galaxy Controls 🌌' });

    /**
     * Referenz auf den Bloom-Node (optional)
     */
    this.bloomPassNode = null;

    /**
     * Performance-Werte für Anzeige
     */
    this.perfParams = { fps: 60 };

    /**
     * Skybox-Reihenfolge
     * Wird dynamisch aus main.js übergeben (Object.keys(skyboxes))
     */
    this.skyboxOrder = Array.isArray(this.callbacks.skyboxKeys)
      ? this.callbacks.skyboxKeys
      : [];

    /**
     * Startindex der aktuellen Skybox
     * Falls config.skybox nicht gefunden wird → Fallback auf 0
     */
    const startIndex = this.skyboxOrder.indexOf(this.config.skybox);
    this.currentSkyboxIndex = startIndex >= 0 ? startIndex : 0;

    // UI initialisieren
    this.setupUI();
    this.initButtons();
  }


  /* ===========================
     TWEAKPANE SETUP
  ============================ */
  /**
   * Steuert, welche UI-Bereiche aktiv sind
   */
  setupUI() {
    this.setupPerformanceFolder();
    this.setupMouseFolder();
    this.setupCloudsFolder();
    this.setupAppearanceFolder();
    this.setupBloomFolder();
    this.setupGalaxyFolder();
  }

  /**
   * Performance-Ordner (FPS, Star Count)
   */
  setupPerformanceFolder() {
    const perfFolder = this.pane.addFolder({ title: 'Performance' });

    perfFolder.addBinding(this.perfParams, 'fps', {
      readonly: true,
      label: 'FPS'
    });

    perfFolder.addBinding(this.config, 'starCount', {
      min: 100_000,
      max: 1_000_000,
      step: 50_000,
      label: 'Star Count'
    }).on('change', (ev) => {
      // WebGL2 fallback (Transform Feedback) is fragile when resizing GPU buffers at runtime.
      // Apply starCount only on the FINAL interaction event (mouse release / input commit).
      if (ev?.last) {
        this.callbacks.onStarCountChange(ev.value);
      }
    });
  }

  /**
   *  Mouse Settings
   */
  setupMouseFolder() {
    const appearanceFolder = this.pane.addFolder({ title: 'Mouse' });

    appearanceFolder.addBinding(this.config, 'mouseForce', {
      min: 0,
      max: 100,
      step: 0.1,
      label: 'Force'
    }).on('change', () =>
      this.callbacks.onUniformChange('mouseForce', this.config.mouseForce)
    );

    appearanceFolder.addBinding(this.config, 'mouseRadius', {
      min: 0,
      max: 50,
      step: 0.1,
      label: 'Radius'
    }).on('change', () =>
      this.callbacks.onUniformChange('mouseRadius', this.config.mouseRadius)
    );
  }

  /**
   * Clouds-Einstellungen
   */
  setupCloudsFolder() {
    const cloudsFolder = this.pane.addFolder({ title: 'Clouds' });

    cloudsFolder.addBinding(this.config, 'cloudSize', {
      min: 0.0,
      max: 4.0,
      step: 0.01,
      label: 'Size'
    }).on('change', () =>
      this.callbacks.onUniformChange('cloudSize', this.config.cloudSize)
    );

    cloudsFolder.addBinding(this.config, 'cloudOpacity', {
      min: 0.0,
      max: 0.1,
      step: 0.001,
      label: 'Strength'
    }).on('change', () =>
      this.callbacks.onUniformChange('cloudOpacity', this.config.cloudOpacity)
    );
  }

  /**
   * Appearance: visuelle Eigenschaften der Sterne
   */
  setupAppearanceFolder() {
    const appearanceFolder = this.pane.addFolder({ title: 'Appearance' });

    appearanceFolder.addBinding(this.config, 'particleSize', {
      min: 0.02,
      max: 0.15,
      step: 0.01,
      label: 'Star Size'
    }).on('change', () =>
      this.callbacks.onUniformChange('particleSize', this.config.particleSize)
    );

    appearanceFolder.addBinding(this.config, 'starBrightness', {
      min: 0.1,
      max: 1.0,
      step: 0.01,
      label: 'Star Brightness'
    }).on('change', () =>
      this.callbacks.onUniformChange('starBrightness', this.config.starBrightness)
    );

    appearanceFolder.addBinding(this.config, 'denseStarColor', {
      label: 'Dense Color',
      view: 'color'
    }).on('change', () =>
      this.callbacks.onUniformChange('denseStarColor', this.config.denseStarColor)
    );

    appearanceFolder.addBinding(this.config, 'sparseStarColor', {
      label: 'Sparse Color',
      view: 'color'
    }).on('change', () =>
      this.callbacks.onUniformChange('sparseStarColor', this.config.sparseStarColor)
    );
  }

  /**
   * Bloom-Postprocessing
   */
  setupBloomFolder() {
    const bloomFolder = this.pane.addFolder({ title: 'Bloom' });

    bloomFolder.addBinding(this.config, 'bloomStrength', {
      min: 0,
      max: 1,
      step: 0.005,
      label: 'Strength'
    }).on('change', () =>
      this.callbacks.onBloomChange('strength', this.config.bloomStrength)
    );

    bloomFolder.addBinding(this.config, 'bloomThreshold', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Cutoff'
    }).on('change', () =>
      this.callbacks.onBloomChange('threshold', this.config.bloomThreshold)
    );
  }

  /**
   * Galaxie-Struktur (Regeneration notwendig)
   */
  setupGalaxyFolder() {
    const galaxyFolder = this.pane.addFolder({ title: 'Structure' });

    galaxyFolder.addBinding(this.config, 'rotationSpeed', {
      min: 0,
      max: 6,
      step: 0.005,
      label: 'Rotation Speed'
    }).on('change', () =>
      this.callbacks.onUniformChange('rotationSpeed', this.config.rotationSpeed)
    );

    galaxyFolder.addBinding(this.config, 'spiralTightness', {
      min: 0.35,
      max: 2.5,
      step: 0.005,
      label: 'Spiral Tightness'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'armCount', {
      min: 1,
      max: 4,
      step: 1,
      label: 'Arm Count'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'armWidth', {
      min: 0.5,
      max: 5,
      step: 0.005,
      label: 'Arm Width'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'randomness', {
      min: 1,
      max: 5,
      step: 0.01,
      label: 'Randomness'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'galaxyRadius', {
      min: 5,
      max: 20,
      step: 0.01,
      label: 'Galaxy Radius'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'galaxyThickness', {
      min: 1,
      max: 10,
      step: 0.01,
      label: 'Thickness'
    }).on('change', () => this.callbacks.onRegenerate());
  }


  /* ===========================
     BUTTONS & HUD
  ============================ */
  /**
   * Initialisiert alle HTML-Buttons außerhalb der Tweakpane
   */
  initButtons() {
    this.infoHud = document.getElementById('info');
    this.controlPanel = document.querySelector('.tp-dfwv');
    this.infoHudBtn = document.getElementById('btn-galaxy');
    this.controlsBtn = document.getElementById('btn-controls');
    this.skyboxBtn = document.getElementById('btn-skybox');
    this.skyboxLabel = document.querySelector('.skybox');

    if (this.infoHudBtn) {
      this.infoHudBtn.addEventListener('click', () => this.toggleInfoHud());
    }

    if (this.controlsBtn) {
      this.controlsBtn.addEventListener('click', () => this.toggleControls());
    }

    if (this.skyboxBtn) {
      this.skyboxBtn.addEventListener('click', () => this.cycleSkybox());
    }

    this.updateSkyboxLabel();
  }

  toggleInfoHud() {
    if (!this.infoHud) return;

    const currentDisplay = window.getComputedStyle(this.infoHud).display;
    this.infoHud.style.display =
      currentDisplay === 'none' ? 'block' : 'none';
    this.controlPanel.style.display =
      currentDisplay === 'none' ? 'block' : 'none';
  }

  toggleControls() {
    const panel = document.querySelector('.tp-dfwv');
    const statusLabel = document.querySelector('.status');

    if (!panel) return;

    if (panel.style.display === 'none') {
      panel.style.display = 'block';
      if (statusLabel) statusLabel.textContent = 'OFF';
    } else {
      panel.style.display = 'none';
      if (statusLabel) statusLabel.textContent = 'ON';
    }
  }


  /* ===========================
     SKYBOX LOGIC
  ============================ */
  /**
   * Wechselt zyklisch zur nächsten Skybox
   * Letzte → wieder Erste
   */
  cycleSkybox() {
    if (this.skyboxOrder.length === 0) return;

    this.currentSkyboxIndex =
      (this.currentSkyboxIndex + 1) % this.skyboxOrder.length;

    const nextSkybox = this.skyboxOrder[this.currentSkyboxIndex];
    this.config.skybox = nextSkybox;

    this.callbacks.onSkyboxChange?.(nextSkybox);

    this.updateSkyboxLabel();
  }
  /**
   * Aktualisiert die HTML-Anzeige der Skybox-Nummer (1-basiert)
   */
  updateSkyboxLabel() {
    if (!this.skyboxLabel) return;
    this.skyboxLabel.textContent = String(this.currentSkyboxIndex + 1);
  }


  /* ===========================
     MISC
  ============================ */

  updateFPS(fps) {
    this.perfParams.fps = fps;
    this.pane.refresh();
  }

  setBloomNode(bloomNode) {
    this.bloomPassNode = bloomNode;
  }
}

