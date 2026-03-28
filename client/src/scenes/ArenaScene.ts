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
	private shownRoundDefeatBanner = false;
	private lastShownStartingRound = 0;
	private renderPowerUps = new Map<string, Phaser.GameObjects.Sprite>();
		private renderPlayerBuffs = new Map<
		string,
		{
			damage?: {
				icon: Phaser.GameObjects.Sprite;
				text: Phaser.GameObjects.Text;
			};
			speed?: {
				icon: Phaser.GameObjects.Sprite;
				text: Phaser.GameObjects.Text;
			};
		}
	>();

	private readonly buffIconScale = 0.72;
	private readonly buffIconAlpha = 0.85;
	private readonly buffIconYOffset = 60;
	private readonly buffIconSpacing = 22;

	private moveKeys!: {
		left: Phaser.Input.Keyboard.Key;
		right: Phaser.Input.Keyboard.Key;
		up: Phaser.Input.Keyboard.Key;
		down: Phaser.Input.Keyboard.Key;
	};

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

	private getPowerUpFrame(kind: string) {
		if (kind === "damage") return 0; // sword
		if (kind === "speed") return 1;  // boots
		return 2; // heart
	}

		private getBuffFrame(kind: "damage" | "speed") {
		return kind === "damage" ? 0 : 1;
	}

	private destroyPlayerBuffIndicators(sessionId: string) {
		const entry = this.renderPlayerBuffs.get(sessionId);
		if (!entry) return;

		entry.damage?.icon.destroy();
		entry.damage?.text.destroy();

		entry.speed?.icon.destroy();
		entry.speed?.text.destroy();

		this.renderPlayerBuffs.delete(sessionId);
	}

	private ensureSingleBuffIndicator(
		sessionId: string,
		kind: "damage" | "speed"
	) {
		let entry = this.renderPlayerBuffs.get(sessionId);
		if (!entry) {
			entry = {};
			this.renderPlayerBuffs.set(sessionId, entry);
		}

		if (entry[kind]) return entry[kind]!;

		const icon = this.add
			.sprite(0, 0, "powerups", this.getBuffFrame(kind))
			.setOrigin(0.5, 0.5)
			.setScale(this.buffIconScale)
			.setAlpha(this.buffIconAlpha)
			.setDepth(1000);

		const text = this.add
			.text(0, 0, "10", {
				fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
				fontSize: "12px",
				color: "#ffffff",
				stroke: "#000000",
				strokeThickness: 3,
				align: "center",
			})
			.setOrigin(0.5, 0.5)
			.setDepth(1001);

		entry[kind] = { icon, text };
		return entry[kind]!;
	}

	private removeSingleBuffIndicator(
		sessionId: string,
		kind: "damage" | "speed"
	) {
		const entry = this.renderPlayerBuffs.get(sessionId);
		if (!entry || !entry[kind]) return;

		entry[kind]!.icon.destroy();
		entry[kind]!.text.destroy();
		delete entry[kind];

		if (!entry.damage && !entry.speed) {
			this.renderPlayerBuffs.delete(sessionId);
		}
	}

	private updatePlayerBuffIndicators(sessionId: string, rp: RenderPlayer, player: any) {
		const now = Date.now();

		const damageRemaining = Math.max(
			0,
			Number(player.damageBoostUntil ?? 0) - now
		);
		const speedRemaining = Math.max(
			0,
			Number(player.speedBoostUntil ?? 0) - now
		);

		const hasDamage = damageRemaining > 0;
		const hasSpeed = speedRemaining > 0;

		if (!hasDamage) {
			this.removeSingleBuffIndicator(sessionId, "damage");
		}
		if (!hasSpeed) {
			this.removeSingleBuffIndicator(sessionId, "speed");
		}

		if (!hasDamage && !hasSpeed) return;

		const activeKinds: Array<"damage" | "speed"> = [];
		if (hasDamage) activeKinds.push("damage");
		if (hasSpeed) activeKinds.push("speed");

		const singleX = rp.sprite.x + 18;
		const leftX = rp.sprite.x - 18;
		const rightX = rp.sprite.x + 18;
		const baseY = rp.sprite.y - this.buffIconYOffset;

		const buffPositions: Partial<Record<"damage" | "speed", { x: number; y: number }>> = {};

		if (hasDamage && hasSpeed) {
			buffPositions.damage = {
				x: leftX,
				y: baseY,
			};
			buffPositions.speed = {
				x: rightX,
				y: baseY,
			};
		} else if (hasDamage) {
			buffPositions.damage = {
				x: singleX,
				y: baseY,
			};
		} else if (hasSpeed) {
			buffPositions.speed = {
				x: singleX,
				y: baseY,
			};
		}

		(["damage", "speed"] as const).forEach((kind) => {
			const pos = buffPositions[kind];

			if (!pos) return;

			const indicator = this.ensureSingleBuffIndicator(sessionId, kind);
			const remainingMs =
				kind === "damage" ? damageRemaining : speedRemaining;
			const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));

			indicator.icon.setPosition(pos.x, pos.y);
			indicator.icon.setDepth(rp.sprite.depth + 20);

			indicator.text.setText(String(secondsLeft));
			indicator.text.setPosition(pos.x, pos.y);
			indicator.text.setDepth(rp.sprite.depth + 21);
		});
	}

	private spawnPowerUpSprite(powerUp: any, powerUpId: string) {
		if (!this.tileToWorldFeet) return;
		if (this.renderPowerUps.has(powerUpId)) return;

		const pos = this.tileToWorldFeet(powerUp.tx, powerUp.ty);

		const sprite = this.add
			.sprite(pos.x, pos.y - 50, "powerups", this.getPowerUpFrame(powerUp.kind))
			.setOrigin(0.5, 0.5)
			.setScale(1)
			.setDepth(pos.y + 5);

		this.tweens.add({
			targets: sprite,
			y: sprite.y - 6,
			duration: 700,
			yoyo: true,
			repeat: -1,
			ease: "Sine.easeInOut",
		});

		this.renderPowerUps.set(powerUpId, sprite);
	}

	private removePowerUpSprite(powerUpId: string) {
		const sprite = this.renderPowerUps.get(powerUpId);
		if (!sprite) return;
		sprite.destroy();
		this.renderPowerUps.delete(powerUpId);
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
		this.renderPowerUps.clear();
		this.blocked.clear();
		this.lastMoveTime = 0;
		this.shownRoundDefeatBanner = false;
		this.renderPlayerBuffs.clear();

		const map = this.make.tilemap({ key: "arena-map" });

		const WALK_FPS = 16;
		const MOVE_INTERVAL_MS = 160;

		this.map = map;
		this.moveIntervalMs = MOVE_INTERVAL_MS;
		this.moveRenderMs = MOVE_INTERVAL_MS;

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
		const powerUps = (this.room.state as any).powerUps;

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

					if (!rp.isAttacking) {
						setAnimState(rp, "idle");
					}
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
				const status = p.alive === false ? " [dead]" : "";
				lines.push(`${name} - ${cls}${status}${host}${me}`);
			});

			this.playerListHud?.setText(
				["Players:", ...(lines.length ? lines : ["-"])].join("\n")
			);
		};

		players.forEach((p: any, sid: string) => {
			if (p.alive === false) return;

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
		});

		players.forEach((p: any, sid: string) => {
			if (p.alive === false) return;

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

			this.moveIntervalMs = Number(me.moveIntervalMs ?? 160);
			this.moveRenderMs = this.moveIntervalMs;
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

		if (powerUps) {
			powerUps.forEach((p: any, powerUpId: string) => {
				this.spawnPowerUpSprite(p, powerUpId);
			});

			powerUps.onAdd = (powerUp: any, powerUpId: string) => {
				this.spawnPowerUpSprite(powerUp, powerUpId);
			};

			powerUps.onRemove = (_powerUp: any, powerUpId: string) => {
				this.removePowerUpSprite(powerUpId);
			};
		}

		const onState = () => {
			const phase = (this.room.state as any).phase as string;

			const round = Number((this.room.state as any).round ?? 0);

			if (phase === "starting" && round > 0 && this.lastShownStartingRound !== round) {
				this.lastShownStartingRound = round;
				this.showRoundBanner(`ROUND ${round}`);
			}

			if (phase === "defeat" && !this.shownRoundDefeatBanner) {
				this.shownRoundDefeatBanner = true;
				this.showRoundBanner("DEFEAT");
			}

			for (const [sid] of Array.from(this.renderPlayers.entries())) {
				const p = players.get?.(sid);
				if (!p) {
					removePlayerSprite(this.renderPlayers, sid);
					this.destroyPlayerBuffIndicators(sid);
					continue;
				}

				if (p.alive === false) {
					removePlayerSprite(this.renderPlayers, sid);
					this.destroyPlayerBuffIndicators(sid);
				}
			}

			players.forEach((p: any, sid: string) => {
				const isAlive = Boolean(p.alive ?? true);

				if (!isAlive) {
					if (this.renderPlayers.has(sid)) {
						removePlayerSprite(this.renderPlayers, sid);
					}

					if (sid === this.room.sessionId) {
						this.updatePlayerHealthHud(
							Number(p.hp ?? 0),
							Number(p.maxHp ?? 150)
						);
					}
					return;
				}

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
				this.updatePlayerBuffIndicators(sid, rp, p);

				if (sid === this.room.sessionId) {
					this.updatePlayerHealthHud(
						Number(p.hp ?? 150),
						Number(p.maxHp ?? 150)
					);
					this.moveIntervalMs = Number(p.moveIntervalMs ?? 160);
					this.moveRenderMs = this.moveIntervalMs;	
				}
			});

			renderPlayerList();

			if (powerUps) {
				for (const powerUpId of Array.from(this.renderPowerUps.keys())) {
					if (!powerUps.get(powerUpId)) {
						this.removePowerUpSprite(powerUpId);
					}
				}

				powerUps.forEach((p: any, powerUpId: string) => {
					if (!this.renderPowerUps.has(powerUpId)) {
						this.spawnPowerUpSprite(p, powerUpId);
					}
				});
			}

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
		const initialRound = Number((this.room.state as any).round ?? 0);

		if (
			initialPhase === "starting" &&
			initialRound > 0 &&
			this.lastShownStartingRound !== initialRound
		) {
			this.lastShownStartingRound = initialRound;
			this.showRoundBanner(`ROUND ${initialRound}`);
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

			for (const sessionId of this.renderPlayerBuffs.keys()) {
				this.destroyPlayerBuffIndicators(sessionId);
			}

			for (const re of this.renderEnemies.values()) {
				re.sprite.destroy();
			}

			for (const powerUpId of this.renderPowerUps.keys()) {
				this.removePowerUpSprite(powerUpId);
			}

			this.renderPlayerBuffs.clear();
			this.renderPowerUps.clear();
			this.renderEnemies.clear();
			this.blocked.clear();
		});

		players.onRemove = (_player: any, sessionId: string) => {
			removePlayerSprite(this.renderPlayers, sessionId);
			this.destroyPlayerBuffIndicators(sessionId);
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

		this.room.onMessage("player_attacked", (msg: any) => {
			const playerId =
				typeof msg?.playerId === "string" ? msg.playerId : null;
			const facing = msg?.facing as "up" | "down" | "left" | "right" | undefined;

			if (!playerId || !facing) return;
			if (playerId === this.room.sessionId) return;

			const rp = this.renderPlayers.get(playerId);
			if (!rp) return;

			rp.facing = facing;

			// Remote attacks should override current interpolation.
			if (rp.isMoving) {
				rp.isMoving = false;
				rp.sprite.x = rp.toX;
				rp.sprite.y = rp.toY;
				rp.sprite.setDepth(rp.sprite.y + this.playerFeetOffset);
				syncLabel(rp, this.nameYOffset);
			}

			rp.isAttacking = true;
			rp.attackEndTime = this.time.now + (
				rp.className === "bow" ? 220 :
				rp.className === "magic" ? 260 :
				180
			);

			setAnimState(rp, "attack");
		});

		this.room.onMessage("player_powerup_collected", (msg: any) => {
			const playerId =
				typeof msg?.playerId === "string" ? msg.playerId : null;

			if (!playerId || playerId !== this.room.sessionId) return;

			if (typeof msg?.hp === "number" && typeof msg?.maxHp === "number") {
				this.updatePlayerHealthHud(Number(msg.hp), Number(msg.maxHp));
			}

			if (typeof msg?.moveIntervalMs === "number") {
				this.moveIntervalMs = Number(msg.moveIntervalMs);
				this.moveRenderMs = this.moveIntervalMs;
			}
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
		const meState = (this.room.state as any).players?.get?.(this.room.sessionId);
		const isMeAlive = Boolean(meState?.alive ?? true);

		if (!isMeAlive && meRp) {
			meRp.queuedMove = null;
		}

		for (const [sid, rp] of this.renderPlayers.entries()) {
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

			const playerState = (this.room.state as any).players?.get?.(sid);
			if (playerState && (playerState.alive ?? true)) {
				this.updatePlayerBuffIndicators(sid, rp, playerState);
			} else {
				this.destroyPlayerBuffIndicators(sid);
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

		if (Phaser.Input.Keyboard.JustDown(this.attackKey)) {
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
