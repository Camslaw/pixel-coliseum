import fs from "node:fs";
import path from "node:path";

type TiledMap = {
	width: number;
	height: number;
	tilewidth: number;
	tileheight: number;
	layers: any[];
};

export type SpawnPoint = {
	tx: number;
	ty: number;
	x: number;
	y: number;
};

export function loadSpawnPointsFromTiledJson(opts: {
	jsonPath: string;
	layerName: string;
}): SpawnPoint[] {
	const { jsonPath, layerName } = opts;

	const full = path.isAbsolute(jsonPath) ? jsonPath : path.join(process.cwd(), jsonPath);
	const raw = fs.readFileSync(full, "utf8");
	const map = JSON.parse(raw) as TiledMap;

	const layer = map.layers.find(
		(l: any) => l.type === "objectgroup" && l.name === layerName
	);

	if (!layer?.objects?.length) return [];

	return layer.objects
		.filter((obj: any) => obj.point)
		.map((obj: any) => {
			const tx = Math.floor((obj.x ?? 0) / map.tilewidth);
			const ty = Math.floor((obj.y ?? 0) / map.tileheight) + 1;

			return {
				tx,
				ty,
				x: obj.x ?? 0,
				y: obj.y ?? 0,
			};
		});
}
