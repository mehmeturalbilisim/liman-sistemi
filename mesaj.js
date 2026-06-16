// mesaj.js — SMS / e-posta gönderim servisi
// Şu an "simülasyon modu"nda çalışır: mesajı kaydeder ve gönderildi işaretler.
// Gerçek sağlayıcı (Netgsm, İleti Yönetim, SMTP) bağlamak için aşağıdaki
// smsGonder / epostaGonder fonksiyonlarının içini doldurmak yeterlidir.

import { calistir, getir } from './db.js';

// Ortam değişkeniyle gerçek gönderim açılabilir (varsayılan: simülasyon)
const GERCEK_GONDERIM = process.env.MESAJ_GERCEK === '1';

// ---- Sağlayıcı entegrasyon noktaları (şimdilik boş) ----
async function smsGonder(telefon, icerik) {
  if (!GERCEK_GONDERIM) {
    // Simülasyon: gerçekten göndermez, başarılı sayar
    return { basarili: true, saglayici: 'simulasyon' };
  }
  // TODO: Netgsm / İleti Yönetim API çağrısı buraya
  // örn: const r = await fetch('https://api.netgsm.com.tr/sms/send/get', {...});
  throw new Error('SMS sağlayıcısı yapılandırılmamış (MESAJ_GERCEK=1 ama entegrasyon eksik).');
}

async function epostaGonder(eposta, konu, icerik) {
  if (!GERCEK_GONDERIM) {
    return { basarili: true, saglayici: 'simulasyon' };
  }
  // TODO: SMTP / SendGrid / Amazon SES çağrısı buraya
  throw new Error('E-posta sağlayıcısı yapılandırılmamış.');
}

// ---- Genel gönderim: kaydet + gönder + durumu güncelle ----
export async function mesajGonder({ kanal, alici, alici_ad, konu, icerik, liman_id, gonderen_id }) {
  // Önce kuyruğa kaydet
  const r = calistir(
    `INSERT INTO mesaj_kayitlari (kanal,alici,alici_ad,konu,icerik,durum,liman_id,gonderen_id)
     VALUES (?,?,?,?,?,'kuyrukta',?,?)`,
    kanal, alici, alici_ad, konu, icerik, liman_id, gonderen_id
  );
  const id = r.lastInsertRowid;

  try {
    if (!alici) throw new Error('Alıcı adresi/numarası yok.');
    if (kanal === 'sms') await smsGonder(alici, icerik);
    else await epostaGonder(alici, konu, icerik);
    calistir(`UPDATE mesaj_kayitlari SET durum='gonderildi' WHERE id=?`, id);
    return { id, durum: 'gonderildi' };
  } catch (e) {
    calistir(`UPDATE mesaj_kayitlari SET durum='basarisiz', hata=? WHERE id=?`, e.message, id);
    return { id, durum: 'basarisiz', hata: e.message };
  }
}

// Toplu gönderim: alıcı listesi [{alici, alici_ad}]
export async function topluGonder({ kanal, alicilar, konu, icerik, liman_id, gonderen_id }) {
  let gonderildi = 0, basarisiz = 0;
  for (const a of alicilar) {
    const s = await mesajGonder({ kanal, alici: a.alici, alici_ad: a.alici_ad, konu, icerik, liman_id, gonderen_id });
    if (s.durum === 'gonderildi') gonderildi++; else basarisiz++;
  }
  return { toplam: alicilar.length, gonderildi, basarisiz, simulasyon: !GERCEK_GONDERIM };
}

export function simulasyonModu() {
  return !GERCEK_GONDERIM;
}
