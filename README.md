# Jellyfin Episode Refresher

Service for automatically updating placeholder episode names and missing descriptions. I made this to cope with some of my metadata woes after 10.11, still very much work in progress.

## How it works

At your cron interval (default every 2 hours), it queries episodes from the last N days (default 7) and checks them for placeholder names and missing descriptions.

```TypeScript
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
```

It also checks whether previous episodes of the same series just use generic names to avoid querying your metadata provider over and over.

## How to use

Either clone this repository and run src/index.ts with tsx/equivalent or use the provided Docker image.

### Environmental variables

Generate the following environmental variables
```
1. SERVER_URL=  //URL to your jellyfin installation
2. API_KEY=     // generate from jellyfin -> dashboard -> API keys
3. DAYS=        // amount of days to search back, default 7 days
4. CRON=        // cron, how often the service runs, default 0 */2 * * *
```

### Docker

```yaml
services:
  jellyfin-episode-refresher:
    image: ghcr.io/telaak/jellyfin-episode-refresher
    container_name: jellyfin-episode-refresher
    environment:
      SERVER_URL: ""
      API_KEY: ""
      DAYS: 7
      CRON: "0 */2 * * * *"
    restart: unless-stopped
```

