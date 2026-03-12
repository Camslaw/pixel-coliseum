import Phaser from "phaser";
import type { AnimState, RenderPlayer } from "./arenaTypes";
import { animDef, getWalkAnimKey, getAttackAnimKey } from "./arenaAnimations";
import { fireArrow, fireMagicBall } from "./arenaProjectiles";

type TileToWorldFeet = (tx: number, ty: number) => { x: number; y: number };

type ProjectileContext = {
	scene: Phaser.Scene;
	map: Phaser.Tilemaps.Tilemap;
	blocked: Set<string>;
	tileToWorldFeet: TileToWorldFeet;
	playerFeetOffset: number;
};

export function syncLabel(
	rp: RenderPlayer,
	nameYOffset: number,
	name?: string
) {
	rp.label.setPosition(rp.sprite.x, rp.sprite.y - nameYOffset);
	rp.label.setDepth(rp.sprite.depth + 1);

	if (name !== undefined) {
		rp.label.setText(name);
	}
}

export function normalizePlayerClass(v: unknown): "sword" | "bow" | "magic" {
	if (v === "sword" || v === "bow" || v === "magic") return v;
	return "sword";
}

export function getSpriteKeyForClass(cls: unknown) {
	const normalized = normalizePlayerClass(cls);

	if (normalized === "bow") return "player-bow-class";
	if (normalized === "magic") return "player-magic-class";
	return "player-sword-class";
}

export function setAnimState(rp: RenderPlayer, nextState: AnimState) {
	if (rp.animState === nextState) {
		if (nextState === "walk") {
			rp.sprite.play(getWalkAnimKey(rp.className, rp.facing), true);
		} else if (nextState === "attack") {
			rp.sprite.play(getAttackAnimKey(rp.className, rp.facing), true);
		}
		return;
	}

	rp.animState = nextState;

	if (nextState === "walk") {
		rp.sprite.play(getWalkAnimKey(rp.className, rp.facing), true);
		return;
	}

	if (nextState === "attack") {
		rp.sprite.play(getAttackAnimKey(rp.className, rp.facing), true);
		return;
	}

	rp.sprite.anims.stop();
	rp.sprite.setFrame(animDef.idleWalk[rp.facing].idle);
}

export function getAttackDurationMs(rp: RenderPlayer) {
	if (rp.className === "bow") return 220;
	if (rp.className === "magic") return 260;
	return 180;
}

export function tryStartLocalAttack(
	meRp: RenderPlayer | undefined,
	now: number,
	projectileCtx: ProjectileContext | null
) {
	if (!meRp) return false;
	if (meRp.isMoving) return false;
	if (meRp.isAttacking) return false;

	meRp.isAttacking = true;
	meRp.attackEndTime = now + getAttackDurationMs(meRp);
	meRp.queuedMove = null;

	setAnimState(meRp, "attack");

	if (projectileCtx) {
		if (meRp.className === "bow") {
			fireArrow(projectileCtx, meRp);
		} else if (meRp.className === "magic") {
			fireMagicBall(projectileCtx, meRp);
		}
	}

	return true;
}

export function advanceAttackState(rp: RenderPlayer, now: number) {
	if (!rp.isAttacking) return;
	if (now < rp.attackEndTime) return;

	rp.isAttacking = false;
	setAnimState(rp, "idle");
}

export function spawnPlayerSprite(
	scene: Phaser.Scene,
	renderPlayers: Map<string, RenderPlayer>,
	player: any,
	sessionId: string,
	tileToWorldFeet: TileToWorldFeet,
	playerFeetOffset: number,
	nameYOffset: number,
	scale: number
) {
	if (renderPlayers.has(sessionId)) return;

	const pos = tileToWorldFeet(player.tx, player.ty);
	const spriteY = pos.y - playerFeetOffset;

	const className = normalizePlayerClass(player.class);
	const spriteKey = getSpriteKeyForClass(className);

	const sprite = scene.add
		.sprite(pos.x, spriteY, spriteKey, animDef.idleWalk.down.idle)
		.setOrigin(0.5, 1)
		.setScale(scale);

	sprite.setDepth(pos.y);

	const label = scene.add
		.text(pos.x, spriteY - nameYOffset, player.name ?? "Player", {
			fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
			fontSize: "12px",
			color: "#ffffff",
		})
		.setOrigin(0.5, 0.5)
		.setDepth(pos.y + 1);

	const rp: RenderPlayer = {
		sessionId,
		sprite,
		label,
		className,

		tx: player.tx,
		ty: player.ty,

		fromX: sprite.x,
		fromY: sprite.y,
		toX: sprite.x,
		toY: sprite.y,

		moveStartTime: 0,
		moveDuration: 0,
		isMoving: false,

		facing: "down",
		animState: "idle",

		pendingInputs: [],
		nextInputSeq: 0,
		queuedMove: null,

		attackEndTime: 0,
		isAttacking: false,
	};

	syncLabel(rp, nameYOffset, player.name ?? "Player");
	renderPlayers.set(sessionId, rp);
}

export function removePlayerSprite(
	renderPlayers: Map<string, RenderPlayer>,
	sessionId: string
) {
	const rp = renderPlayers.get(sessionId);
	if (!rp) return;

	rp.label.destroy();
	rp.sprite.destroy();
	renderPlayers.delete(sessionId);
}