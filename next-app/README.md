# Royal Velvet Club — Online Blackjack & Pişti (Next.js)

C# ASP.NET Core MVC projesinin **Next.js 15 (App Router) + TypeScript + Tailwind CSS** ile yeniden yazılmış, gerçek zamanlı **Online Multiplayer** ve **Vercel** uyumlu sürümüdür.

## Özellikler
- **Tek Oyunculu Blackjack:** Hit, Stand, Double Down (2x), Split (El Bölme), 3:2 Blackjack ödemesi.
- **Tek Oyunculu Pişti:** Akıllı kurpiyer botu, Altın Vale (`J`) ve Gümüş Puan Kartları (`♦10`, `♣2`, `A`), Pişti (`+10`) ve Çift Vale (`+20`) bonusları.
- **Online Multiplayer Odalar:**
  - **1v1 Canlı Pişti Düellosu:** Oda kurup 6 haneli davet koduyla arkadaşınızla karşılıklı gerçek zamanlı Pişti oynayın.
  - **4 Kişilik Ortak Blackjack Masası:** Arkadaşlarınızla aynı masada kurpiyere karşı sırayla hamle yapın.
  - **Tek Bilgisayarda Test Kolaylığı:** Oda içindeki **"2. Sekmede Rakip Aç (Test)"** butonuyla yeni sekmede ayrı bir misafir profiliyle anında karşılıklı test edebilirsiniz.
- **Canlı Liderlik Tablosu & Oyun Geçmişi:** Anlık çip sıralaması, kazanma/kaybetme istatistikleri ve `+500 Bonus Çip` desteği.

## Yerelde Çalıştırma

```bash
cd next-app
npm install
npm run dev
```

Tarayıcıda `http://localhost:3000` adresini açın.

## Vercel'e Deploy Etme
1. Projeyi GitHub'a pushlayın.
2. Vercel'de **New Project** diyerek repoyu seçin.
3. **Root Directory** ayarını `next-app` olarak seçin ve **Deploy** butonuna basın (herhangi bir veritabanı veya ortam değişkeni kurulumu gerektirmez).

