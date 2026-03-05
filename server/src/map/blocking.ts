import fs from "node:fs";
import path from "node:path";

type TiledMap = {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	layers: any[];
};

export type BlockedGrid = {
	w: number;
	h: number;
	blocked: Set<string>; // "tx,ty"
	isBlocked: (tx: number, ty: number) => boolean;
};

function key(tx: number, ty: number) {
	return `${tx},${ty}`;
}

export function loadBlockedFromTiledJson(opts: {
	jsonPath: string;               // absolute or relative to process.cwd()
	objectLayerName?: string;       
}): BlockedGrid {
	const {
		jsonPath,
		objectLayerName = "Object Layer 1",
	} = opts;

	const full = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
	const raw = fs.readFileSync(full, "utf8");
	const map = JSON.parse(raw) as TiledMap;

	const blocked = new Set<string>();

	// object layer blockers
	const objLayer = map.layers.find((l: any) => l.type === "objectgroup" && l.name === objectLayerName);
	if (objLayer?.objects?.length) {
		for (const obj of objLayer.objects) {
            const tx = Math.floor((obj.x ?? 0) / map.tilewidth);
            const ty = Math.floor((obj.y ?? 0) / map.tileheight) - 1;
			blocked.add(key(tx, ty));
		}
	}

	return {
		w: map.width,
		h: map.height,
		blocked,
		isBlocked: (tx: number, ty: number) => {
			if (tx < 0 || ty < 0) return true;
			if (tx >= map.width || ty >= map.height) return true;
			return blocked.has(key(tx, ty));
		},
	};
}
