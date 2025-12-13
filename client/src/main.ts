import Phaser from "phaser";

class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
  }

  preload() {
    this.load.spritesheet("tiles", "/assets/Royal Arena+.png", {
      frameWidth: 32,
      frameHeight: 32,
      margin: 0,
      spacing: 0,
    });

    this.load.tilemapTiledJSON("arena-map", "/assets/arena-map.json");
  }

  create() {
    const map = this.make.tilemap({ key: "arena-map" });
    const tileset = map.addTilesetImage("arena-tileset", "tiles");
    if (!tileset) throw new Error("Tileset mapping failed.");

    // Calculate offset to center the map in the scene
    const offsetX = (this.cameras.main.width - map.widthInPixels) / 2;
    const offsetY = (this.cameras.main.height - map.heightInPixels) / 2;

    // Create layers at the offset position
    map.createLayer("Tile Layer 1", tileset, offsetX, offsetY);
    map.createLayer("additional layer", tileset, offsetX, offsetY);

    // --- Render Object Layer 1 (gid-based objects) ---
    const objLayer = map.getObjectLayer("Object Layer 1");
    if (!objLayer) throw new Error("Missing object layer: Object Layer 1");

    for (const obj of objLayer.objects) {
      if (!("gid" in obj) || !obj.gid) continue;
      const frame = obj.gid - tileset.firstgid;
      // Apply offset to object positions
      const x = (obj.x ?? 0) + (obj.width ?? 0) / 2 + offsetX;
      const y = (obj.y ?? 0) - (obj.height ?? 0) / 2 + offsetY;
      const sprite = this.add.image(x, y, "tiles", frame);
      if (obj.rotation) sprite.setRotation(Phaser.Math.DegToRad(obj.rotation));
    }

    // No need to move the camera, just show the whole scene
  }

}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,
  height: 720,
  backgroundColor: "#1d1f27",
  scene: [MainScene],
};

new Phaser.Game(config);
