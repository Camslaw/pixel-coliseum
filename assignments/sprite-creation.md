# **Pixel Coliseum: Sprite Creation Pipeline**

This document outlines the sprite creation workflow for **Pixel Coliseum**, using a focused, streamlined stack:

- **PixelVibe** for all AI-generated pixel art  
- **Aseprite** for editing, cleanup, and animation  
- **Phaser 3** for loading and playing sprite animations in-game  

This pipeline produces consistent, high-quality pixel art while keeping development fast and manageable.

---

## **1. Overview of the Art Pipeline**

The workflow is simple:

1. **PixelVibe → Generate base pixel art**  
   - Characters, enemies, weapons, tiles, props, and VFX  
   - Multi-frame animations (idle, walk, attack, death)  
   - Top-down 32×32 SNES-style outputs

2. **Aseprite → Clean up & assemble sprite sheets**  
   - Fix AI inconsistencies  
   - Adjust palettes  
   - Align frames  
   - Rebuild smooth animations  
   - Export final PNG + JSON

3. **Phaser 3 → Load and animate**  
   - Uses Aseprite JSON  
   - Automatically generates animation definitions  
   - Plays directional walk/attack cycles in-game

---

## **2. Sprite Creation Workflow (PixelVibe → Aseprite → Phaser 3)**

### **Step 1: Generate Sprite Frames in PixelVibe**

**Assets generated:**

- Player idle/walk/attack frames  
- Enemy sprites with full animation sets  
- Weapons (icons + in-hand poses)  
- Arena tiles (32×32 tileable surfaces)  
- Props and decorations  
- VFX (slashes, projectiles, magic effects)

**Each prompt specifies:**

- Top-down  
- 32×32  
- SNES-style shading  
- Clean outlines  
- Consistent palette  
- Multi-frame animations when needed  

PixelVibe outputs individual PNG frames.

### **Step 2: Refine & Animate in Aseprite**

All PixelVibe frames are refined in Aseprite:

- Crop/align all sprites to 32×32  
- Fix outline inconsistencies and stray pixels  
- Smooth animations using onion skin  
- Add weapon overlays for sword/bow/staff  
- Adjust palettes for consistency  
- Add directional variations when needed  
- Organize everything into labeled animation tags  
- Export final sprite sheets + JSON  

Aseprite is the authoritative source of truth for final visuals.

### **Step 3: Import Into Phaser 3**

Exported files look like:

- `coliseum_hero.png`  
- `coliseum_hero.json`  
- `enemy_skeleton.png`  
- `enemy_skeleton.json`  
- `tileset_arena.png`  

Phaser loads and animates them automatically.

---

## **4. Pixel Art Style Guide**

To maintain a unified look across all PixelVibe output:

- **Resolution:** 32×32 pixels  
- **Perspective:** Top-down action RPG  
- **Palette:** Bright SNES-inspired colors  
- **Outline:** 1px dark border  
- **Shading:** 2–3 tones per color  

**Animation Frame Counts:**

- Idle: 1–2 frames  
- Walk: 4 frames  
- Attack: 3–5 frames  
- Death: 6–8 frames  

**Weapon Alignment:** Always anchored to the same pivot point  
**Arena Tiles:** Tileable 32×32 sandstone/stone patterns  

This ensures all AI-generated content remains visually consistent.
