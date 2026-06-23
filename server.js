// server.js — Liman Yönetim Sistemi API (Faz 1 + Faz 2: Belge Motoru)
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import db, { calistir, getir, tumu } from './db.js';
import { tokenUret, girisGerekli, rolGerekli } from './auth.js';
import { etkinDurum, DURUM_BILGI, uygunlukSkoru, uygunlukHesabiV2 } from './belge-mantik.js';
import { bildirimEkle, hakSahibiKullanicisi, sureDolumTaramasi } from './bildirim.js';
import { mesajGonder, topluGonder, simulasyonModu } from './mesaj.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

// Frontend klasörünü otomatik bul: ister ../frontend (düzgün yapı),
// ister backend ile aynı klasörde (dosyalar tek klasöre konmuşsa) çalışır.
const olasiYollar = [
  join(__dirname, '..', 'frontend'),
  __dirname,
  join(__dirname, 'frontend'),
];
const FRONTEND_DIZIN = olasiYollar.find(y => existsSync(join(y, 'index.html'))) || join(__dirname, '..', 'frontend');

// Frontend'i aynı sunucudan servis et
app.use(express.static(FRONTEND_DIZIN));

// Yüklenen belgeler için klasör + multer
const YUKLEME_DIZIN = join(__dirname, 'yuklemeler');
if (!existsSync(YUKLEME_DIZIN)) mkdirSync(YUKLEME_DIZIN, { recursive: true });
const depolama = multer.diskStorage({
  destination: (req, file, cb) => cb(null, YUKLEME_DIZIN),
  filename: (req, file, cb) => {
    const uzanti = (file.originalname.match(/\.[a-z0-9]+$/i) || [''])[0];
    cb(null, `belge_${Date.now()}_${Math.round(Math.random() * 1e6)}${uzanti}`);
  },
});
const yukle = multer({
  storage: depolama,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const izinli = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    cb(null, izinli.includes(file.mimetype));
  },
});

// Liman erişim kapsamı: super_admin her şeyi görür, diğerleri sadece kendi limanını
function limanKapsami(req) {
  if (req.kullanici.rol === 'super_admin') return null; // sınır yok
  return req.kullanici.liman_id;
}

// ============ KİMLİK DOĞRULAMA ============
app.post('/api/giris', (req, res) => {
  const { eposta, sifre } = req.body;
  if (!eposta || !sifre) return res.status(400).json({ hata: 'E-posta ve şifre girin.' });
  const k = getir('SELECT * FROM kullanicilar WHERE eposta = ? AND aktif = 1', eposta);
  if (!k || !bcrypt.compareSync(sifre, k.sifre_hash)) {
    return res.status(401).json({ hata: 'E-posta veya şifre hatalı.' });
  }
  res.json({
    token: tokenUret(k),
    kullanici: { id: k.id, ad_soyad: k.ad_soyad, rol: k.rol, liman_id: k.liman_id },
  });
});

app.get('/api/ben', girisGerekli, (req, res) => {
  res.json({ kullanici: req.kullanici });
});

// ============ LİMANLAR ============
// Listele — super_admin tüm limanlar, diğer roller kendi limanı
app.get('/api/limanlar', girisGerekli, (req, res) => {
  const kapsam = limanKapsami(req);
  const satirlar = kapsam === null
    ? tumu('SELECT * FROM limanlar ORDER BY ad')
    : tumu('SELECT * FROM limanlar WHERE id = ?', kapsam);
  res.json(satirlar);
});

app.post('/api/limanlar', girisGerekli, rolGerekli('super_admin'), (req, res) => {
  const { ad, kooperatif_adi, il, ilce, adres, vergi_no, yetkili_kisi, telefon, eposta } = req.body;
  if (!ad) return res.status(400).json({ hata: 'Liman adı zorunlu.' });
  const r = calistir(`INSERT INTO limanlar (ad,kooperatif_adi,il,ilce,adres,vergi_no,yetkili_kisi,telefon,eposta)
    VALUES (?,?,?,?,?,?,?,?,?)`, ad, kooperatif_adi, il, ilce, adres, vergi_no, yetkili_kisi, telefon, eposta);
  res.status(201).json(getir('SELECT * FROM limanlar WHERE id = ?', r.lastInsertRowid));
});

app.put('/api/limanlar/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== id) return res.status(403).json({ hata: 'Bu limana erişiminiz yok.' });
  const mevcut = getir('SELECT * FROM limanlar WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Liman bulunamadı.' });
  const g = { ...mevcut, ...req.body };
  calistir(`UPDATE limanlar SET ad=?,kooperatif_adi=?,il=?,ilce=?,adres=?,vergi_no=?,yetkili_kisi=?,telefon=?,eposta=?,aktif=? WHERE id=?`,
    g.ad, g.kooperatif_adi, g.il, g.ilce, g.adres, g.vergi_no, g.yetkili_kisi, g.telefon, g.eposta, g.aktif ? 1 : 0, id);
  res.json(getir('SELECT * FROM limanlar WHERE id = ?', id));
});

// Bir limanın yönetici/personel hesaplarını listele
app.get('/api/limanlar/:id/yoneticiler', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== id) return res.status(403).json({ hata: 'Bu limana erişiminiz yok.' });
  const satirlar = tumu(
    `SELECT id, ad_soyad, eposta, rol, aktif FROM kullanicilar
     WHERE liman_id=? AND rol IN ('liman_yoneticisi','liman_personeli') ORDER BY rol, ad_soyad`,
    id
  );
  res.json(satirlar);
});

// Bir limana yönetici hesabı oluştur
app.post('/api/limanlar/:id/yonetici', girisGerekli, rolGerekli('super_admin'), (req, res) => {
  const id = Number(req.params.id);
  const liman = getir('SELECT * FROM limanlar WHERE id = ?', id);
  if (!liman) return res.status(404).json({ hata: 'Liman bulunamadı.' });
  let { ad_soyad, eposta, rol } = req.body;
  rol = (rol === 'liman_personeli') ? 'liman_personeli' : 'liman_yoneticisi';
  if (!ad_soyad) return res.status(400).json({ hata: 'Ad soyad zorunlu.' });

  // E-posta verilmemişse liman adından öneri üret
  if (!eposta || !eposta.trim()) {
    const taban = (liman.ad || 'liman').toLowerCase()
      .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
      .replace(/[^a-z0-9]/g, '').slice(0, 20) || 'liman';
    let aday = `${taban}@liman.local`, n = 1;
    while (getir('SELECT id FROM kullanicilar WHERE eposta = ?', aday)) { aday = `${taban}${n++}@liman.local`; }
    eposta = aday;
  } else {
    eposta = eposta.trim().toLowerCase();
    if (getir('SELECT id FROM kullanicilar WHERE eposta = ?', eposta)) {
      return res.status(409).json({ hata: 'Bu e-posta zaten kayıtlı.' });
    }
  }

  const sifre = sifreUret();
  const hash = bcrypt.hashSync(sifre, 10);
  const r = calistir(
    `INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol,liman_id) VALUES (?,?,?,?,?)`,
    ad_soyad, eposta, hash, rol, id
  );
  res.status(201).json({ id: r.lastInsertRowid, kullanici_adi: eposta, sifre, rol });
});

// ============ HAK SAHİPLERİ ============
app.get('/api/hak-sahipleri', girisGerekli, (req, res) => {
  const kapsam = limanKapsami(req);
  const satirlar = kapsam === null
    ? tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id ORDER BY h.ad_soyad')
    : tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id WHERE h.liman_id=? ORDER BY h.ad_soyad', kapsam);
  res.json(satirlar);
});

app.get('/api/hak-sahipleri/:id', girisGerekli, (req, res) => {
  const id = Number(req.params.id);
  const h = getir('SELECT * FROM hak_sahipleri WHERE id = ?', id);
  if (!h) return res.status(404).json({ hata: 'Hak sahibi bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== h.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  const tekneler = tumu('SELECT * FROM tekneler WHERE hak_sahibi_id = ? ORDER BY ad', id);
  const damlar = tumu('SELECT * FROM damlar WHERE hak_sahibi_id = ? ORDER BY dam_no', id);
  res.json({ ...h, tekneler, damlar });
});

app.post('/api/hak-sahipleri', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  let { liman_id, ad_soyad, tc_no, telefon, eposta, adres, notlar, baglama_durumu, sira_tarihi, misafir_bitis } = req.body;
  if (kapsam !== null) liman_id = kapsam; // kendi limanına zorla
  if (!liman_id || !ad_soyad) return res.status(400).json({ hata: 'Liman ve ad soyad zorunlu.' });
  const gecerli = ['dam_sahibi', 'gecici', 'sirada', 'misafir'];
  if (!gecerli.includes(baglama_durumu)) baglama_durumu = 'dam_sahibi';
  const r = calistir(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon,eposta,adres,notlar,baglama_durumu,sira_tarihi,misafir_bitis)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, liman_id, ad_soyad, tc_no, telefon, eposta, adres, notlar,
    baglama_durumu, baglama_durumu === 'sirada' ? (sira_tarihi || new Date().toISOString().slice(0, 10)) : null,
    baglama_durumu === 'misafir' ? (misafir_bitis || null) : null);
  res.status(201).json(getir('SELECT * FROM hak_sahipleri WHERE id = ?', r.lastInsertRowid));
});

app.put('/api/hak-sahipleri/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM hak_sahipleri WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Hak sahibi bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  const g = { ...mevcut, ...req.body };
  const gecerli = ['dam_sahibi', 'gecici', 'sirada', 'misafir'];
  if (!gecerli.includes(g.baglama_durumu)) g.baglama_durumu = mevcut.baglama_durumu;
  // Duruma göre ilgili tarihleri temizle/koru
  const siraT = g.baglama_durumu === 'sirada' ? (g.sira_tarihi || new Date().toISOString().slice(0, 10)) : null;
  const misafirB = g.baglama_durumu === 'misafir' ? (g.misafir_bitis || null) : null;
  calistir(`UPDATE hak_sahipleri SET ad_soyad=?,tc_no=?,telefon=?,eposta=?,adres=?,notlar=?,aktif=?,baglama_durumu=?,sira_tarihi=?,misafir_bitis=? WHERE id=?`,
    g.ad_soyad, g.tc_no, g.telefon, g.eposta, g.adres, g.notlar, g.aktif ? 1 : 0, g.baglama_durumu, siraT, misafirB, id);
  res.json(getir('SELECT * FROM hak_sahipleri WHERE id = ?', id));
});

app.delete('/api/hak-sahipleri/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM hak_sahipleri WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Hak sahibi bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  calistir('DELETE FROM hak_sahipleri WHERE id = ?', id);
  res.json({ basarili: true });
});

// ============ TEKNELER ============
function tekneHakSahibiKontrol(req, hak_sahibi_id) {
  const h = getir('SELECT * FROM hak_sahipleri WHERE id = ?', hak_sahibi_id);
  if (!h) return { hata: 'Hak sahibi bulunamadı.', kod: 404 };
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== h.liman_id) return { hata: 'Erişim yok.', kod: 403 };
  return { ok: true };
}

// ---- HAK SAHİBİNE GİRİŞ HESABI ----
function sifreUret() {
  const harf = 'abcdefghjkmnpqrstuvwxyz';
  const rakam = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += harf[Math.floor(Math.random() * harf.length)];
  for (let i = 0; i < 4; i++) s += rakam[Math.floor(Math.random() * rakam.length)];
  return s;
}

// Hesap durumunu döner
app.get('/api/hak-sahipleri/:id/hesap', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  if (!k.hs.kullanici_id) return res.json({ var: false });
  const kul = getir('SELECT id, ad_soyad, eposta, rol, aktif FROM kullanicilar WHERE id=?', k.hs.kullanici_id);
  res.json({ var: true, kullanici: kul });
});

// Hesap oluştur veya şifre sıfırla
app.post('/api/hak-sahipleri/:id/hesap', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const hs = k.hs;
  let kullaniciAdi = (hs.eposta && hs.eposta.trim()) ? hs.eposta.trim().toLowerCase() : null;
  if (!kullaniciAdi) {
    const tel = (hs.telefon || '').replace(/\D/g, '');
    if (!tel) return res.status(400).json({ hata: 'Hesap oluşturmak için hak sahibinin e-postası veya telefonu olmalı.' });
    kullaniciAdi = `${tel}@liman.local`;
  }
  const yeniSifre = sifreUret();
  const hash = bcrypt.hashSync(yeniSifre, 10);
  if (hs.kullanici_id) {
    calistir('UPDATE kullanicilar SET sifre_hash=?, aktif=1 WHERE id=?', hash, hs.kullanici_id);
    const kul = getir('SELECT eposta FROM kullanicilar WHERE id=?', hs.kullanici_id);
    return res.json({ islem: 'sifirlandi', kullanici_adi: kul.eposta, sifre: yeniSifre });
  }
  const cakisma = getir('SELECT id FROM kullanicilar WHERE eposta=?', kullaniciAdi);
  if (cakisma) return res.status(409).json({ hata: 'Bu e-posta/telefon zaten bir hesapta kayıtlı.' });
  const r = calistir(
    `INSERT INTO kullanicilar (ad_soyad,eposta,telefon,sifre_hash,rol,liman_id) VALUES (?,?,?,?,'hak_sahibi',?)`,
    hs.ad_soyad, kullaniciAdi, hs.telefon, hash, hs.liman_id
  );
  calistir('UPDATE hak_sahipleri SET kullanici_id=? WHERE id=?', r.lastInsertRowid, hs.id);
  res.status(201).json({ islem: 'olusturuldu', kullanici_adi: kullaniciAdi, sifre: yeniSifre });
});

// Hesabı pasifleştir
app.delete('/api/hak-sahipleri/:id/hesap', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  if (!k.hs.kullanici_id) return res.status(404).json({ hata: 'Bu hak sahibinin giriş hesabı yok.' });
  calistir('UPDATE kullanicilar SET aktif=0 WHERE id=?', k.hs.kullanici_id);
  res.json({ basarili: true });
});

// ============ TEKNELER ============
// Tüm tekneler: sahip + dam bilgisiyle (liman bazlı izolasyon)
app.get('/api/tekneler', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  const sorgu = `
    SELECT t.*, h.ad_soyad AS sahip_adi, h.telefon AS sahip_telefon, h.liman_id,
           l.ad AS liman_adi,
           (SELECT d.dam_no FROM damlar d WHERE d.hak_sahibi_id = h.id LIMIT 1) AS dam_no,
           (SELECT d.rihtim FROM damlar d WHERE d.hak_sahibi_id = h.id LIMIT 1) AS dam_rihtim
    FROM tekneler t
    JOIN hak_sahipleri h ON h.id = t.hak_sahibi_id
    JOIN limanlar l ON l.id = h.liman_id`;
  const satirlar = kapsam === null
    ? tumu(sorgu + ' ORDER BY t.ad')
    : tumu(sorgu + ' WHERE h.liman_id = ? ORDER BY t.ad', kapsam);
  res.json(satirlar);
});

// Tek tekne detayı
app.get('/api/tekneler/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const t = getir(`
    SELECT t.*, h.ad_soyad AS sahip_adi, h.telefon AS sahip_telefon, h.liman_id,
           l.ad AS liman_adi,
           (SELECT d.dam_no FROM damlar d WHERE d.hak_sahibi_id = h.id LIMIT 1) AS dam_no,
           (SELECT d.rihtim FROM damlar d WHERE d.hak_sahibi_id = h.id LIMIT 1) AS dam_rihtim
    FROM tekneler t JOIN hak_sahipleri h ON h.id = t.hak_sahibi_id JOIN limanlar l ON l.id = h.liman_id
    WHERE t.id = ?`, Number(req.params.id));
  if (!t) return res.status(404).json({ hata: 'Tekne bulunamadı.' });
  const k = tekneHakSahibiKontrol(req, t.hak_sahibi_id);
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  res.json(t);
});

app.post('/api/tekneler', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const { hak_sahibi_id, ad, tekne_tipi, boy_metre, tonaj, motor_no, baglama_kutugu_no, tescil_no, belge_sinifi } = req.body;
  if (!hak_sahibi_id || !ad) return res.status(400).json({ hata: 'Hak sahibi ve tekne adı zorunlu.' });
  const k = tekneHakSahibiKontrol(req, hak_sahibi_id);
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const sinif = belge_sinifi === 'amator' ? 'amator' : 'profesyonel';
  const r = calistir(`INSERT INTO tekneler (hak_sahibi_id,ad,tekne_tipi,boy_metre,tonaj,motor_no,baglama_kutugu_no,tescil_no,belge_sinifi)
    VALUES (?,?,?,?,?,?,?,?,?)`, hak_sahibi_id, ad, tekne_tipi, boy_metre, tonaj, motor_no, baglama_kutugu_no, tescil_no, sinif);
  res.status(201).json(getir('SELECT * FROM tekneler WHERE id = ?', r.lastInsertRowid));
});

// Tekne güncelle
app.put('/api/tekneler/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM tekneler WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Tekne bulunamadı.' });
  const k = tekneHakSahibiKontrol(req, mevcut.hak_sahibi_id);
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  // Sahip değiştiriliyorsa yeni sahibin de kapsamda olduğunu doğrula
  let yeniSahip = mevcut.hak_sahibi_id;
  if (req.body.hak_sahibi_id && Number(req.body.hak_sahibi_id) !== mevcut.hak_sahibi_id) {
    const k2 = tekneHakSahibiKontrol(req, Number(req.body.hak_sahibi_id));
    if (k2.hata) return res.status(k2.kod).json({ hata: k2.hata });
    yeniSahip = Number(req.body.hak_sahibi_id);
  }
  const g = { ...mevcut, ...req.body, hak_sahibi_id: yeniSahip };
  const sinif = g.belge_sinifi === 'amator' ? 'amator' : 'profesyonel';
  calistir(`UPDATE tekneler SET hak_sahibi_id=?,ad=?,tekne_tipi=?,boy_metre=?,tonaj=?,motor_no=?,baglama_kutugu_no=?,tescil_no=?,belge_sinifi=?,aktif=? WHERE id=?`,
    g.hak_sahibi_id, g.ad, g.tekne_tipi, g.boy_metre || null, g.tonaj || null, g.motor_no, g.baglama_kutugu_no, g.tescil_no, sinif, g.aktif ? 1 : 0, id);
  res.json(getir('SELECT * FROM tekneler WHERE id = ?', id));
});

app.delete('/api/tekneler/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const t = getir('SELECT * FROM tekneler WHERE id = ?', Number(req.params.id));
  if (!t) return res.status(404).json({ hata: 'Tekne bulunamadı.' });
  const k = tekneHakSahibiKontrol(req, t.hak_sahibi_id);
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  calistir('DELETE FROM tekneler WHERE id = ?', t.id);
  res.json({ basarili: true });
});

// ============ DAMLAR ============
app.get('/api/damlar', girisGerekli, (req, res) => {
  const kapsam = limanKapsami(req);
  const satirlar = kapsam === null
    ? tumu('SELECT d.*, h.ad_soyad AS hak_sahibi_adi, l.ad AS liman_adi FROM damlar d LEFT JOIN hak_sahipleri h ON h.id=d.hak_sahibi_id JOIN limanlar l ON l.id=d.liman_id ORDER BY d.dam_no')
    : tumu('SELECT d.*, h.ad_soyad AS hak_sahibi_adi, l.ad AS liman_adi FROM damlar d LEFT JOIN hak_sahipleri h ON h.id=d.hak_sahibi_id JOIN limanlar l ON l.id=d.liman_id WHERE d.liman_id=? ORDER BY d.dam_no', kapsam);
  res.json(satirlar);
});

app.post('/api/damlar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  let { liman_id, hak_sahibi_id, dam_no, rihtim, durum, notlar } = req.body;
  if (kapsam !== null) liman_id = kapsam;
  if (!liman_id || !dam_no) return res.status(400).json({ hata: 'Liman ve dam no zorunlu.' });
  const r = calistir(`INSERT INTO damlar (liman_id,hak_sahibi_id,dam_no,rihtim,durum,notlar)
    VALUES (?,?,?,?,?,?)`, liman_id, hak_sahibi_id || null, dam_no, rihtim, durum || (hak_sahibi_id ? 'dolu' : 'bos'), notlar);
  res.status(201).json(getir('SELECT * FROM damlar WHERE id = ?', r.lastInsertRowid));
});

app.put('/api/damlar/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM damlar WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Dam bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  const g = { ...mevcut, ...req.body };
  calistir(`UPDATE damlar SET hak_sahibi_id=?,dam_no=?,rihtim=?,durum=?,notlar=? WHERE id=?`,
    g.hak_sahibi_id || null, g.dam_no, g.rihtim, g.durum, g.notlar, id);
  res.json(getir('SELECT * FROM damlar WHERE id = ?', id));
});

app.delete('/api/damlar/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM damlar WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Dam bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  calistir('DELETE FROM damlar WHERE id = ?', id);
  res.json({ basarili: true });
});

// ============ KULLANICILAR (liman yöneticisi/personel oluşturma) ============
app.get('/api/kullanicilar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const kapsam = limanKapsami(req);
  const satirlar = kapsam === null
    ? tumu('SELECT id,ad_soyad,eposta,telefon,rol,liman_id,aktif FROM kullanicilar ORDER BY ad_soyad')
    : tumu("SELECT id,ad_soyad,eposta,telefon,rol,liman_id,aktif FROM kullanicilar WHERE liman_id=? ORDER BY ad_soyad", kapsam);
  res.json(satirlar);
});

app.post('/api/kullanicilar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const kapsam = limanKapsami(req);
  let { ad_soyad, eposta, telefon, sifre, rol, liman_id } = req.body;
  if (!ad_soyad || !eposta || !sifre || !rol) return res.status(400).json({ hata: 'Ad, e-posta, şifre ve rol zorunlu.' });
  // Liman yöneticisi sadece kendi limanına personel ekler ve süper admin yapamaz
  if (kapsam !== null) {
    liman_id = kapsam;
    if (!['liman_personeli', 'hak_sahibi', 'vekil'].includes(rol)) {
      return res.status(403).json({ hata: 'Bu rolü atama yetkiniz yok.' });
    }
  }
  const varMi = getir('SELECT id FROM kullanicilar WHERE eposta = ?', eposta);
  if (varMi) return res.status(409).json({ hata: 'Bu e-posta zaten kayıtlı.' });
  const hash = bcrypt.hashSync(sifre, 10);
  const r = calistir(`INSERT INTO kullanicilar (ad_soyad,eposta,telefon,sifre_hash,rol,liman_id)
    VALUES (?,?,?,?,?,?)`, ad_soyad, eposta, telefon, hash, rol, liman_id || null);
  res.status(201).json({ id: r.lastInsertRowid, ad_soyad, eposta, rol, liman_id });
});

// Kullanıcı güncelle (bilgiler + isteğe bağlı şifre)
app.put('/api/kullanicilar/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM kullanicilar WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Kullanıcı bulunamadı.' });
  const kapsam = limanKapsami(req);
  // Liman yöneticisi: sadece kendi limanındaki kullanıcılar, süper admin'e dokunamaz
  if (kapsam !== null) {
    if (mevcut.liman_id !== kapsam) return res.status(403).json({ hata: 'Bu kullanıcıya erişiminiz yok.' });
    if (mevcut.rol === 'super_admin') return res.status(403).json({ hata: 'Süper admin düzenlenemez.' });
  }
  let { ad_soyad, eposta, telefon, rol, sifre, aktif } = req.body;

  // Liman yöneticisi yetkisiz rol atayamaz
  if (kapsam !== null && rol && !['liman_personeli', 'hak_sahibi', 'vekil'].includes(rol)) {
    return res.status(403).json({ hata: 'Bu rolü atama yetkiniz yok.' });
  }
  // E-posta değişiyorsa çakışma kontrolü
  if (eposta && eposta !== mevcut.eposta) {
    const cakisma = getir('SELECT id FROM kullanicilar WHERE eposta = ? AND id <> ?', eposta, id);
    if (cakisma) return res.status(409).json({ hata: 'Bu e-posta başka bir kullanıcıda kayıtlı.' });
  }
  const g = {
    ad_soyad: ad_soyad ?? mevcut.ad_soyad,
    eposta: eposta ?? mevcut.eposta,
    telefon: telefon ?? mevcut.telefon,
    rol: rol ?? mevcut.rol,
    aktif: aktif === undefined ? mevcut.aktif : (aktif ? 1 : 0),
  };
  // Şifre verildiyse güncelle (en az 6 karakter)
  if (sifre && sifre.trim()) {
    if (sifre.length < 6) return res.status(400).json({ hata: 'Şifre en az 6 karakter olmalı.' });
    const hash = bcrypt.hashSync(sifre, 10);
    calistir('UPDATE kullanicilar SET ad_soyad=?,eposta=?,telefon=?,rol=?,aktif=?,sifre_hash=? WHERE id=?',
      g.ad_soyad, g.eposta, g.telefon, g.rol, g.aktif, hash, id);
  } else {
    calistir('UPDATE kullanicilar SET ad_soyad=?,eposta=?,telefon=?,rol=?,aktif=? WHERE id=?',
      g.ad_soyad, g.eposta, g.telefon, g.rol, g.aktif, id);
  }
  const guncel = getir('SELECT id,ad_soyad,eposta,telefon,rol,liman_id,aktif FROM kullanicilar WHERE id=?', id);
  res.json(guncel);
});

// ============ ÖZET (dashboard) ============
app.get('/api/ozet', girisGerekli, (req, res) => {
  const kapsam = limanKapsami(req);
  const sayim = (tablo, ekFiltre = '') => {
    if (kapsam === null) return getir(`SELECT COUNT(*) c FROM ${tablo}`).c;
    if (tablo === 'tekneler') {
      return getir(`SELECT COUNT(*) c FROM tekneler t JOIN hak_sahipleri h ON h.id=t.hak_sahibi_id WHERE h.liman_id=?`, kapsam).c;
    }
    return getir(`SELECT COUNT(*) c FROM ${tablo} WHERE liman_id=? ${ekFiltre}`, kapsam).c;
  };
  const ozet = {
    liman: kapsam === null ? getir('SELECT COUNT(*) c FROM limanlar').c : 1,
    hak_sahibi: sayim('hak_sahipleri'),
    tekne: sayim('tekneler'),
    dam: sayim('damlar'),
    bos_dam: kapsam === null
      ? getir("SELECT COUNT(*) c FROM damlar WHERE durum='bos'").c
      : getir("SELECT COUNT(*) c FROM damlar WHERE liman_id=? AND durum='bos'", kapsam).c,
  };

  // Belge istatistikleri (kapsam dahilinde)
  const belgeKosul = kapsam === null ? '' : 'WHERE bt.liman_id = ?';
  const belgeArg = kapsam === null ? [] : [kapsam];
  ozet.inceleme_bekleyen = getir(
    `SELECT COUNT(*) c FROM belgeler b JOIN belge_tipleri bt ON bt.id=b.belge_tipi_id ${belgeKosul ? belgeKosul + ' AND' : 'WHERE'} b.durum='incelemede'`,
    ...belgeArg
  ).c;
  ozet.belge_tipi = getir(
    `SELECT COUNT(*) c FROM belge_tipleri bt ${belgeKosul}`, ...belgeArg
  ).c;
  res.json(ozet);
});

// ============================================================
// FAZ 2 — BELGE MOTORU
// ============================================================

// Bir hak sahibinin hangi limana ait olduğunu döner ve kapsam kontrolü yapar
// Hak sahibi VEYA vekil: kendi/temsil ettiği kayda bağlı self-servis rolleri
const SELF_SERVIS = ['hak_sahibi', 'vekil'];
const selfServisMi = (req) => SELF_SERVIS.includes(req.kullanici.rol);

function hsKapsamKontrol(req, hsId) {
  const hs = getir('SELECT * FROM hak_sahipleri WHERE id = ?', hsId);
  if (!hs) return { hata: 'Hak sahibi bulunamadı.', kod: 404 };
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== hs.liman_id) return { hata: 'Erişim yok.', kod: 403 };
  // Hak sahibi/vekil rolündeyse sadece bağlı olduğu kayıt
  if (selfServisMi(req) && hs.kullanici_id !== req.kullanici.id) {
    return { hata: 'Yalnızca kendi belgelerinize erişebilirsiniz.', kod: 403 };
  }
  return { ok: true, hs };
}

// ---- BELGE TİPLERİ ----
app.get('/api/belge-tipleri', girisGerekli, (req, res) => {
  const kapsam = limanKapsami(req);
  let limanId = kapsam;
  // Hak sahibi/vekil kendi limanının tiplerini görür
  if (selfServisMi(req)) {
    const hs = getir('SELECT liman_id FROM hak_sahipleri WHERE kullanici_id = ?', req.kullanici.id);
    limanId = hs ? hs.liman_id : -1;
  }
  const satirlar = (kapsam === null && req.kullanici.rol === 'super_admin')
    ? tumu('SELECT bt.*, l.ad AS liman_adi FROM belge_tipleri bt JOIN limanlar l ON l.id=bt.liman_id ORDER BY bt.kategori, bt.ad')
    : tumu('SELECT bt.*, l.ad AS liman_adi FROM belge_tipleri bt JOIN limanlar l ON l.id=bt.liman_id WHERE bt.liman_id=? ORDER BY bt.kategori, bt.ad', limanId);
  res.json(satirlar);
});

app.post('/api/belge-tipleri', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const kapsam = limanKapsami(req);
  let { liman_id, ad, kategori, kapsam: blgKapsam, zorunlu, gecerlilik_ay, hatirlatma_gun, aciklama, kosul_min_boy, kosul_max_boy } = req.body;
  if (kapsam !== null) liman_id = kapsam;
  if (!liman_id || !ad) return res.status(400).json({ hata: 'Liman ve belge adı zorunlu.' });
  const r = calistir(
    `INSERT INTO belge_tipleri (liman_id,ad,kategori,kapsam,zorunlu,gecerlilik_ay,hatirlatma_gun,aciklama,kosul_min_boy,kosul_max_boy)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    liman_id, ad, kategori || 'kisisel', blgKapsam || 'hak_sahibi',
    zorunlu === false || zorunlu === 0 ? 0 : 1,
    gecerlilik_ay || null, hatirlatma_gun || 30, aciklama,
    kosul_min_boy || null, kosul_max_boy || null
  );
  res.status(201).json(getir('SELECT * FROM belge_tipleri WHERE id = ?', r.lastInsertRowid));
});

app.put('/api/belge-tipleri/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM belge_tipleri WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Belge tipi bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  const g = { ...mevcut, ...req.body };
  calistir(
    `UPDATE belge_tipleri SET ad=?,kategori=?,kapsam=?,zorunlu=?,gecerlilik_ay=?,hatirlatma_gun=?,aciklama=?,aktif=?,kosul_min_boy=?,kosul_max_boy=? WHERE id=?`,
    g.ad, g.kategori, g.kapsam, g.zorunlu ? 1 : 0, g.gecerlilik_ay || null, g.hatirlatma_gun || 30, g.aciklama, g.aktif ? 1 : 0,
    g.kosul_min_boy || null, g.kosul_max_boy || null, id
  );
  res.json(getir('SELECT * FROM belge_tipleri WHERE id = ?', id));
});

app.delete('/api/belge-tipleri/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const mevcut = getir('SELECT * FROM belge_tipleri WHERE id = ?', id);
  if (!mevcut) return res.status(404).json({ hata: 'Belge tipi bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== mevcut.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  calistir('DELETE FROM belge_tipleri WHERE id = ?', id);
  res.json({ basarili: true });
});

// ---- BELGE DURUM ÖZETİ (bir hak sahibi için: tüm tipler + son belge + etkin durum) ----
// Bir hak sahibinin eksik/sorunlu zorunlu belgelerinin listesi (rapor için)
function eksikBelgeDetaylari(hsId, limanId) {
  const tipler = tumu('SELECT * FROM belge_tipleri WHERE liman_id=? AND aktif=1', limanId);
  const tekneler = tumu('SELECT * FROM tekneler WHERE hak_sahibi_id=?', hsId);
  const damlar = tumu('SELECT * FROM damlar WHERE hak_sahibi_id=?', hsId);
  const ozelKurallar = {};
  for (const kr of tumu('SELECT belge_tipi_id, kural FROM hak_sahibi_belge_kurallari WHERE hak_sahibi_id=?', hsId)) ozelKurallar[kr.belge_tipi_id] = kr.kural;
  const eksikler = [];
  for (const tip of tipler) {
    if (ozelKurallar[tip.id] === 'muaf') continue;
    let ornekler;
    if (tip.kapsam === 'tekne') {
      let uygun = tekneler;
      if (tip.kosul_min_boy != null) uygun = uygun.filter(t => (t.boy_metre ?? 0) >= tip.kosul_min_boy);
      if (tip.kosul_max_boy != null) uygun = uygun.filter(t => (t.boy_metre ?? 999) <= tip.kosul_max_boy);
      ornekler = uygun.map(t => ({ tekne_id: t.id, etiket: t.ad }));
    } else if (tip.kapsam === 'dam') {
      ornekler = damlar.map(d => ({ dam_id: d.id, etiket: 'Dam ' + d.dam_no }));
    } else ornekler = [{ etiket: null }];
    const ekstra = ozelKurallar[tip.id] === 'ekstra';
    if (ornekler.length === 0 && ekstra) ornekler = [{ etiket: null }];
    if (!(tip.zorunlu || ekstra)) continue;
    for (const o of ornekler) {
      let s = 'SELECT * FROM belgeler WHERE belge_tipi_id=? AND hak_sahibi_id=?';
      const p = [tip.id, hsId];
      if (o.tekne_id) { s += ' AND tekne_id=?'; p.push(o.tekne_id); }
      else if (o.dam_id) { s += ' AND dam_id=?'; p.push(o.dam_id); }
      s += ' ORDER BY olusturma_tarihi DESC LIMIT 1';
      const belge = getir(s, ...p);
      const durum = etkinDurum(belge, tip.hatirlatma_gun);
      if (DURUM_BILGI[durum].oncelik < 1) {
        eksikler.push({ ad: tip.ad + (o.etiket ? ` (${o.etiket})` : ''), durum });
      }
    }
  }
  return eksikler;
}

// Bir hak sahibinin uygunluk skorunu V2 mantığıyla hesapla (panel/rapor/mesaj ortak)
function hsUygunluk(hsId, limanId) {
  const tipler = tumu('SELECT * FROM belge_tipleri WHERE liman_id=? AND aktif=1', limanId);
  const tekneler = tumu('SELECT * FROM tekneler WHERE hak_sahibi_id=?', hsId);
  const damlar = tumu('SELECT * FROM damlar WHERE hak_sahibi_id=?', hsId);
  const ozelKurallar = {};
  for (const kr of tumu('SELECT belge_tipi_id, kural FROM hak_sahibi_belge_kurallari WHERE hak_sahibi_id=?', hsId)) {
    ozelKurallar[kr.belge_tipi_id] = kr.kural;
  }
  const belgeBul = (tipId, tekneId, damId) => {
    let s = 'SELECT * FROM belgeler WHERE belge_tipi_id=? AND hak_sahibi_id=?';
    const p = [tipId, hsId];
    if (tekneId) { s += ' AND tekne_id=?'; p.push(tekneId); }
    else if (damId) { s += ' AND dam_id=?'; p.push(damId); }
    s += ' ORDER BY olusturma_tarihi DESC LIMIT 1';
    return getir(s, ...p);
  };
  return uygunlukHesabiV2(tipler, tekneler, damlar, ozelKurallar, belgeBul);
}

app.get('/api/hak-sahipleri/:id/belge-durumu', girisGerekli, (req, res) => {
  const hsId = Number(req.params.id);
  const k = hsKapsamKontrol(req, hsId);
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const tipler = tumu('SELECT * FROM belge_tipleri WHERE liman_id=? AND aktif=1 ORDER BY kategori, ad', k.hs.liman_id);
  const hsTekneler = tumu('SELECT * FROM tekneler WHERE hak_sahibi_id=? ORDER BY ad', hsId);
  const hsDamlar = tumu('SELECT * FROM damlar WHERE hak_sahibi_id=? ORDER BY dam_no', hsId);
  // Kişiye özel kurallar: { belge_tipi_id: 'ekstra'|'muaf' }
  const ozelKurallar = {};
  for (const kr of tumu('SELECT belge_tipi_id, kural FROM hak_sahibi_belge_kurallari WHERE hak_sahibi_id=?', hsId)) {
    ozelKurallar[kr.belge_tipi_id] = kr.kural;
  }

  // Bir belge tipinin bu kişi için kaç örneği gerekli? Hangi varlıklar için?
  // Dönen: [{ tekne_id?, dam_id?, etiket }]
  function gerekliOrnekler(tip) {
    if (ozelKurallar[tip.id] === 'muaf') return [];
    if (tip.kapsam === 'tekne') {
      // Koşullu kural (boy) varsa uygun tekneler; yoksa hepsi
      let tekneler = hsTekneler;
      if (tip.kosul_min_boy != null) tekneler = tekneler.filter(t => (t.boy_metre ?? 0) >= tip.kosul_min_boy);
      if (tip.kosul_max_boy != null) tekneler = tekneler.filter(t => (t.boy_metre ?? 999) <= tip.kosul_max_boy);
      return tekneler.map(t => ({ tekne_id: t.id, etiket: t.ad }));
    }
    if (tip.kapsam === 'dam') {
      return hsDamlar.map(d => ({ dam_id: d.id, etiket: 'Dam ' + d.dam_no }));
    }
    return [{ etiket: null }]; // kişiye ait → tek örnek
  }

  const satirlar = [];
  const skorParcalari = []; // her gerekli örnek için { tip, durum }
  for (const tip of tipler) {
    const ornekler = gerekliOrnekler(tip);
    // Ekstra kural: normalde gerekmese bile (örn. teknesi yok ama ekstra istendi) tek örnek ekle
    const ekstra = ozelKurallar[tip.id] === 'ekstra';
    const liste = ornekler.length > 0 ? ornekler : (ekstra ? [{ etiket: null }] : []);

    for (const o of liste) {
      // İlgili belgeyi bul (tekne_id/dam_id eşleşmesiyle)
      let sorgu = 'SELECT * FROM belgeler WHERE belge_tipi_id=? AND hak_sahibi_id=?';
      const params = [tip.id, hsId];
      if (o.tekne_id) { sorgu += ' AND tekne_id=?'; params.push(o.tekne_id); }
      else if (o.dam_id) { sorgu += ' AND dam_id=?'; params.push(o.dam_id); }
      sorgu += ' ORDER BY olusturma_tarihi DESC LIMIT 1';
      const belge = getir(sorgu, ...params);
      const durum = etkinDurum(belge, tip.hatirlatma_gun);
      const zorunlu = !!tip.zorunlu || ekstra;
      satirlar.push({
        belge_tipi_id: tip.id, ad: tip.ad, kategori: tip.kategori, kapsam: tip.kapsam,
        zorunlu, gecerlilik_ay: tip.gecerlilik_ay,
        tekne_id: o.tekne_id || null, dam_id: o.dam_id || null, ornek_etiket: o.etiket,
        belge_id: belge?.id || null, dosya_adi: belge?.dosya_adi || null,
        gecerlilik_bitis: belge?.gecerlilik_bitis || null, red_gerekce: belge?.red_gerekce || null,
        durum, durum_etiket: DURUM_BILGI[durum].etiket, durum_renk: DURUM_BILGI[durum].renk,
        ozel: ozelKurallar[tip.id] || null,
      });
      if (zorunlu) skorParcalari.push(durum);
    }
  }

  // Uygunluk skoru: zorunlu örneklerin onaylı oranı
  const toplam = skorParcalari.length;
  const tam = skorParcalari.filter(d => DURUM_BILGI[d].oncelik === 1).length;
  const yuzde = toplam === 0 ? 100 : Math.round((tam / toplam) * 100);
  const eksik = skorParcalari.filter(d => DURUM_BILGI[d].oncelik < 1).length;

  res.json({
    hak_sahibi: { id: k.hs.id, ad_soyad: k.hs.ad_soyad },
    skor: { yuzde, tam, toplam, eksik },
    belgeler: satirlar,
  });
});

// ---- KİŞİYE ÖZEL BELGE KURALLARI ----
app.get('/api/hak-sahipleri/:id/ozel-kurallar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const kurallar = tumu(
    `SELECT kr.*, bt.ad AS belge_adi FROM hak_sahibi_belge_kurallari kr
     JOIN belge_tipleri bt ON bt.id=kr.belge_tipi_id WHERE kr.hak_sahibi_id=?`, k.hs.id
  );
  res.json(kurallar);
});

app.post('/api/hak-sahipleri/:id/ozel-kurallar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const { belge_tipi_id, kural } = req.body;
  if (!belge_tipi_id || !['ekstra', 'muaf'].includes(kural)) return res.status(400).json({ hata: 'Geçersiz kural.' });
  const tip = getir('SELECT id FROM belge_tipleri WHERE id=? AND liman_id=?', Number(belge_tipi_id), k.hs.liman_id);
  if (!tip) return res.status(404).json({ hata: 'Belge tipi bu limanda bulunamadı.' });
  // Varsa güncelle, yoksa ekle (UNIQUE kısıtı nedeniyle)
  calistir(
    `INSERT INTO hak_sahibi_belge_kurallari (hak_sahibi_id,belge_tipi_id,kural) VALUES (?,?,?)
     ON CONFLICT(hak_sahibi_id,belge_tipi_id) DO UPDATE SET kural=excluded.kural`,
    k.hs.id, Number(belge_tipi_id), kural
  );
  res.status(201).json({ basarili: true });
});

app.delete('/api/hak-sahipleri/:id/ozel-kurallar/:kuralId', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const k = hsKapsamKontrol(req, Number(req.params.id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  calistir('DELETE FROM hak_sahibi_belge_kurallari WHERE id=? AND hak_sahibi_id=?', Number(req.params.kuralId), k.hs.id);
  res.json({ basarili: true });
});

// ---- BELGE YÜKLEME ----
app.post('/api/belgeler', girisGerekli, yukle.single('dosya'), (req, res) => {
  const { belge_tipi_id, hak_sahibi_id, tekne_id, dam_id, duzenlenme_tarihi } = req.body;
  if (!belge_tipi_id || !hak_sahibi_id) return res.status(400).json({ hata: 'Belge tipi ve hak sahibi zorunlu.' });
  if (!req.file) return res.status(400).json({ hata: 'Geçerli bir dosya yükleyin (PDF/JPG/PNG, en çok 10 MB).' });
  const k = hsKapsamKontrol(req, Number(hak_sahibi_id));
  if (k.hata) return res.status(k.kod).json({ hata: k.hata });
  const tip = getir('SELECT * FROM belge_tipleri WHERE id=? AND liman_id=?', Number(belge_tipi_id), k.hs.liman_id);
  if (!tip) return res.status(404).json({ hata: 'Belge tipi bulunamadı.' });

  // Geçerlilik bitişini hesapla
  let bitis = null;
  if (tip.gecerlilik_ay && duzenlenme_tarihi) {
    const d = new Date(duzenlenme_tarihi);
    d.setMonth(d.getMonth() + tip.gecerlilik_ay);
    bitis = d.toISOString().slice(0, 10);
  }
  const r = calistir(
    `INSERT INTO belgeler (belge_tipi_id,hak_sahibi_id,tekne_id,dam_id,dosya_adi,dosya_yolu,dosya_tur,duzenlenme_tarihi,gecerlilik_bitis,durum)
     VALUES (?,?,?,?,?,?,?,?,?,'incelemede')`,
    Number(belge_tipi_id), Number(hak_sahibi_id), tekne_id || null, dam_id || null,
    req.file.originalname, req.file.filename, req.file.mimetype, duzenlenme_tarihi || null, bitis
  );
  res.status(201).json(getir('SELECT * FROM belgeler WHERE id = ?', r.lastInsertRowid));
});

// ---- BELGE İNCELEME (onay/red) ----
app.put('/api/belgeler/:id/incele', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const id = Number(req.params.id);
  const { karar, red_gerekce } = req.body; // karar: 'onayli' | 'reddedildi'
  if (!['onayli', 'reddedildi'].includes(karar)) return res.status(400).json({ hata: 'Geçersiz karar.' });
  const belge = getir('SELECT b.*, bt.liman_id FROM belgeler b JOIN belge_tipleri bt ON bt.id=b.belge_tipi_id WHERE b.id=?', id);
  if (!belge) return res.status(404).json({ hata: 'Belge bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== belge.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  if (karar === 'reddedildi' && !red_gerekce) return res.status(400).json({ hata: 'Red için gerekçe girin.' });
  calistir(
    `UPDATE belgeler SET durum=?, red_gerekce=?, inceleyen_id=?, inceleme_tarihi=datetime('now') WHERE id=?`,
    karar, karar === 'reddedildi' ? red_gerekce : null, req.kullanici.id, id
  );

  // Hak sahibine bildirim üret
  const belgeTip = getir('SELECT ad FROM belge_tipleri WHERE id=?', belge.belge_tipi_id);
  const hsKul = hakSahibiKullanicisi(belge.hak_sahibi_id);
  if (hsKul) {
    if (karar === 'onayli') {
      bildirimEkle(hsKul, 'belge_onay', `Belgeniz onaylandı: ${belgeTip?.ad || 'Belge'}`,
        `${belgeTip?.ad || 'Belgeniz'} incelendi ve onaylandı.`, id);
    } else {
      bildirimEkle(hsKul, 'belge_red', `Belgeniz reddedildi: ${belgeTip?.ad || 'Belge'}`,
        `Gerekçe: ${red_gerekce}. Lütfen düzeltip yeniden yükleyin.`, id);
    }
  }
  res.json(getir('SELECT * FROM belgeler WHERE id = ?', id));
});

// ---- İNCELEME KUYRUĞU (bekleyen belgeler) ----
app.get('/api/inceleme-kuyrugu', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  const ortak = `SELECT b.id, b.dosya_adi, b.duzenlenme_tarihi, b.gecerlilik_bitis, b.olusturma_tarihi,
      bt.ad AS belge_tipi, bt.kategori, h.ad_soyad AS hak_sahibi_adi, h.id AS hak_sahibi_id, l.ad AS liman_adi
    FROM belgeler b
    JOIN belge_tipleri bt ON bt.id=b.belge_tipi_id
    JOIN hak_sahipleri h ON h.id=b.hak_sahibi_id
    JOIN limanlar l ON l.id=bt.liman_id
    WHERE b.durum='incelemede'`;
  const satirlar = kapsam === null
    ? tumu(ortak + ' ORDER BY b.olusturma_tarihi ASC')
    : tumu(ortak + ' AND bt.liman_id=? ORDER BY b.olusturma_tarihi ASC', kapsam);
  res.json(satirlar);
});

// ---- BELGE DOSYASI GÖRÜNTÜLE/İNDİR ----
app.get('/api/belgeler/:id/dosya', girisGerekli, (req, res) => {
  const id = Number(req.params.id);
  const belge = getir('SELECT b.*, bt.liman_id FROM belgeler b JOIN belge_tipleri bt ON bt.id=b.belge_tipi_id WHERE b.id=?', id);
  if (!belge || !belge.dosya_yolu) return res.status(404).json({ hata: 'Dosya bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== belge.liman_id) {
    // hak sahibi/vekil kendi belgesi mi?
    const hs = getir('SELECT kullanici_id FROM hak_sahipleri WHERE id=?', belge.hak_sahibi_id);
    if (!(selfServisMi(req) && hs?.kullanici_id === req.kullanici.id)) {
      return res.status(403).json({ hata: 'Erişim yok.' });
    }
  }
  res.sendFile(join(YUKLEME_DIZIN, belge.dosya_yolu));
});

// ---- Giriş yapan hak sahibi/vekilin bağlı kaydını bulması ----
app.get('/api/benim-kaydim', girisGerekli, (req, res) => {
  if (!selfServisMi(req)) return res.status(400).json({ hata: 'Yalnızca hak sahipleri/vekiller içindir.' });
  const hs = getir('SELECT * FROM hak_sahipleri WHERE kullanici_id = ?', req.kullanici.id);
  if (!hs) return res.status(404).json({ hata: 'Bağlı hak sahibi kaydı bulunamadı. Lütfen liman yöneticinizle iletişime geçin.' });
  res.json(hs);
});

// ============================================================
// FAZ 3 — DUYURULAR, BİLDİRİMLER, PANEL
// ============================================================

// ---- DUYURULAR ----
// Kullanıcının görebileceği duyurular: kendi limanı + tüm sistem; 'secili' ise sadece hedefindekiler
app.get('/api/duyurular', girisGerekli, (req, res) => {
  let limanId = req.kullanici.liman_id;
  let benimHsId = null;
  if (selfServisMi(req)) {
    const hs = getir('SELECT id, liman_id FROM hak_sahipleri WHERE kullanici_id=?', req.kullanici.id);
    limanId = hs?.liman_id ?? null;
    benimHsId = hs?.id ?? null;
  }
  let satirlar;
  if (req.kullanici.rol === 'super_admin') {
    satirlar = tumu(`SELECT d.*, l.ad AS liman_adi FROM duyurular d LEFT JOIN limanlar l ON l.id=d.liman_id WHERE d.aktif=1 ORDER BY d.olusturma_tarihi DESC`);
  } else if (selfServisMi(req)) {
    // Hak sahibi/vekil: herkese açık olanlar + kendisine özel hedeflenenler
    satirlar = tumu(
      `SELECT d.*, l.ad AS liman_adi FROM duyurular d LEFT JOIN limanlar l ON l.id=d.liman_id
       WHERE d.aktif=1 AND (d.liman_id IS NULL OR d.liman_id=?)
         AND (d.hedef_tipi='herkes' OR d.id IN (SELECT duyuru_id FROM duyuru_hedefleri WHERE hak_sahibi_id=?))
       ORDER BY d.olusturma_tarihi DESC`,
      limanId, benimHsId
    );
  } else {
    // Liman yöneticisi/personeli: kendi limanının + sistem duyuruları (hepsini görür)
    satirlar = tumu(
      `SELECT d.*, l.ad AS liman_adi FROM duyurular d LEFT JOIN limanlar l ON l.id=d.liman_id
       WHERE d.aktif=1 AND (d.liman_id IS NULL OR d.liman_id=?) ORDER BY d.olusturma_tarihi DESC`,
      limanId
    );
  }
  // Okundu bilgisini ekle
  const okunanlar = new Set(tumu('SELECT duyuru_id FROM duyuru_okundu WHERE kullanici_id=?', req.kullanici.id).map(x => x.duyuru_id));
  satirlar.forEach(d => { d.okundu = okunanlar.has(d.id); });
  res.json(satirlar);
});

// Okunmamış duyuru sayısı (menü rozeti için)
app.get('/api/duyurular/okunmamis-sayi', girisGerekli, (req, res) => {
  // Görülebilir duyuruları yukarıdaki mantıkla say
  let limanId = req.kullanici.liman_id, benimHsId = null;
  if (selfServisMi(req)) {
    const hs = getir('SELECT id, liman_id FROM hak_sahipleri WHERE kullanici_id=?', req.kullanici.id);
    limanId = hs?.liman_id ?? null; benimHsId = hs?.id ?? null;
  }
  let gorunur;
  if (req.kullanici.rol === 'super_admin') {
    gorunur = tumu('SELECT id FROM duyurular WHERE aktif=1');
  } else if (selfServisMi(req)) {
    gorunur = tumu(`SELECT id FROM duyurular WHERE aktif=1 AND (liman_id IS NULL OR liman_id=?)
       AND (hedef_tipi='herkes' OR id IN (SELECT duyuru_id FROM duyuru_hedefleri WHERE hak_sahibi_id=?))`, limanId, benimHsId);
  } else {
    gorunur = tumu('SELECT id FROM duyurular WHERE aktif=1 AND (liman_id IS NULL OR liman_id=?)', limanId);
  }
  const okunanlar = new Set(tumu('SELECT duyuru_id FROM duyuru_okundu WHERE kullanici_id=?', req.kullanici.id).map(x => x.duyuru_id));
  const sayi = gorunur.filter(d => !okunanlar.has(d.id)).length;
  res.json({ sayi });
});

// Tek duyuru detayı (aç) + okundu olarak işaretle
app.get('/api/duyurular/:id', girisGerekli, (req, res) => {
  const id = Number(req.params.id);
  const d = getir(`SELECT d.*, l.ad AS liman_adi, k.ad_soyad AS yayinlayan_adi
    FROM duyurular d LEFT JOIN limanlar l ON l.id=d.liman_id LEFT JOIN kullanicilar k ON k.id=d.yayinlayan_id
    WHERE d.id=? AND d.aktif=1`, id);
  if (!d) return res.status(404).json({ hata: 'Duyuru bulunamadı.' });
  // Okundu işaretle (varsa dokunma)
  calistir(`INSERT INTO duyuru_okundu (duyuru_id,kullanici_id) VALUES (?,?) ON CONFLICT(duyuru_id,kullanici_id) DO NOTHING`, id, req.kullanici.id);
  // Yöneticiye hedef kişileri de göster
  if (['super_admin', 'liman_yoneticisi', 'liman_personeli'].includes(req.kullanici.rol) && d.hedef_tipi === 'secili') {
    d.hedefler = tumu(`SELECT h.id, h.ad_soyad FROM duyuru_hedefleri dh JOIN hak_sahipleri h ON h.id=dh.hak_sahibi_id WHERE dh.duyuru_id=?`, id);
  }
  res.json(d);
});

// Duyuru ekli dosyasını indir
app.get('/api/duyurular/:id/dosya', girisGerekli, (req, res) => {
  const d = getir('SELECT * FROM duyurular WHERE id=? AND aktif=1', Number(req.params.id));
  if (!d || !d.dosya_yolu) return res.status(404).json({ hata: 'Dosya yok.' });
  res.sendFile(join(YUKLEME_DIZIN, d.dosya_yolu));
});

app.post('/api/duyurular', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), yukle.single('dosya'), (req, res) => {
  let { liman_id, baslik, icerik, oncelik, hedef_tipi, hedef_hsler } = req.body;
  if (!baslik || !icerik) return res.status(400).json({ hata: 'Başlık ve içerik zorunlu.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null) liman_id = kapsam;
  else if (!liman_id) liman_id = null;
  hedef_tipi = hedef_tipi === 'secili' ? 'secili' : 'herkes';

  const r = calistir(
    `INSERT INTO duyurular (liman_id,baslik,icerik,oncelik,yayinlayan_id,hedef_tipi,dosya_yolu,dosya_adi) VALUES (?,?,?,?,?,?,?,?)`,
    liman_id, baslik, icerik, oncelik || 'normal', req.kullanici.id, hedef_tipi,
    req.file ? req.file.filename : null, req.file ? req.file.originalname : null
  );
  const duyuruId = r.lastInsertRowid;

  // Hedef kişileri çöz
  let hedefHs;
  if (hedef_tipi === 'secili') {
    let idler = [];
    try { idler = JSON.parse(hedef_hsler || '[]'); } catch {}
    idler = idler.map(Number).filter(Boolean);
    for (const hsId of idler) {
      // Güvenlik: hak sahibi gerçekten bu limanda mı?
      const hs = getir('SELECT id, liman_id, kullanici_id FROM hak_sahipleri WHERE id=?', hsId);
      if (!hs) continue;
      if (kapsam !== null && hs.liman_id !== kapsam) continue;
      calistir('INSERT OR IGNORE INTO duyuru_hedefleri (duyuru_id,hak_sahibi_id) VALUES (?,?)', duyuruId, hsId);
    }
    hedefHs = tumu(`SELECT h.kullanici_id FROM duyuru_hedefleri dh JOIN hak_sahipleri h ON h.id=dh.hak_sahibi_id WHERE dh.duyuru_id=? AND h.kullanici_id IS NOT NULL`, duyuruId);
  } else {
    hedefHs = liman_id === null
      ? tumu('SELECT kullanici_id FROM hak_sahipleri WHERE kullanici_id IS NOT NULL')
      : tumu('SELECT kullanici_id FROM hak_sahipleri WHERE liman_id=? AND kullanici_id IS NOT NULL', liman_id);
  }
  for (const h of hedefHs) bildirimEkle(h.kullanici_id, 'duyuru', `Yeni duyuru: ${baslik}`, icerik, null);
  res.status(201).json(getir('SELECT * FROM duyurular WHERE id = ?', duyuruId));
});

app.delete('/api/duyurular/:id', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const id = Number(req.params.id);
  const d = getir('SELECT * FROM duyurular WHERE id=?', id);
  if (!d) return res.status(404).json({ hata: 'Duyuru bulunamadı.' });
  const kapsam = limanKapsami(req);
  if (kapsam !== null && kapsam !== d.liman_id) return res.status(403).json({ hata: 'Erişim yok.' });
  calistir('DELETE FROM duyurular WHERE id=?', id);
  res.json({ basarili: true });
});

// ---- BİLDİRİMLER ----
app.get('/api/bildirimler', girisGerekli, (req, res) => {
  const satirlar = tumu(
    `SELECT * FROM bildirimler WHERE kullanici_id=? ORDER BY olusturma_tarihi DESC LIMIT 50`,
    req.kullanici.id
  );
  const okunmamis = getir('SELECT COUNT(*) c FROM bildirimler WHERE kullanici_id=? AND okundu=0', req.kullanici.id).c;
  res.json({ okunmamis, bildirimler: satirlar });
});

app.put('/api/bildirimler/:id/okundu', girisGerekli, (req, res) => {
  const id = Number(req.params.id);
  calistir('UPDATE bildirimler SET okundu=1 WHERE id=? AND kullanici_id=?', id, req.kullanici.id);
  res.json({ basarili: true });
});

app.put('/api/bildirimler/tumu-okundu', girisGerekli, (req, res) => {
  calistir('UPDATE bildirimler SET okundu=1 WHERE kullanici_id=?', req.kullanici.id);
  res.json({ basarili: true });
});

// ---- SÜRE DOLUM TARAMASI (manuel tetikleme; üretimde zamanlanmış görev olur) ----
app.post('/api/sure-taramasi', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const sonuc = sureDolumTaramasi();
  res.json(sonuc);
});

// ---- TRAFİK-IŞIĞI PANELİ (yönetici: tüm hak sahipleri uygunluk durumu) ----
app.get('/api/panel', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  const hsListe = kapsam === null
    ? tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id ORDER BY h.ad_soyad')
    : tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id WHERE h.liman_id=? ORDER BY h.ad_soyad', kapsam);

  const sonuc = hsListe.map(hs => {
    const skor = hsUygunluk(hs.id, hs.liman_id);
    // Trafik ışığı: yeşil=100, sarı=40-99, kırmızı<40
    const isik = skor.yuzde === 100 ? 'yesil' : skor.yuzde >= 40 ? 'sari' : 'kirmizi';
    return {
      id: hs.id, ad_soyad: hs.ad_soyad, liman_adi: hs.liman_adi,
      telefon: hs.telefon, yuzde: skor.yuzde, tam: skor.tam, toplam: skor.toplam,
      eksik_sayi: skor.eksik, isik,
    };
  });
  // Özet sayım
  const ozet = {
    yesil: sonuc.filter(s => s.isik === 'yesil').length,
    sari: sonuc.filter(s => s.isik === 'sari').length,
    kirmizi: sonuc.filter(s => s.isik === 'kirmizi').length,
  };
  res.json({ ozet, hak_sahipleri: sonuc });
});

// ============================================================
// WEB TAMAMLAMA — RAPORLAR, MESAJLAR
// ============================================================

// CSV güvenli hücre
function csvHucre(deger) {
  const s = String(deger ?? '');
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function csvUret(basliklar, satirlar) {
  // UTF-8 BOM (Excel Türkçe karakter için)
  const bom = '\uFEFF';
  const head = basliklar.map(csvHucre).join(';');
  const body = satirlar.map(r => r.map(csvHucre).join(';')).join('\n');
  return bom + head + '\n' + body;
}

// Bir limanın hak sahipleri için uygunluk verisini topla (rapor ortak fonksiyonu)
function raporVerisi(kapsam) {
  const hsListe = kapsam === null
    ? tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id ORDER BY l.ad, h.ad_soyad')
    : tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id WHERE h.liman_id=? ORDER BY h.ad_soyad', kapsam);
  return hsListe.map(hs => {
    const skor = hsUygunluk(hs.id, hs.liman_id);
    return { hs, skor };
  });
}

// ---- RAPOR: Uygunluk durumu (CSV) ----
app.get('/api/rapor/uygunluk.csv', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const veri = raporVerisi(limanKapsami(req));
  const basliklar = ['Hak Sahibi', 'Liman', 'Telefon', 'Uygunluk %', 'Tam Belge', 'Toplam Zorunlu', 'Eksik', 'Durum'];
  const satirlar = veri.map(({ hs, skor }) => [
    hs.ad_soyad, hs.liman_adi, hs.telefon || '', skor.yuzde, skor.tam, skor.toplam, skor.eksik,
    skor.yuzde === 100 ? 'Tam' : skor.yuzde >= 40 ? 'Dikkat' : 'Eksik',
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="uygunluk-raporu.csv"');
  res.send(csvUret(basliklar, satirlar));
});

// ---- RAPOR: Eksik belgeler detayı (CSV) ----
app.get('/api/rapor/eksik-belgeler.csv', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const kapsam = limanKapsami(req);
  const hsListe = kapsam === null
    ? tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id ORDER BY l.ad, h.ad_soyad')
    : tumu('SELECT h.*, l.ad AS liman_adi FROM hak_sahipleri h JOIN limanlar l ON l.id=h.liman_id WHERE h.liman_id=? ORDER BY h.ad_soyad', kapsam);
  const basliklar = ['Hak Sahibi', 'Liman', 'Telefon', 'Eksik/Sorunlu Belge', 'Durum'];
  const satirlar = [];
  for (const hs of hsListe) {
    for (const e of eksikBelgeDetaylari(hs.id, hs.liman_id)) {
      satirlar.push([hs.ad_soyad, hs.liman_adi, hs.telefon || '', e.ad, DURUM_BILGI[e.durum]?.etiket || e.durum]);
    }
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="eksik-belgeler.csv"');
  res.send(csvUret(basliklar, satirlar));
});

// ---- RAPOR: Yazdırılabilir özet (HTML → tarayıcıdan PDF) ----
app.get('/api/rapor/uygunluk.html', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi', 'liman_personeli'), (req, res) => {
  const veri = raporVerisi(limanKapsami(req));
  const bugun = new Date().toLocaleDateString('tr-TR');
  const ozet = {
    yesil: veri.filter(v => v.skor.yuzde === 100).length,
    sari: veri.filter(v => v.skor.yuzde >= 40 && v.skor.yuzde < 100).length,
    kirmizi: veri.filter(v => v.skor.yuzde < 40).length,
  };
  const satirlar = veri.map(({ hs, skor }) => {
    const renk = skor.yuzde === 100 ? '#3a9d6a' : skor.yuzde >= 40 ? '#d8a93a' : '#d65a4a';
    return `<tr>
      <td>${esc(hs.ad_soyad)}</td><td>${esc(hs.liman_adi)}</td><td>${esc(hs.telefon || '-')}</td>
      <td style="text-align:center"><b style="color:${renk}">%${skor.yuzde}</b></td>
      <td style="text-align:center">${skor.tam}/${skor.toplam}</td>
      <td style="text-align:center">${skor.eksik}</td></tr>`;
  }).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
    <title>Uygunluk Raporu</title>
    <style>
      body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a2e36;padding:32px;max-width:900px;margin:auto}
      h1{font-size:22px;color:#0a2a3a;margin-bottom:4px}.alt{color:#5a7480;font-size:13px;margin-bottom:20px}
      .ozet{display:flex;gap:16px;margin-bottom:22px}
      .kutu{flex:1;border:1px solid #cdd9d7;border-radius:8px;padding:14px;text-align:center}
      .kutu b{font-size:26px;display:block}.kutu span{font-size:12px;color:#5a7480}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f7faf9;text-align:left;padding:9px 11px;border-bottom:2px solid #cdd9d7;font-size:11px;text-transform:uppercase;color:#5a7480}
      td{padding:9px 11px;border-bottom:1px solid #eef2f1}
      @media print{.yazdir{display:none}}
      .yazdir{margin-bottom:18px;padding:9px 16px;background:#0e7c86;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
    </style></head><body>
    <button class="yazdir" onclick="window.print()">🖨️ Yazdır / PDF kaydet</button>
    <h1>⚓ Evrak Uygunluk Raporu</h1>
    <div class="alt">Oluşturma: ${bugun} • Toplam ${veri.length} hak sahibi</div>
    <div class="ozet">
      <div class="kutu"><b style="color:#3a9d6a">${ozet.yesil}</b><span>Tam (%100)</span></div>
      <div class="kutu"><b style="color:#d8a93a">${ozet.sari}</b><span>Dikkat (%40-99)</span></div>
      <div class="kutu"><b style="color:#d65a4a">${ozet.kirmizi}</b><span>Eksik (%40 altı)</span></div>
    </div>
    <table><thead><tr><th>Hak Sahibi</th><th>Liman</th><th>Telefon</th><th style="text-align:center">Uygunluk</th><th style="text-align:center">Belge</th><th style="text-align:center">Eksik</th></tr></thead>
    <tbody>${satirlar || '<tr><td colspan="6" style="text-align:center;color:#5a7480;padding:30px">Kayıt yok</td></tr>'}</tbody></table>
    </body></html>`);
});

// ---- MESAJLAR: toplu SMS/e-posta gönderimi ----
app.post('/api/mesaj/toplu', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), async (req, res) => {
  const { kanal, hedef, konu, icerik } = req.body;
  // hedef: 'tumu' | 'eksik' (eksik belgeli olanlar)
  if (!['sms', 'eposta'].includes(kanal)) return res.status(400).json({ hata: 'Geçersiz kanal.' });
  if (!icerik) return res.status(400).json({ hata: 'Mesaj içeriği zorunlu.' });
  const kapsam = limanKapsami(req);

  let hsListe = kapsam === null
    ? tumu('SELECT * FROM hak_sahipleri WHERE aktif=1')
    : tumu('SELECT * FROM hak_sahipleri WHERE liman_id=? AND aktif=1', kapsam);

  // Eksik belgeli filtresi
  if (hedef === 'eksik') {
    hsListe = hsListe.filter(hs => hsUygunluk(hs.id, hs.liman_id).yuzde < 100);
  }

  const alicilar = hsListe
    .map(hs => ({ alici: kanal === 'sms' ? hs.telefon : hs.eposta, alici_ad: hs.ad_soyad }))
    .filter(a => a.alici);

  if (alicilar.length === 0) return res.status(400).json({ hata: 'Gönderilecek geçerli alıcı yok (telefon/e-posta eksik olabilir).' });

  const sonuc = await topluGonder({ kanal, alicilar, konu, icerik, liman_id: kapsam, gonderen_id: req.kullanici.id });
  res.json(sonuc);
});

// ---- MESAJ KAYITLARI (geçmiş) ----
app.get('/api/mesaj/kayitlar', girisGerekli, rolGerekli('super_admin', 'liman_yoneticisi'), (req, res) => {
  const kapsam = limanKapsami(req);
  const satirlar = kapsam === null
    ? tumu('SELECT * FROM mesaj_kayitlari ORDER BY olusturma_tarihi DESC LIMIT 100')
    : tumu('SELECT * FROM mesaj_kayitlari WHERE liman_id=? ORDER BY olusturma_tarihi DESC LIMIT 100', kapsam);
  res.json({ simulasyon: simulasyonModu(), kayitlar: satirlar });
});

// SPA fallback
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ hata: 'Bulunamadı.' });
  res.sendFile(join(FRONTEND_DIZIN, 'index.html'));
});

// HTML kaçış (raporlar için)
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Liman sistemi çalışıyor: http://localhost:${PORT}`));

// ---- OTOMATİK SÜRE DOLUM TARAMASI ----
// Sunucu açıkken her 12 saatte bir çalışır; açılıştan 10 sn sonra ilk tarama.
function otomatikTarama() {
  try {
    const sonuc = sureDolumTaramasi();
    if (sonuc.yaklasan || sonuc.dolan) {
      console.log(`[Otomatik tarama] ${sonuc.yaklasan} yaklaşan, ${sonuc.dolan} dolmuş belge bildirildi.`);
    }
  } catch (e) {
    console.error('[Otomatik tarama hatası]', e.message);
  }
}
setTimeout(otomatikTarama, 10_000);
setInterval(otomatikTarama, 12 * 60 * 60 * 1000);
