import { ArenaState, Enemy, Player } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";

export type Facing = "up" | "down" | "left" | "right";

type BroadcastFn = (type: string, message: unknown) => void;

type LineResult = {
	stopTx: number;
	stopTy: number;
	enemy: Enemy | null;
	distanceTiles: number;
};

type HandleAttackOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	player: Player;
	facing: Facing;
	broadcast: BroadcastFn;
	applyDamageToEnemy: (enemy: Enemy, damage: number) => void;
};

export function handleAttack({
	state,
	grid,
	player,
	facing,
	broadcast,
	applyDamageToEnemy,
}: HandleAttackOptions) {
	if (!player.alive) return;

	player.facing = facing;

	const damage = getPlayerDamage(player);

	if (player.class === "sword") {
		const enemy = getAdjacentEnemyInFacing(state, player.tx, player.ty, facing);
		if (!enemy || !enemy.alive) return;

		applyDamageToEnemy(enemy, damage);
		return;
	}

	const result = getLineEndpointOrEnemy(state, grid, player.tx, player.ty, facing);
	if (result.distanceTiles <= 0) return;

	const speedTilesPerSecond = getProjectileSpeedTilesPerSecond(player.class);
	const durationMs = Math.round(
		(result.distanceTiles / speedTilesPerSecond) * 1000
	);

	broadcast("projectile_fired", {
		kind: player.class,
		facing,
		fromTx: player.tx,
		fromTy: player.ty,
		toTx: result.stopTx,
		toTy: result.stopTy,
		durationMs,
		targetEnemyId: result.enemy?.id ?? null,
	});

	if (!result.enemy) return;

	const targetEnemyId = result.enemy.id;
	const projectileDamage = damage;

	setTimeout(() => {
		const enemy = state.enemies.get(targetEnemyId);
		if (!enemy) return;
		if (!enemy.alive) return;

		applyDamageToEnemy(enemy, projectileDamage);
	}, durationMs);
}

function getPlayerDamage(player: Player) {
	const baseDamage = 25;
	return Math.max(
		1,
		Math.round((baseDamage * Number(player.damageMultiplierPct ?? 100)) / 100)
	);
}

function getAdjacentEnemyInFacing(
	state: ArenaState,
	tx: number,
	ty: number,
	facing: Facing
): Enemy | null {
	const { dx, dy } = getDeltaFromFacing(facing);
	return getEnemyAt(state, tx + dx, ty + dy);
}

function getEnemyAt(
	state: ArenaState,
	tx: number,
	ty: number
): Enemy | null {
	for (const enemy of state.enemies.values()) {
		if (!enemy.alive) continue;
		if (enemy.tx === tx && enemy.ty === ty) return enemy;
	}
	return null;
}

function getProjectileSpeedTilesPerSecond(cls: string) {
	if (cls === "magic") return 8;
	return 10;
}

function getLineEndpointOrEnemy(
	state: ArenaState,
	grid: BlockedGrid,
	tx: number,
	ty: number,
	facing: Facing
): LineResult {
	const { dx, dy } = getDeltaFromFacing(facing);

	let testTx = tx;
	let testTy = ty;
	let distanceTiles = 0;

	while (true) {
		const nextTx = testTx + dx;
		const nextTy = testTy + dy;

		if (grid.isProjectileBlocked(nextTx, nextTy)) {
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

		const enemy = getEnemyAt(state, testTx, testTy);
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

function getDeltaFromFacing(facing: Facing) {
	if (facing === "left") return { dx: -1, dy: 0 };
	if (facing === "right") return { dx: 1, dy: 0 };
	if (facing === "up") return { dx: 0, dy: -1 };
	return { dx: 0, dy: 1 };
}
