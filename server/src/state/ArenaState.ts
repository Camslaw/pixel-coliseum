import { Schema, MapSchema, type } from "@colyseus/schema";

export class Player extends Schema {
	@type("string") id = "";
	@type("string") name = "";
	@type("string") class = "sword";

	@type("number") tx = 0;
	@type("number") ty = 0;

	@type("string") facing = "down";

	@type("number") hp = 150;
	@type("number") maxHp = 150;

	@type("number") lastProcessedInput = 0;
	@type("number") spawnIndex = -1;
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

export class ArenaState extends Schema {
	@type({ map: Player }) players = new MapSchema<Player>();
	@type({ map: Enemy }) enemies = new MapSchema<Enemy>();

	@type("string") hostId = "";
	@type("string") phase = "lobby"; // lobby -> starting -> playing -> cleared
}
