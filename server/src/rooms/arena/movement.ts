import { ArenaState, Player } from "../../state/ArenaState";
import type { BlockedGrid } from "../../map/blocking";
import type { Facing } from "./combat";

type HandleMoveOptions = {
	state: ArenaState;
	grid: BlockedGrid;
	player: Player;
	rawDx: unknown;
	rawDy: unknown;
	rawSeq: unknown;
	getFacingFromDelta: (dx: number, dy: number) => Facing;
	isTileOccupiedByEnemy: (tx: number, ty: number) => boolean;
};

export function handleMove({
	state,
	grid,
	player,
	rawDx,
	rawDy,
	rawSeq,
	getFacingFromDelta,
	isTileOccupiedByEnemy,
}: HandleMoveOptions) {
	if (state.phase !== "playing") return;
    if (!player.alive) return;

	const dx = Math.sign(Number(rawDx ?? 0));
	const dy = Math.sign(Number(rawDy ?? 0));

	const parsedSeq = Number(rawSeq ?? 0);
	const seq = Number.isFinite(parsedSeq) ? Math.floor(parsedSeq) : 0;

	const ackProcessedInput = () => {
		if (seq > player.lastProcessedInput) {
			player.lastProcessedInput = seq;
		}
	};

	if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) {
		ackProcessedInput();
		return;
	}

	const ntx = player.tx + dx;
	const nty = player.ty + dy;

	player.facing = getFacingFromDelta(dx, dy);

	if (grid.isBlocked(ntx, nty)) {
		ackProcessedInput();
		return;
	}

	for (const other of state.players.values()) {
		if (!other.alive) continue;
		if (other.id !== player.id && other.tx === ntx && other.ty === nty) {
			ackProcessedInput();
			return;
		}
	}

	if (isTileOccupiedByEnemy(ntx, nty)) {
		ackProcessedInput();
		return;
	}

	player.tx = ntx;
	player.ty = nty;
	ackProcessedInput();
}
