import Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import AuthScene from "./scenes/AuthScene";
import HubScene from "./scenes/HubScene";
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

  scene: [BootScene, AuthScene, HubScene, LobbyScene, ArenaScene],
  dom: { createContainer: true },
  pixelArt: true,
  roundPixels: true,
};

new Phaser.Game(config);
