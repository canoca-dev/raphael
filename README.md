# Raphael

Kişisel League of Legends yardımcısı (Windows). Porofessor benzeri:

- **Şampiyon seçimi:** Kendi rankın, seçtiğin şampiyondaki ustalığın, son maçların; grubundaki arkadaşların bilgisi; iki takımın seçimleri ve yasaklar.
- **Yükleme ekranı:** 10 oyuncunun hepsi için rank, sezon kazanma oranı, son maçlar, o şampiyondaki ustalık ve kısa etiketler ("Main", "Son 3 maçını kaybetti", "Bu şampiyonu hiç oynamamış" gibi).
- **Oyun içi:** Ana pencerede iki takımın tablosu; oyunun üstünde duran küçük pencerede süre, skor, eşya altını farkı, ejderha/baron sayacı, rakiplerin rankı ve ölüm sayaçları.

Yalnızca Riot'un açtığı API'leri **okur**: LoL client'ının yerel API'si (LCU), oyunun Live Client Data API'si (127.0.0.1:2999) ve Riot Games API. Oyuna müdahale etmez, bellek okumaz.

## Kurulum

1. [Node.js](https://nodejs.org) LTS sürümünü (20.19 veya üstü) ve [Git](https://git-scm.com)'i kur.
2. Bir terminal aç (Başlat > "Terminal" ya da "cmd") ve projeyi indir:
   ```
   cd %USERPROFILE%
   git clone https://github.com/canoca-dev/raphael.git
   cd raphael
   npm install
   ```
3. Riot API anahtarını yaz. Anahtar yalnızca senin bilgisayarındaki `.env` dosyasında durur, GitHub'a gitmez:
   ```
   copy .env.example .env
   notepad .env
   ```
   `RIOT_API_KEY=` satırına anahtarını yapıştır (`RGAPI-` ile başlar) ve kaydet.
4. Çalıştır:
   ```
   npm start
   ```

Sonraki seferlerde `raphael` klasöründe yalnızca `npm start` yeterli. Güncelleme için `git pull` ve `npm install`.

Anahtar olmadan da açılır, ama yalnızca şampiyonlar ve isimler görünür.

## Riot API anahtarı

- **Günlük anahtar (Development):** developer.riotgames.com'a girince verilir, 24 saatte bir geçersiz olur. Süresi dolunca uygulama üstte uyarır; sitede "Regenerate API Key"e bas, yeni anahtarı `.env`'e yaz, uygulamada **Anahtarı yenile**'ye bas.
- **Kalıcı anahtar (Personal API Key):** Sitede "Register Product" > "Personal API Key" ile başvurulur. Onaylanınca süresi dolmayan bir anahtar verilir; aynı satıra yazılır. Başvuru açıklaması için örnek metin aşağıda.

Sınırlar (iki anahtar için de): saniyede 20, iki dakikada 100 istek. Uygulama bu sınırın altında kalır; bitmiş maçları `%APPDATA%\raphael\match-cache.json` içinde saklayarak istekleri azaltır.

<details>
<summary>Personal API Key başvuru metni</summary>

```
Raphael is a personal, non-commercial desktop helper for League of Legends. Only I use it; it is not distributed and has no public users. It runs locally on my Windows PC.
During champion select it shows my own stats (and my premade's), and from the loading screen on it shows the rank, recent matches and champion mastery of the players in my game.
League Client (LCU) endpoints read: /lol-gameflow/v1/gameflow-phase, /lol-gameflow/v1/session, /lol-champ-select/v1/session, /lol-lobby/v2/lobby, /lol-summoner/v1/current-summoner, /lol-summoner/v2/summoners/puuid/{puuid}. Live Client Data API: /liveclientdata/allgamedata.
Riot API endpoints: account-v1 (by-riot-id), league-v4 (entries by-puuid), champion-mastery-v4 (by-puuid, by-champion), match-v5 (match ids by-puuid, match details), spectator-v5 (active game by puuid).
It respects champion select anonymity (no names or stats of anonymized players), shows no cooldown timers and does not dictate player decisions.
Source code: https://github.com/canoca-dev/raphael
```
</details>

## Kullanım

- LoL client'ı açıkken uygulama kendiliğinden bağlanır (sol üstte yeşil nokta).
- **Ctrl + Shift + F10:** oyun içi pencereyi aç/kapat (`.env` içinde `OVERLAY_HOTKEY` ile değiştirilebilir).
- **Ctrl + Shift + F11:** oyun içi pencereyi taşıma modu. Sürükle, bitince tekrar bas; konum saklanır.
- Oyun içi pencerenin oyunun üstünde görünmesi için oyun ayarlarında Görüntü > Pencere modu = **Kenarlıksız** seçilmeli. Tam ekranda görünmez.

## Riot kuralları (neden bazı şeyler görünmüyor?)

- **Dereceli seçim ekranında anonimlik:** Riot, Tek/Çift (ve güvenli tarafta kalmak için Esnek) seçim ekranında diğer oyuncuların ismini ve istatistiğini göstermeyi uygulamalara yasaklıyor. Burada yalnızca sen ve grubundaki arkadaşların görünür; diğerleri "Takım arkadaşı N" olur ve hiçbir verisi çekilmez. İsimler yükleme ekranında açılır, analiz orada yapılır. Normal oyunlarda client'ın gösterdiği takım arkadaşları seçim ekranında da görünür.
- **Oyun içinde yasak olanlar:** rakibin yetenek, büyü ya da ulti bekleme süresini takip etmek; "şimdi git gank at" gibi karar dikte eden bildirimler; güç sıçraması bildirimleri. Bu uygulama bunları yapmaz.

## Sorun giderme

- **Günlük** butonu `%APPDATA%\raphael\raphael.log` dosyasını açar. Bir şey çalışmazsa önce buna bak.
- Client bulunamıyorsa: LoL farklı bir klasördeyse `.env` içine `LOL_PATH=` yaz.
- `.env` içine `RAPHAEL_DEBUG=1` yazarsan client'tan gelen ham veriler `%APPDATA%\raphael\debug` klasörüne kaydedilir.

## Geliştirme

```
npm test              # birim testleri
npm run typecheck     # tip kontrolü
npm run build && npm run e2e   # gerçek uygulamayı sahte client, oyun ve Riot API ile uçtan uca dener
npm run preview:mock  # arayüzü tarayıcıda örnek veriyle aç (?mock=champ | loading | live | idle, &overlay=1)
```

| Klasör | İçerik |
| --- | --- |
| `src/main/engine.ts` | Uygulamanın beyni: client, oyun ve Riot API'yi okur, arayüze gidecek durumu üretir |
| `src/main/champselect.ts` | Seçim ekranı ve anonimlik kuralı |
| `src/main/game.ts`, `live.ts` | Yükleme ekranı ve oyun içi veriler |
| `src/main/riot.ts`, `stats.ts` | Riot API istemcisi, hız sınırı, istatistik ve etiketler |
| `src/main/main.ts` | Electron pencereleri ve kısayollar |
| `src/renderer` | React arayüzü |

### Bilinen sınırlar ve tahminler

- Seçim ekranı alan adları (`nameVisibilityType` gibi) gerçek client'ta doğrulanmadı; sahte client ile test edildi. Belirsiz durumda uygulama gizli kabul eder.
- Ejderha (5:00, sonra 5 dk), Baron (20:00, sonra 6 dk) ve Kadim Ejderha (6 dk) zamanları 2026 sezonuna göre; değişirse `src/main/live.ts` içindeki `OBJECTIVE_RULES`.
- Başkalarının son 5 maçına, senin son 10 maçına bakılır (API sınırı yüzünden).

---

Raphael isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
