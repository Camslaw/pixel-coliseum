import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player, Enemy } from "../state/ArenaState";
import { pool } from "../db/pool";
import { sessionMiddleware } from "../session";
import { loadBlockedFromTiledJson, type BlockedGrid } from "../map/blocking";
import { loadSpawnPointsFromTiledJson, type SpawnPoint } from "../map/spawns";

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
			this.state.phase = "playing";
		});

		this.onMessage("set_class", (client, msg: any) => {
			const cls = normalizeClass(msg?.class);
			const p = this.state.players.get(client.sessionId);
			if (!p) return;
			p.class = cls;
		});

		this.onMessage("move", (client, msg: any) => {
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

			p.tx = ntx;
			p.ty = nty;
			ackProcessedInput();
		});
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

	private spawnInitialEnemy() {
		if (this.state.enemies.size > 0) return;

		const availableSpawns = this.enemySpawns.length > 0
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

		this.state.enemies.set(enemy.id, enemy);
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
		p.lastProcessedInput = 0;

		const usedSpawnIndices = new Set<number>();
		this.state.players.forEach((pl: any) => {
			const idx = pl.spawnIndex;
			if (typeof idx === "number") usedSpawnIndices.add(idx);
		});

		const availableSpawns = this.playerSpawns.length > 0
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

		// Phase 1 test spawn: one server-controlled orc
		this.spawnInitialEnemy();
	}

	onLeave(client: Client) {
		this.state.players.delete(client.sessionId);

		if (this.state.players.size === 0) {
			this.disconnect();
			return;
		}

		if (client.sessionId === this.state.hostId) {
			const nextHost = this.state.players.keys().next().value as string | undefined;
			this.state.hostId = nextHost ?? "";
		}
	}
}

function normalizeClass(v: unknown): string {
	if (v === "sword" || v === "bow" || v === "magic") return v;
	return "sword";
}
