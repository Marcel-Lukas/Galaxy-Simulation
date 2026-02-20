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
     * Performance-Werte für Anzeige (z. B. FPS)
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
    // this.setupPerformanceFolder(); //todo
    this.setupAppearanceFolder();
    // this.setupCloudsFolder();      //todo
    // this.setupBloomFolder();       //todo
    this.setupGalaxyFolder();
    // this.setupMouseFolder();       //todo
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
      min: 1000,
      max: 1_000_000,
      step: 1000,
      label: 'Star Count'
    }).on('change', () =>
      this.callbacks.onStarCountChange(this.config.starCount)
    );
  }

  /**
   * Appearance: visuelle Eigenschaften der Sterne
   */
  setupAppearanceFolder() {
    const appearanceFolder = this.pane.addFolder({ title: 'Appearance' });

    appearanceFolder.addBinding(this.config, 'particleSize', {
      min: 0.05,
      max: 0.5,
      step: 0.01,
      label: 'Star Size'
    }).on('change', () =>
      this.callbacks.onUniformChange('particleSize', this.config.particleSize)
    );

    appearanceFolder.addBinding(this.config, 'starBrightness', {
      min: 0.0,
      max: 2.0,
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
   * Clouds-Einstellungen (aktuell optional)
   */
  setupCloudsFolder() {
    const cloudsFolder = this.pane.addFolder({ title: 'Clouds' });

    cloudsFolder.addBinding(this.config, 'cloudCount', {
      min: 0,
      max: 100000,
      step: 1000,
      label: 'Count'
    }).on('change', () =>
      this.callbacks.onCloudCountChange(this.config.cloudCount)
    );

    cloudsFolder.addBinding(this.config, 'cloudSize', {
      min: 0.5,
      max: 10.0,
      step: 0.01,
      label: 'Size'
    }).on('change', () =>
      this.callbacks.onUniformChange('cloudSize', this.config.cloudSize)
    );

    cloudsFolder.addBinding(this.config, 'cloudOpacity', {
      min: 0.0,
      max: 1.0,
      step: 0.01,
      label: 'Opacity'
    }).on('change', () =>
      this.callbacks.onUniformChange('cloudOpacity', this.config.cloudOpacity)
    );

    cloudsFolder.addBinding(this.config, 'cloudTintColor', {
      label: 'Tint Color',
      view: 'color'
    }).on('change', () =>
      this.callbacks.onCloudTintChange(this.config.cloudTintColor)
    );
  }

  /**
   * Bloom-Postprocessing (optional)
   */
  setupBloomFolder() {
    const bloomFolder = this.pane.addFolder({ title: 'Bloom' });

    bloomFolder.addBinding(this.config, 'bloomStrength', {
      min: 0,
      max: 3,
      step: 0.01,
      label: 'Strength'
    }).on('change', () =>
      this.callbacks.onBloomChange('strength', this.config.bloomStrength)
    );

    bloomFolder.addBinding(this.config, 'bloomRadius', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Radius'
    }).on('change', () =>
      this.callbacks.onBloomChange('radius', this.config.bloomRadius)
    );

    bloomFolder.addBinding(this.config, 'bloomThreshold', {
      min: 0,
      max: 1,
      step: 0.01,
      label: 'Threshold'
    }).on('change', () =>
      this.callbacks.onBloomChange('threshold', this.config.bloomThreshold)
    );
  }

  /**
   * Galaxie-Struktur (Regeneration notwendig)
   */
  setupGalaxyFolder() {
    const galaxyFolder = this.pane.addFolder({ title: 'Galaxy Structure' });

    galaxyFolder.addBinding(this.config, 'rotationSpeed', {
      min: 0,
      max: 2,
      step: 0.01,
      label: 'Rotation Speed'
    }).on('change', () =>
      this.callbacks.onUniformChange('rotationSpeed', this.config.rotationSpeed)
    );

    galaxyFolder.addBinding(this.config, 'spiralTightness', {
      min: 0,
      max: 10,
      step: 0.01,
      label: 'Spiral Tightness'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'armCount', {
      min: 1,
      max: 4,
      step: 1,
      label: 'Arm Count'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'armWidth', {
      min: 1,
      max: 5,
      step: 0.01,
      label: 'Arm Width'
    }).on('change', () => this.callbacks.onRegenerate());

    galaxyFolder.addBinding(this.config, 'randomness', {
      min: 0,
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
      min: 0.1,
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

    this.infoHudBtn = document.getElementById('btn-galaxy');
    this.controlsBtn = document.getElementById('btn-controls');
    this.skyboxBtn = document.getElementById('btn-skybox');

    // Anzeige für die aktuelle Skybox-Nummer
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
    // Initiale Skybox-Nummer anzeigen
    this.updateSkyboxLabel();
  }

  toggleInfoHud() {
    if (!this.infoHud) return;

    const currentDisplay = window.getComputedStyle(this.infoHud).display;
    this.infoHud.style.display =
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


