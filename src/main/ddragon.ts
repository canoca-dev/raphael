// Data Dragon: Riot'un şampiyon adları ve görselleri için herkese açık CDN'i.

export interface ChampionInfo {
  id: number;
  key: string; // görsel dosya adı, ör. "MonkeyKing"
  name: string; // Türkçe görünen ad
}

export class DDragon {
  version?: string;
  private byId = new Map<number, ChampionInfo>();
  private byKey = new Map<string, ChampionInfo>();
  private byName = new Map<string, ChampionInfo>();

  async load(locale = 'tr_TR'): Promise<void> {
    const versions = (await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()) as string[];
    const version = versions[0];
    const data = (await (
      await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${locale}/champion.json`)
    ).json()) as { data: Record<string, { key: string; id: string; name: string }> };
    this.setChampions(
      Object.values(data.data).map((c) => ({ id: Number(c.key), key: c.id, name: c.name })),
      version,
    );
  }

  setChampions(list: ChampionInfo[], version: string) {
    this.version = version;
    for (const c of list) {
      this.byId.set(c.id, c);
      this.byKey.set(c.key.toLowerCase(), c);
      this.byName.set(c.name.toLowerCase(), c);
    }
  }

  champion(id: number): ChampionInfo | undefined {
    return this.byId.get(id);
  }

  /** Live Client Data'daki rawChampionName ("game_character_displayname_MonkeyKing") veya ad ile bulur. */
  championFromLive(rawChampionName: string | undefined, championName: string): ChampionInfo | undefined {
    const raw = rawChampionName?.replace(/^game_character_displayname_/, '').toLowerCase();
    return (raw && this.byKey.get(raw)) || this.byName.get(championName.toLowerCase()) || this.byKey.get(championName.toLowerCase());
  }
}
