import Phaser from "phaser";
import { auth } from "../auth";

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

    this.load.spritesheet("player", "/assets/player-sprites.png", {
      frameWidth: 48,
      frameHeight: 48,
    });

    this.load.html("menu-ui", "/ui/menu.html");
    this.load.html("lobby-ui", "/ui/lobby.html");
  }

  create() {
    (async () => {
      await auth.restore();
      this.scene.start("menu");
    })();
  }
}
