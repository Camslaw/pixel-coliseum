import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player, Enemy } from "../state/ArenaState";
import { pool } from "../db/pool";
import { sessionMiddleware } from "../session";
import { loadBlockedFromTiledJson, type BlockedGrid } from "../map/blocking";
import { loadSpawnPointsFromTiledJson, type SpawnPoint } from "../map/spawns";

type JoinOptions = { class?: string };
type Facing = "up" | "down" | "left" | "right";

function hydrateSession(req: any): Promise<void> {
	return new Promise((resolve, reject) => {
		if (!req.url) req.url = "/";
		if (!req.originalUrl) req.originalUrl = req.url;

		const res = {
			getHeader() {},
			setHeader() {},
			writeHead() {},
			end() {},
			headersSent: false,
		} as any;

		sessionMiddleware(req, res, (err: any) => {
			if (err) reject(err);
			else resolve();
		});
	});
}

export class ArenaRoom extends Room<ArenaState> {
	private grid!: BlockedGrid;
	private playerSpawns: SpawnPoint[] = [];
	private enemySpawns: SpawnPoint[] = [];
	private nextEnemyId = 1;
	private roundStartTimer: ReturnType<typeof setTimeout> | undefined;

	onCreate(_options: any) {
		this.state = new ArenaState();
		this.maxClients = 4;

		const jsonPath = "../client/public/assets/arena-map.json";

		this.grid = loadBlockedFromTiledJson({
			jsonPath,
			terrainLayerName: "Terrain",
			propsLayerName: "Props",
		});

		this.playerSpawns = loadSpawnPointsFromTiledJson({
			jsonPath,
			layerName: "PlayerSpawns",
		});

		this.enemySpawns = loadSpawnPointsFromTiledJson({
			jsonPath,
			layerName: "EnemySpawns",
		});

		this.onMessage("start_game", (client) => {
			if (client.sessionId !== this.state.hostId) return;
			if (this.state.phase !== "lobby") return;

			this.startRound1();
		});

		this.onMessage("set_class", (client, msg: any) => {
			const cls = normalizeClass(msg?.class);
			const p = this.state.players.get(client.sessionId);
			if (!p) return;
			p.class = cls;
		});

		this.onMessage("move", (client, msg: any) => {
			if (this.state.phase !== "playing") return;

			const p = this.state.players.get(client.sessionId);
			if (!p) return;

			const dx = Math.sign(msg?.dx ?? 0);
			const dy = Math.sign(msg?.dy ?? 0);

			const rawSeq = Number(msg?.seq ?? 0);
			const seq = Number.isFinite(rawSeq) ? Math.floor(rawSeq) : 0;

			const ackProcessedInput = () => {
				if (seq > p.lastProcessedInput) {
					p.lastProcessedInput = seq;
				}
			};

			if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) {
				ackProcessedInput();
				return;
			}

			const ntx = p.tx + dx;
			const nty = p.ty + dy;

			p.facing = this.getFacingFromDelta(dx, dy);

			if (this.grid.isBlocked(ntx, nty)) {
				ackProcessedInput();
				return;
			}

			for (const other of this.state.players.values()) {
				if (other.id !== p.id && other.tx === ntx && other.ty === nty) {
					ackProcessedInput();
					return;
				}
			}

			if (this.isTileOccupiedByEnemy(ntx, nty)) {
				ackProcessedInput();
				return;
			}

			p.tx = ntx;
			p.ty = nty;
			ackProcessedInput();
		});

		this.onMessage("attack", (client, msg: any) => {
			if (this.state.phase !== "playing") return;

			const p = this.state.players.get(client.sessionId);
			if (!p) return;

			const facing = normalizeFacing(msg?.facing) ?? (p.facing as Facing);
			p.facing = facing;

			// Sword stays instant melee
			if (p.class === "sword") {
				const enemy = this.getAdjacentEnemyInFacing(p.tx, p.ty, facing);
				if (!enemy || !enemy.alive) return;

				const DAMAGE = 25;
				this.applyDamageToEnemy(enemy, DAMAGE);

				return;
			}

			// Bow / magic: find first enemy or wall endpoint
			const result = this.getLineEndpointOrEnemy(p.tx, p.ty, facing);
			if (result.distanceTiles <= 0) return;

			const speedTilesPerSecond = this.getProjectileSpeedTilesPerSecond(p.class);
			const durationMs = Math.round((result.distanceTiles / speedTilesPerSecond) * 1000);

			this.broadcast("projectile_fired", {
				kind: p.class, // bow or magic
				facing,
				fromTx: p.tx,
				fromTy: p.ty,
				toTx: result.stopTx,
				toTy: result.stopTy,
				durationMs,
				targetEnemyId: result.enemy?.id ?? null,
			});

			// No enemy hit, just fly until wall/open endpoint
			if (!result.enemy) return;

			const targetEnemyId = result.enemy.id;

			setTimeout(() => {
				const enemy = this.state.enemies.get(targetEnemyId);
				if (!enemy) return;
				if (!enemy.alive) return;

				const DAMAGE = 25;
				this.applyDamageToEnemy(enemy, DAMAGE);

			}, durationMs);
		});

		this.onMessage("look", (client, msg: any) => {
			const p = this.state.players.get(client.sessionId);
			if (!p) return;

			const facing = normalizeFacing(msg?.facing);
			if (!facing) return;

			p.facing = facing;
		});

		this.setSimulationInterval(() => {
			this.updateEnemies();
		}, 400);
	}

	private startRound1() {
		if (this.roundStartTimer) {
			clearTimeout(this.roundStartTimer);
			this.roundStartTimer = undefined;
		}

		this.state.enemies.clear();
		this.state.phase = "starting";

		this.roundStartTimer = setTimeout(() => {
			this.spawnInitialEnemy();
			this.state.phase = "playing";
			this.roundStartTimer = undefined;
		}, 1800);
	}

	private isTileOccupiedByPlayer(tx: number, ty: number) {
		for (const p of this.state.players.values()) {
			if (p.tx === tx && p.ty === ty) return true;
		}
		return false;
	}

	private isTileOccupiedByEnemy(tx: number, ty: number) {
		for (const e of this.state.enemies.values()) {
			if (e.alive && e.tx === tx && e.ty === ty) return true;
		}
		return false;
	}

	private getEnemyAt(tx: number, ty: number) {
		for (const enemy of this.state.enemies.values()) {
			if (!enemy.alive) continue;
			if (enemy.tx === tx && enemy.ty === ty) return enemy;
		}
		return null;
	}

	private getDeltaFromFacing(facing: Facing) {
		if (facing === "left") return { dx: -1, dy: 0 };
		if (facing === "right") return { dx: 1, dy: 0 };
		if (facing === "up") return { dx: 0, dy: -1 };
		return { dx: 0, dy: 1 };
	}

	private spawnInitialEnemy() {
		if (this.state.enemies.size > 0) return;

		const availableSpawns =
			this.enemySpawns.length > 0
				? this.enemySpawns
				: [
						{ tx: 14, ty: 2, x: 0, y: 0 },
						{ tx: 15, ty: 2, x: 0, y: 0 },
						{ tx: 1, ty: 9, x: 0, y: 0 },
						{ tx: 28, ty: 9, x: 0, y: 0 },
						{ tx: 14, ty: 18, x: 0, y: 0 },
						{ tx: 15, ty: 18, x: 0, y: 0 },
				  ];

		const validSpawn = availableSpawns.find((spawn) => {
			if (this.grid.isBlocked(spawn.tx, spawn.ty)) return false;
			if (this.isTileOccupiedByPlayer(spawn.tx, spawn.ty)) return false;
			if (this.isTileOccupiedByEnemy(spawn.tx, spawn.ty)) return false;
			return true;
		});

		if (!validSpawn) {
			console.warn("No valid enemy spawn found.");
			return;
		}

		const enemy = new Enemy();
		enemy.id = `${this.roomId}_enemy_${this.nextEnemyId++}`;
		enemy.kind = "orc";
		enemy.tx = validSpawn.tx;
		enemy.ty = validSpawn.ty;
		enemy.facing = "down";
		enemy.animState = "idle";
		enemy.alive = true;
		enemy.lastAttackAt = 0;
		enemy.hp = 100;
		enemy.maxHp = 100;

		this.state.enemies.set(enemy.id, enemy);
	}

	private getNearestPlayer(tx: number, ty: number) {
		let best: Player | null = null;
		let bestDist = Number.POSITIVE_INFINITY;

		for (const p of this.state.players.values()) {
			const dist = Math.abs(p.tx - tx) + Math.abs(p.ty - ty);
			if (dist < bestDist) {
				bestDist = dist;
				best = p;
			}
		}

		return best;
	}

	private areAdjacent(ax: number, ay: number, bx: number, by: number) {
		return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
	}

	private getFacingFromDelta(dx: number, dy: number): Facing {
		if (Math.abs(dx) > Math.abs(dy)) {
			return dx < 0 ? "left" : "right";
		}
		if (dy < 0) return "up";
		return "down";
	}

	private canEnemyMoveTo(enemyId: string, tx: number, ty: number) {
		if (this.grid.isBlocked(tx, ty)) return false;
		if (this.isTileOccupiedByPlayer(tx, ty)) return false;

		for (const e of this.state.enemies.values()) {
			if (!e.alive) continue;
			if (e.id === enemyId) continue;
			if (e.tx === tx && e.ty === ty) return false;
		}

		return true;
	}

		private getAdjacentEnemyInFacing(
		tx: number,
		ty: number,
		facing: Facing
	): Enemy | null {
		const { dx, dy } = this.getDeltaFromFacing(facing);
		return this.getEnemyAt(tx + dx, ty + dy);
	}

	private getFirstEnemyInLine(
		tx: number,
		ty: number,
		facing: Facing
	): Enemy | null {
		const { dx, dy } = this.getDeltaFromFacing(facing);

		let testTx = tx;
		let testTy = ty;

		while (true) {
			testTx += dx;
			testTy += dy;

			if (this.grid.isBlocked(testTx, testTy)) {
				return null;
			}

			const enemy = this.getEnemyAt(testTx, testTy);
			if (enemy && enemy.alive) {
				return enemy;
			}
		}
	}

	private applyDamageToEnemy(enemy: Enemy, damage: number) {
		const prevHp = enemy.hp;
		const nextHp = Math.max(0, prevHp - damage);

		enemy.hp = nextHp;

		this.broadcast("enemy_damaged", {
			enemyId: enemy.id,
			damage,
			hp: nextHp,
			maxHp: enemy.maxHp,
			isKillingBlow: nextHp <= 0,
		});

		if (nextHp <= 0) {
			enemy.alive = false;
			this.state.enemies.delete(enemy.id);

			if (this.state.enemies.size === 0) {
				this.state.phase = "cleared";
			}
		}
	}

	private getProjectileSpeedTilesPerSecond(cls: string) {
		if (cls === "magic") return 8;
		return 10; // bow
	}

	private getLineEndpointOrEnemy(
		tx: number,
		ty: number,
		facing: Facing
	): {
		stopTx: number;
		stopTy: number;
		enemy: Enemy | null;
		distanceTiles: number;
	} {
		const { dx, dy } = this.getDeltaFromFacing(facing);

		let testTx = tx;
		let testTy = ty;
		let distanceTiles = 0;

		while (true) {
			const nextTx = testTx + dx;
			const nextTy = testTy + dy;

			if (this.grid.isBlocked(nextTx, nextTy)) {
				return {
					stopTx: testTx,
					stopTy: testTy,
					enemy: null,
					distanceTiles,
				};
			}

			testTx = nextTx;
			testTy = nextTy;
			distanceTiles++;

			const enemy = this.getEnemyAt(testTx, testTy);
			if (enemy && enemy.alive) {
				return {
					stopTx: testTx,
					stopTy: testTy,
					enemy,
					distanceTiles,
				};
			}
		}
	}

	private updateEnemies() {
		if (this.state.phase !== "playing") return;

		const now = Date.now();

		for (const enemy of this.state.enemies.values()) {
			if (!enemy.alive) continue;

			const target = this.getNearestPlayer(enemy.tx, enemy.ty);

			if (!target) {
				enemy.animState = "idle";
				continue;
			}

			const dx = target.tx - enemy.tx;
			const dy = target.ty - enemy.ty;

			enemy.facing = this.getFacingFromDelta(dx, dy);

			if (this.areAdjacent(enemy.tx, enemy.ty, target.tx, target.ty)) {
				const ATTACK_COOLDOWN_MS = 800;

				if (now - enemy.lastAttackAt >= ATTACK_COOLDOWN_MS) {
					enemy.lastAttackAt = now;
					enemy.animState = "attack";
				} else {
					enemy.animState = "idle";
				}

				continue;
			}

			let moved = false;

			const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
			const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;

			if (Math.abs(dx) >= Math.abs(dy)) {
				if (
					stepX !== 0 &&
					this.canEnemyMoveTo(enemy.id, enemy.tx + stepX, enemy.ty)
				) {
					enemy.tx += stepX;
					moved = true;
				} else if (
					stepY !== 0 &&
					this.canEnemyMoveTo(enemy.id, enemy.tx, enemy.ty + stepY)
				) {
					enemy.ty += stepY;
					moved = true;
				}
			} else {
				if (
					stepY !== 0 &&
					this.canEnemyMoveTo(enemy.id, enemy.tx, enemy.ty + stepY)
				) {
					enemy.ty += stepY;
					moved = true;
				} else if (
					stepX !== 0 &&
					this.canEnemyMoveTo(enemy.id, enemy.tx + stepX, enemy.ty)
				) {
					enemy.tx += stepX;
					moved = true;
				}
			}

			enemy.animState = moved ? "walk" : "idle";
		}
	}

	async onAuth(client: Client, _options: JoinOptions, reqFromOnAuth: any) {
		await hydrateSession(reqFromOnAuth);

		const userId = reqFromOnAuth?.session?.userId as string | undefined;

		if (!userId) {
			throw new ServerError(4216, "UNAUTHENTICATED");
		}

		(client as any).userId = userId;
		return true;
	}

	async onJoin(client: Client, _options: JoinOptions) {
		const userId = (client as any).userId as string | undefined;
		if (!userId) throw new ServerError(4216, "UNAUTHENTICATED");

		const r = await pool.query(
			`SELECT display_name FROM users WHERE id = $1`,
			[userId]
		);

		const displayName = String(r.rows[0]?.display_name ?? "Player").slice(0, 16);

		const p = new Player();
		p.id = client.sessionId;
		p.name = displayName;
		p.class = "sword";
		p.tx = 0;
		p.ty = 0;
		p.facing = "down";
		p.lastProcessedInput = 0;

		const usedSpawnIndices = new Set<number>();
		this.state.players.forEach((pl: any) => {
			const idx = pl.spawnIndex;
			if (typeof idx === "number") usedSpawnIndices.add(idx);
		});

		const availableSpawns =
			this.playerSpawns.length > 0
				? this.playerSpawns
				: [
						{ tx: 12, ty: 7, x: 0, y: 0 },
						{ tx: 17, ty: 7, x: 0, y: 0 },
						{ tx: 12, ty: 11, x: 0, y: 0 },
						{ tx: 17, ty: 11, x: 0, y: 0 },
				  ];

		let spawnIndex = availableSpawns.findIndex((_s, i) => !usedSpawnIndices.has(i));
		if (spawnIndex === -1) spawnIndex = 0;

		const spawn = availableSpawns[spawnIndex];
		if (!spawn) {
			throw new ServerError(5000, "NO_PLAYER_SPAWNS_DEFINED");
		}

		p.spawnIndex = spawnIndex;

		let tx = spawn.tx;
		let ty = spawn.ty;

		if (this.grid.isBlocked(tx, ty)) {
			const maxR = 6;
			let found = false;

			for (let r2 = 1; r2 <= maxR && !found; r2++) {
				for (let dy = -r2; dy <= r2 && !found; dy++) {
					for (let dx = -r2; dx <= r2 && !found; dx++) {
						const nx = tx + dx;
						const ny = ty + dy;

						if (this.grid.isBlocked(nx, ny)) continue;
						if (this.isTileOccupiedByPlayer(nx, ny)) continue;

						tx = nx;
						ty = ny;
						found = true;
					}
				}
			}
		}

		p.tx = tx;
		p.ty = ty;

		this.state.players.set(client.sessionId, p);
		if (!this.state.hostId) this.state.hostId = client.sessionId;
	}

	onLeave(client: Client) {
		this.state.players.delete(client.sessionId);

		if (this.state.players.size === 0) {
			if (this.roundStartTimer) {
				clearTimeout(this.roundStartTimer);
				this.roundStartTimer = undefined;
			}

			this.disconnect();
			return;
		}

		if (client.sessionId === this.state.hostId) {
			const nextHost = this.state.players.keys().next().value as string | undefined;
			this.state.hostId = nextHost ?? "";
		}
	}

	onDispose() {
		if (this.roundStartTimer) {
			clearTimeout(this.roundStartTimer);
			this.roundStartTimer = undefined;
		}
	}
}

function normalizeClass(v: unknown): string {
	if (v === "sword" || v === "bow" || v === "magic") return v;
	return "sword";
}

function normalizeFacing(v: unknown): Facing | null {
	if (v === "up" || v === "down" || v === "left" || v === "right") return v;
	return null;
}
