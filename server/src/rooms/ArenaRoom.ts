import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player, Enemy, PowerUp } from "../state/ArenaState";
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
type PowerUpKind = "damage" | "speed" | "heal";

const DEFAULT_MOVE_INTERVAL_MS = 160;
const SPEED_BOOST_MOVE_INTERVAL_MS = 100;
const DAMAGE_BOOST_PCT = 150;
const EFFECT_DURATION_MS = 10000;
const HEAL_AMOUNT = 50;
type PowerUpCategory = "buff" | "heal";

const BUFF_SPAWN_INTERVAL_MS = 2000;
const HEAL_SPAWN_INTERVAL_MS = 2000;
const POWER_UP_LIFETIME_MS = 12000;
const MAX_ACTIVE_BUFF_POWERUPS = 2;

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
	private itemSpawns: SpawnPoint[] = [];

	private nextEnemyId = 1;
	private nextPowerUpId = 1;

	private roundStartTimer: ReturnType<typeof setTimeout> | undefined;
	private pendingEnemySpawns = 0;
	private enemySpawnInterval: ReturnType<typeof setInterval> | undefined;
	private buffSpawnInterval: ReturnType<typeof setInterval> | undefined;
	private healSpawnInterval: ReturnType<typeof setInterval> | undefined;

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
		this.startPowerUpSpawnProcessor();
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

		this.itemSpawns = loadSpawnPointsFromTiledJson({
			jsonPath,
			layerName: "ItemSpawns",
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

			this.tryCollectPowerUpAtPlayer(p);
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
			this.cleanupExpiredPlayerEffects();
			this.cleanupExpiredPowerUps();

			updateEnemies({
				state: this.state,
				grid: this.grid,
				applyDamageToPlayer: this.applyDamageToPlayer.bind(this),
			});
		}, 400);
	}

	private startEnemySpawnProcessor() {
		this.enemySpawnInterval = setInterval(() => {
			if (this.state.phase !== "playing") return;
			if (this.pendingEnemySpawns <= 0) return;

			const spawned = this.trySpawnOneEnemy();
			if (spawned) {
				this.pendingEnemySpawns--;
			}
		}, 1500);
	}

	private startPowerUpSpawnProcessor() {
		this.buffSpawnInterval = setInterval(() => {
			if (this.state.phase !== "playing") return;

			const activeBuffCount = this.countPowerUpsByCategory("buff");
			const buffsToSpawn = MAX_ACTIVE_BUFF_POWERUPS - activeBuffCount;

			for (let i = 0; i < buffsToSpawn; i++) {
				const spawned = this.trySpawnPowerUpCategory("buff");
				if (!spawned) break;
			}
		}, BUFF_SPAWN_INTERVAL_MS);

		this.healSpawnInterval = setInterval(() => {
			if (this.state.phase !== "playing") return;
			if (this.countPowerUpsByCategory("heal") > 0) return;
			if (!this.doesAnyPlayerNeedHealing()) return;

			this.trySpawnPowerUpCategory("heal");
		}, HEAL_SPAWN_INTERVAL_MS);
	}

	private startRound(roundNumber: number) {
		if (this.roundStartTimer) {
			clearTimeout(this.roundStartTimer);
			this.roundStartTimer = undefined;
		}

		this.state.enemies.clear();
		this.state.powerUps.clear();
		this.pendingEnemySpawns = 0;
		this.state.round = roundNumber;
		this.state.phase = "starting";

		for (const p of this.state.players.values()) {
			p.alive = true;
			p.hp = p.maxHp;
			this.resetPlayerEffects(p);
		}

		this.roundStartTimer = setTimeout(() => {
			this.state.phase = "playing";
			this.spawnEnemiesForRound(roundNumber);
			this.roundStartTimer = undefined;
		}, 1800);
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

	private trySpawnPowerUpCategory(category: PowerUpCategory) {
		if (this.itemSpawns.length === 0) return false;

		const availableSpawns = this.itemSpawns.filter((spawn) => {
			if (this.grid.isBlocked(spawn.tx, spawn.ty)) return false;
			if (this.isTileOccupiedByPlayer(spawn.tx, spawn.ty)) return false;
			if (this.isTileOccupiedByEnemy(spawn.tx, spawn.ty)) return false;
			if (this.isTileOccupiedByPowerUp(spawn.tx, spawn.ty)) return false;
			return true;
		});

		if (availableSpawns.length === 0) return false;

		const spawn = availableSpawns[Math.floor(Math.random() * availableSpawns.length)];
		if (!spawn) return false;

		let kind: PowerUpKind;

		if (category === "heal") {
			kind = "heal";
		} else {
			const buffKinds: Array<"damage" | "speed"> = ["damage", "speed"];
			kind = buffKinds[Math.floor(Math.random() * buffKinds.length)] ?? "damage";
		}

		const powerUp = new PowerUp();
		powerUp.id = `${this.roomId}_powerup_${this.nextPowerUpId++}`;
		powerUp.kind = kind;
		powerUp.category = category;
		powerUp.tx = spawn.tx;
		powerUp.ty = spawn.ty;
		powerUp.expiresAt = Date.now() + POWER_UP_LIFETIME_MS;

		this.state.powerUps.set(powerUp.id, powerUp);
		return true;
	}

	private countPowerUpsByCategory(category: PowerUpCategory) {
		let count = 0;

		for (const powerUp of this.state.powerUps.values()) {
			if (powerUp.category === category) {
				count++;
			}
		}

		return count;
	}

	private doesAnyPlayerNeedHealing() {
		for (const player of this.state.players.values()) {
			if (!player.alive) continue;
			if (player.hp < player.maxHp) return true;
		}
		return false;
	}

	private cleanupExpiredPowerUps() {
		const now = Date.now();

		for (const powerUp of this.state.powerUps.values()) {
			if (powerUp.expiresAt > 0 && now >= powerUp.expiresAt) {
				this.state.powerUps.delete(powerUp.id);
			}
		}
	}

	private tryCollectPowerUpAtPlayer(player: Player) {
		for (const powerUp of this.state.powerUps.values()) {
			if (powerUp.tx !== player.tx || powerUp.ty !== player.ty) continue;

			this.applyPowerUpToPlayer(player, powerUp);
			this.state.powerUps.delete(powerUp.id);
			return;
		}
	}

	private applyPowerUpToPlayer(player: Player, powerUp: PowerUp) {
		const now = Date.now();

		if (powerUp.kind === "heal") {
			player.hp = Math.min(player.maxHp, player.hp + HEAL_AMOUNT);

			this.broadcast("player_powerup_collected", {
				playerId: player.id,
				kind: powerUp.kind,
				hp: player.hp,
				maxHp: player.maxHp,
			});
			return;
		}

		if (powerUp.kind === "damage") {
			player.damageMultiplierPct = DAMAGE_BOOST_PCT;
			player.damageBoostUntil = now + EFFECT_DURATION_MS;

			this.broadcast("player_powerup_collected", {
				playerId: player.id,
				kind: powerUp.kind,
				damageMultiplierPct: player.damageMultiplierPct,
				damageBoostUntil: player.damageBoostUntil,
			});
			return;
		}

		if (powerUp.kind === "speed") {
			player.moveIntervalMs = SPEED_BOOST_MOVE_INTERVAL_MS;
			player.speedBoostUntil = now + EFFECT_DURATION_MS;

			this.broadcast("player_powerup_collected", {
				playerId: player.id,
				kind: powerUp.kind,
				moveIntervalMs: player.moveIntervalMs,
				speedBoostUntil: player.speedBoostUntil,
			});
		}
	}

	private cleanupExpiredPlayerEffects() {
		const now = Date.now();

		for (const player of this.state.players.values()) {
			if (
				player.damageBoostUntil > 0 &&
				now >= player.damageBoostUntil
			) {
				player.damageBoostUntil = 0;
				player.damageMultiplierPct = 100;
			}

			if (
				player.speedBoostUntil > 0 &&
				now >= player.speedBoostUntil
			) {
				player.speedBoostUntil = 0;
				player.moveIntervalMs = DEFAULT_MOVE_INTERVAL_MS;
			}
		}
	}

	private resetPlayerEffects(player: Player) {
		player.moveIntervalMs = DEFAULT_MOVE_INTERVAL_MS;
		player.speedBoostUntil = 0;
		player.damageMultiplierPct = 100;
		player.damageBoostUntil = 0;
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

	private isTileOccupiedByPowerUp(tx: number, ty: number) {
		for (const p of this.state.powerUps.values()) {
			if (p.tx === tx && p.ty === ty) return true;
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
			this.state.powerUps.clear();
			this.state.phase = "defeat";
			this.broadcast("round_defeat", {});
		}
	}

	private spawnEnemiesForRound(roundNumber: number) {
		const totalToSpawn = 4 + (roundNumber - 1) * 2;

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
		p.moveIntervalMs = DEFAULT_MOVE_INTERVAL_MS;
		p.damageMultiplierPct = 100;

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
			this.state.powerUps.clear();
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

		if (this.buffSpawnInterval) {
			clearInterval(this.buffSpawnInterval);
			this.buffSpawnInterval = undefined;
		}

		if (this.healSpawnInterval) {
			clearInterval(this.healSpawnInterval);
			this.healSpawnInterval = undefined;
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
