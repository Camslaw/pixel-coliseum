import Phaser from "phaser";
import type { Facing, QueuedMove, RenderPlayer } from "./arenaTypes";
import { isBlocked } from "./arenaCollision";

type TileToWorldFeet = (tx: number, ty: number) => { x: number; y: number };

type MovementContext = {
	map: Phaser.Tilemaps.Tilemap;
	blocked: Set<string>;
	tileToWorldFeet: TileToWorldFeet;
	playerFeetOffset: number;
	moveRenderMs: number;
	lastMoveTime: number;
	moveIntervalMs: number;
	roomSessionId: string;
	sendMove: (dx: number, dy: number, seq: number) => void;
};

type PlayerAnimFns = {
	setAnimState: (rp: RenderPlayer, nextState: "idle" | "walk" | "attack") => void;
	syncLabel: (rp: RenderPlayer, name?: string) => void;
};

export function getFacingFromDelta(dx: number, dy: number): Facing {
	if (dx < 0) return "left";
	if (dx > 0) return "right";
	if (dy < 0) return "up";
	return "down";
}

export function beginRenderMove(
	rp: RenderPlayer,
	targetTx: number,
	targetTy: number,
	now: number,
	duration: number,
	facing: Facing,
	tileToWorldFeet: TileToWorldFeet,
	playerFeetOffset: number,
	setAnimState: PlayerAnimFns["setAnimState"]
) {
	const targetFeet = tileToWorldFeet(targetTx, targetTy);
	const targetSpriteY = targetFeet.y - playerFeetOffset;

	rp.fromX = rp.sprite.x;
	rp.fromY = rp.sprite.y;
	rp.toX = targetFeet.x;
	rp.toY = targetSpriteY;
	rp.moveStartTime = now;
	rp.moveDuration = duration;
	rp.isMoving = true;
	rp.facing = facing;

	setAnimState(rp, "walk");
}

export function advanceRenderMove(
	rp: RenderPlayer,
	now: number,
	playerFeetOffset: number,
	setAnimState: PlayerAnimFns["setAnimState"],
	syncLabel: PlayerAnimFns["syncLabel"]
) {
	if (!rp.isMoving) return;

	const t = Phaser.Math.Clamp(
		(now - rp.moveStartTime) / rp.moveDuration,
		0,
		1
	);

	rp.sprite.x = Phaser.Math.Linear(rp.fromX, rp.toX, t);
	rp.sprite.y = Phaser.Math.Linear(rp.fromY, rp.toY, t);
	rp.sprite.setDepth(rp.sprite.y + playerFeetOffset);

	syncLabel(rp);

	if (t >= 1) {
		rp.sprite.x = rp.toX;
		rp.sprite.y = rp.toY;
		rp.sprite.setDepth(rp.sprite.y + playerFeetOffset);

		rp.isMoving = false;
		setAnimState(rp, "idle");
		syncLabel(rp);
	}
}

export function snapRenderPlayerToTile(
	rp: RenderPlayer,
	tx: number,
	ty: number,
	tileToWorldFeet: TileToWorldFeet,
	playerFeetOffset: number
) {
	const pos = tileToWorldFeet(tx, ty);
	const spriteY = pos.y - playerFeetOffset;

	rp.sprite.setPosition(pos.x, spriteY);
	rp.sprite.setDepth(pos.y);

	rp.fromX = pos.x;
	rp.fromY = spriteY;
	rp.toX = pos.x;
	rp.toY = spriteY;
	rp.isMoving = false;
}

export function reconcileLocalPlayer(
	rp: RenderPlayer,
	player: any,
	ctx: Pick<MovementContext, "map" | "blocked" | "tileToWorldFeet" | "playerFeetOffset" | "moveRenderMs">,
	fns: Pick<PlayerAnimFns, "setAnimState" | "syncLabel">,
	now: number
) {
	const serverTx = player.tx as number;
	const serverTy = player.ty as number;
	const lastProcessedInput = Number(player.lastProcessedInput ?? 0);

	rp.pendingInputs = rp.pendingInputs.filter((input) => input.seq > lastProcessedInput);

	let correctedTx = serverTx;
	let correctedTy = serverTy;
	let replayFacing = rp.facing;

	for (const input of rp.pendingInputs) {
		const ntx = correctedTx + input.dx;
		const nty = correctedTy + input.dy;

		if (isBlocked(ntx, nty, ctx.map, ctx.blocked)) {
			continue;
		}

		correctedTx = ntx;
		correctedTy = nty;
		replayFacing = getFacingFromDelta(input.dx, input.dy);
	}

	const needsLogicalCorrection = rp.tx !== correctedTx || rp.ty !== correctedTy;

	rp.tx = correctedTx;
	rp.ty = correctedTy;

	if (!needsLogicalCorrection) {
		fns.syncLabel(rp, player.name ?? "Player");
		return;
	}

	snapRenderPlayerToTile(
		rp,
		serverTx,
		serverTy,
		ctx.tileToWorldFeet,
		ctx.playerFeetOffset
	);

	if (rp.pendingInputs.length > 0) {
		beginRenderMove(
			rp,
			correctedTx,
			correctedTy,
			now,
			ctx.moveRenderMs,
			replayFacing,
			ctx.tileToWorldFeet,
			ctx.playerFeetOffset,
			fns.setAnimState
		);
	} else {
		fns.setAnimState(rp, "idle");
		fns.syncLabel(rp, player.name ?? "Player");
	}
}

export function getDesiredInputDirection(moveKeys: {
	left: Phaser.Input.Keyboard.Key;
	right: Phaser.Input.Keyboard.Key;
	up: Phaser.Input.Keyboard.Key;
	down: Phaser.Input.Keyboard.Key;
}): QueuedMove | null {
	let dx = 0;
	let dy = 0;

	if (moveKeys.left.isDown) dx = -1;
	else if (moveKeys.right.isDown) dx = 1;
	else if (moveKeys.up.isDown) dy = -1;
	else if (moveKeys.down.isDown) dy = 1;
	else return null;

	return { dx, dy };
}

export function tryStartPredictedLocalMove(
	meRp: RenderPlayer | undefined,
	dx: number,
	dy: number,
	now: number,
	ctx: MovementContext,
	setAnimState: PlayerAnimFns["setAnimState"]
): boolean {
	if (!meRp) return false;

	const ntx = meRp.tx + dx;
	const nty = meRp.ty + dy;

	if (isBlocked(ntx, nty, ctx.map, ctx.blocked)) return false;

	const facing = getFacingFromDelta(dx, dy);
	const seq = ++meRp.nextInputSeq;

	meRp.pendingInputs.push({ seq, dx, dy });

	meRp.tx = ntx;
	meRp.ty = nty;

	beginRenderMove(
		meRp,
		ntx,
		nty,
		now,
		ctx.moveRenderMs,
		facing,
		ctx.tileToWorldFeet,
		ctx.playerFeetOffset,
		setAnimState
	);

	meRp.queuedMove = null;
	ctx.lastMoveTime = now;
	ctx.sendMove(dx, dy, seq);
	return true;
}

export function tryConsumeQueuedLocalMove(
	meRp: RenderPlayer | undefined,
	now: number,
	ctx: MovementContext,
	setAnimState: PlayerAnimFns["setAnimState"]
): boolean {
	if (!meRp) return false;
	if (meRp.isMoving) return false;
	if (!meRp.queuedMove) return false;
	if (now - ctx.lastMoveTime < ctx.moveIntervalMs) return false;

	const { dx, dy } = meRp.queuedMove;
	return tryStartPredictedLocalMove(meRp, dx, dy, now, ctx, setAnimState);
}
