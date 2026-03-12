import Phaser from "phaser";
import type { AnimState, Facing, RenderEnemy } from "./arenaTypes";
import {
	animDef,
	getEnemyWalkAnimKey,
	getEnemyAttackAnimKey,
} from "./arenaAnimations";

type TileToWorldFeet = (tx: number, ty: number) => { x: number; y: number };

export function setEnemyAnimState(re: RenderEnemy, nextState: AnimState) {
	if (re.animState === nextState) {
		if (nextState === "walk") {
			re.sprite.play(getEnemyWalkAnimKey(re.kind, re.facing), true);
		} else if (nextState === "attack") {
			re.sprite.play(getEnemyAttackAnimKey(re.kind, re.facing), true);
		}
		return;
	}

	re.animState = nextState;

	if (nextState === "walk") {
		re.sprite.play(getEnemyWalkAnimKey(re.kind, re.facing), true);
		return;
	}

	if (nextState === "attack") {
		re.sprite.play(getEnemyAttackAnimKey(re.kind, re.facing), true);
		return;
	}

	re.sprite.anims.stop();
	re.sprite.setFrame(animDef.idleWalk[re.facing].idle);
}

export function spawnEnemySprite(
	scene: Phaser.Scene,
	renderEnemies: Map<string, RenderEnemy>,
	enemy: any,
	enemyId: string,
	tileToWorldFeet: TileToWorldFeet,
	playerFeetOffset: number,
	scale: number
) {
	if (renderEnemies.has(enemyId)) return;

	const pos = tileToWorldFeet(enemy.tx, enemy.ty);
	const spriteY = pos.y - playerFeetOffset;

	const sprite = scene.add
		.sprite(pos.x, spriteY, "orc-enemy", animDef.idleWalk.down.idle)
		.setOrigin(0.5, 1)
		.setScale(scale);

	sprite.setDepth(pos.y);

	const re: RenderEnemy = {
		id: enemyId,
		sprite,
		kind: "orc",

		tx: enemy.tx,
		ty: enemy.ty,

		fromX: sprite.x,
		fromY: sprite.y,
		toX: sprite.x,
		toY: sprite.y,

		moveStartTime: 0,
		moveDuration: 0,
		isMoving: false,

		facing: (enemy.facing as Facing) ?? "down",
		animState: (enemy.animState as AnimState) ?? "idle",
	};

	setEnemyAnimState(re, re.animState);
	renderEnemies.set(enemyId, re);
}

export function syncEnemyToAuthoritativeState(
	re: RenderEnemy,
	enemy: any,
	tileToWorldFeet: TileToWorldFeet,
	playerFeetOffset: number,
	now: number,
	moveRenderMs: number
) {
	const prevTx = re.tx;
	const prevTy = re.ty;
	const nextTx = enemy.tx as number;
	const nextTy = enemy.ty as number;

	re.facing = (enemy.facing as Facing) ?? re.facing;

	const moved = prevTx !== nextTx || prevTy !== nextTy;

	if (!moved) {
		if (!re.isMoving) {
			const pos = tileToWorldFeet(nextTx, nextTy);
			const spriteY = pos.y - playerFeetOffset;

			re.sprite.setPosition(pos.x, spriteY);
			re.sprite.setDepth(pos.y);
		}

		setEnemyAnimState(re, (enemy.animState as AnimState) ?? "idle");
		re.tx = nextTx;
		re.ty = nextTy;
		return;
	}

	const targetFeet = tileToWorldFeet(nextTx, nextTy);
	const targetSpriteY = targetFeet.y - playerFeetOffset;

	re.fromX = re.sprite.x;
	re.fromY = re.sprite.y;
	re.toX = targetFeet.x;
	re.toY = targetSpriteY;
	re.moveStartTime = now;
	re.moveDuration = moveRenderMs;
	re.isMoving = true;

	re.tx = nextTx;
	re.ty = nextTy;

	setEnemyAnimState(re, "walk");
}

export function advanceEnemyRenderMove(
	re: RenderEnemy,
	now: number,
	playerFeetOffset: number
) {
	if (!re.isMoving) return;

	const t = Phaser.Math.Clamp(
		(now - re.moveStartTime) / re.moveDuration,
		0,
		1
	);

	re.sprite.x = Phaser.Math.Linear(re.fromX, re.toX, t);
	re.sprite.y = Phaser.Math.Linear(re.fromY, re.toY, t);
	re.sprite.setDepth(re.sprite.y + playerFeetOffset);

	if (t >= 1) {
		re.sprite.x = re.toX;
		re.sprite.y = re.toY;
		re.sprite.setDepth(re.sprite.y + playerFeetOffset);

		re.isMoving = false;
		setEnemyAnimState(re, "idle");
	}
}

export function removeEnemySprite(
	renderEnemies: Map<string, RenderEnemy>,
	enemyId: string
) {
	const re = renderEnemies.get(enemyId);
	if (!re) return;

	re.sprite.destroy();
	renderEnemies.delete(enemyId);
}
