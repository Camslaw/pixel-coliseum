import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type {
	ArenaSceneData,
	AnimState,
	RenderPlayer,
	RenderEnemy,
} from "./arena/arenaTypes";
import {
	animDef,
	getWalkAnimKey,
	getAttackAnimKey,
	ensurePlayerAnimations,
	ensureEnemyAnimations,
} from "./arena/arenaAnimations";
import { buildBlockedGrid } from "./arena/arenaCollision";
import { fireArrow, fireMagicBall } from "./arena/arenaProjectiles";
import {
	getFacingFromDelta,
	beginRenderMove,
	advanceRenderMove,
	reconcileLocalPlayer,
	getDesiredInputDirection,
	tryStartPredictedLocalMove,
	tryConsumeQueuedLocalMove,
} from "./arena/arenaMovement";
import {
	spawnEnemySprite,
	syncEnemyToAuthoritativeState,
	advanceEnemyRenderMove,
	removeEnemySprite,
} from "./arena/arenaEnemies";
import {
	syncLabel,
	normalizePlayerClass,
	getSpriteKeyForClass,
	setAnimState,
	tryStartLocalAttack,
	advanceAttackState,
	spawnPlayerSprite,
	removePlayerSprite,
} from "./arena/arenaPlayers";

export default class ArenaScene extends Phaser.Scene {
	private room!: Room;
	private renderPlayers = new Map<string, RenderPlayer>();
	private renderEnemies = new Map<string, RenderEnemy>();
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

	private getMovementContext() {
		if (!this.map || !this.tileToWorldFeet) return null;

		return {
			map: this.map,
			blocked: this.blocked,
			tileToWorldFeet: this.tileToWorldFeet,
			playerFeetOffset: this.playerFeetOffset,
			moveRenderMs: this.moveRenderMs,
			lastMoveTime: this.lastMoveTime,
			moveIntervalMs: this.moveIntervalMs,
			roomSessionId: this.room.sessionId,
			sendMove: (dx: number, dy: number, seq: number) => {
				this.room.send("move", { dx, dy, seq });
			},
		};
	}

	create() {
		this.renderPlayers.clear();
		this.renderEnemies.clear();
		this.blocked.clear();
		this.lastMoveTime = 0;

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

		buildBlockedGrid(map, this.blocked);

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
		const enemies = (this.room.state as any).enemies;
		if (!players) {
			console.warn("Room state has no players map yet.");
			return;
		}

		ensurePlayerAnimations(this, getSpriteKeyForClass, WALK_FPS);
		ensureEnemyAnimations(this, WALK_FPS);

		const syncToAuthoritativeState = (rp: RenderPlayer, player: any) => {
			const isLocal = rp.sessionId === this.room.sessionId;

			if (isLocal) {
				const moveCtx = this.getMovementContext();
				if (!moveCtx) return;

				reconcileLocalPlayer(
					rp,
					player,
					moveCtx,
					{
						setAnimState,
						syncLabel: (targetRp, name) => syncLabel(targetRp, this.nameYOffset, name),
					},
					this.time.now
				);
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
					setAnimState(rp, "idle");
				}

				syncLabel(rp, this.nameYOffset, player.name ?? "Player")
				return;
			}

			const dx = nextTx - prevTx;
			const dy = nextTy - prevTy;
			const facing = getFacingFromDelta(dx, dy);

			const targetFeet = this.tileToWorldFeet!(nextTx, nextTy);
			const targetSpriteY = targetFeet.y - this.playerFeetOffset;

			const alreadyMovingToSameTarget =
				rp.isMoving &&
				rp.toX === targetFeet.x &&
				rp.toY === targetSpriteY;

			if (!alreadyMovingToSameTarget) {
				if (!this.tileToWorldFeet) return;

				beginRenderMove(
					rp,
					nextTx,
					nextTy,
					this.time.now,
					this.moveRenderMs,
					facing,
					this.tileToWorldFeet,
					this.playerFeetOffset,
					setAnimState
				);
			} else {
				rp.facing = facing;
				setAnimState(rp, "walk");
			}

			syncLabel(rp, player.name ?? "Player");

			rp.tx = nextTx;
			rp.ty = nextTy;
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

		players.forEach((p: any, sid: string) =>
			spawnPlayerSprite(
				this,
				this.renderPlayers,
				p,
				sid,
				this.tileToWorldFeet!,
				this.playerFeetOffset,
				this.nameYOffset,
				PLAYER_SCALE
			)
		);
		players.forEach((p: any, sid: string) => {
			const rp = this.renderPlayers.get(sid);
			if (!rp) return;
			syncToAuthoritativeState(rp, p);
		});
		renderPlayerList();

		if (enemies) {
			enemies.forEach((e: any, enemyId: string) => {
				spawnEnemySprite(
					this,
					this.renderEnemies,
					e,
					enemyId,
					this.tileToWorldFeet!,
					this.playerFeetOffset,
					PLAYER_SCALE
				);
			});

			enemies.forEach((e: any, enemyId: string) => {
				const re = this.renderEnemies.get(enemyId);
				if (!re) return;
				syncEnemyToAuthoritativeState(
					re,
					e,
					this.tileToWorldFeet!,
					this.playerFeetOffset,
					this.time.now,
					this.moveRenderMs
				);
			});

			enemies.onAdd = (enemy: any, enemyId: string) => {
				spawnEnemySprite(
					this,
					this.renderEnemies,
					enemy,
					enemyId,
					this.tileToWorldFeet!,
					this.playerFeetOffset,
					PLAYER_SCALE
				);

				const re = this.renderEnemies.get(enemyId);
				if (!re) return;

				syncEnemyToAuthoritativeState(
					re,
					enemy,
					this.tileToWorldFeet!,
					this.playerFeetOffset,
					this.time.now,
					this.moveRenderMs
				);
			};

			enemies.onRemove = (_enemy: any, enemyId: string) => {
				removeEnemySprite(this.renderEnemies, enemyId);
			};
		}

		const onState = () => {
			players.forEach((p: any, sid: string) => {
				if (!this.renderPlayers.has(sid)) {
					spawnPlayerSprite(
						this,
						this.renderPlayers,
						p,
						sid,
						this.tileToWorldFeet!,
						this.playerFeetOffset,
						this.nameYOffset,
						PLAYER_SCALE
					);
				}

				const rp = this.renderPlayers.get(sid);
				if (!rp) return;

				syncToAuthoritativeState(rp, p);
			});

			renderPlayerList();

			if (enemies) {
				enemies.forEach((e: any, enemyId: string) => {
					if (!this.renderEnemies.has(enemyId)) {
						spawnEnemySprite(
							this,
							this.renderEnemies,
							e,
							enemyId,
							this.tileToWorldFeet!,
							this.playerFeetOffset,
							PLAYER_SCALE
						);
					}

					const re = this.renderEnemies.get(enemyId);
					if (!re) return;

					syncEnemyToAuthoritativeState(
						re,
						e,
						this.tileToWorldFeet!,
						this.playerFeetOffset,
						this.time.now,
						this.moveRenderMs
					);
				});
			}
		};

		const unsubscribeState = this.room.onStateChange(onState);

				this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			try {
				(unsubscribeState as any)?.();
			} catch {}

			for (const sessionId of this.renderPlayers.keys()) {
				removePlayerSprite(this.renderPlayers, sessionId);
			}

			for (const re of this.renderEnemies.values()) {
				re.sprite.destroy();
			}
			this.renderEnemies.clear();

			this.blocked.clear();
		});

		players.onRemove = (_player: any, sessionId: string) => {
			removePlayerSprite(this.renderPlayers, sessionId);
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
			advanceRenderMove(
				rp,
				now,
				this.playerFeetOffset,
				setAnimState,
				(targetRp, name) => syncLabel(targetRp, this.nameYOffset, name)
			);
			advanceAttackState(rp, now);

			if (!rp.isMoving && !rp.isAttacking) {
				syncLabel(rp, this.nameYOffset)
			}
		}

		// Start attack on SPACE press
		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			const projectileCtx =
				this.map && this.tileToWorldFeet
					? {
							scene: this,
							map: this.map,
							blocked: this.blocked,
							tileToWorldFeet: this.tileToWorldFeet,
							playerFeetOffset: this.playerFeetOffset,
					  }
					: null;

			if (tryStartLocalAttack(meRp, now, projectileCtx)) {
				return;
			}
		}

		// Local player cannot move while attacking
		if (meRp?.isAttacking) {
			meRp.queuedMove = null;
			return;
		}

		for (const re of this.renderEnemies.values()) {
			advanceEnemyRenderMove(re, now, this.playerFeetOffset);
		}

		const desired = getDesiredInputDirection(this.moveKeys);

		// If local player is currently moving, buffer the latest desired direction.
		if (meRp?.isMoving) {
			meRp.queuedMove = desired;
			return;
		}

		// If a move is queued, try to consume it first as soon as movement/cooldown allows.
		{
			const moveCtx = this.getMovementContext();
			if (
				moveCtx &&
				tryConsumeQueuedLocalMove(
					meRp,
					now,
					moveCtx,
					setAnimState
				)
			) {
				this.lastMoveTime = now;
				return;
			}
		}

		if (now - this.lastMoveTime < this.moveIntervalMs) {
			if (desired && meRp) {
				meRp.queuedMove = desired;
			}
			return;
		}

		if (!desired) return;

				{
			const moveCtx = this.getMovementContext();
			if (
				moveCtx &&
				tryStartPredictedLocalMove(
					meRp,
					desired.dx,
					desired.dy,
					now,
					moveCtx,
					setAnimState
				)
			) {
				this.lastMoveTime = now;
			}
		}
	}
}
