# ⚓ Liman Yönetim Sistemi — Tam Web Sürümü (Faz 1-4 + Tamamlama)

Balıkçı barınakları ve liman kooperatifleri için eksiksiz hak sahibi, tekne, dam, **evrak takip**, **bildirim/duyuru**, **raporlama**, **toplu mesaj** ve **mobil (PWA)** sistemi.

## Bu fazda neler var

**Faz 1 — Çekirdek**
- **Rol bazlı kimlik doğrulama (JWT):** süper admin, liman yöneticisi, liman personeli, hak sahibi, vekil
- **Liman izolasyonu:** her liman yöneticisi/personeli yalnızca kendi limanının verisini görür ve yönetir
- **Liman yönetimi:** liman işletmesi/kooperatif tanımlama (yalnızca süper admin)
- **Hak sahibi yönetimi:** kayıt, arama, düzenleme, detay görünümü
- **Tekne kayıtları:** hak sahibine bağlı tekne ekleme (tip, boy, tonaj, bağlama kütüğü no vb.)
- **Dam/rıhtım yönetimi:** dam tanımı, hak sahibine atama, durum takibi (boş/dolu/bakımda)
- **Kullanıcı yönetimi:** sisteme yeni kullanıcı/yetki tanımlama
- **Genel bakış paneli** ve **mobil uyumlu** deniz temalı arayüz

**Faz 2 — Belge Motoru**
- **Belge tipi tanımı:** her liman kendi zorunlu/opsiyonel belge listesini oluşturur (kategori, geçerlilik süresi, kime ait: kişi/tekne/dam)
- **Belge yükleme:** PDF/JPG/PNG, sürükle-bırak destekli; geçerlilik bitiş tarihi otomatik hesaplanır
- **Belge yaşam döngüsü:** Yüklenmedi → İncelemede → Onaylı / Reddedildi → Süresi Yaklaşıyor → Süresi Doldu
- **İnceleme kuyruğu:** yönetici belgeleri onaylar veya gerekçeli reddeder
- **Uygunluk skoru:** her hak sahibi için canlı %0–100 evrak tamamlanma göstergesi
- **Hak sahibi self-servis ekranı:** "Belgelerim" ve "Profilim" — kendi evrakını yükler, durumunu takip eder

**Faz 3 — Bildirimler, Duyurular, Panel**
- **Duyurular:** süper admin tüm sisteme veya seçili limana, liman yöneticisi kendi limanına duyuru yayınlar; öncelik (normal/önemli/acil) ile
- **Bildirim zili:** okunmamış sayacı, açılır panel, tekil/toplu okundu işaretleme
- **Otomatik bildirim:** belge onaylandığında/reddedildiğinde ve yeni duyuru yayınlandığında hak sahibine bildirim düşer
- **Süre dolum taraması:** onaylı belgelerin geçerlilik tarihlerini tarar, süresi yaklaşan/dolan belgeler için bildirim üretir
- **Uygunluk paneli (trafik ışığı):** tüm hak sahiplerini 🟢 tam / 🟡 dikkat / 🔴 eksik olarak tek ekranda gösterir

**Faz 4 — Mobil (PWA / Progressive Web App)**
- **Ana ekrana eklenebilir:** telefonda tarayıcıda açıp "Ana ekrana ekle" denince uygulama gibi simgeyle, tam ekran açılır
- **Kurulum yönlendirmesi:** Android'de otomatik kurulum istemi, iOS'ta adım adım Safari talimatı
- **Kamera ile belge yükleme:** mobilde "Kamera ile çek" / "Dosyadan seç" seçenekleri
- **Çevrimdışı destek:** service worker ile arayüz dosyaları önbelleğe alınır (internet kesilse de uygulama açılır)
- **Native his:** özel uygulama simgesi, splash rengi, çentik (safe-area) uyumu

**Web Tamamlama — İleri Yönetim Özellikleri**
- **Raporlar:** uygunluk durumu ve eksik belgeler raporları — Excel (CSV) indirme ve yazdırılabilir/PDF HTML çıktı
- **Toplu mesaj:** hak sahiplerine SMS veya e-posta (tümüne ya da yalnızca eksik belgesi olanlara); gönderim geçmişi kaydı. *Şu an simülasyon modunda; gerçek gönderim için sağlayıcı (Netgsm/SMTP) bağlanır*
- **Otomatik süre taraması:** sunucu açıkken 12 saatte bir geçerliliği yaklaşan/dolan belgeleri tarar ve bildirim üretir
- **Koşullu belge kuralları:** bir belge yalnızca belirli tekne boyu aralığındaki hak sahiplerinden istenebilir (ör. telsiz yalnızca 12m+ teknede)
- **Tekne/dam başına belge:** "tekneye ait" belge tipleri kişinin her teknesi için ayrı ayrı istenir (2 teknesi varsa 2 bağlama ruhsatı); "dama ait" belgeler her dam için ayrı. Belge yüklenirken hangi tekne/dam için olduğu otomatik eşleşir ve ekranda tekne/dam adıyla gösterilir.
- **Kişiye özel belge kuralları:** bir hak sahibini belirli bir belgeden muaf tutabilir veya ona ekstra bir belge isteyebilirsiniz (genel listenin üstüne kişisel istisna). Hak sahibi detayındaki "Özel belge kuralları" bölümünden yönetilir.
- **Bağlama durumu (damı olmayanlar dahil):** her hak sahibi bir bağlama durumuna sahiptir — Dam sahibi, Geçici bağlama (dam tahsisi yok ama kayık bağlıyor), Sırada bekliyor (dam talebi var) veya Misafir tekne (başka limandan kısa süreli). Hak Sahipleri sayfasındaki sekmelerden duruma göre filtrelenir; sırada bekleyenler sıra tarihiyle, misafirler ayrılış tarihiyle takip edilir. Evrak takibi tüm durumlar için çalışır.
- **Tekne belge sınıfı:** her tekne profesyonel belgeli (ruhsatlı ticari balıkçılık) veya amatör belgeli (hobi) olarak işaretlenir. Tekne ekleme/düzenleme formunda seçilir, tekne listesi ve detayında rozetle gösterilir.
- **Vekil/temsilci rolü:** bir hak sahibi adına işlem yapan kişi (oğlu, muhasebecisi vb.) kendi girişiyle o kişinin belgelerini yönetir
- **Hak sahibine giriş hesabı oluşturma:** yönetici, hak sahibi detayından tek tıkla giriş hesabı oluşturur. Sistem kullanıcı adını (e-posta veya telefon) ve otomatik bir şifre üretir; yönetici bu bilgiyi hak sahibine iletir. Şifre sıfırlama ve hesabı pasifleştirme de aynı yerden yapılır.

### Sonradan eklenen hak sahibi sisteme nasıl girer?

1. Yönetici **Hak Sahipleri → ilgili kişi → Detay** açar
2. Alttaki **Giriş hesabı** bölümünde **"🔑 Giriş hesabı oluştur"** der
3. Çıkan kutudaki **kullanıcı adı + şifreyi** hak sahibine iletir (kopyala butonu vardır)
4. Hak sahibi bu bilgilerle giriş yapıp kendi belgelerini yükler

> Kullanıcı adı: hak sahibinin e-postası varsa o; yoksa telefonundan `5551112233@liman.local` biçiminde otomatik üretilir.

> Gerçek App Store / Play Store uygulaması (Flutter) sonraki opsiyonel adımdır. PWA çoğu kullanım için yeterlidir ve mağaza onayı/ücreti gerektirmez.

**Web Tamamlama — Raporlar, Mesajlar, Gelişmiş Kurallar**
- **Raporlar:** Uygunluk durumu ve eksik belgeler için Excel (CSV) indirme + yazdırılabilir/PDF HTML rapor
- **Toplu mesaj:** hak sahiplerine SMS/e-posta (tümüne veya yalnızca eksik belgesi olanlara); gönderim geçmişi tutulur. *Simülasyon modunda gelir; gerçek gönderim için Netgsm/SMTP gibi bir sağlayıcı bağlanır (kod altyapısı hazır)*
- **Otomatik süre taraması:** sunucu açıkken her 12 saatte bir çalışır, süresi dolan/yaklaşan belgeler için bildirim üretir (elle "Tara" da hâlâ var)
- **Koşullu belge kuralları:** bir belge tipi yalnızca belirli tekne boyu aralığında istenebilir (ör. "12m üzeri teknede telsiz ruhsatı"); uygunluk skoru bunu dikkate alır
- **Vekil/temsilci rolü:** bir hak sahibi adına işlem yapan kişi (oğlu, muhasebecisi); self-servis ekranlardan o kişinin belgelerini yükler/takip eder

### PWA nasıl kurulur (kullanıcı tarafı)

**iPhone/iPad (Safari):** Siteyi açın → alttaki **Paylaş** (⬆️) → **"Ana Ekrana Ekle"** → **Ekle**.
**Android (Chrome):** Siteyi açın → çıkan **"Ekle"** banner'ına dokunun (veya menü → "Uygulamayı yükle").

> PWA'nın çalışması için sitenin **HTTPS** üzerinden sunulması gerekir (localhost test için yeterli, ama gerçek telefonlardan erişim için sunucunun HTTPS'li bir adreste olması şarttır).

## Teknoloji

| Katman | Teknoloji |
|--------|-----------|
| Backend | Node.js + Express |
| Veritabanı | SQLite (Node yerleşik `node:sqlite`) |
| Kimlik doğrulama | JWT (`jsonwebtoken`) + `bcryptjs` |
| Dosya yükleme | `multer` |
| Frontend | Saf JavaScript (tek sayfa uygulama), CSS |

Ekstra native bağımlılık veya derleme adımı yoktur; `npm install` yeterlidir.

## Kurulum ve çalıştırma


```bash
cd backend
npm install        # bağımlılıkları yükle
npm run seed       # örnek veriyi yükle (ilk kurulumda bir kez)
npm start          # sunucuyu başlat
```

Ardından tarayıcıdan: **http://localhost:3000**

### Test giriş bilgileri

| Rol | E-posta | Şifre |
|-----|---------|-------|
| Süper Admin | `admin@liman.gov.tr` | `admin123` |
| Liman Yöneticisi (Karaburun) | `karaburun@liman.gov.tr` | `liman123` |
| Liman Yöneticisi (Foça) | `foca@liman.gov.tr` | `liman123` |
| Hak Sahibi (Hasan Yılmaz) | `hasan@liman.gov.tr` | `hasan123` |
| Vekil (Ali Demir adına) | `vekil@liman.gov.tr` | `vekil123` |
| Vekil (Ali Demir adına) | `vekil@liman.gov.tr` | `vekil123` |

## Proje yapısı

```
liman-sistemi/
├── backend/
│   ├── server.js            # Express sunucu + tüm API uçları
│   ├── db.js                # Veritabanı şeması + güvenli sorgu sarmalayıcıları
│   ├── auth.js              # JWT üretimi ve yetki middleware
│   ├── seed.js              # Örnek veri yükleyici
│   ├── entegrasyon-test.mjs # API entegrasyon testleri (16 senaryo)
│   └── liman.db             # SQLite veritabanı (seed sonrası oluşur)
└── frontend/
    ├── index.html
    ├── stil.css             # Deniz temalı tasarım
    └── uygulama.js          # Tek sayfa uygulama mantığı
```

Frontend, backend sunucusu tarafından statik olarak servis edilir; ayrı bir sunucu gerekmez.

## API uçları (özet)

| Yöntem | Uç | Açıklama |
|--------|-----|----------|
| POST | `/api/giris` | Giriş, JWT döner |
| GET | `/api/ozet` | Dashboard sayıları |
| GET/POST/PUT | `/api/limanlar` | Liman yönetimi |
| GET/POST/PUT/DELETE | `/api/hak-sahipleri` | Hak sahibi yönetimi |
| GET | `/api/hak-sahipleri/:id` | Detay (tekne + dam dahil) |
| POST/DELETE | `/api/tekneler` | Tekne yönetimi |
| GET/POST/PUT/DELETE | `/api/damlar` | Dam yönetimi |
| GET/POST | `/api/kullanicilar` | Kullanıcı yönetimi |

Tüm `/api/*` uçları (giriş hariç) `Authorization: Bearer <token>` başlığı ister.

## Test

```bash
cd backend
npm run seed                  # testten önce veriyi sıfırla
node entegrasyon-test.mjs     # 16 senaryo: kimlik, yetki, izolasyon, CRUD
```

## Sonraki fazlar (yol haritası)

- **Faz 2 — Belge motoru:** belge tipi tanımı, yükleme, inceleme, onay/red, geçerlilik tarihleri
- **Faz 3 — Bildirim & dashboard:** süre dolum hatırlatmaları, trafik ışığı paneli, duyurular
- **Faz 4 — Mobil uygulama:** Flutter ile iOS + Android
- **Faz 5 — Akıllı katman:** OCR ile tarih okuma, e-Devlet entegrasyonu, QR dam etiketleri, raporlar

## Güvenlik notları (üretime geçmeden önce)

- `auth.js` içindeki `JWT_SECRET` ortam değişkeni olarak ayarlanmalı (`process.env.JWT_SECRET`)
- HTTPS arkasında çalıştırılmalı
- Üretimde SQLite yerine PostgreSQL'e geçiş önerilir (eşzamanlı kullanım için)
