import Phaser from "phaser";
import type { Room } from "colyseus.js";

type PlayerClass = "sword" | "bow" | "magic";

type ArenaSceneData = {
  room: Room;
};

export default class ArenaScene extends Phaser.Scene {
  private room!: Room;
  private playerGfx = new Map<string, Phaser.GameObjects.Arc>();

  constructor() {
    super("arena");
  }

  init(data: ArenaSceneData) {
    this.room = data.room;
  }

  create() {
    const map = this.make.tilemap({ key: "arena-map" });
    const tileset = map.addTilesetImage("arena-tileset", "tiles");
    if (!tileset) throw new Error("Tileset mapping failed.");

    const offsetX = (this.cameras.main.width - map.widthInPixels) / 2;
    const offsetY = (this.cameras.main.height - map.heightInPixels) / 2;

    map.createLayer("Tile Layer 1", tileset, offsetX, offsetY);
    map.createLayer("additional layer", tileset, offsetX, offsetY);

    const objLayer = map.getObjectLayer("Object Layer 1");
    if (!objLayer) throw new Error("Missing object layer: Object Layer 1");

    for (const obj of objLayer.objects) {
        if (!("gid" in obj) || !obj.gid) continue;
        const frame = obj.gid - tileset.firstgid;
        const x = (obj.x ?? 0) + (obj.width ?? 0) / 2 + offsetX;
        const y = (obj.y ?? 0) - (obj.height ?? 0) / 2 + offsetY;
        const sprite = this.add.image(x, y, "tiles", frame);
        if (obj.rotation) sprite.setRotation(Phaser.Math.DegToRad(obj.rotation));
    }

    const hud = this.add.text(
        16,
        16,
        `Room: ${this.room.roomId}\nYou: ${this.room.sessionId}`,
        {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
        }
    );
    hud.setScrollFactor(0);
    hud.setDepth(9999);

    const players = (this.room.state as any).players;
    if (!players) {
        console.warn("Room state has no players map yet.");
        return;
    }

    players.onAdd = (player: any, sessionId: string) => {
        const cls = (player.class as PlayerClass) ?? "sword";

        const radius = 16;
        const circle = this.add.circle(player.x, player.y, radius) as Phaser.GameObjects.Arc;
        circle.setStrokeStyle(3, 0xffffff, 0.9);
        circle.setAlpha(0.9);

        const label = this.add.text(player.x, player.y - 28, cls, {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: "12px",
        color: "#ffffff",
        }).setOrigin(0.5);

        (circle as any).__label = label;

        player.onChange = () => {
        circle.setPosition(player.x, player.y);
        label.setPosition(player.x, player.y - 28);
        label.setText(player.class);
        };

        this.playerGfx.set(sessionId, circle);
    };

    players.onRemove = (_player: any, sessionId: string) => {
        const circle = this.playerGfx.get(sessionId);
        if (!circle) return;
        const label = (circle as any).__label as Phaser.GameObjects.Text | undefined;
        label?.destroy();
        circle.destroy();
        this.playerGfx.delete(sessionId);
    };
  }
}
