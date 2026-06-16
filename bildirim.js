// bildirim.js — Bildirim üretimi ve süre dolum taraması
import { calistir, getir, tumu } from './db.js';
import { etkinDurum } from './belge-mantik.js';

// Bir kullanıcıya bildirim ekle
export function bildirimEkle(kullaniciId, tur, baslik, icerik = null, ilgiliBelgeId = null) {
  if (!kullaniciId) return;
  calistir(
    `INSERT INTO bildirimler (kullanici_id,tur,baslik,icerik,ilgili_belge_id) VALUES (?,?,?,?,?)`,
    kullaniciId, tur, baslik, icerik, ilgiliBelgeId
  );
}

// Bir hak sahibine bağlı giriş kullanıcısını bul (varsa)
export function hakSahibiKullanicisi(hakSahibiId) {
  const hs = getir('SELECT kullanici_id FROM hak_sahipleri WHERE id = ?', hakSahibiId);
  return hs?.kullanici_id || null;
}

// Süre dolum taraması: onaylı belgeleri tara, yaklaşan/dolan için bildirim üret.
// Aynı belge için aynı türde tekrar bildirim üretmez (mükerrer engelleme).
export function sureDolumTaramasi() {
  const belgeler = tumu(`
    SELECT b.*, bt.hatirlatma_gun, bt.ad AS belge_adi, h.kullanici_id, h.ad_soyad
    FROM belgeler b
    JOIN belge_tipleri bt ON bt.id = b.belge_tipi_id
    JOIN hak_sahipleri h ON h.id = b.hak_sahibi_id
    WHERE b.durum = 'onayli' AND b.gecerlilik_bitis IS NOT NULL
  `);

  let yaklasan = 0, dolan = 0;
  for (const b of belgeler) {
    const durum = etkinDurum(b, b.hatirlatma_gun);
    if (durum !== 'yaklasiyor' && durum !== 'suresi_doldu') continue;
    const tur = durum === 'yaklasiyor' ? 'sure_yaklasiyor' : 'sure_doldu';

    // Bu belge için bu türde zaten bildirim var mı?
    const varMi = getir(
      `SELECT id FROM bildirimler WHERE ilgili_belge_id = ? AND tur = ?`,
      b.id, tur
    );
    if (varMi) continue;

    const baslik = durum === 'yaklasiyor'
      ? `Belge süresi yaklaşıyor: ${b.belge_adi}`
      : `Belge süresi doldu: ${b.belge_adi}`;
    const icerik = durum === 'yaklasiyor'
      ? `${b.belge_adi} belgenizin geçerliliği ${b.gecerlilik_bitis} tarihinde sona eriyor. Lütfen yenileyin.`
      : `${b.belge_adi} belgenizin geçerliliği ${b.gecerlilik_bitis} tarihinde sona erdi. Lütfen güncel belge yükleyin.`;

    // Hak sahibine bildir
    if (b.kullanici_id) bildirimEkle(b.kullanici_id, tur, baslik, icerik, b.id);
    if (durum === 'yaklasiyor') yaklasan++; else dolan++;
  }
  return { yaklasan, dolan, taranan: belgeler.length };
}
