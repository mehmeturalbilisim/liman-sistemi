// seed.js — Test için örnek veri
import bcrypt from 'bcryptjs';
import db from './db.js';

// Temizle
db.exec(`DELETE FROM damlar; DELETE FROM tekneler; DELETE FROM hak_sahipleri; DELETE FROM kullanicilar; DELETE FROM limanlar;`);

const h = (s) => bcrypt.hashSync(s, 10);

// Limanlar
const liman1 = db.prepare(`INSERT INTO limanlar (ad,kooperatif_adi,il,ilce,yetkili_kisi,telefon) VALUES (?,?,?,?,?,?)`)
  .run('Karaburun Balıkçı Barınağı', 'S.S. Karaburun Su Ürünleri Koop.', 'İzmir', 'Karaburun', 'Ahmet Denizci', '0232 000 0001').lastInsertRowid;
const liman2 = db.prepare(`INSERT INTO limanlar (ad,kooperatif_adi,il,ilce,yetkili_kisi,telefon) VALUES (?,?,?,?,?,?)`)
  .run('Foça Liman Kooperatifi', 'S.S. Foça Su Ürünleri Koop.', 'İzmir', 'Foça', 'Mehmet Reis', '0232 000 0002').lastInsertRowid;

// Kullanıcılar
db.prepare(`INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol) VALUES (?,?,?,?)`)
  .run('Sistem Yöneticisi', 'admin@liman.gov.tr', h('admin123'), 'super_admin');
db.prepare(`INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol,liman_id) VALUES (?,?,?,?,?)`)
  .run('Karaburun Yöneticisi', 'karaburun@liman.gov.tr', h('liman123'), 'liman_yoneticisi', liman1);
db.prepare(`INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol,liman_id) VALUES (?,?,?,?,?)`)
  .run('Foça Yöneticisi', 'foca@liman.gov.tr', h('liman123'), 'liman_yoneticisi', liman2);

// Hak sahipleri (liman1)
const hs1 = db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon) VALUES (?,?,?,?)`)
  .run(liman1, 'Hasan Yılmaz', '12345678901', '0532 111 1111').lastInsertRowid;
const hs2 = db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon) VALUES (?,?,?,?)`)
  .run(liman1, 'Ali Demir', '12345678902', '0532 222 2222').lastInsertRowid;
const hs3 = db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon) VALUES (?,?,?,?)`)
  .run(liman2, 'Veli Kaya', '12345678903', '0532 333 3333').lastInsertRowid;

// Damı olmayan örnek kişiler (farklı bağlama durumları)
db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon,baglama_durumu) VALUES (?,?,?,?,'gecici')`)
  .run(liman1, 'Mehmet Serbest', '12345678904', '0532 444 4444');
db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon,baglama_durumu,sira_tarihi) VALUES (?,?,?,?,'sirada',?)`)
  .run(liman1, 'Osman Bekleyen', '12345678905', '0532 555 5555', '2026-03-01');
db.prepare(`INSERT INTO hak_sahipleri (liman_id,ad_soyad,tc_no,telefon,baglama_durumu,misafir_bitis) VALUES (?,?,?,?,'misafir',?)`)
  .run(liman1, 'Kemal Misafir', '12345678906', '0532 666 6666', '2026-07-15');

// Tekneler
db.prepare(`INSERT INTO tekneler (hak_sahibi_id,ad,tekne_tipi,boy_metre,baglama_kutugu_no,belge_sinifi) VALUES (?,?,?,?,?,'profesyonel')`)
  .run(hs1, 'Karadeniz', 'Trol', 14.5, 'BK-1001');
db.prepare(`INSERT INTO tekneler (hak_sahibi_id,ad,tekne_tipi,boy_metre,baglama_kutugu_no,belge_sinifi) VALUES (?,?,?,?,?,'amator')`)
  .run(hs2, 'Umut', 'Olta/Paragat', 9.0, 'BK-1002');

// Damlar
db.prepare(`INSERT INTO damlar (liman_id,hak_sahibi_id,dam_no,rihtim,durum) VALUES (?,?,?,?,?)`)
  .run(liman1, hs1, 'A-01', 'Kuzey Rıhtım', 'dolu');
db.prepare(`INSERT INTO damlar (liman_id,hak_sahibi_id,dam_no,rihtim,durum) VALUES (?,?,?,?,?)`)
  .run(liman1, hs2, 'A-02', 'Kuzey Rıhtım', 'dolu');
db.prepare(`INSERT INTO damlar (liman_id,dam_no,rihtim,durum) VALUES (?,?,?,?)`)
  .run(liman1, 'A-03', 'Kuzey Rıhtım', 'bos');
db.prepare(`INSERT INTO damlar (liman_id,hak_sahibi_id,dam_no,rihtim,durum) VALUES (?,?,?,?,?)`)
  .run(liman2, hs3, 'B-01', 'Ana Rıhtım', 'dolu');

// ===== FAZ 2: Belge tipleri (Karaburun limanı için örnek set) =====
const bt = (ad, kategori, kapsam, zorunlu, ay, hatirlatma) =>
  db.prepare(`INSERT INTO belge_tipleri (liman_id,ad,kategori,kapsam,zorunlu,gecerlilik_ay,hatirlatma_gun) VALUES (?,?,?,?,?,?,?)`)
    .run(liman1, ad, kategori, kapsam, zorunlu, ay, hatirlatma);

bt('Nüfus cüzdanı fotokopisi', 'kisisel', 'hak_sahibi', 1, null, 30);
bt('İkametgah belgesi', 'kisisel', 'hak_sahibi', 1, 12, 30);
bt('Su ürünleri ruhsat teskeresi', 'mesleki', 'hak_sahibi', 1, 12, 60);
bt('Balıkçı kooperatifi üyelik belgesi', 'mesleki', 'hak_sahibi', 1, 12, 30);
bt('Bağlama kütüğü ruhsatnamesi', 'tekne', 'tekne', 1, 60, 60);
bt('Denize elverişlilik belgesi', 'tekne', 'tekne', 1, 12, 30);
bt('Tekne sigortası (mali sorumluluk)', 'mali', 'tekne', 1, 12, 30);
bt('Vergi borcu yoktur yazısı', 'mali', 'hak_sahibi', 1, 6, 30);
bt('Dam tahsis sözleşmesi', 'dam', 'dam', 1, null, 30);
bt('Gemiadamı sağlık raporu', 'saglik', 'hak_sahibi', 0, 24, 30);

// Koşullu kural örneği: yalnızca 12m üzeri teknelerde telsiz ruhsatı zorunlu
db.prepare(`INSERT INTO belge_tipleri (liman_id,ad,kategori,kapsam,zorunlu,gecerlilik_ay,hatirlatma_gun,kosul_min_boy) VALUES (?,?,?,?,?,?,?,?)`)
  .run(liman1, 'Telsiz ruhsatı (GMDSS)', 'tekne', 'tekne', 1, 24, 30, 12);

// ===== FAZ 2: Hak sahibi giriş hesabı (Hasan Yılmaz ile eşleştir) =====
const hasanKul = db.prepare(`INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol,liman_id) VALUES (?,?,?,?,?)`)
  .run('Hasan Yılmaz', 'hasan@liman.gov.tr', h('hasan123'), 'hak_sahibi', liman1).lastInsertRowid;
db.prepare(`UPDATE hak_sahipleri SET kullanici_id=? WHERE id=?`).run(hasanKul, hs1);

// ===== Vekil hesabı: Ali Demir adına işlem yapan temsilci =====
const vekilKul = db.prepare(`INSERT INTO kullanicilar (ad_soyad,eposta,sifre_hash,rol,liman_id) VALUES (?,?,?,?,?)`)
  .run('Ali Demir (Vekil: oğlu)', 'vekil@liman.gov.tr', h('vekil123'), 'vekil', liman1).lastInsertRowid;
db.prepare(`UPDATE hak_sahipleri SET kullanici_id=? WHERE id=?`).run(vekilKul, hs2);

// ===== FAZ 3: Örnek duyurular =====
db.prepare(`INSERT INTO duyurular (liman_id,baslik,icerik,oncelik) VALUES (?,?,?,?)`)
  .run(null, 'Av yasağı dönemi yaklaşıyor', 'Genel av yasağı 15 Nisan-15 Eylül tarihleri arasında uygulanacaktır. Tüm hak sahiplerinin belgelerini güncel tutması rica olunur.', 'onemli');
db.prepare(`INSERT INTO duyurular (liman_id,baslik,icerik,oncelik) VALUES (?,?,?,?)`)
  .run(liman1, 'Liman bakım çalışması', 'Kuzey rıhtımda 10-12 Mart tarihlerinde bakım çalışması yapılacaktır. Teknelerinizi geçici olarak güney rıhtıma alınız.', 'normal');

console.log('Örnek veri yüklendi.');
console.log('Giriş bilgileri:');
console.log('  Süper Admin      → admin@liman.gov.tr / admin123');
console.log('  Liman Yöneticisi → karaburun@liman.gov.tr / liman123');
console.log('  Liman Yöneticisi → foca@liman.gov.tr / liman123');
console.log('  Hak Sahibi       → hasan@liman.gov.tr / hasan123');
console.log('  Vekil            → vekil@liman.gov.tr / vekil123');
