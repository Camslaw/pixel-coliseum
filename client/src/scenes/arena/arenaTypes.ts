import type Phaser from "phaser";
import type { Room } from "colyseus.js";

export type ArenaSceneData = {
	room: Room;
};

export type Facing = "up" | "down" | "left" | "right";
export type AnimState = "idle" | "walk" | "attack";

export type PendingMove = {
	seq: number;
	dx: number;
	dy: number;
};

export type QueuedMove = {
	dx: number;
	dy: number;
};

export type RenderPlayer = {
	sessionId: string;
	sprite: Phaser.GameObjects.Sprite;
	label: Phaser.GameObjects.Text;
	className: "sword" | "bow" | "magic";
	tx: number;
	ty: number;
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	moveStartTime: number;
	moveDuration: number;
	isMoving: boolean;
	facing: Facing;
	animState: AnimState;
	pendingInputs: PendingMove[];
	nextInputSeq: number;
	queuedMove: QueuedMove | null;
	attackEndTime: number;
	isAttacking: boolean;
};

export type RenderEnemy = {
	id: string;
	sprite: Phaser.GameObjects.Sprite;
	kind: "orc";
	tx: number;
	ty: number;
	fromX: number;
	fromY: number;
	toX: number;
	toY: number;
	moveStartTime: number;
	moveDuration: number;
	isMoving: boolean;
	facing: Facing;
	animState: AnimState;

	hp: number;
	maxHp: number;

	healthBarBg: Phaser.GameObjects.Graphics;
	healthBarFill: Phaser.GameObjects.Graphics;
	lastRenderedHp: number;
};