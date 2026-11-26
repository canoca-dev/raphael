# Raphael

Kişisel League of Legends yardımcısı. Şampiyon seçiminde takım arkadaşlarının rank, son maç, ustalık ve şampiyon kazanma bilgisini; oyun sırasında da her zaman üstte duran küçük bir pencerede skor, eşya altını farkı, ejderha/baron zamanlayıcısı ve rakiplerin rankını gösterir.

Yalnızca Riot'un resmi olarak açtığı API'leri **okur**: LoL client'ının yerel API'si (LCU), oyunun Live Client Data API'si (127.0.0.1:2999) ve Riot Games API. Oyuna müdahale etmez, bellek okumaz.

## Kurulum (Windows)

1. [Node.js](https://nodejs.org) LTS sürümünü kur.
2. Repoyu indir ve klasörde bağımlılıkları kur:
   ```
   git clone https://github.com/canoca-dev/raphael.git
   cd raphael
   npm install
   ```
3. `.env.example` dosyasını `.env` adıyla kopyala, içine Riot API anahtarını yaz:
   ```
   copy .env.example .env
   notepad .env
   ```
   Anahtarı https://developer.riotgames.com adresinden LoL hesabınla giriş yapıp alırsın. Development key 24 saatte bir geçersiz olur; yenisini alınca `.env`'e yazıp uygulamada **Anahtarı yenile** butonuna basman yeter.
4. Çalıştır:
   ```
   npm start
   ```

Anahtar olmadan da açılır, ama yalnızca seçilen şampiyonlar ve isimler görünür.

## Kullanım

- LoL client'ı açıkken uygulama kendiliğinden bağlanır (sol üstte yeşil nokta).
- Şampiyon seçiminde takımın kartlar halinde görünür. Rakiplerin isimleri Riot tarafından gizlendiği için onların bilgisi oyun başlayınca gelir.
- Oyun başlayınca sağ üstte küçük bir pencere çıkar. **Ctrl + Shift + R** ile açıp kapatırsın.
- Pencerenin oyunun üstünde görünmesi için oyun ayarlarında Görüntü > Pencere modu = **Kenarlıksız** seç.

## Geliştirme

```
npm test            # birim testleri
npm run typecheck   # tip kontrolü
npm run preview:mock  # arayüzü tarayıcıda örnek veriyle aç (?mock=champ, ?mock=live, &overlay=1)
```

| Klasör | İçerik |
| --- | --- |
| `src/main` | Electron ana süreci: LCU, Live Client, Riot API, önbellek |
| `src/renderer` | React arayüzü |
| `src/shared` | İki taraf arasındaki tipler |

## Bilinen sınırlar ve tahminler

- Dereceli seçim ekranında Riot bazı takım arkadaşlarını gizleyebiliyor. O zaman kart "Gizli oyuncu" der, bilgi oyun başlayınca gelir.
- "Bu şampiyon" kazanma oranı yalnızca son 5 maça bakar (API sınırını korumak için).
- Ejderha ve baron zamanları yamaya göre değişebilir; `src/main/live.ts` içindeki `OBJECTIVE_RULES` ile ayarlanır.
- Eşya altını, Live Client Data'daki eşya fiyatlarının toplamıdır; gerçek altın değil.
