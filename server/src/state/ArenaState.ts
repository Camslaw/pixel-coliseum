import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("string") name: string = "";
  @type("string") class: string = "sword";
  @type("number") tx: number = 0;
  @type("number") ty: number = 0;
}

export class ArenaState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();

  @type("string") phase: "lobby" | "playing" = "lobby";
  @type("string") hostId: string = "";
}
