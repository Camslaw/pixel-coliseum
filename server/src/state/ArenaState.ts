import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
	@type("string") id = ""; // session id
	@type("string") userId = ""; // actual db user id
	@type("string") name = "";
	@type("string") class = "sword";

	@type("number") tx = 0;
	@type("number") ty = 0;

	@type("string") facing = "down";

	@type("number") hp = 150;
	@type("number") maxHp = 150;

	@type("number") lastProcessedInput = 0;
	@type("number") spawnIndex = -1;
	@type("boolean") alive = true;

	@type("number") moveIntervalMs = 160;
	@type("number") speedBoostUntil = 0;

	@type("number") damageMultiplierPct = 100;
	@type("number") damageBoostUntil = 0;

	// runtime stat tracking
	@type("number") score = 0;
	@type("number") kills = 0;
	@type("number") powerUpsCollected = 0;
	@type("number") roundSurvived = 0;
	@type("number") runStartedAt = 0;

	// helper flag to avoid double-saving
	@type("boolean") statsCommitted = false;
}

export class Enemy extends Schema {
	@type("string") id = "";
	@type("string") kind = "orc";

	@type("number") tx = 0;
	@type("number") ty = 0;

	@type("string") facing = "down";
	@type("string") animState = "idle";

	@type("boolean") alive = true;
	@type("number") lastAttackAt = 0;

	@type("number") hp = 100;
	@type("number") maxHp = 100;
}

export class PowerUp extends Schema {
	@type("string") id = "";
	@type("string") kind = "damage"; // "damage" | "speed" | "heal"
	@type("string") category = "buff"; // "buff" | "heal"
	@type("number") tx = 0;
	@type("number") ty = 0;
	@type("number") expiresAt = 0;
}

export class ArenaState extends Schema {
	@type({ map: Player }) players = new MapSchema<Player>();
	@type({ map: Enemy }) enemies = new MapSchema<Enemy>();
	@type({ map: PowerUp }) powerUps = new MapSchema<PowerUp>();

	@type("string") hostId = "";
	@type("string") phase = "lobby";

	@type("number") round = 0;
}
