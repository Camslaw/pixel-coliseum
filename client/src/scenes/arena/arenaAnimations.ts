import type Phaser from "phaser";
import type { Facing } from "./arenaTypes";

export const animDef = {
	idleWalk: {
		down: {
			idle: 1,
			walk: [0, 1, 2, 1],
		},
		left: {
			idle: 24,
			walk: [23, 24, 25, 24],
		},
		right: {
			idle: 47,
			walk: [46, 47, 48, 47],
		},
		up: {
			idle: 70,
			walk: [69, 70, 71, 70],
		},
	},
	attack: {
		sword: {
			down: [10, 11, 12, 13, 14],
			left: [33, 34, 35, 36, 37],
			right: [56, 57, 58, 59, 60],
			up: [79, 80, 81, 82, 83],
		},
		bow: {
			down: [15, 16, 17, 18],
			left: [38, 39, 40, 41],
			right: [61, 62, 63, 64],
			up: [84, 85, 86, 87],
		},
		magic: {
			down: [15, 16, 17, 18],
			left: [38, 39, 40, 41],
			right: [61, 62, 63, 64],
			up: [84, 85, 86, 87],
		},
	},
} as const;

export type PlayerClass = "sword" | "bow" | "magic";
export type EnemyKind = "orc";

export function getWalkAnimKey(className: PlayerClass, facing: Facing) {
	return `player-${className}-walk-${facing}`;
}

export function getAttackAnimKey(className: PlayerClass, facing: Facing) {
	return `player-${className}-attack-${facing}`;
}

export function getEnemyWalkAnimKey(kind: EnemyKind, facing: Facing) {
	return `enemy-${kind}-walk-${facing}`;
}

export function getEnemyAttackAnimKey(kind: EnemyKind, facing: Facing) {
	return `enemy-${kind}-attack-${facing}`;
}

export function ensurePlayerAnimations(
	scene: Phaser.Scene,
	getSpriteKeyForClass: (cls: PlayerClass) => string,
	walkFps: number
) {
	const makeWalk = (
		className: PlayerClass,
		facing: Facing,
		frames: readonly number[]
	) => {
		const key = getWalkAnimKey(className, facing);
		if (scene.anims.exists(key)) return;

		scene.anims.create({
			key,
			frames: frames.map((frame) => ({
				key: getSpriteKeyForClass(className),
				frame,
			})),
			frameRate: walkFps,
			repeat: -1,
		});
	};

	const makeAttack = (
		className: PlayerClass,
		facing: Facing,
		frames: readonly number[]
	) => {
		const key = getAttackAnimKey(className, facing);
		if (scene.anims.exists(key)) return;

		scene.anims.create({
			key,
			frames: frames.map((frame) => ({
				key: getSpriteKeyForClass(className),
				frame,
			})),
			frameRate: 12,
			repeat: 0,
		});
	};

	const classes: PlayerClass[] = ["sword", "bow", "magic"];

	for (const cls of classes) {
		makeWalk(cls, "down", animDef.idleWalk.down.walk);
		makeWalk(cls, "left", animDef.idleWalk.left.walk);
		makeWalk(cls, "right", animDef.idleWalk.right.walk);
		makeWalk(cls, "up", animDef.idleWalk.up.walk);

		makeAttack(cls, "down", animDef.attack[cls].down);
		makeAttack(cls, "left", animDef.attack[cls].left);
		makeAttack(cls, "right", animDef.attack[cls].right);
		makeAttack(cls, "up", animDef.attack[cls].up);
	}
}

export function ensureEnemyAnimations(scene: Phaser.Scene, walkFps: number) {
	const makeWalk = (facing: Facing, frames: readonly number[]) => {
		const key = getEnemyWalkAnimKey("orc", facing);
		if (scene.anims.exists(key)) return;

		scene.anims.create({
			key,
			frames: frames.map((frame) => ({
				key: "orc-enemy",
				frame,
			})),
			frameRate: walkFps,
			repeat: -1,
		});
	};

	const makeAttack = (facing: Facing, frames: readonly number[]) => {
		const key = getEnemyAttackAnimKey("orc", facing);
		if (scene.anims.exists(key)) return;

		scene.anims.create({
			key,
			frames: frames.map((frame) => ({
				key: "orc-enemy",
				frame,
			})),
			frameRate: 12,
			repeat: 0,
		});
	};

	makeWalk("down", animDef.idleWalk.down.walk);
	makeWalk("left", animDef.idleWalk.left.walk);
	makeWalk("right", animDef.idleWalk.right.walk);
	makeWalk("up", animDef.idleWalk.up.walk);

	makeAttack("down", animDef.attack.sword.down);
	makeAttack("left", animDef.attack.sword.left);
	makeAttack("right", animDef.attack.sword.right);
	makeAttack("up", animDef.attack.sword.up);
}
