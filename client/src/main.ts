import Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import MenuScene from "./scenes/MenuScene";
import MatchScene from "./scenes/MatchScene";
import LobbyScene from "./scenes/LobbyScene";
import ArenaScene from "./scenes/ArenaScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  backgroundColor: "#1d1f27",

  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },

  scene: [BootScene, MenuScene, MatchScene, LobbyScene, ArenaScene],
  dom: { createContainer: true },
  pixelArt: true,
  roundPixels: true,
};

new Phaser.Game(config);
