import Phaser from "phaser";
import { auth } from "../auth";

type ProfileStatsResponse = {
	stats: {
		highestScore: number;
		highestRoundSurvived: number;
		totalScore: number;
		totalKills: number;
		totalPowerupsCollected: number;
		totalTimePlayedSeconds: number;
		gamesPlayed: number;
	};
};

function getApiBaseUrl(): string {
	const api = import.meta.env.VITE_API_URL as string | undefined;
	if (api && api.trim()) {
		return api.replace(/\/$/, "");
	}
	return "http://localhost:3000";
}

function formatDuration(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;

	if (hours > 0) {
		return `${hours}h ${minutes}m ${seconds}s`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds}s`;
	}
	return `${seconds}s`;
}

export default class ProfileScene extends Phaser.Scene {
	private uiRoot?: Phaser.GameObjects.DOMElement;

	constructor() {
		super("profile");
	}

	preload() {
		this.load.html("profile-ui", "/ui/profile.html");
	}

	async create() {
		await auth.restore();

		if (!auth.user) {
			this.scene.start("auth");
			return;
		}

		this.uiRoot = this.add
			.dom(this.cameras.main.centerX, this.cameras.main.centerY)
			.createFromCache("profile-ui");

		this.uiRoot.setOrigin(0.5, 0.5);
		this.uiRoot.setDepth(1000);

		const el = this.uiRoot.node as HTMLDivElement;

		const profileName = el.querySelector<HTMLDivElement>("#profileName")!;
		const status = el.querySelector<HTMLDivElement>("#profileStatus")!;
		const highestScore = el.querySelector<HTMLDivElement>("#highestScore")!;
		const highestRound = el.querySelector<HTMLDivElement>("#highestRound")!;
		const totalScore = el.querySelector<HTMLDivElement>("#totalScore")!;
		const totalKills = el.querySelector<HTMLDivElement>("#totalKills")!;
		const totalPowerUps = el.querySelector<HTMLDivElement>("#totalPowerUps")!;
		const totalTimePlayed = el.querySelector<HTMLDivElement>("#totalTimePlayed")!;
		const gamesPlayed = el.querySelector<HTMLDivElement>("#gamesPlayed")!;
		const backBtn = el.querySelector<HTMLButtonElement>("#backToHub")!;

		const displayName = auth.user.displayName ?? auth.user.email ?? "Unknown";
		profileName.innerText = `${displayName}'s Profile`;

		backBtn.onclick = () => {
			this.uiRoot?.destroy();
			this.uiRoot = undefined;
			this.scene.start("hub");
		};

		status.innerText = "Loading stats...";

		try {
			const res = await fetch(`${getApiBaseUrl()}/auth/me/stats`, {
				method: "GET",
				credentials: "include",
			});

			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}

			const data: ProfileStatsResponse = await res.json();
            const stats = data.stats;

            highestScore.innerText = String(stats.highestScore ?? 0);
            highestRound.innerText = String(stats.highestRoundSurvived ?? 0);
            totalScore.innerText = String(stats.totalScore ?? 0);
            totalKills.innerText = String(stats.totalKills ?? 0);
            totalPowerUps.innerText = String(stats.totalPowerupsCollected ?? 0);
            totalTimePlayed.innerText = formatDuration(
                Number(stats.totalTimePlayedSeconds ?? 0)
            );
            gamesPlayed.innerText = String(stats.gamesPlayed ?? 0);

			status.innerText = "";
		} catch (err) {
			console.error(err);
			status.innerText = "Failed to load profile stats.";
		}
	}

	shutdown() {
		this.uiRoot?.destroy();
		this.uiRoot = undefined;
	}
}
