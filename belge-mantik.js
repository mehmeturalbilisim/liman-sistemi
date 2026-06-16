// belge-mantik.js — Belge yaşam döngüsü ve uygunluk skoru hesaplama

// Bir belgenin "etkin durumu"nu hesaplar (saklanan durum + tarih kontrolü)
// Dönüş: 'yuklenmedi' | 'incelemede' | 'reddedildi' | 'onayli' | 'yaklasiyor' | 'suresi_doldu'
export function etkinDurum(belge, hatirlatmaGun = 30) {
  if (!belge) return 'yuklenmedi';
  if (belge.durum === 'incelemede') return 'incelemede';
  if (belge.durum === 'reddedildi') return 'reddedildi';
  // onaylı → tarih kontrolü
  if (belge.durum === 'onayli') {
    if (!belge.gecerlilik_bitis) return 'onayli'; // süresiz
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const bitis = new Date(belge.gecerlilik_bitis);
    const kalanGun = Math.ceil((bitis - bugun) / 86400000);
    if (kalanGun < 0) return 'suresi_doldu';
    if (kalanGun <= (hatirlatmaGun || 30)) return 'yaklasiyor';
    return 'onayli';
  }
  return 'yuklenmedi';
}

// Durum görsel bilgisi (frontend ile ortak sözlük)
export const DURUM_BILGI = {
  yuklenmedi:   { etiket: 'Yüklenmedi',     renk: 'gri',    oncelik: 0 },
  reddedildi:   { etiket: 'Reddedildi',     renk: 'kirmizi', oncelik: 0 },
  suresi_doldu: { etiket: 'Süresi doldu',   renk: 'kirmizi', oncelik: 0 },
  yaklasiyor:   { etiket: 'Süresi yaklaşıyor', renk: 'sari', oncelik: 0.5 },
  incelemede:   { etiket: 'İncelemede',     renk: 'mavi',   oncelik: 0.5 },
  onayli:       { etiket: 'Onaylı',         renk: 'yesil',  oncelik: 1 },
};

// Bir hak sahibinin uygunluk skoru: zorunlu belge tiplerinin ne kadarı "tam" (onaylı/yaklaşıyor)
// belgeTipleri: o limanın aktif belge tipleri
// sonBelgeMap: her tip için en güncel belge
// tekneler: hak sahibinin tekneleri (koşullu kuralları değerlendirmek için, opsiyonel)
export function uygunlukSkoru(belgeTipleri, sonBelgeMap, tekneler = null) {
  // Koşullu kural değerlendirmesi: bir belge tipi yalnızca belirli boy aralığında
  // zorunluysa ve hak sahibinin o aralıkta teknesi yoksa, o tip "gerekli değil" sayılır.
  const gerekli = (tip) => {
    if (!tip.zorunlu || !tip.aktif) return false;
    const minB = tip.kosul_min_boy, maxB = tip.kosul_max_boy;
    if (minB == null && maxB == null) return true; // koşulsuz
    if (!tekneler || tekneler.length === 0) return false; // koşullu ama tekne bilgisi yok
    return tekneler.some(t => {
      const boy = t.boy_metre;
      if (boy == null) return false;
      if (minB != null && boy < minB) return false;
      if (maxB != null && boy > maxB) return false;
      return true;
    });
  };
  const zorunlular = belgeTipleri.filter(gerekli);
  if (zorunlular.length === 0) return { yuzde: 100, tam: 0, toplam: 0, eksik: [] };
  let puan = 0;
  const eksik = [];
  for (const tip of zorunlular) {
    const belge = sonBelgeMap[tip.id];
    const durum = etkinDurum(belge, tip.hatirlatma_gun);
    const bilgi = DURUM_BILGI[durum];
    puan += bilgi.oncelik;
    if (bilgi.oncelik < 1) eksik.push({ tip: tip.ad, durum });
  }
  return {
    yuzde: Math.round((puan / zorunlular.length) * 100),
    tam: zorunlular.filter(t => DURUM_BILGI[etkinDurum(sonBelgeMap[t.id], t.hatirlatma_gun)].oncelik === 1).length,
    toplam: zorunlular.length,
    eksik,
  };
}

// Yeni kapsamlı uygunluk hesabı: tekne/dam başına örnekler + kişiye özel kurallar.
// Parametreler veritabanından toplanıp verilir (server.js bu veriyi sağlar).
// tipler: belge_tipleri[], tekneler: [], damlar: [], ozelKurallar: {tipId: 'ekstra'|'muaf'}
// belgeBul(tipId, tekne_id|null, dam_id|null) → belge | null
export function uygunlukHesabiV2(tipler, tekneler, damlar, ozelKurallar, belgeBul) {
  const parcalar = []; // her zorunlu örnek için durum
  for (const tip of tipler) {
    if (ozelKurallar[tip.id] === 'muaf') continue;
    let ornekler;
    if (tip.kapsam === 'tekne') {
      let uygun = tekneler;
      if (tip.kosul_min_boy != null) uygun = uygun.filter(t => (t.boy_metre ?? 0) >= tip.kosul_min_boy);
      if (tip.kosul_max_boy != null) uygun = uygun.filter(t => (t.boy_metre ?? 999) <= tip.kosul_max_boy);
      ornekler = uygun.map(t => ({ tekne_id: t.id }));
    } else if (tip.kapsam === 'dam') {
      ornekler = damlar.map(d => ({ dam_id: d.id }));
    } else {
      ornekler = [{}];
    }
    const ekstra = ozelKurallar[tip.id] === 'ekstra';
    if (ornekler.length === 0 && ekstra) ornekler = [{}];
    const zorunlu = !!tip.zorunlu || ekstra;
    if (!zorunlu) continue;
    for (const o of ornekler) {
      const belge = belgeBul(tip.id, o.tekne_id || null, o.dam_id || null);
      parcalar.push(etkinDurum(belge, tip.hatirlatma_gun));
    }
  }
  const toplam = parcalar.length;
  const tam = parcalar.filter(d => DURUM_BILGI[d].oncelik === 1).length;
  const eksik = parcalar.filter(d => DURUM_BILGI[d].oncelik < 1).length;
  return { yuzde: toplam === 0 ? 100 : Math.round((tam / toplam) * 100), tam, toplam, eksik };
}
