// Riot ile ilgili sabit metinler (arayüz ve README aynı metni kullanır).

export const RIOT_PORTAL_URL = 'https://developer.riotgames.com/';

/** Personal API Key başvuru formundaki açıklama alanına yapıştırılacak metin. */
export const PERSONAL_KEY_DESCRIPTION = `Raphael is a personal, non-commercial desktop helper for League of Legends, used only by me. It runs locally on my Windows PC. The source code is public on GitHub and my PC installs updates from there, but the app is not promoted and has no other users. The API key is stored only on my computer, never in the source code or the installer.
During champion select it shows my own stats (and my premade's), and from the loading screen on it shows the rank, recent matches and champion mastery of the players in my game.
Raphael also runs a rate-limited background job that collects public ranked match data (match-v5) from all regions and computes aggregate champion statistics locally, for my own personal research only. Results are never published or shared.
League Client (LCU) endpoints read: /lol-gameflow/v1/gameflow-phase, /lol-gameflow/v1/session, /lol-champ-select/v1/session, /lol-lobby/v2/lobby, /lol-summoner/v1/current-summoner, /lol-summoner/v2/summoners/puuid/{puuid}. Live Client Data API: /liveclientdata/allgamedata.
Riot API endpoints: account-v1 (by-riot-id), league-v4 (entries by-puuid; challenger, grandmaster and master leagues and entries by tier for the research job), champion-mastery-v4 (by-puuid, by-champion), match-v5 (match ids by-puuid, match details, match timelines), spectator-v5 (active game by puuid), lol-status-v4 (platform data, to check that the key works).
It respects champion select anonymity (no names or stats of anonymized players), shows no cooldown timers and does not dictate player decisions.
Source code: https://github.com/canoca-dev/raphael`;

export const RIOT_LEGAL =
  "Raphael isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.";
