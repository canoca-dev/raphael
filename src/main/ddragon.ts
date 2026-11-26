// Data Dragon: Riot'un şampiyon/eşya adları ve görselleri için herkese açık CDN'i.

export interface ChampionInfo {
  id: number;
  key: string; // görsel dosya adı, ör. "MonkeyKing"
  name: string; // Türkçe görünen ad
}

// Testlerde sahte sunucuya yönlendirmek için RAPHAEL_DDRAGON_BASE_URL kullanılabilir.
const CDN = process.env.RAPHAEL_DDRAGON_BASE_URL || 'https://ddragon.leagueoflegends.com';

export class DDragon {
  version?: string;
  private byId = new Map<number, ChampionInfo>();
  private byKey = new Map<string, ChampionInfo>();
  private byName = new Map<string, ChampionInfo>();
  private itemGold = new Map<number, number>();

  get loaded() {
    return !!this.version;
  }

  async load(locale = 'tr_TR', fetchImpl: typeof fetch = fetch): Promise<void> {
    const getJson = async <T>(url: string) => {
      const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Data Dragon ${res.status}`);
      return (await res.json()) as T;
    };
    const versions = await getJson<string[]>(`${CDN}/api/versions.json`);
    const version = versions[0];
    const [champs, items] = await Promise.all([
      getJson<{ data: Record<string, { key: string; id: string; name: string }> }>(
        `${CDN}/cdn/${version}/data/${locale}/champion.json`,
      ),
      getJson<{ data: Record<string, { gold?: { total?: number } }> }>(`${CDN}/cdn/${version}/data/${locale}/item.json`),
    ]);
    this.setData(
      version,
      Object.values(champs.data).map((c) => ({ id: Number(c.key), key: c.id, name: c.name })),
      Object.entries(items.data).map(([id, it]) => [Number(id), it.gold?.total ?? 0]),
    );
  }

  setData(version: string, champions: ChampionInfo[], itemGold: [number, number][] = []) {
    this.version = version;
    for (const c of champions) {
      this.byId.set(c.id, c);
      this.byKey.set(c.key.toLowerCase(), c);
      this.byName.set(c.name.toLowerCase(), c);
    }
    for (const [id, gold] of itemGold) this.itemGold.set(id, gold);
  }

  champion(id: number | undefined): ChampionInfo | undefined {
    return id ? this.byId.get(id) : undefined;
  }

  /** Live Client Data'daki rawChampionName ("game_character_displayname_MonkeyKing") veya ad ile bulur. */
  championFromLive(rawChampionName: string | undefined, championName: string | undefined): ChampionInfo | undefined {
    const raw = rawChampionName?.replace(/^game_character_displayname_/, '').toLowerCase();
    const name = championName?.toLowerCase();
    return (raw && this.byKey.get(raw)) || (name && (this.byName.get(name) || this.byKey.get(name))) || undefined;
  }

  /** Eşyanın toplam maliyeti (Data Dragon). Bilinmiyorsa undefined. */
  itemTotalGold(itemId: number): number | undefined {
    return this.itemGold.get(itemId);
  }
}
