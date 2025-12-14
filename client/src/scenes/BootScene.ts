import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
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
    this.scene.start("menu");
  }
}
