import { ArenaState, Enemy, Player } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";

type Facing = "up" | "down" | "left" | "right";

type UpdateEnemiesOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	applyDamageToPlayer: (player: Player, damage: number) => void;
};

export function updateEnemies({
	state,
	grid,
	applyDamageToPlayer,
}: UpdateEnemiesOptions) {
	if (state.phase !== "playing") return;

	const now = Date.now();

	for (const enemy of state.enemies.values()) {
		if (!enemy.alive) continue;

		const target = getNearestPlayer(state.players, enemy.tx, enemy.ty);

		if (!target) {
			enemy.animState = "idle";
			continue;
		}

		const dx = target.tx - enemy.tx;
		const dy = target.ty - enemy.ty;

		enemy.facing = getFacingFromDelta(dx, dy);

		if (areAdjacent(enemy.tx, enemy.ty, target.tx, target.ty)) {
			const ATTACK_COOLDOWN_MS = 800;

			if (now - enemy.lastAttackAt >= ATTACK_COOLDOWN_MS) {
				enemy.lastAttackAt = now;
				enemy.animState = "attack";

				const DAMAGE = 10;
				applyDamageToPlayer(target, DAMAGE);
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
				canEnemyMoveTo(state, grid, enemy.id, enemy.tx + stepX, enemy.ty)
			) {
				enemy.tx += stepX;
				moved = true;
			} else if (
				stepY !== 0 &&
				canEnemyMoveTo(state, grid, enemy.id, enemy.tx, enemy.ty + stepY)
			) {
				enemy.ty += stepY;
				moved = true;
			}
		} else {
			if (
				stepY !== 0 &&
				canEnemyMoveTo(state, grid, enemy.id, enemy.tx, enemy.ty + stepY)
			) {
				enemy.ty += stepY;
				moved = true;
			} else if (
				stepX !== 0 &&
				canEnemyMoveTo(state, grid, enemy.id, enemy.tx + stepX, enemy.ty)
			) {
				enemy.tx += stepX;
				moved = true;
			}
		}

		enemy.animState = moved ? "walk" : "idle";
	}
}

function getNearestPlayer(
	players: ArenaState["players"],
	tx: number,
	ty: number
): Player | null {
	let best: Player | null = null;
	let bestDist = Number.POSITIVE_INFINITY;

	for (const p of players.values()) {
		if (!p.alive) continue;

		const dist = Math.abs(p.tx - tx) + Math.abs(p.ty - ty);
		if (dist < bestDist) {
			bestDist = dist;
			best = p;
		}
	}

	return best;
}

function areAdjacent(ax: number, ay: number, bx: number, by: number) {
	return Math.abs(ax - bx) + Math.abs(ay - by) === 1;
}

function getFacingFromDelta(dx: number, dy: number): Facing {
	if (Math.abs(dx) > Math.abs(dy)) {
		return dx < 0 ? "left" : "right";
	}
	if (dy < 0) return "up";
	return "down";
}

function canEnemyMoveTo(
	state: ArenaState,
	grid: BlockedGrid,
	enemyId: string,
	tx: number,
	ty: number
) {
	if (grid.isBlocked(tx, ty)) return false;
	if (isTileOccupiedByPlayer(state.players, tx, ty)) return false;

	for (const e of state.enemies.values()) {
		if (!e.alive) continue;
		if (e.id === enemyId) continue;
		if (e.tx === tx && e.ty === ty) return false;
	}

	return true;
}

function isTileOccupiedByPlayer(
	players: ArenaState["players"],
	tx: number,
	ty: number
) {
	for (const p of players.values()) {
		if (!p.alive) continue;
		if (p.tx === tx && p.ty === ty) return true;
	}
	return false;
}
