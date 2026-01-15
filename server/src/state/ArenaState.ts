import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") class: string = "sword";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  @type("string") phase: "lobby" | "playing" | "playing" = "lobby";
  @type("string") hostId: string = "";
}
