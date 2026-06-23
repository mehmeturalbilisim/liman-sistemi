// db.js — Veritabanı bağlantısı ve şema (Node yerleşik SQLite)
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new DatabaseSync(join(__dirname, 'liman.db'));

db.exec('PRAGMA foreign_keys = ON;');

// ---- Şema ----
db.exec(`
CREATE TABLE IF NOT EXISTS kullanicilar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad_soyad TEXT NOT NULL,
  eposta TEXT UNIQUE NOT NULL,
  telefon TEXT,
  sifre_hash TEXT NOT NULL,
  rol TEXT NOT NULL CHECK(rol IN ('super_admin','liman_yoneticisi','liman_personeli','hak_sahibi','vekil')),
  liman_id INTEGER,
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS limanlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ad TEXT NOT NULL,
  kooperatif_adi TEXT,
  il TEXT,
  ilce TEXT,
  adres TEXT,
  vergi_no TEXT,
  yetkili_kisi TEXT,
  telefon TEXT,
  eposta TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hak_sahipleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liman_id INTEGER NOT NULL,
  kullanici_id INTEGER,
  ad_soyad TEXT NOT NULL,
  tc_no TEXT,
  telefon TEXT,
  eposta TEXT,
  adres TEXT,
  notlar TEXT,
  -- Bağlama durumu: dam_sahibi (dam tahsisli) | gecici (serbest/geçici bağlama) |
  -- sirada (dam talebi var, bekliyor) | misafir (günübirlik/kısa süreli başka limandan)
  baglama_durumu TEXT NOT NULL DEFAULT 'dam_sahibi'
    CHECK(baglama_durumu IN ('dam_sahibi','gecici','sirada','misafir')),
  sira_tarihi TEXT,                  -- sıraya giriş tarihi (sirada ise)
  misafir_bitis TEXT,                -- misafir ise tahmini ayrılış tarihi
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE CASCADE,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS tekneler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hak_sahibi_id INTEGER NOT NULL,
  ad TEXT NOT NULL,
  tekne_tipi TEXT,
  boy_metre REAL,
  tonaj REAL,
  motor_no TEXT,
  baglama_kutugu_no TEXT,
  tescil_no TEXT,
  -- Belge sınıfı: profesyonel (ruhsatlı ticari balıkçılık) | amatör (hobi)
  belge_sinifi TEXT NOT NULL DEFAULT 'profesyonel'
    CHECK(belge_sinifi IN ('profesyonel','amator')),
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (hak_sahibi_id) REFERENCES hak_sahipleri(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS damlar (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liman_id INTEGER NOT NULL,
  hak_sahibi_id INTEGER,
  dam_no TEXT NOT NULL,
  rihtim TEXT,
  durum TEXT NOT NULL DEFAULT 'bos' CHECK(durum IN ('bos','dolu','bakim')),
  notlar TEXT,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE CASCADE,
  FOREIGN KEY (hak_sahibi_id) REFERENCES hak_sahipleri(id) ON DELETE SET NULL
);

-- ===== FAZ 2: BELGE MOTORU =====

-- Her limanın tanımladığı zorunlu/opsiyonel belge tipleri
CREATE TABLE IF NOT EXISTS belge_tipleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liman_id INTEGER NOT NULL,
  ad TEXT NOT NULL,
  kategori TEXT NOT NULL DEFAULT 'kisisel'
    CHECK(kategori IN ('kisisel','mesleki','tekne','mali','dam','saglik')),
  kapsam TEXT NOT NULL DEFAULT 'hak_sahibi'
    CHECK(kapsam IN ('hak_sahibi','tekne','dam')),
  zorunlu INTEGER NOT NULL DEFAULT 1,
  gecerlilik_ay INTEGER,             -- kaç ay geçerli (NULL = süresiz)
  hatirlatma_gun INTEGER DEFAULT 30, -- bitişten kaç gün önce uyar
  -- Koşullu kural: yalnızca belirli tekne boyu aralığında zorunlu
  kosul_min_boy REAL,                -- bu boydan büyük teknelerde iste (NULL = sınır yok)
  kosul_max_boy REAL,                -- bu boydan küçük teknelerde iste (NULL = sınır yok)
  aciklama TEXT,
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE CASCADE
);

-- Yüklenen belgeler (her kayıt bir belge tipinin bir hak sahibi/tekne/dam için örneği)
CREATE TABLE IF NOT EXISTS belgeler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  belge_tipi_id INTEGER NOT NULL,
  hak_sahibi_id INTEGER NOT NULL,
  tekne_id INTEGER,                  -- kapsam tekne ise
  dam_id INTEGER,                    -- kapsam dam ise
  dosya_adi TEXT,                    -- orijinal dosya adı
  dosya_yolu TEXT,                   -- diskteki yol
  dosya_tur TEXT,                    -- MIME
  duzenlenme_tarihi TEXT,            -- belgenin düzenlendiği tarih
  gecerlilik_bitis TEXT,            -- son geçerlilik tarihi
  durum TEXT NOT NULL DEFAULT 'incelemede'
    CHECK(durum IN ('incelemede','onayli','reddedildi')),
  red_gerekce TEXT,
  inceleyen_id INTEGER,
  inceleme_tarihi TEXT,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (belge_tipi_id) REFERENCES belge_tipleri(id) ON DELETE CASCADE,
  FOREIGN KEY (hak_sahibi_id) REFERENCES hak_sahipleri(id) ON DELETE CASCADE,
  FOREIGN KEY (tekne_id) REFERENCES tekneler(id) ON DELETE CASCADE,
  FOREIGN KEY (dam_id) REFERENCES damlar(id) ON DELETE CASCADE,
  FOREIGN KEY (inceleyen_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_belge_hs ON belgeler(hak_sahibi_id);
CREATE INDEX IF NOT EXISTS idx_belge_tip ON belgeler(belge_tipi_id);

-- Kişiye özel belge kuralları: bir hak sahibinden belirli bir belge tipini
-- ekstra iste ('ekstra') veya muaf tut ('muaf')
CREATE TABLE IF NOT EXISTS hak_sahibi_belge_kurallari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hak_sahibi_id INTEGER NOT NULL,
  belge_tipi_id INTEGER NOT NULL,
  kural TEXT NOT NULL CHECK(kural IN ('ekstra','muaf')),
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(hak_sahibi_id, belge_tipi_id),
  FOREIGN KEY (hak_sahibi_id) REFERENCES hak_sahipleri(id) ON DELETE CASCADE,
  FOREIGN KEY (belge_tipi_id) REFERENCES belge_tipleri(id) ON DELETE CASCADE
);

-- ===== FAZ 3: DUYURULAR & BİLDİRİMLER =====

-- Duyurular: liman_id NULL ise tüm sisteme (yalnızca süper admin)
CREATE TABLE IF NOT EXISTS duyurular (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  liman_id INTEGER,                  -- NULL = tüm sistem
  baslik TEXT NOT NULL,
  icerik TEXT NOT NULL,
  oncelik TEXT NOT NULL DEFAULT 'normal' CHECK(oncelik IN ('normal','onemli','acil')),
  yayinlayan_id INTEGER,
  -- Hedef: 'herkes' (limandaki/sistemdeki herkes) | 'secili' (yalnızca seçili hak sahipleri)
  hedef_tipi TEXT NOT NULL DEFAULT 'herkes' CHECK(hedef_tipi IN ('herkes','secili')),
  dosya_yolu TEXT,                   -- ekli dosyanın sunucudaki adı
  dosya_adi TEXT,                    -- ekli dosyanın orijinal adı
  aktif INTEGER NOT NULL DEFAULT 1,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE CASCADE,
  FOREIGN KEY (yayinlayan_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);

-- Duyuru hedefleri: 'secili' duyurular için hangi hak sahiplerine gittiği
CREATE TABLE IF NOT EXISTS duyuru_hedefleri (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  duyuru_id INTEGER NOT NULL,
  hak_sahibi_id INTEGER NOT NULL,
  UNIQUE(duyuru_id, hak_sahibi_id),
  FOREIGN KEY (duyuru_id) REFERENCES duyurular(id) ON DELETE CASCADE,
  FOREIGN KEY (hak_sahibi_id) REFERENCES hak_sahipleri(id) ON DELETE CASCADE
);

-- Duyuru okundu kaydı: hangi kullanıcı hangi duyuruyu açtı
CREATE TABLE IF NOT EXISTS duyuru_okundu (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  duyuru_id INTEGER NOT NULL,
  kullanici_id INTEGER NOT NULL,
  okundu_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(duyuru_id, kullanici_id),
  FOREIGN KEY (duyuru_id) REFERENCES duyurular(id) ON DELETE CASCADE,
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE
);

-- Bildirimler: belirli bir kullanıcıya yönelik
CREATE TABLE IF NOT EXISTS bildirimler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kullanici_id INTEGER NOT NULL,
  tur TEXT NOT NULL DEFAULT 'bilgi'
    CHECK(tur IN ('bilgi','belge_onay','belge_red','sure_yaklasiyor','sure_doldu','duyuru')),
  baslik TEXT NOT NULL,
  icerik TEXT,
  ilgili_belge_id INTEGER,
  okundu INTEGER NOT NULL DEFAULT 0,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (kullanici_id) REFERENCES kullanicilar(id) ON DELETE CASCADE,
  FOREIGN KEY (ilgili_belge_id) REFERENCES belgeler(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_bildirim_kul ON bildirimler(kullanici_id, okundu);

-- ===== WEB TAMAMLAMA: MESAJ KAYITLARI (SMS/E-POSTA) =====
CREATE TABLE IF NOT EXISTS mesaj_kayitlari (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kanal TEXT NOT NULL CHECK(kanal IN ('sms','eposta')),
  alici TEXT NOT NULL,             -- telefon veya e-posta
  alici_ad TEXT,
  konu TEXT,
  icerik TEXT NOT NULL,
  durum TEXT NOT NULL DEFAULT 'kuyrukta' CHECK(durum IN ('kuyrukta','gonderildi','basarisiz')),
  hata TEXT,
  liman_id INTEGER,
  gonderen_id INTEGER,
  olusturma_tarihi TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (liman_id) REFERENCES limanlar(id) ON DELETE SET NULL,
  FOREIGN KEY (gonderen_id) REFERENCES kullanicilar(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_mesaj_liman ON mesaj_kayitlari(liman_id);
`);

// Node yerleşik SQLite undefined parametreleri kabul etmez; null'a çeviririz.
const nrm = (a) => a.map((v) => (v === undefined ? null : v));

// Güvenli sarmalayıcılar
export const calistir = (sql, ...p) => db.prepare(sql).run(...nrm(p)); // INSERT/UPDATE/DELETE
export const getir = (sql, ...p) => db.prepare(sql).get(...nrm(p));     // tek satır
export const tumu = (sql, ...p) => db.prepare(sql).all(...nrm(p));      // çok satır

export default db;
