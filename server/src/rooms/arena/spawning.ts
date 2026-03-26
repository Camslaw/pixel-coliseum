import { ArenaState, Enemy } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";
import type { SpawnPoint } from "../../map/spawns";

type IsTileOccupiedByPlayerFn = (tx: number, ty: number) => boolean;
type IsTileOccupiedByEnemyFn = (tx: number, ty: number) => boolean;

type AssignPlayerSpawnOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	playerSpawns: SpawnPoint[];
	isTileOccupiedByPlayer: IsTileOccupiedByPlayerFn;
};

type AssignPlayerSpawnResult = {
	spawnIndex: number;
	tx: number;
	ty: number;
};

type SpawnInitialEnemyOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	enemySpawns: SpawnPoint[];
	roomId: string;
	nextEnemyId: number;
	isTileOccupiedByPlayer: IsTileOccupiedByPlayerFn;
	isTileOccupiedByEnemy: IsTileOccupiedByEnemyFn;
};

type SpawnInitialEnemyResult = {
	enemy: Enemy | null;
	nextEnemyId: number;
};

const DEFAULT_PLAYER_SPAWNS: SpawnPoint[] = [
	{ tx: 12, ty: 7, x: 0, y: 0 },
	{ tx: 17, ty: 7, x: 0, y: 0 },
	{ tx: 12, ty: 11, x: 0, y: 0 },
	{ tx: 17, ty: 11, x: 0, y: 0 },
];

const DEFAULT_ENEMY_SPAWNS: SpawnPoint[] = [
	{ tx: 14, ty: 2, x: 0, y: 0 },
	{ tx: 15, ty: 2, x: 0, y: 0 },
	{ tx: 1, ty: 9, x: 0, y: 0 },
	{ tx: 28, ty: 9, x: 0, y: 0 },
	{ tx: 14, ty: 18, x: 0, y: 0 },
	{ tx: 15, ty: 18, x: 0, y: 0 },
];

export function assignPlayerSpawn({
	state,
	grid,
	playerSpawns,
	isTileOccupiedByPlayer,
}: AssignPlayerSpawnOptions): AssignPlayerSpawnResult {
	const usedSpawnIndices = new Set<number>();

	state.players.forEach((pl: any) => {
		const idx = pl.spawnIndex;
		if (typeof idx === "number") usedSpawnIndices.add(idx);
	});

	const availableSpawns =
		playerSpawns.length > 0 ? playerSpawns : DEFAULT_PLAYER_SPAWNS;

	let spawnIndex = availableSpawns.findIndex((_s, i) => !usedSpawnIndices.has(i));
	if (spawnIndex === -1) spawnIndex = 0;

	const spawn = availableSpawns[spawnIndex];
	if (!spawn) {
		throw new Error("NO_PLAYER_SPAWNS_DEFINED");
	}

	let tx = spawn.tx;
	let ty = spawn.ty;

	if (grid.isBlocked(tx, ty)) {
		const nearby = findNearestOpenTile({
			grid,
			startTx: tx,
			startTy: ty,
			maxRadius: 6,
			isTileOccupiedByPlayer,
		});

		if (nearby) {
			tx = nearby.tx;
			ty = nearby.ty;
		}
	}

	return {
		spawnIndex,
		tx,
		ty,
	};
}

export function spawnInitialEnemy({
	state,
	grid,
	enemySpawns,
	roomId,
	nextEnemyId,
	isTileOccupiedByPlayer,
	isTileOccupiedByEnemy,
}: SpawnInitialEnemyOptions): SpawnInitialEnemyResult {
	const availableSpawns =
		enemySpawns.length > 0 ? enemySpawns : DEFAULT_ENEMY_SPAWNS;

	const validSpawns = availableSpawns.filter((spawn) => {
		if (grid.isBlocked(spawn.tx, spawn.ty)) return false;
		if (isTileOccupiedByPlayer(spawn.tx, spawn.ty)) return false;
		if (isTileOccupiedByEnemy(spawn.tx, spawn.ty)) return false;
		return true;
	});

	if (validSpawns.length === 0) {
		return {
			enemy: null,
			nextEnemyId,
		};
	}

	const randomIndex = Math.floor(Math.random() * validSpawns.length);
    const chosenSpawn = validSpawns[randomIndex];

    if (!chosenSpawn) {
        return {
            enemy: null,
            nextEnemyId,
        };
    }

    const enemy = new Enemy();
    enemy.id = `${roomId}_enemy_${nextEnemyId}`;
    enemy.kind = "orc";
    enemy.tx = chosenSpawn.tx;
    enemy.ty = chosenSpawn.ty;
	enemy.facing = "down";
	enemy.animState = "idle";
	enemy.alive = true;
	enemy.lastAttackAt = 0;
	enemy.hp = 100;
	enemy.maxHp = 100;

	state.enemies.set(enemy.id, enemy);

	return {
		enemy,
		nextEnemyId: nextEnemyId + 1,
	};
}

function findNearestOpenTile({
	grid,
	startTx,
	startTy,
	maxRadius,
	isTileOccupiedByPlayer,
}: {
	grid: BlockedGrid;
	startTx: number;
	startTy: number;
	maxRadius: number;
	isTileOccupiedByPlayer: IsTileOccupiedByPlayerFn;
}) {
	for (let r = 1; r <= maxRadius; r++) {
		for (let dy = -r; dy <= r; dy++) {
			for (let dx = -r; dx <= r; dx++) {
				const tx = startTx + dx;
				const ty = startTy + dy;

				if (grid.isBlocked(tx, ty)) continue;
				if (isTileOccupiedByPlayer(tx, ty)) continue;

				return { tx, ty };
			}
		}
	}

	return null;
}
