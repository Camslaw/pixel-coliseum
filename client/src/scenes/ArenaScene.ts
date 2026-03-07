import Phaser from "phaser";
import type { Room } from "colyseus.js";

type ArenaSceneData = {
	room: Room;
};

export default class ArenaScene extends Phaser.Scene {
	private room!: Room;
	private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
	private playerListHud?: Phaser.GameObjects.Text;
	private blocked = new Set<string>();

	constructor() {
		super("arena");
	}

	init(data: ArenaSceneData) {
		this.room = data.room;
	}

	private key(tx: number, ty: number) {
		return `${tx},${ty}`;
	}

	private buildBlockedGrid(map: Phaser.Tilemaps.Tilemap) {
		this.blocked.clear();

		// Terrain tiles block if non-empty
		const terrainLayer = map.getLayer("Terrain")?.tilemapLayer;
		if (terrainLayer) {
			for (let ty = 0; ty < map.height; ty++) {
				for (let tx = 0; tx < map.width; tx++) {
					const tile = terrainLayer.getTileAt(tx, ty);
					if (tile && tile.index !== -1) {
						const blockedTy = ty + 1;
						if (blockedTy < map.height) {
							this.blocked.add(this.key(tx, blockedTy));
						}
					}
				}
			}
		}

		// Props block only on their base tile
		const propsLayer = map.getObjectLayer("Props");
		if (propsLayer) {
			for (const obj of propsLayer.objects) {
				if (!("gid" in obj) || !obj.gid) continue;

				const tx = Math.floor((obj.x ?? 0) / map.tileWidth);
				const ty = Math.floor((obj.y ?? 0) / map.tileHeight);
				this.blocked.add(this.key(tx, ty));
			}
		}
	}

	private isBlocked(tx: number, ty: number, map: Phaser.Tilemaps.Tilemap) {
		if (tx < 0 || ty < 0) return true;
		if (tx >= map.width || ty >= map.height) return true;
		return this.blocked.has(this.key(tx, ty));
	}

	create() {
		const map = this.make.tilemap({ key: "arena-map" });
		const tileset = map.addTilesetImage("arena-tileset", "tiles");
		if (!tileset) throw new Error("Tileset mapping failed.");

		this.buildBlockedGrid(map);

		const tex = this.textures.get("player-sword-class");
		console.log("frameTotal:", tex.frameTotal);
		console.log("frames:", Object.keys(tex.frames).slice(0, 20));

		const offsetX = Math.round((this.cameras.main.width - map.widthInPixels) / 2);
		const offsetY = Math.round((this.cameras.main.height - map.heightInPixels) / 2);
		const TILE = map.tileWidth;

		const PLAYER_SCALE = 1.5;
		const PLAYER_FEET_OFFSET = 8;
		const NAME_Y_OFFSET = Math.round(2.25 * TILE);

		const tileToWorldFeet = (tx: number, ty: number) => ({
			x: Math.round(offsetX + (tx + 0.5) * TILE),
			y: Math.round(offsetY + (ty + 1) * TILE),
		});

		// ----------------------------
		// Base tile layers
		// ----------------------------
		const groundLayer = map.createLayer("Ground", tileset, offsetX, offsetY);
		const groundDetailsLayer = map.createLayer("GroundDetails", tileset, offsetX, offsetY);
		const terrainLayer = map.createLayer("Terrain", tileset, offsetX, offsetY);

		groundLayer?.setDepth(0);
		groundDetailsLayer?.setDepth(1);
		terrainLayer?.setDepth(2);

		// ----------------------------
		// Props: depth-sort by their base Y
		// ----------------------------
		const propsLayer = map.getObjectLayer("Props");
		if (propsLayer) {
			for (const obj of propsLayer.objects) {
				if (!("gid" in obj) || !obj.gid) continue;

				const frame = obj.gid - tileset.firstgid;

				// In Tiled tile objects, x/y is bottom-left of the tile object.
				const x = Math.round((obj.x ?? 0) + (obj.width ?? 0) / 2 + offsetX);
				const y = Math.round((obj.y ?? 0) + offsetY);

				const prop = this.add.image(x, y, "tiles", frame).setOrigin(0.5, 1);

				// Critical: sort by base Y
				prop.setDepth(y);

				if (obj.rotation) {
					prop.setRotation(Phaser.Math.DegToRad(obj.rotation));
				}
			}
		}

		// ----------------------------
		// Overhangs: always above world actors
		// ----------------------------
		const overhangLayer = map.createLayer("Overhangs", tileset, offsetX, offsetY);
		overhangLayer?.setDepth(5000);

		// ----------------------------
		// HUD
		// ----------------------------
		const leaveText = this.add
			.text(16, 36, "Leave Game", {
				fontFamily: "ui-monospace, monospace",
				fontSize: "16px",
			})
			.setScrollFactor(0)
			.setDepth(9999)
			.setInteractive({ useHandCursor: true });

		leaveText.on("pointerdown", () => {
			this.room.leave();
		});

		const hud = this.add.text(0, 64, `Room: ${this.room.roomId}\n`, {
			fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			fontSize: "14px",
			color: "#ffffff",
			backgroundColor: "rgba(0,0,0,0.5)",
			padding: { left: 8, right: 8, top: 6, bottom: 6 },
		});
		hud.setScrollFactor(0);
		hud.setDepth(9999);

		this.playerListHud = this.add.text(0, hud.y + hud.height + 8, "", {
			fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			fontSize: "14px",
			color: "#ffffff",
			backgroundColor: "rgba(0,0,0,0.5)",
			padding: { left: 8, right: 8, top: 6, bottom: 6 },
		});
		this.playerListHud.setScrollFactor(0);
		this.playerListHud.setDepth(9999);

		// ----------------------------
		// Players
		// ----------------------------
		const players = (this.room.state as any).players;
		if (!players) {
			console.warn("Room state has no players map yet.");
			return;
		}

		const spawnPlayerSprite = (player: any, sessionId: string) => {
			if (this.playerSprites.has(sessionId)) return;

			const pos = tileToWorldFeet(player.tx, player.ty);
			const spriteY = pos.y - PLAYER_FEET_OFFSET;

			const sprite = this.add
				.sprite(pos.x, spriteY, "player-sword-class", 1)
				.setOrigin(0.5, 1)
				.setScale(PLAYER_SCALE);

			// Critical: player depth is based on feet Y
			sprite.setDepth(pos.y);

			const label = this.add
				.text(pos.x, spriteY - NAME_Y_OFFSET, player.name ?? "Player", {
					fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
					fontSize: "12px",
					color: "#ffffff",
				})
				.setOrigin(0.5, 0.5)
				.setDepth(pos.y + 1);

			(sprite as any).__label = label;
			this.playerSprites.set(sessionId, sprite);
		};

		const updateSpriteFromState = (sid: string) => {
			const p = players.get(sid);
			const sprite = this.playerSprites.get(sid);
			if (!p || !sprite) return;

			const pos = tileToWorldFeet(p.tx, p.ty);
			const spriteY = pos.y - PLAYER_FEET_OFFSET;

			sprite.setPosition(pos.x, spriteY);
			sprite.setDepth(pos.y);

			const label = (sprite as any).__label as Phaser.GameObjects.Text | undefined;
			if (label) {
				label.setPosition(pos.x, spriteY - NAME_Y_OFFSET);
				label.setText(p.name ?? "Player");
				label.setDepth(pos.y + 1);
			}
		};

		const renderPlayerList = () => {
			const state = this.room.state as any;
			const hostId = state.hostId as string | undefined;

			const lines: string[] = [];
			players.forEach((p: any, sid: string) => {
				const me = sid === this.room.sessionId ? " (you)" : "";
				const host = hostId && sid === hostId ? " [host]" : "";
				const cls = (p.class as string) ?? "(no class)";
				const name = (p.name as string) ?? "Player";
				lines.push(`${name} - ${cls}${host}${me}`);
			});

			this.playerListHud?.setText(["Players:", ...(lines.length ? lines : ["-"])].join("\n"));
		};

		players.forEach((p: any, sid: string) => spawnPlayerSprite(p, sid));
		players.forEach((_p: any, sid: string) => updateSpriteFromState(sid));
		renderPlayerList();

		const onState = () => {
			players.forEach((_p: any, sid: string) => {
				if (!this.playerSprites.has(sid)) {
					spawnPlayerSprite(players.get(sid), sid);
				}
				updateSpriteFromState(sid);
			});
			renderPlayerList();
		};

		const unsubscribeState = this.room.onStateChange(onState);

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			try {
				(unsubscribeState as any)?.();
			} catch {}
		});

		players.onRemove = (_player: any, sessionId: string) => {
			const sprite = this.playerSprites.get(sessionId);
			if (sprite) {
				const label = (sprite as any).__label as Phaser.GameObjects.Text | undefined;
				label?.destroy();
				sprite.destroy();
				this.playerSprites.delete(sessionId);
			}
			renderPlayerList();
		};

		this.room.onLeave(() => {
			this.scene.start("hub");
		});

		// ----------------------------
		// Input
		// ----------------------------
		const onKeyDown = (ev: KeyboardEvent) => {
			let dx = 0;
			let dy = 0;

			switch (ev.code) {
				case "KeyA":
				case "ArrowLeft":
					dx = -1;
					break;
				case "KeyD":
				case "ArrowRight":
					dx = 1;
					break;
				case "KeyW":
				case "ArrowUp":
					dy = -1;
					break;
				case "KeyS":
				case "ArrowDown":
					dy = 1;
					break;
				default:
					return;
			}

			const me = (players as any).get(this.room.sessionId);
			if (!me) return;

			const ntx = me.tx + dx;
			const nty = me.ty + dy;

			if (this.isBlocked(ntx, nty, map)) return;

			this.room.send("move", { dx, dy });
		};

		this.game.canvas?.setAttribute("tabindex", "0");
		this.game.canvas?.addEventListener("pointerdown", () => {
			this.game.canvas?.focus();
		});

		this.input.keyboard?.on("keydown", onKeyDown);

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			this.input.keyboard?.off("keydown", onKeyDown);
		});
	}
}
