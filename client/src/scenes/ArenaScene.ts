import Phaser from "phaser";
import type { Room } from "colyseus.js";
import type {
	ArenaSceneData,
	RenderPlayer,
	RenderEnemy,
} from "./arena/arenaTypes";
import {
	ensurePlayerAnimations,
	ensureEnemyAnimations,
} from "./arena/arenaAnimations";
import { buildBlockedGrid } from "./arena/arenaCollision";
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
	spawnDamageNumber,
} from "./arena/arenaEnemies";
import {
	syncLabel,
	getSpriteKeyForClass,
	setAnimState,
	tryStartLocalAttack,
	advanceAttackState,
	spawnPlayerSprite,
	removePlayerSprite,
} from "./arena/arenaPlayers";
import { playRemoteProjectile } from "./arena/arenaProjectiles";

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

	private lookTapThresholdMs = 90;
	private pendingLookFacing: "up" | "down" | "left" | "right" | null = null;
	private pendingLookStartedAt = 0;

	private attackKey!: Phaser.Input.Keyboard.Key;

	private playerHealthBarBg?: Phaser.GameObjects.Graphics;
	private playerHealthBarFill?: Phaser.GameObjects.Graphics;
	private playerHealthText?: Phaser.GameObjects.Text;

	private playerFeetOffset = 8;
	private nameYOffset = 0;
	private moveRenderMs = 140;
	private enemyMoveRenderMs = 400;
	private tileToWorldFeet?: (tx: number, ty: number) => { x: number; y: number };

	private roundBanner?: Phaser.GameObjects.Text;
	private shownRound1Banner = false;
	private shownRoundClearedBanner = false;

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

	private getJustPressedFacing():
		| "up"
		| "down"
		| "left"
		| "right"
		| null {
		if (Phaser.Input.Keyboard.JustDown(this.moveKeys.left)) return "left";
		if (Phaser.Input.Keyboard.JustDown(this.moveKeys.right)) return "right";
		if (Phaser.Input.Keyboard.JustDown(this.moveKeys.up)) return "up";
		if (Phaser.Input.Keyboard.JustDown(this.moveKeys.down)) return "down";
		return null;
	}

	private isFacingKeyStillDown(facing: "up" | "down" | "left" | "right") {
		if (facing === "left") return this.moveKeys.left.isDown;
		if (facing === "right") return this.moveKeys.right.isDown;
		if (facing === "up") return this.moveKeys.up.isDown;
		return this.moveKeys.down.isDown;
	}

	private applyLocalLook(
		meRp: RenderPlayer | undefined,
		facing: "up" | "down" | "left" | "right"
	) {
		if (!meRp) return;

		meRp.facing = facing;
		setAnimState(meRp, "idle");
		syncLabel(meRp, this.nameYOffset);
		this.room.send("look", { facing });
	}

	private showRoundBanner(text: string) {
		if (this.roundBanner) {
			this.roundBanner.destroy();
			this.roundBanner = undefined;
		}

		this.roundBanner = this.add
			.text(this.cameras.main.centerX, this.cameras.main.centerY, text, {
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
				fontSize: "40px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 6,
				backgroundColor: "rgba(0,0,0,0.35)",
				padding: { left: 18, right: 18, top: 12, bottom: 12 },
			})
			.setOrigin(0.5, 0.5)
			.setScrollFactor(0)
			.setDepth(10000);

		this.tweens.add({
			targets: this.roundBanner,
			alpha: { from: 0, to: 1 },
			duration: 200,
			yoyo: false,
		});

		this.time.delayedCall(1400, () => {
			if (!this.roundBanner) return;

			this.tweens.add({
				targets: this.roundBanner,
				alpha: 0,
				duration: 250,
				onComplete: () => {
					this.roundBanner?.destroy();
					this.roundBanner = undefined;
				},
			});
		});
	}

	private updatePlayerHealthHud(hp: number, maxHp: number) {
		if (!this.playerHealthBarBg || !this.playerHealthBarFill || !this.playerHealthText) {
			return;
		}

		const clampedHp = Phaser.Math.Clamp(hp, 0, maxHp);
		const ratio = maxHp > 0 ? clampedHp / maxHp : 0;

		const x = 16;
		const y = this.cameras.main.height - 44;
		const width = 220;
		const height = 14;

		this.playerHealthBarBg.clear();
		this.playerHealthBarBg.fillStyle(0x000000, 0.75);
		this.playerHealthBarBg.fillRect(x - 2, y - 2, width + 4, height + 4);

		this.playerHealthBarFill.clear();
		this.playerHealthBarFill.fillStyle(0xcc2f2f, 1);
		this.playerHealthBarFill.fillRect(x, y, Math.round(width * ratio), height);

		this.playerHealthText.setText(`HP ${clampedHp} / ${maxHp}`);
		this.playerHealthText.setPosition(x, y - 22);
	}

	create() {
		this.renderPlayers.clear();
		this.renderEnemies.clear();
		this.blocked.clear();
		this.lastMoveTime = 0;
		this.shownRound1Banner = false;
		this.shownRoundClearedBanner = false;
		this.pendingLookFacing = null;
		this.pendingLookStartedAt = 0;

		const map = this.make.tilemap({ key: "arena-map" });

		this.moveRenderMs = 160;
		this.enemyMoveRenderMs = 400;
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

		this.playerHealthBarBg = this.add.graphics().setScrollFactor(0).setDepth(9999);
		this.playerHealthBarFill = this.add.graphics().setScrollFactor(0).setDepth(10000);

		this.playerHealthText = this.add
			.text(16, this.cameras.main.height - 66, "HP 150 / 150", {
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
				fontSize: "14px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 3,
			})
			.setScrollFactor(0)
			.setDepth(10001);

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

				const serverFacing = (player.facing ?? rp.facing) as
					| "up"
					| "down"
					| "left"
					| "right";
				rp.facing = serverFacing;

				reconcileLocalPlayer(
					rp,
					player,
					moveCtx,
					{
						setAnimState,
						syncLabel: (targetRp, name) =>
							syncLabel(targetRp, this.nameYOffset, name),
					},
					this.time.now
				);
				return;
			}

			const prevTx = rp.tx;
			const prevTy = rp.ty;
			const nextTx = player.tx as number;
			const nextTy = player.ty as number;

			const serverFacing = (player.facing ?? rp.facing) as
				| "up"
				| "down"
				| "left"
				| "right";
			rp.facing = serverFacing;

			const moved = prevTx !== nextTx || prevTy !== nextTy;

			if (!moved) {
				if (!rp.isMoving) {
					const pos = this.tileToWorldFeet!(nextTx, nextTy);
					const spriteY = pos.y - this.playerFeetOffset;

					rp.sprite.setPosition(pos.x, spriteY);
					rp.sprite.setDepth(pos.y);
					setAnimState(rp, "idle");
				}

				syncLabel(rp, this.nameYOffset, player.name ?? "Player");
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
				beginRenderMove(
					rp,
					nextTx,
					nextTy,
					this.time.now,
					this.moveRenderMs,
					facing,
					this.tileToWorldFeet!,
					this.playerFeetOffset,
					setAnimState
				);
			} else {
				rp.facing = facing;
				setAnimState(rp, "walk");
			}

			syncLabel(rp, this.nameYOffset, player.name ?? "Player");

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

			this.playerListHud?.setText(
				["Players:", ...(lines.length ? lines : ["-"])].join("\n")
			);
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

		const me = players.get?.(this.room.sessionId);
		if (me) {
			this.updatePlayerHealthHud(
				Number(me.hp ?? 150),
				Number(me.maxHp ?? 150)
			);
		}

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
					this.enemyMoveRenderMs
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
					this.enemyMoveRenderMs
				);
			};

			enemies.onRemove = (_enemy: any, enemyId: string) => {
				removeEnemySprite(this.renderEnemies, enemyId);
			};
		}

		const onState = () => {
			const phase = (this.room.state as any).phase as string;

			if (phase === "starting" && !this.shownRound1Banner) {
				this.shownRound1Banner = true;
				this.showRoundBanner("ROUND 1");
			}

			if (phase === "cleared" && !this.shownRoundClearedBanner) {
				this.shownRoundClearedBanner = true;
				this.showRoundBanner("ROUND CLEARED");
			}

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

				if (sid === this.room.sessionId) {
					this.updatePlayerHealthHud(
						Number(p.hp ?? 150),
						Number(p.maxHp ?? 150)
					);
				}
			});

			renderPlayerList();

			if (enemies) {
				// Remove stale rendered enemies that no longer exist in server state
				for (const enemyId of Array.from(this.renderEnemies.keys())) {
					if (!enemies.get(enemyId)) {
						removeEnemySprite(this.renderEnemies, enemyId);
					}
				}

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
						this.enemyMoveRenderMs
					);

					re.lastRenderedHp = Number(e.hp ?? re.hp);
				});
			}
		};

		const initialPhase = (this.room.state as any).phase as string;
		if (initialPhase === "starting" && !this.shownRound1Banner) {
			this.shownRound1Banner = true;
			this.showRoundBanner("ROUND 1");
		}

		const unsubscribeState = this.room.onStateChange(onState);

		this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
			try {
				(unsubscribeState as any)?.();
			} catch {}

			this.playerHealthBarBg?.destroy();
			this.playerHealthBarBg = undefined;

			this.playerHealthBarFill?.destroy();
			this.playerHealthBarFill = undefined;

			this.playerHealthText?.destroy();
			this.playerHealthText = undefined;

			this.roundBanner?.destroy();
			this.roundBanner = undefined;

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

		this.room.onMessage("projectile_fired", (msg: any) => {
			if (!this.tileToWorldFeet) return;

			const kind = msg?.kind as "bow" | "magic";
			const facing = msg?.facing as "up" | "down" | "left" | "right";
			const fromTx = Number(msg?.fromTx ?? 0);
			const fromTy = Number(msg?.fromTy ?? 0);
			const toTx = Number(msg?.toTx ?? fromTx);
			const toTy = Number(msg?.toTy ?? fromTy);
			const durationMs = Number(msg?.durationMs ?? 0);
			const targetEnemyId =
				typeof msg?.targetEnemyId === "string" ? msg.targetEnemyId : null;

			if (kind !== "bow" && kind !== "magic") return;

			const targetEnemy = targetEnemyId
				? this.renderEnemies.get(targetEnemyId)
				: undefined;

			playRemoteProjectile({
				scene: this,
				kind,
				facing,
				fromTx,
				fromTy,
				toTx,
				toTy,
				tileToWorldFeet: this.tileToWorldFeet,
				playerFeetOffset: this.playerFeetOffset,
				durationMs,
				targetEnemy,
			});
		});

		this.room.onMessage("enemy_damaged", (msg: any) => {
			const enemyId =
				typeof msg?.enemyId === "string" ? msg.enemyId : null;
			const damage = Number(msg?.damage ?? 0);

			if (!enemyId || damage <= 0) return;

			const re = this.renderEnemies.get(enemyId);
			if (!re) return;

			spawnDamageNumber(
				this,
				re.sprite.x,
				re.sprite.y - 62,
				damage
			);

			// Keep local cached hp in sync immediately for UI smoothness
			if (typeof msg?.hp === "number") {
				re.hp = Number(msg.hp);
				re.lastRenderedHp = Number(msg.hp);
			}
			if (typeof msg?.maxHp === "number") {
				re.maxHp = Number(msg.maxHp);
			}
		});

		this.room.onMessage("player_damaged", (msg: any) => {
			const playerId =
				typeof msg?.playerId === "string" ? msg.playerId : null;

			if (!playerId || playerId !== this.room.sessionId) return;

			const hp = Number(msg?.hp ?? 150);
			const maxHp = Number(msg?.maxHp ?? 150);

			this.updatePlayerHealthHud(hp, maxHp);
		});

		this.game.canvas?.setAttribute("tabindex", "0");
		this.game.canvas?.addEventListener("pointerdown", () => {
			this.game.canvas?.focus();
		});
	}

	update() {
		if (!this.room || !this.moveKeys || !this.map) return;

		const phase = (this.room.state as any).phase as string;
		const now = this.time.now;
		const meRp = this.renderPlayers.get(this.room.sessionId);

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
				syncLabel(rp, this.nameYOffset);
			}
		}

		for (const re of this.renderEnemies.values()) {
			advanceEnemyRenderMove(re, now, this.playerFeetOffset);
		}

		if (phase !== "playing") {
			if (meRp) {
				meRp.queuedMove = null;
			}
			return;
		}

		const justPressedFacing = this.getJustPressedFacing();

		if (justPressedFacing && meRp && !meRp.isMoving && !meRp.isAttacking) {
			this.pendingLookFacing = justPressedFacing;
			this.pendingLookStartedAt = now;
		}

		if (this.pendingLookFacing && meRp && !meRp.isMoving && !meRp.isAttacking) {
			const stillDown = this.isFacingKeyStillDown(this.pendingLookFacing);
			const heldMs = now - this.pendingLookStartedAt;

			// Quick tap: turn only
			if (!stillDown) {
				if (heldMs < this.lookTapThresholdMs) {
					this.applyLocalLook(meRp, this.pendingLookFacing);
				}

				this.pendingLookFacing = null;
				this.pendingLookStartedAt = 0;
				return;
			}

			// Still holding, but threshold not reached yet: don't move yet
			if (heldMs < this.lookTapThresholdMs) {
				return;
			}

			// Threshold reached: allow normal movement to start
			this.pendingLookFacing = null;
			this.pendingLookStartedAt = 0;
		}

		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
			this.pendingLookFacing = null;
			this.pendingLookStartedAt = 0;
			
			if (
				tryStartLocalAttack(meRp, now, null, (facing) => {
					this.room.send("attack", { facing });
				})
			) {
				return;
			}
		}

		if (meRp?.isAttacking) {
			meRp.queuedMove = null;
			return;
		}

		const desired = getDesiredInputDirection(this.moveKeys);

		if (meRp?.isMoving) {
			this.pendingLookFacing = null;
			this.pendingLookStartedAt = 0;
			meRp.queuedMove = desired;
			return;
		}

		{
			const moveCtx = this.getMovementContext();
			if (
				moveCtx &&
				tryConsumeQueuedLocalMove(meRp, now, moveCtx, setAnimState)
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
