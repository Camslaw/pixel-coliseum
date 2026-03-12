import type Phaser from "phaser";

function key(tx: number, ty: number) {
	return `${tx},${ty}`;
}

export function buildBlockedGrid(
	map: Phaser.Tilemaps.Tilemap,
	blocked: Set<string>
) {
	blocked.clear();

	const terrainLayer = map.getLayer("Terrain")?.tilemapLayer;
	if (terrainLayer) {
		for (let ty = 0; ty < map.height; ty++) {
			for (let tx = 0; tx < map.width; tx++) {
				const tile = terrainLayer.getTileAt(tx, ty);
				if (tile && tile.index !== -1) {
					const blockedTy = ty + 1;
					if (blockedTy < map.height) {
						blocked.add(key(tx, blockedTy));
					}
				}
			}
		}
	}

	const propsLayer = map.getObjectLayer("Props");
	if (propsLayer) {
		for (const obj of propsLayer.objects) {
			if (!("gid" in obj) || !obj.gid) continue;

			const tx = Math.floor((obj.x ?? 0) / map.tileWidth);
			const ty = Math.floor((obj.y ?? 0) / map.tileHeight);
			blocked.add(key(tx, ty));
		}
	}
}

export function isBlocked(
	tx: number,
	ty: number,
	map: Phaser.Tilemaps.Tilemap,
	blocked: Set<string>
) {
	if (tx < 0 || ty < 0) return true;
	if (tx >= map.width || ty >= map.height) return true;
	return blocked.has(key(tx, ty));
}