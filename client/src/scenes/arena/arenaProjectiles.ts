import Phaser from "phaser";
import type { Facing, RenderEnemy } from "./arenaTypes";

type TileToWorldFeet = (tx: number, ty: number) => { x: number; y: number };

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

function getProjectileOffsets(kind: "bow" | "magic", facing: Facing) {
	if (kind === "bow") {
		switch (facing) {
			case "right":
				return {
					spawnOffsetX: 10,
					spawnOffsetY: -40,
					scale: 1.75,
					texture: "arrow-projectile",
					frame: getArrowFrame(facing),
				};
			case "left":
				return {
					spawnOffsetX: -10,
					spawnOffsetY: -40,
					scale: 1.75,
					texture: "arrow-projectile",
					frame: getArrowFrame(facing),
				};
			case "up":
				return {
					spawnOffsetX: 0,
					spawnOffsetY: -52,
					scale: 1.75,
					texture: "arrow-projectile",
					frame: getArrowFrame(facing),
				};
			case "down":
				return {
					spawnOffsetX: 0,
					spawnOffsetY: -28,
					scale: 1.75,
					texture: "arrow-projectile",
					frame: getArrowFrame(facing),
				};
		}
	}

	switch (facing) {
		case "right":
			return {
				spawnOffsetX: 16,
				spawnOffsetY: -46,
				scale: 1.2,
				texture: "magic-ball-projectile",
				frame: getMagicBallFrame(facing),
			};
		case "left":
			return {
				spawnOffsetX: -16,
				spawnOffsetY: -46,
				scale: 1.2,
				texture: "magic-ball-projectile",
				frame: getMagicBallFrame(facing),
			};
		case "up":
			return {
				spawnOffsetX: 0,
				spawnOffsetY: -70,
				scale: 1.2,
				texture: "magic-ball-projectile",
				frame: getMagicBallFrame(facing),
			};
		case "down":
			return {
				spawnOffsetX: 0,
				spawnOffsetY: -28,
				scale: 1.2,
				texture: "magic-ball-projectile",
				frame: getMagicBallFrame(facing),
			};
	}
}

export function playRemoteProjectile(opts: {
	scene: Phaser.Scene;
	kind: "bow" | "magic";
	facing: Facing;
	fromTx: number;
	fromTy: number;
	toTx: number;
	toTy: number;
	tileToWorldFeet: TileToWorldFeet;
	playerFeetOffset: number;
	durationMs: number;
	targetEnemy?: RenderEnemy;
}) {
	const {
		scene,
		kind,
		facing,
		fromTx,
		fromTy,
		toTx,
		toTy,
		tileToWorldFeet,
		playerFeetOffset,
		durationMs,
		targetEnemy,
	} = opts;

	const cfg = getProjectileOffsets(kind, facing);

	const fromFeet = tileToWorldFeet(fromTx, fromTy);
	const toFeet = tileToWorldFeet(toTx, toTy);

	const startX = fromFeet.x + cfg.spawnOffsetX;
	const startY = fromFeet.y - playerFeetOffset + cfg.spawnOffsetY;

	const defaultTargetX = toFeet.x + cfg.spawnOffsetX;
	const defaultTargetY = toFeet.y - playerFeetOffset + cfg.spawnOffsetY;

	const projectile = scene.add.sprite(startX, startY, cfg.texture, cfg.frame);
	projectile.setScale(cfg.scale);
	projectile.setDepth(startY + playerFeetOffset + 20);

	const tweenState = { t: 0 };

	scene.tweens.add({
		targets: tweenState,
		t: 1,
		duration: durationMs,
		onUpdate: () => {
			let targetX = defaultTargetX;
			let targetY = defaultTargetY;

			// If there is a target enemy still rendered, chase its current sprite position
			if (targetEnemy) {
				targetX = targetEnemy.sprite.x + cfg.spawnOffsetX;
				targetY = targetEnemy.sprite.y + cfg.spawnOffsetY;
			}

			projectile.x = Phaser.Math.Linear(startX, targetX, tweenState.t);
			projectile.y = Phaser.Math.Linear(startY, targetY, tweenState.t);

			projectile.setDepth(projectile.y + playerFeetOffset + 20);
		},
		onComplete: () => {
			projectile.destroy();
		},
	});
}
