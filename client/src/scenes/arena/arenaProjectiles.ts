import Phaser from "phaser";
import type { Facing, RenderPlayer } from "./arenaTypes";
import { isBlocked } from "./arenaCollision";

type TileToWorldFeet = (tx: number, ty: number) => { x: number; y: number };

type ProjectileContext = {
	scene: Phaser.Scene;
	map: Phaser.Tilemaps.Tilemap;
	blocked: Set<string>;
	tileToWorldFeet: TileToWorldFeet;
	playerFeetOffset: number;
};

function getArrowFrame(facing: Facing) {
	switch (facing) {
		case "up":
			return 86;
		case "down":
			return 17;
		case "left":
			return 40;
		case "right":
			return 63;
	}
}

function getMagicBallFrame(facing: Facing) {
	switch (facing) {
		case "up":
			return 0;
		case "down":
			return 1;
		case "left":
			return 2;
		case "right":
			return 3;
	}
}

export function fireArrow(ctx: ProjectileContext, rp: RenderPlayer) {
	const { scene, map, blocked, tileToWorldFeet, playerFeetOffset } = ctx;

	const arrow = scene.add.sprite(
		rp.sprite.x,
		rp.sprite.y,
		"arrow-projectile",
		getArrowFrame(rp.facing)
	);

	arrow.setScale(1.75);
	arrow.setDepth(rp.sprite.depth + 5);

	let dx = 0;
	let dy = 0;

	let spawnOffsetX = 0;
	let spawnOffsetY = 0;

	switch (rp.facing) {
		case "right":
			dx = 1;
			spawnOffsetX = 10;
			spawnOffsetY = -40;
			break;
		case "left":
			dx = -1;
			spawnOffsetX = -10;
			spawnOffsetY = -40;
			break;
		case "up":
			dy = -1;
			spawnOffsetX = 0;
			spawnOffsetY = -52;
			break;
		case "down":
			dy = 1;
			spawnOffsetX = 0;
			spawnOffsetY = -28;
			break;
	}

	arrow.x += spawnOffsetX;
	arrow.y += spawnOffsetY;

	let testTx = rp.tx;
	let testTy = rp.ty;

	let lastOpenTx = rp.tx;
	let lastOpenTy = rp.ty;

	while (true) {
		const nextTx = testTx + dx;
		const nextTy = testTy + dy;

		if (isBlocked(nextTx, nextTy, map, blocked)) {
			break;
		}

		lastOpenTx = nextTx;
		lastOpenTy = nextTy;
		testTx = nextTx;
		testTy = nextTy;
	}

	if (lastOpenTx === rp.tx && lastOpenTy === rp.ty) {
		arrow.destroy();
		return;
	}

	const targetFeet = tileToWorldFeet(lastOpenTx, lastOpenTy);
	const targetX = targetFeet.x + spawnOffsetX;
	const targetY = targetFeet.y - playerFeetOffset + spawnOffsetY;

	const distancePx = Phaser.Math.Distance.Between(arrow.x, arrow.y, targetX, targetY);
	const projectileSpeed = 320;
	const duration = (distancePx / projectileSpeed) * 1000;

	scene.tweens.add({
		targets: arrow,
		x: targetX,
		y: targetY,
		duration,
		onComplete: () => {
			arrow.destroy();
		},
	});
}

export function fireMagicBall(ctx: ProjectileContext, rp: RenderPlayer) {
	const { scene, map, blocked, tileToWorldFeet, playerFeetOffset } = ctx;

	const ball = scene.add.sprite(
		rp.sprite.x,
		rp.sprite.y,
		"magic-ball-projectile",
		getMagicBallFrame(rp.facing)
	);

	ball.setScale(1.2);
	ball.setDepth(rp.sprite.depth + 5);

	let dx = 0;
	let dy = 0;

	let spawnOffsetX = 0;
	let spawnOffsetY = 0;

	switch (rp.facing) {
		case "right":
			dx = 1;
			spawnOffsetX = 16;
			spawnOffsetY = -46;
			break;
		case "left":
			dx = -1;
			spawnOffsetX = -16;
			spawnOffsetY = -46;
			break;
		case "up":
			dy = -1;
			spawnOffsetX = 0;
			spawnOffsetY = -70;
			break;
		case "down":
			dy = 1;
			spawnOffsetX = 0;
			spawnOffsetY = -28;
			break;
	}

	ball.x += spawnOffsetX;
	ball.y += spawnOffsetY;

	let testTx = rp.tx;
	let testTy = rp.ty;

	let lastOpenTx = rp.tx;
	let lastOpenTy = rp.ty;

	while (true) {
		const nextTx = testTx + dx;
		const nextTy = testTy + dy;

		if (isBlocked(nextTx, nextTy, map, blocked)) {
			break;
		}

		lastOpenTx = nextTx;
		lastOpenTy = nextTy;
		testTx = nextTx;
		testTy = nextTy;
	}

	if (lastOpenTx === rp.tx && lastOpenTy === rp.ty) {
		ball.destroy();
		return;
	}

	const targetFeet = tileToWorldFeet(lastOpenTx, lastOpenTy);
	const targetX = targetFeet.x + spawnOffsetX;
	const targetY = targetFeet.y - playerFeetOffset + spawnOffsetY;

	const distancePx = Phaser.Math.Distance.Between(ball.x, ball.y, targetX, targetY);
	const projectileSpeed = 260;
	const duration = (distancePx / projectileSpeed) * 1000;

	scene.tweens.add({
		targets: ball,
		x: targetX,
		y: targetY,
		duration,
		onComplete: () => {
			ball.destroy();
		},
	});
}
