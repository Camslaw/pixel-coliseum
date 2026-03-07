import { Room, Client, ServerError } from "@colyseus/core";
import { ArenaState, Player } from "../state/ArenaState";
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

			if (dx !== 0 && dy !== 0) return;

			const ntx = p.tx + dx;
			const nty = p.ty + dy;

			if (this.grid.isBlocked(ntx, nty)) return;

			for (const other of this.state.players.values()) {
				if (other.id !== p.id && other.tx === ntx && other.ty === nty) {
					return;
				}
			}

			p.tx = ntx;
			p.ty = nty;
		});
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

    (p as any).spawnIndex = spawnIndex;

    let tx = spawn.tx;
    let ty = spawn.ty;

		if (this.grid.isBlocked(tx, ty)) {
			const maxR = 6;
			let found = false;

			for (let r = 1; r <= maxR && !found; r++) {
				for (let dy = -r; dy <= r && !found; dy++) {
					for (let dx = -r; dx <= r && !found; dx++) {
						const nx = tx + dx;
						const ny = ty + dy;

						if (this.grid.isBlocked(nx, ny)) continue;

						let occupied = false;
						for (const other of this.state.players.values()) {
							if (other.tx === nx && other.ty === ny) {
								occupied = true;
								break;
							}
						}
						if (occupied) continue;

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
