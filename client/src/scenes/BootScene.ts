import Phaser from "phaser";

export default class BootScene extends Phaser.Scene {
	constructor() {
		super("boot");
	}

	preload() {
		// background so you don't stare at a black canvas
		this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x0f1117).setOrigin(0);

		const loadingText = this.add
			.text(this.scale.width / 2, this.scale.height / 2, "Loading...", {
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
				fontSize: "18px",
				color: "#ffffff",
			})
			.setOrigin(0.5, 0.5);

		this.load.on("progress", (p: number) => {
			loadingText.setText(`Loading... ${Math.round(p * 100)}%`);
		});

		this.load.on("complete", () => {
			this.load.off("progress");
			this.load.off("complete");
		});

		// load game assets
		this.load.spritesheet("tiles", "/assets/Royal Arena+.png", {
			frameWidth: 32,
			frameHeight: 32,
			margin: 0,
			spacing: 0,
		});

		this.load.tilemapTiledJSON("arena-map", "/assets/arena-map.json");

		this.load.spritesheet("player-sword-class", "/assets/sword-class-sprite.png", {
			frameWidth: 48,
			frameHeight: 48,
		});

		this.load.spritesheet("player-bow-class", "/assets/bow-class-sprite.png", {
			frameWidth: 48,
			frameHeight: 48,
		});

		this.load.spritesheet("player-magic-class", "/assets/magic-class-sprite.png", {
			frameWidth: 48,
			frameHeight: 48,
		});
	}

	create() {
		this.scene.start("auth");
	}
}
