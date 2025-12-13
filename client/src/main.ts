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

    map.createLayer("Tile Layer 1", tileset, 0, 0);
    map.createLayer("additional layer", tileset, 0, 0);

    // --- Render Object Layer 1 (gid-based objects) ---
    const objLayer = map.getObjectLayer("Object Layer 1");
    if (!objLayer) throw new Error("Missing object layer: Object Layer 1");

    for (const obj of objLayer.objects) {
      // Only tile-objects have gid
      if (!("gid" in obj) || !obj.gid) continue;

      // Convert global tile id -> tileset frame index
      const frame = obj.gid - tileset.firstgid;

      // Tiled object's (x,y) is bottom-left for tile objects in orthogonal maps
      const x = (obj.x ?? 0) + (obj.width ?? 0) / 2;
      const y = (obj.y ?? 0) - (obj.height ?? 0) / 2;

      const sprite = this.add.image(x, y, "tiles", frame);

      // If rotation is used in Tiled:
      if (obj.rotation) sprite.setRotation(Phaser.Math.DegToRad(obj.rotation));
    }

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
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
