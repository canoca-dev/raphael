# Raphael

Kişisel League of Legends yardımcısı (Windows). Porofessor benzeri:

- **Şampiyon seçimi:** Kendi rankın, seçtiğin şampiyondaki ustalığın, son maçların; grubundaki arkadaşların bilgisi; iki takımın seçimleri ve yasaklar.
- **Yükleme ekranı:** 10 oyuncunun hepsi için rank, sezon kazanma oranı, son maçlar, o şampiyondaki ustalık ve kısa etiketler ("Main", "Son 3 maçını kaybetti", "Bu şampiyonu hiç oynamamış" gibi).
- **Oyun içi:** Ana pencerede iki takımın tablosu; oyunun üstünde duran küçük pencerede süre, skor, eşya altını farkı, ejderha/baron sayacı, rakiplerin rankı ve ölüm sayaçları.

Yalnızca Riot'un açtığı API'leri **okur**: LoL client'ının yerel API'si (LCU), oyunun Live Client Data API'si (127.0.0.1:2999) ve Riot Games API. Oyuna müdahale etmez, bellek okumaz.

## Kurulum

1. [Releases](https://github.com/canoca-dev/raphael/releases/latest) sayfasından **Raphael-Kurulum-x.y.z.exe** dosyasını indir ve çalıştır. Yönetici izni istemez, birkaç saniyede kurulur ve Raphael açılır.
   - Windows "Bilgisayarınız korundu" derse **Ek bilgi** > **Yine de çalıştır**'a bas. Uygulama imzalı olmadığı için bu uyarı ilk kurulumda bir kez çıkar.
2. Raphael ilk açılışta **Ayarlar**'ı açar. Riot API anahtarını buraya yapıştırıp **Kaydet**'e bas (ya da anahtarı kopyalayıp **Panodan yapıştır**). Raphael anahtarı Riot'a sorarak dener; çalışıyorsa yeşil **Çalışıyor** yazar.
3. Bitti. Bundan sonra:
   - Windows açılınca Raphael arka planda başlar (saatin yanındaki simge). Şampiyon seçimi başlayınca pencere kendiliğinden öne gelir.
   - Pencereyi kapatınca arka planda çalışmaya devam eder. Tamamen kapatmak için simgeye sağ tıklayıp **Çıkış**.
   - Yeni sürümler kendiliğinden iner; üstte **Yeniden başlat ve kur** çıkınca basman yeter.

Anahtar olmadan da açılır, ama yalnızca şampiyonlar ve isimler görünür.

## Riot API anahtarı

- **Günlük anahtar (Development):** developer.riotgames.com'a girince verilir, 24 saatte bir geçersiz olur ve yalnızca Riot sitesinde yenilenir (Raphael bunu senin yerine yapamaz). Süresi dolunca Raphael bildirim gösterir. Yenilemek için uygulamadaki **Riot sitesini aç**'a bas, **Regenerate API Key**'e bas, anahtarın yanındaki kopyala düğmesine tıkla ve Raphael'e dön: panodaki yeni anahtarı kendisi alır.
- **Kalıcı anahtar (Personal API Key):** Süresi dolmaz, her gün yenileme derdini bitirir. Başvuru:
  1. developer.riotgames.com'a Riot hesabınla giriş yap.
  2. Ana sayfadaki **Register Product** düğmesine bas, **Personal API Key**'i seç.
  3. Ürün adına `Raphael` yaz. Riot ayrıntılı açıklama istiyor; aşağıdaki metni açıklama alanına yapıştır (aynı metin uygulamada **Ayarlar** > **Kalıcı anahtar** altında **Metni kopyala** ile de alınabilir). Adres sorarsa: https://github.com/canoca-dev/raphael
  4. Kuralları kabul edip gönder. Riot inceler, sonuç sitedeki mesajlarına gelir (süre belirtilmiyor).
  5. Onaylanınca anahtar ürününün sayfasında görünür. Kopyala; Raphael panodan alır ya da **Ayarlar**'a yapıştırırsın.

Sınırlar (iki anahtar için de): saniyede 20, iki dakikada 100 istek. Uygulama bu sınırın altında kalır; bitmiş maçları `%APPDATA%\raphael\match-cache.json` içinde saklayarak istekleri azaltır.

Anahtar yalnızca bu bilgisayarda, `%APPDATA%\raphael\settings.json` içinde Windows'un kullanıcıya özel şifrelemesiyle (DPAPI) saklanır. Kurulum dosyasında ya da kodda anahtar yoktur (Riot kuralı: "Do not include your API key in your code, especially if you plan on distributing a binary").

<details>
<summary>Personal API Key başvuru metni</summary>

```
Raphael is a personal, non-commercial desktop helper for League of Legends. Only I use it; it is not distributed and has no public users. It runs locally on my Windows PC and the API key is stored only on my computer (never in the source code).
During champion select it shows my own stats (and my premade's), and from the loading screen on it shows the rank, recent matches and champion mastery of the players in my game.
League Client (LCU) endpoints read: /lol-gameflow/v1/gameflow-phase, /lol-gameflow/v1/session, /lol-champ-select/v1/session, /lol-lobby/v2/lobby, /lol-summoner/v1/current-summoner, /lol-summoner/v2/summoners/puuid/{puuid}. Live Client Data API: /liveclientdata/allgamedata.
Riot API endpoints: account-v1 (by-riot-id), league-v4 (entries by-puuid), champion-mastery-v4 (by-puuid, by-champion), match-v5 (match ids by-puuid, match details), spectator-v5 (active game by puuid), lol-status-v4 (platform data, to check that the key works).
It respects champion select anonymity (no names or stats of anonymized players), shows no cooldown timers and does not dictate player decisions.
Source code: https://github.com/canoca-dev/raphael
```
</details>

## Kullanım

- LoL client'ı açıkken uygulama kendiliğinden bağlanır (sol üstte yeşil nokta).
- **Ctrl + Z:** oyun içi pencereyi aç/kapat. Kısayol yalnızca oyun sırasında etkindir; oyun dışında Ctrl + Z diğer programlarda geri alma olarak çalışmaya devam eder. **Ayarlar**'dan değiştirilebilir.
- **Ctrl + Shift + F11:** oyun içi pencereyi taşıma modu (ya da **Ayarlar** > **Pencerenin yerini değiştir**). Sürükle, bitince tekrar bas; konum saklanır.
- Oyun içi pencerenin oyunun üstünde görünmesi için oyun ayarlarında Görüntü > Pencere modu = **Kenarlıksız** seçilmeli. Tam ekranda görünmez.

## Riot kuralları (neden bazı şeyler görünmüyor?)

- **Dereceli seçim ekranında anonimlik:** Riot, Tek/Çift (ve güvenli tarafta kalmak için Esnek) seçim ekranında diğer oyuncuların ismini ve istatistiğini göstermeyi uygulamalara yasaklıyor. Burada yalnızca sen ve grubundaki arkadaşların görünür; diğerleri "Takım arkadaşı N" olur ve hiçbir verisi çekilmez. İsimler yükleme ekranında açılır, analiz orada yapılır. Normal oyunlarda client'ın gösterdiği takım arkadaşları seçim ekranında da görünür.
- **Oyun içinde yasak olanlar:** rakibin yetenek, büyü ya da ulti bekleme süresini takip etmek; "şimdi git gank at" gibi karar dikte eden bildirimler; güç sıçraması bildirimleri. Bu uygulama bunları yapmaz.

## Sorun giderme

- **Ayarlar** > **Günlüğü aç** `%APPDATA%\raphael\raphael.log` dosyasını açar. Bir şey çalışmazsa önce buna bak.
- Üstte "Riot API anahtarının süresi dolmuş" yazıyorsa: **Riot sitesini aç** > **Regenerate API Key** > kopyala, Raphael'e dön.
- Oyun içi pencere Ctrl + Z ile açılmıyorsa: oyun **Kenarlıksız** modda mı? Başka bir program aynı kısayolu kullanıyorsa Raphael üstte uyarır; **Ayarlar**'dan başka bir tuş seç.
- Client bulunamıyorsa: LoL standart dışı bir klasördeyse Raphael bir kez PowerShell ile bulur ve klasörü hatırlar; bulamazsa client'ı yeniden başlat.

## Geliştirme

Kaynaktan çalıştırmak için [Node.js](https://nodejs.org) 22.12+ ve [Git](https://git-scm.com) gerekir:

```
git clone https://github.com/canoca-dev/raphael.git
cd raphael
npm install
npm start
```

Geliştirirken anahtar istenirse proje klasöründeki `.env` dosyasına da yazılabilir (`copy .env.example .env`); **Ayarlar**'a girilen anahtar önceliklidir.

```
npm test              # birim testleri
npm run typecheck     # tip kontrolü
npm run build && npm run e2e   # gerçek uygulamayı sahte client, oyun ve Riot API ile uçtan uca dener (Linux'ta: xvfb-run -a npm run e2e)
npm run preview:mock  # arayüzü tarayıcıda örnek veriyle aç (?mock=champ | loading | live | idle | nokey | expired, &overlay=1, &view=settings)
npm run dist          # Windows kurulum dosyası (Windows'ta), çıktı: release/
```

**Yeni sürüm yayınlamak:** `package.json` içindeki `version`'ı artır, main'e birleştir, `v` ile başlayan etiketi gönder (ör. `git tag v0.3.0 && git push origin v0.3.0`). GitHub Actions Windows'ta test edip kurulum dosyasını Releases'a koyar; kurulu uygulamalar otomatik günceller. Her PR'da da aynı testler Windows'ta çalışır ve kurulum dosyası Actions sayfasından indirilebilir.

| Klasör | İçerik |
| --- | --- |
| `src/main/engine.ts` | Uygulamanın beyni: client, oyun ve Riot API'yi okur, arayüze gidecek durumu üretir |
| `src/main/champselect.ts` | Seçim ekranı ve anonimlik kuralı |
| `src/main/game.ts`, `live.ts` | Yükleme ekranı ve oyun içi veriler |
| `src/main/riot.ts`, `stats.ts` | Riot API istemcisi, hız sınırı, istatistik ve etiketler |
| `src/main/main.ts` | Electron pencereleri, sistem tepsisi, kısayollar, anahtar ve güncelleme |
| `src/main/settings.ts` | Ayarlar ve şifreli anahtar saklama |
| `src/renderer` | React arayüzü |

### Bilinen sınırlar ve tahminler

- Seçim ekranı alan adları (`nameVisibilityType` gibi) gerçek client'ta doğrulanmadı; sahte client ile test edildi. Belirsiz durumda uygulama gizli kabul eder.
- Ejderha (5:00, sonra 5 dk), Baron (20:00, sonra 6 dk) ve Kadim Ejderha (6 dk) zamanları 2026 sezonuna göre; değişirse `src/main/live.ts` içindeki `OBJECTIVE_RULES`.
- Başkalarının son 5 maçına, senin son 10 maçına bakılır (API sınırı yüzünden).
- Kurulum dosyası imzalı değil; Windows ilk kurulumda uyarı gösterir. Güncellemeler uyarısız iner.

---

Raphael isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
