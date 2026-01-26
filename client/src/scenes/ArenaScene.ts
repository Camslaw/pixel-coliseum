import Phaser from "phaser";
import type { Room } from "colyseus.js";

type PlayerClass = "sword" | "bow" | "magic";

type ArenaSceneData = {
  room: Room;
};

export default class ArenaScene extends Phaser.Scene {
  private room!: Room;
  private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();

  private playerListHud?: Phaser.GameObjects.Text;

  constructor() {
    super("arena");
  }

  init(data: ArenaSceneData) {
    this.room = data.room;
  }

  private drawDebugGrid(map: Phaser.Tilemaps.Tilemap, offsetX: number, offsetY: number) {
    const g = this.add.graphics();
    g.setDepth(9998); // under HUD (9999), over map/objects

    const tileW = map.tileWidth;
    const tileH = map.tileHeight;

    const w = map.widthInPixels;
    const h = map.heightInPixels;

    const startX = Math.round(offsetX);
    const startY = Math.round(offsetY);

    // subtle lines
    g.lineStyle(1, 0x00ff00, 0.25);

    // vertical lines
    for (let x = 0; x <= w; x += tileW) {
      g.beginPath();
      g.moveTo(startX + x, startY);
      g.lineTo(startX + x, startY + h);
      g.strokePath();
    }

    // horizontal lines
    for (let y = 0; y <= h; y += tileH) {
      g.beginPath();
      g.moveTo(startX, startY + y);
      g.lineTo(startX + w, startY + y);
      g.strokePath();
    }

    // outline the map
    g.lineStyle(2, 0xffff00, 0.6);
    g.strokeRect(startX, startY, w, h);

    // optional: show tile coordinates every N tiles
    const labelEvery = 5;
    for (let ty = 0; ty < map.height; ty += labelEvery) {
      for (let tx = 0; tx < map.width; tx += labelEvery) {
        this.add
          .text(
            startX + tx * tileW + 2,
            startY + ty * tileH + 2,
            `${tx},${ty}`,
            { fontSize: "10px", color: "#00ff00" }
          )
          .setDepth(9998)
          .setAlpha(0.8);
      }
    }
  }

  create() {
    const map = this.make.tilemap({ key: "arena-map" });
    const tileset = map.addTilesetImage("arena-tileset", "tiles");
    if (!tileset) throw new Error("Tileset mapping failed.");

    const offsetX = Math.round((this.cameras.main.width - map.widthInPixels) / 2);
    const offsetY = Math.round((this.cameras.main.height - map.heightInPixels) / 2);

    const TILE = map.tileWidth;

    const tileToWorldFeet = (tx: number, ty: number) => ({
      x: offsetX + (tx + 0.5) * TILE,
      y: offsetY + (ty + 1) * TILE, // bottom edge of tile (feet)
    });

    // this.drawDebugGrid(map, offsetX, offsetY);

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

    const leaveText = this.add
      .text(16, 36, "Leave Game", { fontFamily: "ui-monospace, monospace", fontSize: "16px" })
      .setScrollFactor(0)
      .setDepth(9999)
      .setInteractive({ useHandCursor: true });

    leaveText.on("pointerdown", () => {
      this.room.leave(); // triggers onLeave handler (below)
    });

    const hud = this.add.text(
      -14,
      64,
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

    this.playerListHud = this.add.text(
      -54,
      hud.y + hud.height + 8,
      "",
      {
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        fontSize: "14px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.5)",
        padding: { left: 8, right: 8, top: 6, bottom: 6 },
      }
    );
    this.playerListHud.setScrollFactor(0);
    this.playerListHud.setDepth(9999);

    const players = (this.room.state as any).players;
    if (!players) {
      console.warn("Room state has no players map yet.");
      return;
    }

    const PLAYER_DEPTH = 50;

    const spawnPlayerSprite = (player: any, sessionId: string) => {
      if (this.playerSprites.has(sessionId)) return;

      const pos = tileToWorldFeet(player.tx, player.ty);

      const sprite = this.add.sprite(pos.x, pos.y, "player", 0)
        .setOrigin(0.5, 1)
        .setDepth(PLAYER_DEPTH);

      // crosshair for debugging
      // const cross = this.add.graphics().setDepth(9999);
      // cross.lineStyle(1, 0xff00ff, 1);
      // cross.strokeLineShape(new Phaser.Geom.Line(pos.x - 6, pos.y, pos.x + 6, pos.y));
      // cross.strokeLineShape(new Phaser.Geom.Line(pos.x, pos.y - 6, pos.x, pos.y + 6));

      // sprite.setScale(1);

      const NAME_Y_OFFSET = 1.35 * TILE; // centered in tile above the feet tile

      const label = this.add.text(
        pos.x,
        pos.y - NAME_Y_OFFSET,
        player.name ?? "Player",
        {
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          fontSize: "12px",
          color: "#ffffff",
        }
      )
      .setOrigin(0.5, 0.5)
      .setDepth(PLAYER_DEPTH + 1);

      (sprite as any).__label = label;

      player.onChange = () => {
        const pos = tileToWorldFeet(player.tx, player.ty);

        // pixel-perfect (optional but safe)
        const x = Math.round(pos.x);
        const y = Math.round(pos.y);

        sprite.setPosition(x, y);
        label.setPosition(x, y - sprite.displayHeight - 6);
        label.setText(player.name ?? "Player");
        renderPlayerList();
      };

      this.playerSprites.set(sessionId, sprite);
    };

    const renderPlayerList = () => {
      const state = this.room.state as any;
      const hostId = state.hostId as string | undefined;

      const lines: string[] = [];
      players.forEach((p: any, sid: string) => {
        const me = sid === this.room.sessionId ? " (you)" : "";
        const host = hostId && sid === hostId ? " [host]" : "";
        const cls = (p.class as string) ?? "(no class)";
        const name = (p.name as string) ?? "Player";
        lines.push(`${name} - ${cls}${host}${me}`);
      });

      this.playerListHud?.setText(
        ["Players:", ...(lines.length ? lines : ["-"])].join("\n")
      );
    };

    players.forEach((p: any, sid: string) => spawnPlayerSprite(p, sid));
    renderPlayerList();

    this.scale.on("resize", () => {
      this.playerListHud?.setPosition(this.cameras.main.width - 16, 16);
    });

    players.onAdd = (player: any, sessionId: string) => {
      spawnPlayerSprite(player, sessionId);
      renderPlayerList();
    };

    players.onRemove = (_player: any, sessionId: string) => {
      const sprite = this.playerSprites.get(sessionId);
      if (sprite) {
        const label = (sprite as any).__label as Phaser.GameObjects.Text | undefined;
        label?.destroy();
        sprite.destroy();
        this.playerSprites.delete(sessionId);
      }
      renderPlayerList();
    };

    this.room.onLeave(() => {
      this.scene.start("match");
    });
  }
}
