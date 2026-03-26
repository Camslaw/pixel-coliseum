import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player, Enemy } from "../state/ArenaState";
import { pool } from "../db/pool";
import { sessionMiddleware } from "../session";
import { loadBlockedFromTiledJson, type BlockedGrid } from "../map/blocking";
import { loadSpawnPointsFromTiledJson, type SpawnPoint } from "../map/spawns";
import { updateEnemies } from "./arena/enemies";
import { handleAttack, type Facing } from "./arena/combat";
import { handleMove } from "./arena/movement";
import { assignPlayerSpawn, spawnInitialEnemy as spawnInitialEnemyIntoState } from "./arena/spawning";
import path from "path";

type JoinOptions = { class?: string };

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
	private pendingEnemySpawns = 0;
	private enemySpawnInterval: ReturnType<typeof setInterval> | undefined;	

	onCreate(_options: any) {
		this.state = new ArenaState();
		this.maxClients = 4;

		this.loadArenaData();
		this.registerStartGameMessage();
		this.registerSetClassMessage();
		this.registerMoveMessage();
		this.registerAttackMessage();
		this.registerLookMessage();
		this.startEnemySimulation();
		this.startEnemySpawnProcessor();
	}

	private loadArenaData() {
		const jsonPath = path.resolve(process.cwd(), "assets", "arena-map.json");

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
	}

	private registerStartGameMessage() {
		this.onMessage("start_game", (client) => {
			if (client.sessionId !== this.state.hostId) return;
			if (this.state.phase !== "lobby") return;

			this.startRound(1);
		});
	}

	private registerSetClassMessage() {
		this.onMessage("set_class", (client, msg: any) => {
			const cls = normalizeClass(msg?.class);
			const p = this.state.players.get(client.sessionId);
			if (!p) return;
			p.class = cls;
		});
	}

	private registerMoveMessage() {
		this.onMessage("move", (client, msg: any) => {
			const p = this.state.players.get(client.sessionId);
			if (!p || !p.alive) return;

			handleMove({
				state: this.state,
				grid: this.grid,
				player: p,
				rawDx: msg?.dx,
				rawDy: msg?.dy,
				rawSeq: msg?.seq,
				getFacingFromDelta: this.getFacingFromDelta.bind(this),
				isTileOccupiedByEnemy: this.isTileOccupiedByEnemy.bind(this),
			});
		});
	}

	private registerAttackMessage() {
		this.onMessage("attack", (client, msg: any) => {
			if (this.state.phase !== "playing") return;

			const p = this.state.players.get(client.sessionId);
			if (!p || !p.alive) return;

			const facing = normalizeFacing(msg?.facing) ?? (p.facing as Facing);

			handleAttack({
				state: this.state,
				grid: this.grid,
				player: p,
				facing,
				broadcast: this.broadcast.bind(this),
				applyDamageToEnemy: this.applyDamageToEnemy.bind(this),
			});
		});
	}

	private registerLookMessage() {
		this.onMessage("look", (client, msg: any) => {
			const p = this.state.players.get(client.sessionId);
			if (!p || !p.alive) return;

			const facing = normalizeFacing(msg?.facing);
			if (!facing) return;

			p.facing = facing;
		});
	}

	private startEnemySimulation() {
		this.setSimulationInterval(() => {
			updateEnemies({
				state: this.state,
				grid: this.grid,
				applyDamageToPlayer: this.applyDamageToPlayer.bind(this),
			});
		}, 400);
	}

	private trySpawnOneEnemy() {
		const result = spawnInitialEnemyIntoState({
			state: this.state,
			grid: this.grid,
			enemySpawns: this.enemySpawns,
			roomId: this.roomId,
			nextEnemyId: this.nextEnemyId,
			isTileOccupiedByPlayer: this.isTileOccupiedByPlayer.bind(this),
			isTileOccupiedByEnemy: this.isTileOccupiedByEnemy.bind(this),
		});

		if (!result.enemy) {
			return false;
		}

		this.nextEnemyId = result.nextEnemyId;
		return true;
	}

	private startEnemySpawnProcessor() {
		this.enemySpawnInterval = setInterval(() => {
			if (this.state.phase !== "playing") return;
			if (this.pendingEnemySpawns <= 0) return;

			const spawned = this.trySpawnOneEnemy();
			if (spawned) {
				this.pendingEnemySpawns--;
			}
		}, 3000);
	}

	private startRound(roundNumber: number) {
		if (this.roundStartTimer) {
			clearTimeout(this.roundStartTimer);
			this.roundStartTimer = undefined;
		}

		this.state.enemies.clear();
		this.pendingEnemySpawns = 0;
		this.state.round = roundNumber;
		this.state.phase = "starting";

		for (const p of this.state.players.values()) {
			p.alive = true;
			p.hp = p.maxHp;
		}

		this.roundStartTimer = setTimeout(() => {
			this.state.phase = "playing";
			this.spawnEnemiesForRound(roundNumber);
			this.roundStartTimer = undefined;
		}, 1800);
	}

	private isTileOccupiedByPlayer(tx: number, ty: number) {
		for (const p of this.state.players.values()) {
			if (!p.alive) continue;
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

	private areAllPlayersDead() {
		if (this.state.players.size === 0) return false;

		for (const p of this.state.players.values()) {
			if (p.alive) return false;
		}
		return true;
	}

	private killPlayer(player: Player) {
		if (!player.alive) return;

		player.alive = false;
		player.hp = 0;

		this.broadcast("player_died", {
			playerId: player.id,
		});

		if (this.areAllPlayersDead()) {
			if (this.roundStartTimer) {
				clearTimeout(this.roundStartTimer);
				this.roundStartTimer = undefined;
			}

			this.pendingEnemySpawns = 0;
			this.state.phase = "defeat";
			this.broadcast("round_defeat", {});
		}
	}

	private spawnEnemiesForRound(roundNumber: number) {
		const totalToSpawn = Math.max(1, roundNumber);

		this.pendingEnemySpawns = 0;

		const spawnedFirst = this.trySpawnOneEnemy();

		if (!spawnedFirst) {
			console.warn(`No valid enemy spawn found for round ${roundNumber}.`);
			this.pendingEnemySpawns = totalToSpawn;
			return;
		}

		this.pendingEnemySpawns = totalToSpawn - 1;
	}

	private getFacingFromDelta(dx: number, dy: number): Facing {
		if (Math.abs(dx) > Math.abs(dy)) {
			return dx < 0 ? "left" : "right";
		}
		if (dy < 0) return "up";
		return "down";
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
				const nextRound = this.state.round + 1;
				this.startRound(nextRound);
			}
		}
	}

	private applyDamageToPlayer(player: Player, damage: number) {
		if (!player.alive) return;
		if (this.state.phase !== "playing") return;

		const nextHp = Math.max(0, player.hp - damage);
		player.hp = nextHp;

		this.broadcast("player_damaged", {
			playerId: player.id,
			damage,
			hp: nextHp,
			maxHp: player.maxHp,
			isKillingBlow: nextHp <= 0,
		});

		if (nextHp <= 0) {
			this.killPlayer(player);
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
		p.hp = 150;
		p.maxHp = 150;
		p.lastProcessedInput = 0;
		p.alive = true;

		const spawnResult = (() => {
			try {
				return assignPlayerSpawn({
					state: this.state,
					grid: this.grid,
					playerSpawns: this.playerSpawns,
					isTileOccupiedByPlayer: this.isTileOccupiedByPlayer.bind(this),
				});
			} catch {
				throw new ServerError(5000, "NO_PLAYER_SPAWNS_DEFINED");
			}
		})();

		p.spawnIndex = spawnResult.spawnIndex;
		p.tx = spawnResult.tx;
		p.ty = spawnResult.ty;

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

			this.pendingEnemySpawns = 0;
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

		if (this.enemySpawnInterval) {
			clearInterval(this.enemySpawnInterval);
			this.enemySpawnInterval = undefined;
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
