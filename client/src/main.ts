import Phaser from "phaser";
import BootScene from "./scenes/BootScene";
import MenuScene from "./scenes/MenuScene";
import LobbyScene from "./scenes/LobbyScene";
import ArenaScene from "./scenes/ArenaScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1200,
  height: 720,
  backgroundColor: "#1d1f27",
  parent: "app",
  scene: [BootScene, MenuScene, LobbyScene, ArenaScene],

  // IMPORTANT for Phaser DOM UI (input/buttons)
  dom: { createContainer: true },
};

new Phaser.Game(config);
