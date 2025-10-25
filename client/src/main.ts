import Phaser from "phaser";

class MainScene extends Phaser.Scene {
  constructor() {
    super("main");
  }

  create() {
    this.add.text(300, 280, "Hello Pixel Coliseum!", {
      fontFamily: "Arial",
      fontSize: "24px",
      color: "#ffffff",
    });
  }
}

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  backgroundColor: "#1d1f27",
  scene: [MainScene],
};

new Phaser.Game(config);
