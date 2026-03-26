import fs from "node:fs";
import path from "node:path";

type TiledLayer = any;

type TiledMap = {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	layers: TiledLayer[];
};

export type BlockedGrid = {
	w: number;
	h: number;
	blocked: Set<string>;
	projectileBlocked: Set<string>;
	isBlocked: (tx: number, ty: number) => boolean;
	isProjectileBlocked: (tx: number, ty: number) => boolean;
};

function key(tx: number, ty: number) {
	return `${tx},${ty}`;
}

export function loadBlockedFromTiledJson(opts: {
	jsonPath: string;
	terrainLayerName?: string;
	propsLayerName?: string;
}): BlockedGrid {
	const {
		jsonPath,
		terrainLayerName = "Terrain",
		propsLayerName = "Props",
	} = opts;

	const full = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
	const raw = fs.readFileSync(full, "utf8");
	const map = JSON.parse(raw) as TiledMap;

	const blocked = new Set<string>();
	const projectileBlocked = new Set<string>();

	// 1) terrain blocks movement on the tile below its base,
	// but does NOT block projectiles
	const terrainLayer = map.layers.find(
		(l: any) => l.type === "tilelayer" && l.name === terrainLayerName
	);

	if (terrainLayer?.data?.length) {
		for (let i = 0; i < terrainLayer.data.length; i++) {
			const gid = terrainLayer.data[i];
			if (!gid) continue;

			const tx = i % map.width;
			const ty = Math.floor(i / map.width);
			const blockedTy = ty + 1;

			if (blockedTy < map.height) {
				blocked.add(key(tx, blockedTy));
			}
		}
	}

	// 2) props block both movement and projectiles on their base tile
	const propsLayer = map.layers.find(
		(l: any) => l.type === "objectgroup" && l.name === propsLayerName
	);

	if (propsLayer?.objects?.length) {
		for (const obj of propsLayer.objects) {
			if (!obj.gid) continue;

			const tx = Math.floor((obj.x ?? 0) / map.tilewidth);
			const ty = Math.floor((obj.y ?? 0) / map.tileheight);

			blocked.add(key(tx, ty));
			projectileBlocked.add(key(tx, ty));
		}
	}

	return {
		w: map.width,
		h: map.height,
		blocked,
		projectileBlocked,
		isBlocked: (tx: number, ty: number) => {
			if (tx < 0 || ty < 0) return true;
			if (tx >= map.width || ty >= map.height) return true;
			return blocked.has(key(tx, ty));
		},
		isProjectileBlocked: (tx: number, ty: number) => {
			if (tx < 0 || ty < 0) return true;
			if (tx >= map.width || ty >= map.height) return true;
			return projectileBlocked.has(key(tx, ty));
		},
	};
}
