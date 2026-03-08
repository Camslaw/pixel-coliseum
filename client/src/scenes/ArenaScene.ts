import Phaser from "phaser";
import type { Room } from "colyseus.js";

type ArenaSceneData = {
	room: Room;
};

type Facing = "up" | "down" | "left" | "right";
type AnimState = "idle" | "walk" | "attack";

type PendingMove = {
	seq: number;
	dx: number;
	dy: number;
};

type QueuedMove = {
	dx: number;
	dy: number;
};

type RenderPlayer = {
	sessionId: string;
	sprite: Phaser.GameObjects.Sprite;
	label: Phaser.GameObjects.Text;
	className: "sword" | "bow" | "magic";

	tx: number;
	ty: number;

	fromX: number;
	fromY: number;
	toX: number;
	toY: number;

	moveStartTime: number;
	moveDuration: number;
	isMoving: boolean;

	facing: Facing;
	animState: AnimState;

	pendingInputs: PendingMove[];
	nextInputSeq: number;

	queuedMove: QueuedMove | null;

	attackEndTime: number;
	isAttacking: boolean;
};

export default class ArenaScene extends Phaser.Scene {
	private room!: Room;
	private renderPlayers = new Map<string, RenderPlayer>();
	private playerListHud?: Phaser.GameObjects.Text;
	private blocked = new Set<string>();
	private lastMoveTime = 0;
	private map?: Phaser.Tilemaps.Tilemap;
	private moveIntervalMs = 160;

	private moveKeys!: {
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
	};

	private attackKey!: Phaser.Input.Keyboard.Key;

	private animDef = {
		down: {
			idle: 1,
			walk: [0, 1, 2, 1],
			attack: [10, 11, 12, 13, 14]
		},
		left: {
			idle: 24,
			walk: [23, 24, 25, 24],
			attack: [33, 34, 35, 36, 37]
		},
		right: {
			idle: 47,
			walk: [46, 47, 48, 47],
			attack: [56, 57, 58, 59, 60]
		},
		up: {
			idle: 70,
			walk: [69, 70, 71, 70],
			attack: [79, 80, 81, 82, 83]
		},
	} as const;

	private playerFeetOffset = 8;
	private nameYOffset = 0;
	private moveRenderMs = 140;
	private tileToWorldFeet?: (tx: number, ty: number) => { x: number; y: number };

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

	private getWalkAnimKey(className: "sword" | "bow" | "magic", facing: Facing) {
		return `player-${className}-walk-${facing}`;
	}

	private getAttackAnimKey(className: "sword" | "bow" | "magic", facing: Facing) {
		return `player-${className}-attack-${facing}`;
	}

	private syncLabel(rp: RenderPlayer, name?: string) {
		rp.label.setPosition(rp.sprite.x, rp.sprite.y - this.nameYOffset);
		rp.label.setDepth(rp.sprite.depth + 1);

		if (name !== undefined) {
			rp.label.setText(name);
		}
	}

	private normalizePlayerClass(v: unknown): "sword" | "bow" | "magic" {
		if (v === "sword" || v === "bow" || v === "magic") return v;
		return "sword";
	}

	private getSpriteKeyForClass(cls: unknown) {
		const normalized = this.normalizePlayerClass(cls);

		if (normalized === "bow") return "player-bow-class";
		if (normalized === "magic") return "player-magic-class";
		return "player-sword-class";
	}

	private setAnimState(rp: RenderPlayer, nextState: AnimState) {
		if (rp.animState === nextState) {
			if (nextState === "walk") {
				rp.sprite.play(this.getWalkAnimKey(rp.className, rp.facing), true);
			} else if (nextState === "attack") {
				rp.sprite.play(this.getAttackAnimKey(rp.className, rp.facing), true);
			}
			return;
		}

		rp.animState = nextState;

		if (nextState === "walk") {
			rp.sprite.play(this.getWalkAnimKey(rp.className, rp.facing), true);
			return;
		}

		if (nextState === "attack") {
			rp.sprite.play(this.getAttackAnimKey(rp.className, rp.facing), true);
			return;
		}

		rp.sprite.anims.stop();
		rp.sprite.setFrame(this.animDef[rp.facing].idle);
	}

		private getAttackDurationMs(rp: RenderPlayer) {
		if (rp.className === "bow") return 220;
		if (rp.className === "magic") return 260;
		return 180; // sword
	}

	private tryStartLocalAttack(now: number) {
		const meRp = this.renderPlayers.get(this.room.sessionId);
		if (!meRp) return false;
		if (meRp.isMoving) return false;
		if (meRp.isAttacking) return false;

		meRp.isAttacking = true;
		meRp.attackEndTime = now + this.getAttackDurationMs(meRp);
		meRp.queuedMove = null;

		this.setAnimState(meRp, "attack");

		// Optional later:
		// this.room.send("attack", { facing: meRp.facing, class: meRp.className });

		return true;
	}

	private advanceAttackState(rp: RenderPlayer, now: number) {
		if (!rp.isAttacking) return;
		if (now < rp.attackEndTime) return;

		rp.isAttacking = false;
		this.setAnimState(rp, "idle");
	}

	private beginRenderMove(
		rp: RenderPlayer,
		targetTx: number,
		targetTy: number,
		now: number,
		duration: number,
		facing: Facing
	) {
		if (!this.tileToWorldFeet) return;

		const targetFeet = this.tileToWorldFeet(targetTx, targetTy);
		const targetSpriteY = targetFeet.y - this.playerFeetOffset;

		rp.fromX = rp.sprite.x;
		rp.fromY = rp.sprite.y;
		rp.toX = targetFeet.x;
		rp.toY = targetSpriteY;
		rp.moveStartTime = now;
		rp.moveDuration = duration;
		rp.isMoving = true;
		rp.facing = facing;

		this.setAnimState(rp, "walk");
	}

	private advanceRenderMove(rp: RenderPlayer, now: number) {
		if (!rp.isMoving) return;

		const t = Phaser.Math.Clamp(
			(now - rp.moveStartTime) / rp.moveDuration,
			0,
			1
		);

		rp.sprite.x = Phaser.Math.Linear(rp.fromX, rp.toX, t);
		rp.sprite.y = Phaser.Math.Linear(rp.fromY, rp.toY, t);
		rp.sprite.setDepth(rp.sprite.y + this.playerFeetOffset);

		this.syncLabel(rp);

		if (t >= 1) {
			rp.sprite.x = rp.toX;
			rp.sprite.y = rp.toY;
			rp.sprite.setDepth(rp.sprite.y + this.playerFeetOffset);

			rp.isMoving = false;
			this.setAnimState(rp, "idle");
			this.syncLabel(rp);
		}
	}

	private getFacingFromDelta(dx: number, dy: number): Facing {
		if (dx < 0) return "left";
		if (dx > 0) return "right";
		if (dy < 0) return "up";
		return "down";
	}

	private snapRenderPlayerToTile(rp: RenderPlayer, tx: number, ty: number) {
		if (!this.tileToWorldFeet) return;

		const pos = this.tileToWorldFeet(tx, ty);
		const spriteY = pos.y - this.playerFeetOffset;

		rp.sprite.setPosition(pos.x, spriteY);
		rp.sprite.setDepth(pos.y);

		rp.fromX = pos.x;
		rp.fromY = spriteY;
		rp.toX = pos.x;
		rp.toY = spriteY;
		rp.isMoving = false;
	}

	private reconcileLocalPlayer(rp: RenderPlayer, player: any) {
		const serverTx = player.tx as number;
		const serverTy = player.ty as number;
		const lastProcessedInput = Number(player.lastProcessedInput ?? 0);

		// Drop inputs the server has already processed.
		rp.pendingInputs = rp.pendingInputs.filter((input) => input.seq > lastProcessedInput);

		// Rebuild the predicted logical tile from the server position + remaining inputs.
		let correctedTx = serverTx;
		let correctedTy = serverTy;
		let replayFacing = rp.facing;

		for (const input of rp.pendingInputs) {
			const ntx = correctedTx + input.dx;
			const nty = correctedTy + input.dy;

			if (!this.map || this.isBlocked(ntx, nty, this.map)) {
				continue;
			}

			correctedTx = ntx;
			correctedTy = nty;
			replayFacing = this.getFacingFromDelta(input.dx, input.dy);
		}

		const needsLogicalCorrection = rp.tx !== correctedTx || rp.ty !== correctedTy;

		// Update logical tile no matter what.
		rp.tx = correctedTx;
		rp.ty = correctedTy;

		// If there is no mismatch, do NOT snap or restart movement.
		if (!needsLogicalCorrection) {
			this.syncLabel(rp, player.name ?? "Player");
			return;
		}

		// Only do a visual correction when prediction truly diverged.
		this.snapRenderPlayerToTile(rp, serverTx, serverTy);

		if (rp.pendingInputs.length > 0) {
			this.beginRenderMove(rp, correctedTx, correctedTy, this.time.now, this.moveRenderMs, replayFacing);
		} else {
			this.setAnimState(rp, "idle");
			this.syncLabel(rp, player.name ?? "Player");
		}
	}

	private getDesiredInputDirection(): QueuedMove | null {
		let dx = 0;
		let dy = 0;

		if (this.moveKeys.left.isDown) dx = -1;
		else if (this.moveKeys.right.isDown) dx = 1;
		else if (this.moveKeys.up.isDown) dy = -1;
		else if (this.moveKeys.down.isDown) dy = 1;
		else return null;

		return { dx, dy };
	}

	private tryStartPredictedLocalMove(dx: number, dy: number, now: number) {
		if (!this.map) return false;

		const meRp = this.renderPlayers.get(this.room.sessionId);
		if (!meRp) return false;

		const ntx = meRp.tx + dx;
		const nty = meRp.ty + dy;

		if (this.isBlocked(ntx, nty, this.map)) return false;

		const facing = this.getFacingFromDelta(dx, dy);
		const seq = ++meRp.nextInputSeq;

		meRp.pendingInputs.push({ seq, dx, dy });

		meRp.tx = ntx;
		meRp.ty = nty;

		this.beginRenderMove(meRp, ntx, nty, now, this.moveRenderMs, facing);

		meRp.queuedMove = null;
		this.lastMoveTime = now;
		this.room.send("move", { dx, dy, seq });
		return true;
	}

	private tryConsumeQueuedLocalMove(now: number) {
		const meRp = this.renderPlayers.get(this.room.sessionId);
		if (!meRp) return false;
		if (meRp.isMoving) return false;
		if (!meRp.queuedMove) return false;
		if (now - this.lastMoveTime < this.moveIntervalMs) return false;

		const { dx, dy } = meRp.queuedMove;
		return this.tryStartPredictedLocalMove(dx, dy, now);
	}

	create() {
		const map = this.make.tilemap({ key: "arena-map" });

		this.moveRenderMs = 160;
		const WALK_FPS = 10;
		const MOVE_INTERVAL_MS = 160;

		this.map = map;
		this.moveIntervalMs = MOVE_INTERVAL_MS;

		const tileset = map.addTilesetImage("arena-tileset", "tiles");
		if (!tileset) throw new Error("Tileset mapping failed.");

		this.moveKeys = this.input.keyboard!.addKeys({
			left: Phaser.Input.Keyboard.KeyCodes.A,
			right: Phaser.Input.Keyboard.KeyCodes.D,
			up: Phaser.Input.Keyboard.KeyCodes.W,
			down: Phaser.Input.Keyboard.KeyCodes.S,
		}) as {
			left: Phaser.Input.Keyboard.Key;
			right: Phaser.Input.Keyboard.Key;
			up: Phaser.Input.Keyboard.Key;
			down: Phaser.Input.Keyboard.Key;
		};

		this.attackKey = this.input.keyboard!.addKey(
			Phaser.Input.Keyboard.KeyCodes.SPACE
		);

		this.buildBlockedGrid(map);

		const offsetX = Math.round((this.cameras.main.width - map.widthInPixels) / 2);
		const offsetY = Math.round((this.cameras.main.height - map.heightInPixels) / 2);
		const TILE = map.tileWidth;

		const PLAYER_SCALE = 1.75;
		this.playerFeetOffset = 8;
		this.nameYOffset = Math.round(2.65 * TILE);

		this.tileToWorldFeet = (tx: number, ty: number) => ({
			x: Math.round(offsetX + (tx + 0.5) * TILE),
			y: Math.round(offsetY + (ty + 1) * TILE),
		});

		const groundLayer = map.createLayer("Ground", tileset, offsetX, offsetY);
		const groundDetailsLayer = map.createLayer("GroundDetails", tileset, offsetX, offsetY);
		const terrainLayer = map.createLayer("Terrain", tileset, offsetX, offsetY);

		groundLayer?.setDepth(0);
		groundDetailsLayer?.setDepth(1);
		terrainLayer?.setDepth(2);

		const propsLayer = map.getObjectLayer("Props");
		if (propsLayer) {
			for (const obj of propsLayer.objects) {
				if (!("gid" in obj) || !obj.gid) continue;

				const frame = obj.gid - tileset.firstgid;
				const x = Math.round((obj.x ?? 0) + (obj.width ?? 0) / 2 + offsetX);
				const y = Math.round((obj.y ?? 0) + offsetY);

				const prop = this.add.image(x, y, "tiles", frame).setOrigin(0.5, 1);
				prop.setDepth(y);

				if (obj.rotation) {
					prop.setRotation(Phaser.Math.DegToRad(obj.rotation));
				}
			}
		}

		const overhangLayer = map.createLayer("Overhangs", tileset, offsetX, offsetY);
		overhangLayer?.setDepth(5000);

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

		const players = (this.room.state as any).players;
		if (!players) {
			console.warn("Room state has no players map yet.");
			return;
		}

		const ensurePlayerAnimations = () => {
			const makeWalk = (
				className: "sword" | "bow" | "magic",
				facing: Facing,
				frames: readonly number[]
			) => {
				const key = this.getWalkAnimKey(className, facing);
				if (this.anims.exists(key)) return;

				this.anims.create({
					key,
					frames: frames.map((frame) => ({
						key: this.getSpriteKeyForClass(className),
						frame,
					})),
					frameRate: WALK_FPS,
					repeat: -1,
				});
			};

			const makeAttack = (
				className: "sword" | "bow" | "magic",
				facing: Facing,
				frames: readonly number[]
			) => {
				const key = this.getAttackAnimKey(className, facing);
				if (this.anims.exists(key)) return;

				this.anims.create({
					key,
					frames: frames.map((frame) => ({
						key: this.getSpriteKeyForClass(className),
						frame,
					})),
					frameRate: 12,
					repeat: 0,
				});
			};

			const classes: Array<"sword" | "bow" | "magic"> = ["sword", "bow", "magic"];

			for (const cls of classes) {
				makeWalk(cls, "down", this.animDef.down.walk);
				makeWalk(cls, "left", this.animDef.left.walk);
				makeWalk(cls, "right", this.animDef.right.walk);
				makeWalk(cls, "up", this.animDef.up.walk);

				makeAttack(cls, "down", this.animDef.down.attack);
				makeAttack(cls, "left", this.animDef.left.attack);
				makeAttack(cls, "right", this.animDef.right.attack);
				makeAttack(cls, "up", this.animDef.up.attack);
			}
		};

		ensurePlayerAnimations();

		const syncToAuthoritativeState = (rp: RenderPlayer, player: any) => {
			const isLocal = rp.sessionId === this.room.sessionId;

			if (isLocal) {
				this.reconcileLocalPlayer(rp, player);
				return;
			}

			const prevTx = rp.tx;
			const prevTy = rp.ty;
			const nextTx = player.tx as number;
			const nextTy = player.ty as number;

			const moved = prevTx !== nextTx || prevTy !== nextTy;

			if (!moved) {
				if (!rp.isMoving) {
					const pos = this.tileToWorldFeet!(nextTx, nextTy);
					const spriteY = pos.y - this.playerFeetOffset;

					rp.sprite.setPosition(pos.x, spriteY);
					rp.sprite.setDepth(pos.y);
					this.setAnimState(rp, "idle");
				}

				this.syncLabel(rp, player.name ?? "Player");
				return;
			}

			const dx = nextTx - prevTx;
			const dy = nextTy - prevTy;
			const facing = this.getFacingFromDelta(dx, dy);

			const targetFeet = this.tileToWorldFeet!(nextTx, nextTy);
			const targetSpriteY = targetFeet.y - this.playerFeetOffset;

			const alreadyMovingToSameTarget =
				rp.isMoving &&
				rp.toX === targetFeet.x &&
				rp.toY === targetSpriteY;

			if (!alreadyMovingToSameTarget) {
				this.beginRenderMove(rp, nextTx, nextTy, this.time.now, this.moveRenderMs, facing);
			} else {
				rp.facing = facing;
				this.setAnimState(rp, "walk");
			}

			this.syncLabel(rp, player.name ?? "Player");

			rp.tx = nextTx;
			rp.ty = nextTy;
		};

		const spawnPlayerSprite = (player: any, sessionId: string) => {
			if (this.renderPlayers.has(sessionId)) return;

			const pos = this.tileToWorldFeet!(player.tx, player.ty);
			const spriteY = pos.y - this.playerFeetOffset;

			const className = this.normalizePlayerClass(player.class);
			const spriteKey = this.getSpriteKeyForClass(className);

			const sprite = this.add
				.sprite(pos.x, spriteY, spriteKey, this.animDef.down.idle)
				.setOrigin(0.5, 1)
				.setScale(PLAYER_SCALE);

			sprite.setDepth(pos.y);

			const label = this.add
				.text(pos.x, spriteY - this.nameYOffset, player.name ?? "Player", {
					fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
					fontSize: "12px",
					color: "#ffffff",
				})
				.setOrigin(0.5, 0.5)
				.setDepth(pos.y + 1);

			const rp: RenderPlayer = {
				sessionId,
				sprite,
				label,
				className,

				tx: player.tx,
				ty: player.ty,

				fromX: sprite.x,
				fromY: sprite.y,
				toX: sprite.x,
				toY: sprite.y,

				moveStartTime: 0,
				moveDuration: this.moveRenderMs,
				isMoving: false,

				facing: "down",
				animState: "idle",

				pendingInputs: [],
				nextInputSeq: 0,
				queuedMove: null,

				attackEndTime: 0,
				isAttacking: false,
			};

			this.syncLabel(rp, player.name ?? "Player");
			this.renderPlayers.set(sessionId, rp);
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
		players.forEach((p: any, sid: string) => {
			const rp = this.renderPlayers.get(sid);
			if (!rp) return;
			syncToAuthoritativeState(rp, p);
		});
		renderPlayerList();

		const onState = () => {
			players.forEach((p: any, sid: string) => {
				if (!this.renderPlayers.has(sid)) {
					spawnPlayerSprite(p, sid);
				}

				const rp = this.renderPlayers.get(sid);
				if (!rp) return;

				syncToAuthoritativeState(rp, p);
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
			const rp = this.renderPlayers.get(sessionId);
			if (rp) {
				rp.label.destroy();
				rp.sprite.destroy();
				this.renderPlayers.delete(sessionId);
			}
			renderPlayerList();
		};

		this.room.onLeave(() => {
			this.scene.start("hub");
		});

		this.game.canvas?.setAttribute("tabindex", "0");
		this.game.canvas?.addEventListener("pointerdown", () => {
			this.game.canvas?.focus();
		});
	}

	update() {
		if (!this.room || !this.moveKeys || !this.map) return;

		const now = this.time.now;
		const meRp = this.renderPlayers.get(this.room.sessionId);

		// Advance all render interpolation and attack timers
		for (const rp of this.renderPlayers.values()) {
			this.advanceRenderMove(rp, now);
			this.advanceAttackState(rp, now);

			if (!rp.isMoving && !rp.isAttacking) {
				this.syncLabel(rp);
			}
		}

		// Start attack on SPACE press
		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			if (this.tryStartLocalAttack(now)) {
				return;
			}
		}

		// Local player cannot move while attacking
		if (meRp?.isAttacking) {
			meRp.queuedMove = null;
			return;
		}

		const desired = this.getDesiredInputDirection();

		// If local player is currently moving, buffer the latest desired direction.
		if (meRp?.isMoving) {
			meRp.queuedMove = desired;
			return;
		}

		// If a move is queued, try to consume it first as soon as movement/cooldown allows.
		if (this.tryConsumeQueuedLocalMove(now)) {
			return;
		}

		if (now - this.lastMoveTime < this.moveIntervalMs) {
			if (desired && meRp) {
				meRp.queuedMove = desired;
			}
			return;
		}

		if (!desired) return;

		this.tryStartPredictedLocalMove(desired.dx, desired.dy, now);
	}
}
