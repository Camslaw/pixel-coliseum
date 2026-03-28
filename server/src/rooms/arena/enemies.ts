import { ArenaState, Enemy, Player } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";
import {
	canEnemyStandOn,
	findPathToBestAdjacentTile,
	type TileStep,
} from "./enemyPathFinding";

type Facing = "up" | "down" | "left" | "right";

type UpdateEnemiesOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	applyDamageToPlayer: (player: Player, damage: number) => void;
};

type EnemyNavMemory = {
	path: TileStep[];
	goalPlayerId: string;
	lastGoalTx: number;
	lastGoalTy: number;
	lastPathfindAt: number;
};

const enemyNavMemory = new Map<string, EnemyNavMemory>();

const ATTACK_COOLDOWN_MS = 800;
const DAMAGE = 10;
const REPATH_INTERVAL_MS = 900;

export function updateEnemies({
	state,
	grid,
	applyDamageToPlayer,
}: UpdateEnemiesOptions) {
	if (state.phase !== "playing") return;

	const now = Date.now();

	pruneEnemyNavMemory(state);

	for (const enemy of state.enemies.values()) {
		if (!enemy.alive) continue;

		const target = getNearestPlayer(state.players, enemy.tx, enemy.ty);

		if (!target) {
			enemy.animState = "idle";
			clearEnemyPath(enemy.id);
			continue;
		}

		const dx = target.tx - enemy.tx;
		const dy = target.ty - enemy.ty;
		enemy.facing = getFacingFromDelta(dx, dy);

		if (areAdjacent(enemy.tx, enemy.ty, target.tx, target.ty)) {
			clearEnemyPath(enemy.id);

			if (now - enemy.lastAttackAt >= ATTACK_COOLDOWN_MS) {
				enemy.lastAttackAt = now;
				enemy.animState = "attack";
				applyDamageToPlayer(target, DAMAGE);
			} else {
				enemy.animState = "idle";
			}

			continue;
		}

		const memory = getOrCreateEnemyNavMemory(enemy.id);

		if (shouldRepath(enemy, target, memory, now, state, grid)) {
			memory.path = findPathToBestAdjacentTile({
				state,
				grid,
				enemyId: enemy.id,
				startTx: enemy.tx,
				startTy: enemy.ty,
				targetTx: target.tx,
				targetTy: target.ty,
			});
			memory.goalPlayerId = target.id;
			memory.lastGoalTx = target.tx;
			memory.lastGoalTy = target.ty;
			memory.lastPathfindAt = now;
		}

		const nextStep = peekNextValidStep(memory.path, state, grid, enemy.id);

		if (!nextStep) {
			enemy.animState = "idle";
			continue;
		}

		const moveDx = nextStep.tx - enemy.tx;
		const moveDy = nextStep.ty - enemy.ty;

		enemy.tx = nextStep.tx;
		enemy.ty = nextStep.ty;
		enemy.facing = getFacingFromDelta(moveDx, moveDy);
		enemy.animState = "walk";

		memory.path.shift();
	}
}

function getOrCreateEnemyNavMemory(enemyId: string): EnemyNavMemory {
	let memory = enemyNavMemory.get(enemyId);
	if (memory) return memory;

	memory = {
		path: [],
		goalPlayerId: "",
		lastGoalTx: 0,
		lastGoalTy: 0,
		lastPathfindAt: 0,
	};

	enemyNavMemory.set(enemyId, memory);
	return memory;
}

function clearEnemyPath(enemyId: string) {
	const memory = enemyNavMemory.get(enemyId);
	if (!memory) return;

	memory.path = [];
	memory.goalPlayerId = "";
	memory.lastGoalTx = 0;
	memory.lastGoalTy = 0;
	memory.lastPathfindAt = 0;
}

function pruneEnemyNavMemory(state: ArenaState) {
	const liveEnemyIds = new Set<string>();

	for (const enemy of state.enemies.values()) {
		if (!enemy.alive) continue;
		liveEnemyIds.add(enemy.id);
	}

	for (const enemyId of enemyNavMemory.keys()) {
		if (!liveEnemyIds.has(enemyId)) {
			enemyNavMemory.delete(enemyId);
		}
	}
}

function shouldRepath(
	enemy: Enemy,
	target: Player,
	memory: EnemyNavMemory,
	now: number,
	state: ArenaState,
	grid: BlockedGrid
): boolean {
	if (memory.path.length === 0) return true;
	if (memory.goalPlayerId !== target.id) return true;
	if (now - memory.lastPathfindAt >= REPATH_INTERVAL_MS) return true;

	// Repath if the target moved tiles since last path.
	if (memory.lastGoalTx !== target.tx || memory.lastGoalTy !== target.ty) {
		return true;
	}

	const nextStep = memory.path[0];
	if (!nextStep) return true;

	// If the next step is no longer standable, path is stale.
	if (!canEnemyStandOn(state, grid, enemy.id, nextStep.tx, nextStep.ty)) {
		return true;
	}

	// If the path somehow no longer starts adjacent to the enemy's current tile,
	// it's stale and should be recomputed.
	if (!areAdjacent(enemy.tx, enemy.ty, nextStep.tx, nextStep.ty)) {
		return true;
	}

	return false;
}

function peekNextValidStep(
	path: TileStep[],
	state: ArenaState,
	grid: BlockedGrid,
	enemyId: string
): TileStep | null {
	while (path.length > 0) {
		const step = path[0];

		if (!step) {
			return null;
		}

		if (canEnemyStandOn(state, grid, enemyId, step.tx, step.ty)) {
			return step;
		}

		path.shift();
	}

	return null;
}

function getNearestPlayer(
	players: ArenaState["players"],
	tx: number,
	ty: number
): Player | null {
	let best: Player | null = null;
	let bestDist = Number.POSITIVE_INFINITY;

	for (const player of players.values()) {
		if (!player.alive) continue;

		const dist = Math.abs(player.tx - tx) + Math.abs(player.ty - ty);
		if (dist < bestDist) {
			bestDist = dist;
			best = player;
		}
	}

	return best;
}

function areAdjacent(ax: number, ay: number, bx: number, by: number): boolean {
	return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function getFacingFromDelta(dx: number, dy: number): Facing {
	if (Math.abs(dx) > Math.abs(dy)) {
		return dx < 0 ? "left" : "right";
	}
	if (dy < 0) return "up";
	return "down";
}
