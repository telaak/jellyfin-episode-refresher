import { Jellyfin } from "@jellyfin/sdk";
import { ItemRefreshApiRefreshItemRequest } from "@jellyfin/sdk/lib/generated-client/api/item-refresh-api";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  getItemsApi,
  getItemRefreshApi,
} from "@jellyfin/sdk/lib/utils/api/index.js";
import { CronJob } from "cron";
import dayjs from "dayjs";
import "dotenv/config";

const jellyfin = new Jellyfin({
  clientInfo: {
    name: "Episode Refresher",
    version: "1.0.0",
  },
  deviceInfo: {
    name: "Episode Refresher",
    id: "episode-refresher-docker",
  },
});

const SERVER_URL = process.env.SERVER_URL as string;
const API_KEY = process.env.API_KEY as string;
const DAYS = Number(process.env.DAYS) || 7;
const CRON = process.env.CRON || "0 */2 * * * *";

const jellyfinApi = jellyfin.createApi(SERVER_URL, API_KEY);
const itemsApi = getItemsApi(jellyfinApi);
const refreshApi = getItemRefreshApi(jellyfinApi);

function isPlaceholderTitle(episode: BaseItemDto): boolean {
  const title = episode.Name;
  const seriesName = episode.SeriesName;

  if (!title || title.trim() === "") return true;

  const t = title.trim().toLowerCase();
  const s = (seriesName || "").trim().toLowerCase();

  // 1. TBA variations
  const tbaPatterns = [
    /^t\.?b\.?a\.?$/, // TBA, T.B.A, tba
    /^to be announced$/, // "to be announced"
    /^to be confirmed$/, // "to be confirmed"
    /^tbd$/, // "TBD"
  ];
  if (tbaPatterns.some((p) => p.test(t))) return true;

  // 2. S01E01, 1x01, E01 patterns
  const epCodePattern =
    /^(s?\d{1,2}e\d{1,2}|[1-9]\d?x\d{1,2}|e\d{1,2}|episode \d{1,3})$/;
  if (epCodePattern.test(t)) return true;

  // 3. Title equals the series name
  //if (s && t.includes(s)) return true;

  // 4. Just numbers
  if (/^\d+$/.test(t)) return true;

  return false;
}

function dateNDaysAgo(days: number): string {
  const now = dayjs();
  const before = now.subtract(days, "days");
  return before.toISOString();
}

function padSeasonOrEpisode(index: number | string) {
  return index.toString().padStart(2, "0");
}

async function shouldRefreshEpisode(ep: BaseItemDto): Promise<Boolean> {
  const isMissingTitle = isPlaceholderTitle(ep);

  if (isMissingTitle) {
    if (!ep.Overview) {
      return true;
    }

    const seasonItems = await itemsApi.getItems({
      parentId: ep.ParentId!,
      includeItemTypes: ["Episode"],
      fields: ["Overview"],
      sortBy: ["IndexNumber"],
      sortOrder: ["Descending"],
      recursive: false,
      limit: 5,
    });

    const previousEpisodes = seasonItems.data.Items || [];

    if (previousEpisodes.length <= 1) return true;

    const isPreviousPlaceHolderTitles =
      previousEpisodes.every(isPlaceholderTitle);

    return !isPreviousPlaceHolderTitles;
  }

  return ep.Overview ? false : true;
}

async function refreshEpisodes() {
  console.log(`Scanning for episodes in last ${DAYS} days…`);

  const response = await itemsApi.getItems({
    includeItemTypes: ["Episode"],
    minPremiereDate: dateNDaysAgo(DAYS),
    fields: ["OriginalTitle", "Overview", "ParentId"],
    recursive: true,
  });

  const episodes = response.data.Items ?? [];
  console.log(`Found ${episodes.length} episodes.`);

  for (const episode of episodes) {
    try {
      const shouldRefresh = await shouldRefreshEpisode(episode);

      if (shouldRefresh) {
        const id = episode.Id!;
        const seriesName = episode.SeriesName ?? "Unknown Series";
        const title = episode.Name ?? "Unknown Title";
        const seasonNumber = episode.ParentIndexNumber ?? "??";
        const episodeNumber = episode.IndexNumber ?? "??";

        const merged = `${seriesName}: S${padSeasonOrEpisode(
          seasonNumber
        )}E${padSeasonOrEpisode(episodeNumber)} - ${title}`;
        console.log(`refreshing ${merged}`);

        await refreshApi.refreshItem({
          itemId: id,
          replaceAllMetadata: true,
          metadataRefreshMode: "FullRefresh",
        });
      }
    } catch (error) {
      console.error(error);
    }
  }

  console.log("Done.");
}

const refreshJob = new CronJob(
  CRON, // cronTime
  async function () {
    try {
      await refreshEpisodes();
    } catch (error) {
      console.error(error);
    }
  }, // onTick
  null, // onComplete
  true, // start
  "Europe/Helsinki" // timeZone
);

console.log(`Running cronjob ${CRON}`);
