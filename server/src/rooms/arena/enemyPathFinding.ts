import { ArenaState } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";

export type TileStep = {
	tx: number;
	ty: number;
};

type SearchNode = {
	tx: number;
	ty: number;
	g: number;
	h: number;
	f: number;
	parentKey: string | null;
};

type FindPathOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	enemyId: string;
	startTx: number;
	startTy: number;
	targetTx: number;
	targetTy: number;
};

const CARDINAL_DIRS: TileStep[] = [
	{ tx: 1, ty: 0 },
	{ tx: -1, ty: 0 },
	{ tx: 0, ty: 1 },
	{ tx: 0, ty: -1 },
];

export function findPathToBestAdjacentTile({
	state,
	grid,
	enemyId,
	startTx,
	startTy,
	targetTx,
	targetTy,
}: FindPathOptions): TileStep[] {
	const candidateGoals = getAdjacentGoalCandidates(
		state,
		grid,
		enemyId,
		targetTx,
		targetTy
	);

	if (candidateGoals.length === 0) {
		return [];
	}

	let bestPath: TileStep[] = [];

	for (const goal of candidateGoals) {
		const path = findPathAStar({
			state,
			grid,
			enemyId,
			startTx,
			startTy,
			goalTx: goal.tx,
			goalTy: goal.ty,
		});

		if (path.length === 0) continue;
		if (bestPath.length === 0 || path.length < bestPath.length) {
			bestPath = path;
		}
	}

	return bestPath;
}

function getAdjacentGoalCandidates(
	state: ArenaState,
	grid: BlockedGrid,
	enemyId: string,
	targetTx: number,
	targetTy: number
): TileStep[] {
	const candidates: TileStep[] = [];

	for (const dir of CARDINAL_DIRS) {
		const tx = targetTx + dir.tx;
		const ty = targetTy + dir.ty;

		if (!canEnemyStandOn(state, grid, enemyId, tx, ty)) continue;
		candidates.push({ tx, ty });
	}

	candidates.sort((a, b) => {
		const da = manhattan(a.tx, a.ty, targetTx, targetTy);
		const db = manhattan(b.tx, b.ty, targetTx, targetTy);
		return da - db;
	});

	return candidates;
}

type FindPathAStarOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	enemyId: string;
	startTx: number;
	startTy: number;
	goalTx: number;
	goalTy: number;
};

function findPathAStar({
	state,
	grid,
	enemyId,
	startTx,
	startTy,
	goalTx,
	goalTy,
}: FindPathAStarOptions): TileStep[] {
	if (startTx === goalTx && startTy === goalTy) {
		return [];
	}

	const startKey = key(startTx, startTy);
	const goalKey = key(goalTx, goalTy);

	const open = new Map<string, SearchNode>();
	const closed = new Set<string>();
	const visitedNodes = new Map<string, SearchNode>();

	open.set(startKey, {
		tx: startTx,
		ty: startTy,
		g: 0,
		h: manhattan(startTx, startTy, goalTx, goalTy),
		f: manhattan(startTx, startTy, goalTx, goalTy),
		parentKey: null,
	});

	while (open.size > 0) {
		const current = popLowestF(open);
		if (!current) break;

		const currentKey = key(current.tx, current.ty);

		if (currentKey === goalKey) {
			visitedNodes.set(currentKey, current);
			return reconstructPath(currentKey, visitedNodes, startKey);
		}

		open.delete(currentKey);
		closed.add(currentKey);
		visitedNodes.set(currentKey, current);

		for (const dir of CARDINAL_DIRS) {
			const nextTx = current.tx + dir.tx;
			const nextTy = current.ty + dir.ty;
			const nextKey = key(nextTx, nextTy);

			if (closed.has(nextKey)) continue;
			if (!canEnemyStandOn(state, grid, enemyId, nextTx, nextTy)) continue;

			const tentativeG = current.g + 1;
			const existing = open.get(nextKey);

			if (existing && tentativeG >= existing.g) {
				continue;
			}

			const h = manhattan(nextTx, nextTy, goalTx, goalTy);
			open.set(nextKey, {
				tx: nextTx,
				ty: nextTy,
				g: tentativeG,
				h,
				f: tentativeG + h,
				parentKey: currentKey,
			});
		}
	}

	return [];
}

function reconstructPath(
	goalKey: string,
	visitedNodes: Map<string, SearchNode>,
	startKey: string
): TileStep[] {
	const reversed: TileStep[] = [];

	let currentKey: string | null = goalKey;

	while (currentKey) {
		const node = visitedNodes.get(currentKey);
		if (!node) break;

		if (currentKey !== startKey) {
			reversed.push({ tx: node.tx, ty: node.ty });
		}

		currentKey = node.parentKey;
	}

	reversed.reverse();
	return reversed;
}

function popLowestF(open: Map<string, SearchNode>): SearchNode | null {
	let best: SearchNode | null = null;

	for (const node of open.values()) {
		if (!best) {
			best = node;
			continue;
		}

		if (node.f < best.f) {
			best = node;
			continue;
		}

		if (node.f === best.f && node.h < best.h) {
			best = node;
		}
	}

	return best;
}

export function canEnemyStandOn(
	state: ArenaState,
	grid: BlockedGrid,
	enemyId: string,
	tx: number,
	ty: number
): boolean {
	if (grid.isBlocked(tx, ty)) return false;
	if (isTileOccupiedByPlayer(state.players, tx, ty)) return false;

	for (const enemy of state.enemies.values()) {
		if (!enemy.alive) continue;
		if (enemy.id === enemyId) continue;
		if (enemy.tx === tx && enemy.ty === ty) return false;
	}

	return true;
}

function isTileOccupiedByPlayer(
	players: ArenaState["players"],
	tx: number,
	ty: number
): boolean {
	for (const player of players.values()) {
		if (!player.alive) continue;
		if (player.tx === tx && player.ty === ty) return true;
	}
	return false;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
	return Math.abs(ax - bx) + Math.abs(ay - by);
}

function key(tx: number, ty: number): string {
	return `${tx},${ty}`;
}