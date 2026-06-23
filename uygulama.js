// uygulama.js — Liman Yönetim Sistemi (Faz 1) tek sayfa uygulaması

const API = '/api';
let durum = {
  token: localStorage.getItem('token') || null,
  kullanici: JSON.parse(localStorage.getItem('kullanici') || 'null'),
  sayfa: 'ozet',
  veri: {},
};

const rolAdi = {
  super_admin: 'Süper Admin',
  liman_yoneticisi: 'Liman Yöneticisi',
  liman_personeli: 'Liman Personeli',
  hak_sahibi: 'Hak Sahibi',
  vekil: 'Vekil',
};
const damDurumu = {
  bos: { etiket: 'Boş', sinif: 'rozet-gri' },
  dolu: { etiket: 'Dolu', sinif: 'rozet-teal' },
  bakim: { etiket: 'Bakımda', sinif: 'rozet-sari' },
};

const kategoriAdi = {
  kisisel: 'Kişisel / İdari',
  mesleki: 'Mesleki',
  tekne: 'Tekne / Teknik',
  mali: 'Mali / Sigorta',
  dam: 'Dam / Rıhtım',
  saglik: 'Sağlık',
};
// Tekne belge sınıfı: profesyonel / amatör
const belgeSinifi = {
  profesyonel: { etiket: 'Profesyonel', sinif: 'teal', ikon: '⚓' },
  amator: { etiket: 'Amatör', sinif: 'sari', ikon: '🎣' },
};
const kapsamAdi = { hak_sahibi: 'Kişiye ait', tekne: 'Tekneye ait', dam: 'Dama ait' };
// Bağlama durumu: dam tahsisli / geçici / sırada / misafir
const baglamaDurumu = {
  dam_sahibi: { etiket: 'Dam sahibi', sinif: 'teal', ikon: '🛟' },
  gecici: { etiket: 'Geçici bağlama', sinif: 'sari', ikon: '⚓' },
  sirada: { etiket: 'Sırada bekliyor', sinif: 'mavi', ikon: '⏳' },
  misafir: { etiket: 'Misafir tekne', sinif: 'gri', ikon: '🧭' },
};
const belgeDurumEtiket = {
  yuklenmedi: 'Yüklenmedi', reddedildi: 'Reddedildi', suresi_doldu: 'Süresi doldu',
  yaklasiyor: 'Süresi yaklaşıyor', incelemede: 'İncelemede', onayli: 'Onaylı',
};

// ---- API yardımcıları ----
async function istek(yol, secenek = {}) {
  const basliklar = { 'Content-Type': 'application/json', ...(secenek.headers || {}) };
  if (durum.token) basliklar['Authorization'] = 'Bearer ' + durum.token;
  const cevap = await fetch(API + yol, { ...secenek, headers: basliklar });
  if (cevap.status === 401) { cikis(); throw new Error('Oturum süresi doldu.'); }
  const veri = await cevap.json().catch(() => ({}));
  if (!cevap.ok) throw new Error(veri.hata || 'Bir hata oluştu.');
  return veri;
}

// Dosya (FormData) yükleme — Content-Type'ı tarayıcı ayarlar
async function istekDosya(yol, formData) {
  const basliklar = {};
  if (durum.token) basliklar['Authorization'] = 'Bearer ' + durum.token;
  const cevap = await fetch(API + yol, { method: 'POST', headers: basliklar, body: formData });
  if (cevap.status === 401) { cikis(); throw new Error('Oturum süresi doldu.'); }
  const veri = await cevap.json().catch(() => ({}));
  if (!cevap.ok) throw new Error(veri.hata || 'Yükleme başarısız.');
  return veri;
}

function toast(mesaj, tip = 'basari') {
  const eski = document.querySelector('.toast');
  if (eski) eski.remove();
  const t = document.createElement('div');
  t.className = `toast ${tip}`;
  t.innerHTML = `<span>${tip === 'basari' ? '✓' : '⚠'}</span><span>${mesaj}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

const yetkili = (...roller) => durum.kullanici && roller.includes(durum.kullanici.rol);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ============ GİRİŞ ============
function girisEkrani(hata = '') {
  document.getElementById('kok').innerHTML = `
    <div class="giris-sayfa">
      <div class="giris-kart">
        <div class="giris-logo">
          <div class="anchor">⚓</div>
          <div>
            <div class="giris-baslik">Liman Yönetim<br/>Sistemi</div>
          </div>
        </div>
        <p class="giris-altbaslik">Balıkçı barınakları ve kooperatifleri için evrak ve hak sahibi takibi</p>
        ${hata ? `<div class="hata-kutu">${escapeHtml(hata)}</div>` : ''}
        <form id="giris-form">
          <div class="alan">
            <label>E-posta</label>
            <input type="email" name="eposta" placeholder="ornek@liman.gov.tr" required autocomplete="username" />
          </div>
          <div class="alan">
            <label>Şifre</label>
            <input type="password" name="sifre" placeholder="••••••••" required autocomplete="current-password" />
          </div>
          <button class="btn btn-blok" type="submit">Giriş yap</button>
        </form>
      </div>
    </div>`;

  document.getElementById('giris-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await istek('/giris', { method: 'POST', body: JSON.stringify({ eposta: f.get('eposta'), sifre: f.get('sifre') }) });
      durum.token = r.token; durum.kullanici = r.kullanici;
      localStorage.setItem('token', r.token);
      localStorage.setItem('kullanici', JSON.stringify(r.kullanici));
      durum.sayfa = 'ozet';
      uygulamaCiz();
      // Giriş sonrası PWA kurulum önerisi (Android olayı varsa veya iOS ise)
      if (pwaYukleOlayi) pwaBannerGoster();
      else pwaIosKontrol();
    } catch (err) {
      girisEkrani(err.message);
    }
  });
}

function cikis() {
  durum.token = null; durum.kullanici = null;
  localStorage.removeItem('token'); localStorage.removeItem('kullanici');
  girisEkrani();
}

// ============ UYGULAMA İSKELETİ ============
function menuOgeleri() {
  // Hak sahibi ve vekil: sadeleştirilmiş self-servis menü
  if (yetkili('hak_sahibi', 'vekil')) {
    return [
      { id: 'belgelerim', ad: 'Belgelerim', ikon: '📄' },
      { id: 'duyurular', ad: 'Duyurular', ikon: '📢' },
      { id: 'profilim', ad: 'Profilim', ikon: '👤' },
    ];
  }
  const m = [{ id: 'ozet', ad: 'Genel Bakış', ikon: '📊' }];
  m.push({ id: 'panel', ad: 'Uygunluk Paneli', ikon: '🚦' });
  if (yetkili('super_admin', 'liman_yoneticisi')) m.push({ id: 'limanlar', ad: 'Limanlar', ikon: '⚓' });
  m.push({ id: 'hak-sahipleri', ad: 'Hak Sahipleri', ikon: '👤' });
  m.push({ id: 'inceleme', ad: 'İnceleme Kuyruğu', ikon: '📥' });
  m.push({ id: 'tekneler', ad: 'Tekneler', ikon: '⛵' });
  m.push({ id: 'damlar', ad: 'Damlar', ikon: '🛟' });
  m.push({ id: 'duyurular', ad: 'Duyurular', ikon: '📢' });
  if (yetkili('super_admin', 'liman_yoneticisi')) m.push({ id: 'mesajlar', ad: 'Toplu Mesaj', ikon: '✉️' });
  if (yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli')) m.push({ id: 'raporlar', ad: 'Raporlar', ikon: '📈' });
  if (yetkili('super_admin', 'liman_yoneticisi')) m.push({ id: 'belge-tipleri', ad: 'Belge Tipleri', ikon: '🗂️' });
  if (yetkili('super_admin', 'liman_yoneticisi')) m.push({ id: 'kullanicilar', ad: 'Kullanıcılar', ikon: '🔑' });
  return m;
}

function uygulamaCiz() {
  const k = durum.kullanici;
  document.getElementById('kok').innerHTML = `
    <div class="uygulama">
      <aside class="yan" id="yan">
        <div class="yan-logo">
          <div class="anchor">⚓</div>
          <div><b>Liman</b><small>Yönetim Sistemi</small></div>
        </div>
        <ul class="menu" id="menu">
          ${menuOgeleri().map(o => `<li><a data-sayfa="${o.id}" class="${durum.sayfa === o.id ? 'aktif' : ''}"><span class="ikon">${o.ikon}</span>${o.ad}${o.id === 'duyurular' ? '<span class="menu-rozet" id="duyuru-rozet" style="display:none"></span>' : ''}</a></li>`).join('')}
        </ul>
        <div class="yan-alt">
          <div class="yan-kullanici">
            <b>${escapeHtml(k.ad_soyad || 'Kullanıcı')}</b>
            <div class="rozet-rol">${rolAdi[k.rol] || k.rol}</div>
          </div>
          <a class="menu" id="cikis-btn" style="display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:9px;color:rgba(238,246,244,.75);cursor:pointer;text-decoration:none;font-size:14px;font-weight:500;"><span class="ikon">↩</span>Çıkış yap</a>
        </div>
      </aside>
      <main class="icerik">
        <div class="ust-mobil">
          <button class="menu-ac" id="menu-ac">☰</button>
          <b style="font-family:var(--display);font-size:18px;color:var(--derin)">Liman Yönetim</b>
        </div>
        <div class="ust-bar">
          <div style="position:relative">
            <button class="zil" id="zil-btn">🔔<span class="zil-sayac gizli" id="zil-sayac">0</span></button>
            <div class="zil-panel gizli" id="zil-panel"></div>
          </div>
        </div>
        <div id="sayfa-icerik"></div>
      </main>
    </div>`;

    document.getElementById('menu').addEventListener('click', (e) => {
    const a = e.target.closest('a[data-sayfa]');
    if (!a) return;
    durum.sayfa = a.dataset.sayfa;
    document.getElementById('yan').classList.remove('acik');
    uygulamaCiz();
  });
  document.getElementById('cikis-btn').addEventListener('click', cikis);
  const menuAc = document.getElementById('menu-ac');
  if (menuAc) menuAc.addEventListener('click', () => document.getElementById('yan').classList.toggle('acik'));

  zilKur();
  rozetleriTazele();
  sayfaCiz();
}

// Menü rozetlerini (okunmamış duyuru sayısı) güncelle
async function rozetleriTazele() {
  try {
    const r = await istek('/duyurular/okunmamis-sayi');
    const rozet = document.getElementById('duyuru-rozet');
    if (rozet) {
      if (r.sayi > 0) { rozet.textContent = r.sayi; rozet.style.display = 'inline-block'; }
      else rozet.style.display = 'none';
    }
  } catch {}
}

function sayfaCiz() {
  const hedef = document.getElementById('sayfa-icerik');
  hedef.innerHTML = '<div class="bos-durum"><div class="ikon">⏳</div><p>Yükleniyor…</p></div>';
  // Hak sahibi ve vekil için varsayılan sayfa
  if (yetkili('hak_sahibi', 'vekil') && !['belgelerim', 'profilim', 'duyurular'].includes(durum.sayfa)) {
    durum.sayfa = 'belgelerim';
  }
  ({
    ozet: ozetSayfa,
    limanlar: limanlarSayfa,
    'hak-sahipleri': hakSahipleriSayfa,
    tekneler: teknelerSayfa,
    damlar: damlarSayfa,
    kullanicilar: kullanicilarSayfa,
    'belge-tipleri': belgeTipleriSayfa,
    inceleme: incelemeSayfa,
    belgelerim: belgelerimSayfa,
    profilim: profilimSayfa,
    panel: panelSayfa,
    duyurular: duyurularSayfa,
    raporlar: raporlarSayfa,
    mesajlar: mesajlarSayfa,
  }[durum.sayfa] || ozetSayfa)(hedef);
}

// ============ ÖZET ============
async function ozetSayfa(hedef) {
  try {
    const o = await istek('/ozet');
    const kartlar = [];
    if (yetkili('super_admin')) kartlar.push({ deger: o.liman, etiket: 'Liman', sinif: '' });
    kartlar.push({ deger: o.hak_sahibi, etiket: 'Hak Sahibi', sinif: '' });
    kartlar.push({ deger: o.tekne, etiket: 'Tekne', sinif: 'pirinc' });
    kartlar.push({ deger: o.dam, etiket: 'Toplam Dam', sinif: '' });
    kartlar.push({ deger: o.bos_dam, etiket: 'Boş Dam', sinif: o.bos_dam > 0 ? 'mercan' : '' });
    kartlar.push({ deger: o.inceleme_bekleyen ?? 0, etiket: 'İnceleme Bekleyen', sinif: (o.inceleme_bekleyen > 0) ? 'mercan' : '' });

    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div>
          <h1>Genel Bakış</h1>
          <p>${yetkili('super_admin') ? 'Tüm sistem' : 'Limanınız'} için anlık durum özeti</p>
        </div>
      </div>
      <div class="istatistik-izgara">
        ${kartlar.map(c => `<div class="istat-kart ${c.sinif}"><div class="deger">${c.deger}</div><div class="etiket">${c.etiket}</div></div>`).join('')}
      </div>
      <div class="panel">
        <div class="panel-baslik"><h2>Hızlı işlemler</h2></div>
        <div style="padding:20px;display:flex;gap:12px;flex-wrap:wrap">
          ${(o.inceleme_bekleyen > 0) ? `<button class="btn" data-git="inceleme">📥 ${o.inceleme_bekleyen} belgeyi incele</button>` : ''}
          <button class="btn btn-acik" data-git="hak-sahipleri">👤 Hak sahiplerini yönet</button>
          <button class="btn btn-acik" data-git="belge-tipleri">🗂️ Belge tiplerini düzenle</button>
          <button class="btn btn-acik" data-git="damlar">🛟 Damları görüntüle</button>
        </div>
      </div>`;
    hedef.querySelectorAll('[data-git]').forEach(b => b.addEventListener('click', () => { durum.sayfa = b.dataset.git; uygulamaCiz(); }));
  } catch (err) { hataGoster(hedef, err); }
}

// ============ LİMANLAR ============
async function limanlarSayfa(hedef) {
  try {
    const liste = await istek('/limanlar');
    durum.veri.limanlar = liste;
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Limanlar</h1><p>Kayıtlı liman işletmeleri ve kooperatifler</p></div>
        ${yetkili('super_admin') ? '<button class="btn" id="ekle-btn">+ Liman ekle</button>' : ''}
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr><th>Liman</th><th>Konum</th><th>Yetkili</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${liste.length === 0 ? `<tr><td colspan="5"><div class="bos-durum"><div class="ikon">⚓</div><p>Henüz liman kaydı yok.</p></div></td></tr>` :
                liste.map(l => `
                <tr>
                  <td><b>${escapeHtml(l.ad)}</b><span class="alt">${escapeHtml(l.kooperatif_adi || '')}</span></td>
                  <td>${escapeHtml([l.ilce, l.il].filter(Boolean).join(', ') || '—')}</td>
                  <td>${escapeHtml(l.yetkili_kisi || '—')}<span class="alt">${escapeHtml(l.telefon || '')}</span></td>
                  <td><span class="rozet ${l.aktif ? 'rozet-yesil' : 'rozet-gri'}">${l.aktif ? 'Aktif' : 'Pasif'}</span></td>
                  <td><div class="satir-islem">${yetkili('super_admin', 'liman_yoneticisi') ? `<button class="btn btn-acik btn-mini" data-duzenle="${l.id}">Düzenle</button>` : ''}</div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    const ekle = document.getElementById('ekle-btn');
    if (ekle) ekle.addEventListener('click', () => limanFormu());
    hedef.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => limanFormu(liste.find(x => x.id == b.dataset.duzenle))));
  } catch (err) { hataGoster(hedef, err); }
}

function limanFormu(liman = null) {
  const d = liman || {};
  modal(liman ? 'Limanı düzenle' : 'Yeni liman', `
    <div class="alan"><label>Liman adı *</label><input name="ad" value="${escapeHtml(d.ad)}" required /></div>
    <div class="alan"><label>Kooperatif adı</label><input name="kooperatif_adi" value="${escapeHtml(d.kooperatif_adi)}" /></div>
    <div class="alan-grup">
      <div class="alan"><label>İl</label><input name="il" value="${escapeHtml(d.il)}" /></div>
      <div class="alan"><label>İlçe</label><input name="ilce" value="${escapeHtml(d.ilce)}" /></div>
    </div>
    <div class="alan"><label>Adres</label><input name="adres" value="${escapeHtml(d.adres)}" /></div>
    <div class="alan-grup">
      <div class="alan"><label>Yetkili kişi</label><input name="yetkili_kisi" value="${escapeHtml(d.yetkili_kisi)}" /></div>
      <div class="alan"><label>Telefon</label><input name="telefon" value="${escapeHtml(d.telefon)}" /></div>
    </div>
    <div class="alan"><label>Vergi no</label><input name="vergi_no" value="${escapeHtml(d.vergi_no)}" /></div>
    ${(liman && yetkili('super_admin')) ? `
    <div class="detay-grup" style="margin-top:8px">
      <h4>Liman yönetici hesapları</h4>
      <div id="yonetici-bolum"><p class="alt" style="font-size:13px;color:var(--metin-soluk)">Yükleniyor…</p></div>
    </div>` : ''}
  `, async (form) => {
    const govde = formVeri(form);
    if (liman) await istek('/limanlar/' + liman.id, { method: 'PUT', body: JSON.stringify(govde) });
    else await istek('/limanlar', { method: 'POST', body: JSON.stringify(govde) });
    toast(liman ? 'Liman güncellendi.' : 'Liman eklendi.');
    sayfaCiz();
  });

  // Düzenleme modunda yönetici bölümünü yükle
  if (liman && yetkili('super_admin')) yoneticiBolumunuYukle(liman.id);
}

// Liman düzenleme modalındaki yönetici hesapları bölümü
async function yoneticiBolumunuYukle(limanId) {
  const bolum = document.getElementById('yonetici-bolum');
  if (!bolum) return;
  try {
    const liste = await istek('/limanlar/' + limanId + '/yoneticiler');
    bolum.innerHTML = `
      ${liste.length === 0
        ? '<p style="font-size:13px;color:var(--metin-soluk);margin-bottom:10px">Bu limanın henüz yönetici hesabı yok.</p>'
        : '<div class="mini-liste" style="margin-bottom:10px">' + liste.map(k => `
            <div class="mini-kart">
              <div><b>${escapeHtml(k.ad_soyad)}</b><span class="alt">${escapeHtml(k.eposta)} • ${rolAdi[k.rol] || k.rol}</span></div>
              <span class="bdurum ${k.aktif ? 'yesil' : 'gri'}">${k.aktif ? 'Aktif' : 'Pasif'}</span>
            </div>`).join('') + '</div>'}
      <button type="button" class="btn btn-acik btn-mini" id="yonetici-ekle">🔑 Yönetici hesabı oluştur</button>`;
    document.getElementById('yonetici-ekle').addEventListener('click', () => yoneticiOlusturFormu(limanId));
  } catch (err) {
    bolum.innerHTML = `<p style="font-size:13px;color:var(--mercan)">${escapeHtml(err.message)}</p>`;
  }
}

// Yeni yönetici hesabı oluşturma formu
function yoneticiOlusturFormu(limanId) {
  modalKapat();
  modal('Liman yönetici hesabı oluştur', `
    <div class="alan"><label>Ad soyad *</label><input name="ad_soyad" required placeholder="ör. Ahmet Denizci" /></div>
    <div class="alan"><label>E-posta (boş bırakırsanız otomatik üretilir)</label><input name="eposta" type="email" placeholder="opsiyonel" /></div>
    <div class="alan"><label>Rol</label>
      <select name="rol">
        <option value="liman_yoneticisi">Liman Yöneticisi</option>
        <option value="liman_personeli">Liman Personeli (sınırlı)</option>
      </select></div>
  `, async (form) => {
    const govde = formVeri(form);
    const sonuc = await istek('/limanlar/' + limanId + '/yonetici', { method: 'POST', body: JSON.stringify(govde) });
    hesapSonucGoster('Yönetici hesabı oluşturuldu', sonuc.kullanici_adi, sonuc.sifre);
  });
}

// Oluşturulan hesabın kullanıcı adı + şifresini gösteren ortak kutu (modal içeriği)
function hesapSonucGoster(baslik, kullaniciAdi, sifre) {
  modalKapat();
  modal(baslik, `
    <p style="font-size:13px;color:var(--metin-soluk);margin-bottom:12px">Bu bilgileri ilgili kişiye iletin. Şifre yalnızca şimdi gösteriliyor, sonra tekrar görüntülenemez.</p>
    <div class="mini-kart" style="margin-bottom:8px"><div><b>Kullanıcı adı</b></div><div style="font-family:monospace;font-size:14px">${escapeHtml(kullaniciAdi)}</div></div>
    <div class="mini-kart"><div><b>Şifre</b></div><div style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px">${escapeHtml(sifre)}</div></div>
    <button class="btn btn-blok btn-acik btn-mini" id="kopyala-hesap" style="margin-top:14px">📋 Bilgileri kopyala</button>
  `, null, 'Kapat');
  document.getElementById('kopyala-hesap').addEventListener('click', () => {
    const metin = `Liman Yönetim Sistemi giriş bilgileri:\nKullanıcı adı: ${kullaniciAdi}\nŞifre: ${sifre}`;
    navigator.clipboard?.writeText(metin).then(
      () => toast('Bilgiler panoya kopyalandı.'),
      () => toast('Kopyalanamadı, elle not alın.', 'hata')
    );
  });
}

// ============ HAK SAHİPLERİ ============
async function hakSahipleriSayfa(hedef) {
  try {
    const liste = await istek('/hak-sahipleri');
    durum.veri.hakSahipleri = liste;
    const cokLiman = yetkili('super_admin');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Hak Sahipleri</h1><p>Tekne ve dam hak sahipleri</p></div>
        ${yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli') ? '<button class="btn" id="ekle-btn">+ Hak sahibi ekle</button>' : ''}
      </div>
      <div class="filtre-bar">
        <input class="ara-kutu" id="ara" placeholder="🔍 İsim veya telefon ara…" />
      </div>
      <div class="durum-sekmeler" id="durum-sekmeler">
        <button class="durum-sekme aktif" data-durum="hepsi">Hepsi</button>
        <button class="durum-sekme" data-durum="dam_sahibi">🛟 Dam sahibi</button>
        <button class="durum-sekme" data-durum="gecici">⚓ Geçici bağlama</button>
        <button class="durum-sekme" data-durum="sirada">⏳ Sırada</button>
        <button class="durum-sekme" data-durum="misafir">🧭 Misafir</button>
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr><th>Ad Soyad</th>${cokLiman ? '<th>Liman</th>' : ''}<th>Telefon</th><th>Bağlama durumu</th><th></th></tr></thead>
            <tbody id="hs-govde"></tbody>
          </table>
        </div>
      </div>`;

    let aktifDurum = 'hepsi';
    const ciz = (filtre = '') => {
      const f = filtre.toLowerCase();
      const veri = liste.filter(h =>
        (!f || (h.ad_soyad || '').toLowerCase().includes(f) || (h.telefon || '').includes(f)) &&
        (aktifDurum === 'hepsi' || (h.baglama_durumu || 'dam_sahibi') === aktifDurum));
      const govde = document.getElementById('hs-govde');
      govde.innerHTML = veri.length === 0
        ? `<tr><td colspan="${cokLiman ? 5 : 4}"><div class="bos-durum"><div class="ikon">👤</div><p>Kayıt bulunamadı.</p></div></td></tr>`
        : veri.map(h => {
          const bd = baglamaDurumu[h.baglama_durumu || 'dam_sahibi'];
          let ek = '';
          if (h.baglama_durumu === 'sirada' && h.sira_tarihi) ek = `<span class="alt">Sıra: ${new Date(h.sira_tarihi).toLocaleDateString('tr-TR')}</span>`;
          if (h.baglama_durumu === 'misafir' && h.misafir_bitis) ek = `<span class="alt">Ayrılış: ${new Date(h.misafir_bitis).toLocaleDateString('tr-TR')}</span>`;
          return `
          <tr>
            <td><b>${escapeHtml(h.ad_soyad)}</b>${h.tc_no ? `<span class="alt">TC: ${escapeHtml(h.tc_no)}</span>` : ''}</td>
            ${cokLiman ? `<td>${escapeHtml(h.liman_adi)}</td>` : ''}
            <td>${escapeHtml(h.telefon || '—')}</td>
            <td><span class="rozet rozet-${bd.sinif}">${bd.ikon} ${bd.etiket}</span>${ek}</td>
            <td><div class="satir-islem">
              <button class="btn btn-acik btn-mini" data-detay="${h.id}">Detay</button>
              ${yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli') ? `<button class="btn btn-acik btn-mini" data-duzenle="${h.id}">Düzenle</button>` : ''}
              ${yetkili('super_admin', 'liman_yoneticisi') ? `<button class="btn btn-tehlike btn-mini" data-sil="${h.id}">Sil</button>` : ''}
            </div></td>
          </tr>`; }).join('');
      govde.querySelectorAll('[data-detay]').forEach(b => b.addEventListener('click', () => hakSahibiDetay(b.dataset.detay)));
      govde.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => hakSahibiFormu(liste.find(x => x.id == b.dataset.duzenle))));
      govde.querySelectorAll('[data-sil]').forEach(b => b.addEventListener('click', () => hakSahibiSil(b.dataset.sil)));
    };
    ciz();
    document.getElementById('ara').addEventListener('input', (e) => ciz(e.target.value));
    document.getElementById('durum-sekmeler').querySelectorAll('.durum-sekme').forEach(b => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.durum-sekme').forEach(x => x.classList.remove('aktif'));
        b.classList.add('aktif');
        aktifDurum = b.dataset.durum;
        ciz(document.getElementById('ara').value);
      });
    });
    const ekle = document.getElementById('ekle-btn');
    if (ekle) ekle.addEventListener('click', () => hakSahibiFormu());
  } catch (err) { hataGoster(hedef, err); }
}

async function hakSahibiFormu(hs = null) {
  let limanlar = durum.veri.limanlar;
  if (yetkili('super_admin') && !limanlar) limanlar = await istek('/limanlar');
  const d = hs || {};
  const limanSecim = yetkili('super_admin')
    ? `<div class="alan"><label>Liman *</label><select name="liman_id" required>
        <option value="">— Seçin —</option>
        ${(limanlar || []).map(l => `<option value="${l.id}" ${d.liman_id == l.id ? 'selected' : ''}>${escapeHtml(l.ad)}</option>`).join('')}
       </select></div>` : '';
  modal(hs ? 'Hak sahibini düzenle' : 'Yeni hak sahibi', `
    ${limanSecim}
    <div class="alan"><label>Ad soyad *</label><input name="ad_soyad" value="${escapeHtml(d.ad_soyad)}" required /></div>
    <div class="alan-grup">
      <div class="alan"><label>T.C. kimlik no</label><input name="tc_no" value="${escapeHtml(d.tc_no)}" maxlength="11" /></div>
      <div class="alan"><label>Telefon</label><input name="telefon" value="${escapeHtml(d.telefon)}" /></div>
    </div>
    <div class="alan"><label>E-posta</label><input name="eposta" type="email" value="${escapeHtml(d.eposta)}" /></div>
    <div class="alan"><label>Adres</label><input name="adres" value="${escapeHtml(d.adres)}" /></div>
    <div class="alan">
      <label>Bağlama durumu *</label>
      <select name="baglama_durumu" id="baglama-sec">
        ${Object.keys(baglamaDurumu).map(k => `<option value="${k}" ${(d.baglama_durumu || 'dam_sahibi') === k ? 'selected' : ''}>${baglamaDurumu[k].ikon} ${baglamaDurumu[k].etiket}</option>`).join('')}
      </select>
    </div>
    <div class="alan" id="sira-alan" style="display:none">
      <label>Sıraya giriş tarihi</label>
      <input name="sira_tarihi" type="date" value="${d.sira_tarihi || ''}" />
    </div>
    <div class="alan" id="misafir-alan" style="display:none">
      <label>Tahmini ayrılış tarihi</label>
      <input name="misafir_bitis" type="date" value="${d.misafir_bitis || ''}" />
    </div>
    <div class="baglama-aciklama" id="baglama-aciklama"></div>
    <div class="alan"><label>Notlar</label><textarea name="notlar" rows="2">${escapeHtml(d.notlar)}</textarea></div>
  `, async (form) => {
    const govde = formVeri(form);
    if (hs) await istek('/hak-sahipleri/' + hs.id, { method: 'PUT', body: JSON.stringify(govde) });
    else await istek('/hak-sahipleri', { method: 'POST', body: JSON.stringify(govde) });
    toast(hs ? 'Hak sahibi güncellendi.' : 'Hak sahibi eklendi.');
    sayfaCiz();
  });

  // Bağlama durumuna göre ek alanları ve açıklamayı göster
  const sec = document.getElementById('baglama-sec');
  const siraAlan = document.getElementById('sira-alan');
  const misafirAlan = document.getElementById('misafir-alan');
  const aciklamaKutu = document.getElementById('baglama-aciklama');
  const aciklamalar = {
    dam_sahibi: 'Limanda kendisine dam (bağlama yeri) tahsis edilmiş kişi. Damını detay ekranından atayabilirsiniz.',
    gecici: 'Dam tahsisi yok ama limana geçici/serbest olarak kayık bağlıyor. Evrak takibi yine yapılır.',
    sirada: 'Dam talebi var, boş dam çıkınca sırada. Sıraya giriş tarihiyle takip edilir.',
    misafir: 'Başka limandan gelip kısa süre kalan günübirlik/misafir tekne. Ayrılış tarihiyle takip edilir.',
  };
  const guncelle = () => {
    siraAlan.style.display = sec.value === 'sirada' ? 'block' : 'none';
    misafirAlan.style.display = sec.value === 'misafir' ? 'block' : 'none';
    aciklamaKutu.textContent = aciklamalar[sec.value] || '';
  };
  sec.addEventListener('change', guncelle);
  guncelle();
}

async function hakSahibiSil(id) {
  if (!confirm('Bu hak sahibini ve bağlı tekne/dam kayıtlarını silmek istediğinize emin misiniz?')) return;
  try { await istek('/hak-sahipleri/' + id, { method: 'DELETE' }); toast('Hak sahibi silindi.'); sayfaCiz(); }
  catch (err) { toast(err.message, 'hata'); }
}

async function hakSahibiDetay(id) {
  try {
    const h = await istek('/hak-sahipleri/' + id);
    const bdRozet = baglamaDurumu[h.baglama_durumu || 'dam_sahibi'];
    let bdEk = '';
    if (h.baglama_durumu === 'sirada' && h.sira_tarihi) bdEk = ` • Sıraya giriş: ${new Date(h.sira_tarihi).toLocaleDateString('tr-TR')}`;
    if (h.baglama_durumu === 'misafir' && h.misafir_bitis) bdEk = ` • Ayrılış: ${new Date(h.misafir_bitis).toLocaleDateString('tr-TR')}`;
    modal(escapeHtml(h.ad_soyad), `
      <div class="detay-grup">
        <h4>İletişim</h4>
        <div class="mini-liste">
          <div class="mini-kart"><div><b>Bağlama durumu</b></div><div><span class="rozet rozet-${bdRozet.sinif}">${bdRozet.ikon} ${bdRozet.etiket}</span>${bdEk}</div></div>
          <div class="mini-kart"><div><b>Telefon</b></div><div>${escapeHtml(h.telefon || '—')}</div></div>
          <div class="mini-kart"><div><b>T.C. No</b></div><div>${escapeHtml(h.tc_no || '—')}</div></div>
          <div class="mini-kart"><div><b>E-posta</b></div><div>${escapeHtml(h.eposta || '—')}</div></div>
        </div>
      </div>
      <div class="detay-grup">
        <h4>Tekneler (${h.tekneler.length})</h4>
        <div class="mini-liste">
          ${h.tekneler.length === 0 ? '<div class="mini-kart"><div class="alt">Kayıtlı tekne yok.</div></div>' :
            h.tekneler.map(t => `<div class="mini-kart">
              <div><b>${escapeHtml(t.ad)}</b><span class="alt">${escapeHtml(t.tekne_tipi || 'Tip belirtilmemiş')}${t.boy_metre ? ' • ' + t.boy_metre + ' m' : ''}</span></div>
              ${yetkili('super_admin','liman_yoneticisi','liman_personeli') ? `<button class="btn btn-tehlike btn-mini" data-tekne-sil="${t.id}">Sil</button>` : ''}
            </div>`).join('')}
        </div>
        ${yetkili('super_admin','liman_yoneticisi','liman_personeli') ? `<button class="btn btn-acik btn-mini" id="tekne-ekle" style="margin-top:10px">+ Tekne ekle</button>` : ''}
      </div>
      <div class="detay-grup">
        <h4>Damlar (${h.damlar.length})</h4>
        <div class="mini-liste">
          ${h.damlar.length === 0 ? '<div class="mini-kart"><div class="alt">Atanmış dam yok.</div></div>' :
            h.damlar.map(dm => `<div class="mini-kart">
              <div><b>Dam ${escapeHtml(dm.dam_no)}</b><span class="alt">${escapeHtml(dm.rihtim || '')}</span></div>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="rozet ${damDurumu[dm.durum].sinif}">${damDurumu[dm.durum].etiket}</span>
                ${yetkili('super_admin','liman_yoneticisi','liman_personeli') ? `<button class="btn btn-tehlike btn-mini" data-dam-kaldir="${dm.id}">Kaldır</button>` : ''}
              </div>
            </div>`).join('')}
        </div>
        ${yetkili('super_admin','liman_yoneticisi','liman_personeli') ? `<button class="btn btn-acik btn-mini" id="dam-ata" style="margin-top:10px">+ Dam ata</button>` : ''}
      </div>
      <div class="detay-grup">
        <h4>Evrak durumu</h4>
        <button class="btn btn-blok" id="belge-durum-btn">📄 Belgeleri görüntüle ve yönet</button>
      </div>
      ${yetkili('super_admin', 'liman_yoneticisi') ? `
      <div class="detay-grup">
        <h4>Giriş hesabı</h4>
        <div id="hesap-bolum"><p class="alt" style="font-size:13px;color:var(--metin-soluk)">Yükleniyor…</p></div>
      </div>
      <div class="detay-grup">
        <h4>Özel belge kuralları</h4>
        <div id="ozel-kural-bolum"><p class="alt" style="font-size:13px;color:var(--metin-soluk)">Yükleniyor…</p></div>
      </div>` : ''}
    `, null, 'Kapat');

    const bd = document.getElementById('belge-durum-btn');
    if (bd) bd.addEventListener('click', () => hakSahibiBelgeDurumu(h.id, h.ad_soyad));

    if (yetkili('super_admin', 'liman_yoneticisi')) { hesapBolumunuYukle(h.id); ozelKuralBolumunuYukle(h); }

    const te = document.getElementById('tekne-ekle');
    if (te) te.addEventListener('click', () => tekneFormu(h.id));
    document.querySelectorAll('[data-tekne-sil]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Tekne silinsin mi?')) return;
      await istek('/tekneler/' + b.dataset.tekneSil, { method: 'DELETE' });
      toast('Tekne silindi.'); modalKapat(); hakSahibiDetay(id);
    }));

    const da = document.getElementById('dam-ata');
    if (da) da.addEventListener('click', () => damAtaFormu(h));
    document.querySelectorAll('[data-dam-kaldir]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Bu dam kişiden kaldırılsın mı? (Dam silinmez, boşa çıkar.)')) return;
      await istek('/damlar/' + b.dataset.damKaldir, { method: 'PUT', body: JSON.stringify({ hak_sahibi_id: null, durum: 'bos' }) });
      toast('Dam kaldırıldı.'); modalKapat(); hakSahibiDetay(id);
    }));
  } catch (err) { toast(err.message, 'hata'); }
}

// Hak sahibine dam atama: mevcut boş damı seç veya yeni dam oluştur
async function damAtaFormu(h) {
  modalKapat();
  // Limanın boş damlarını getir
  let bosDamlar = [];
  try {
    const tum = await istek('/damlar');
    bosDamlar = tum.filter(d => d.liman_id === h.liman_id && !d.hak_sahibi_id);
  } catch {}
  const secenekler = bosDamlar.length
    ? `<div class="alan"><label>Boş damlardan seç</label>
        <select name="mevcut_dam" id="mevcut-dam">
          <option value="">— Yeni dam oluştur —</option>
          ${bosDamlar.map(d => `<option value="${d.id}">Dam ${escapeHtml(d.dam_no)}${d.rihtim ? ' (' + escapeHtml(d.rihtim) + ')' : ''}</option>`).join('')}
        </select></div>`
    : '<p style="font-size:13px;color:var(--metin-soluk);margin-bottom:12px">Limanda boş dam yok. Aşağıdan yeni dam oluşturup atayabilirsiniz.</p>';

  modal(`Dam ata — ${escapeHtml(h.ad_soyad)}`, `
    ${secenekler}
    <div id="yeni-dam-alan">
      <div class="alan-grup">
        <div class="alan"><label>Yeni dam no</label><input name="dam_no" placeholder="ör. B-12" /></div>
        <div class="alan"><label>Rıhtım</label><input name="rihtim" placeholder="ör. Güney Rıhtım" /></div>
      </div>
    </div>
  `, async (form) => {
    const govde = formVeri(form);
    const mevcutId = form.querySelector('#mevcut-dam')?.value;
    if (mevcutId) {
      // Var olan boş damı bu kişiye ata
      await istek('/damlar/' + mevcutId, { method: 'PUT', body: JSON.stringify({ hak_sahibi_id: h.id, durum: 'dolu' }) });
    } else {
      // Yeni dam oluştur ve ata
      if (!govde.dam_no) throw new Error('Dam no girin veya listeden boş dam seçin.');
      await istek('/damlar', { method: 'POST', body: JSON.stringify({ liman_id: h.liman_id, hak_sahibi_id: h.id, dam_no: govde.dam_no, rihtim: govde.rihtim, durum: 'dolu' }) });
    }
    toast('Dam atandı.');
    hakSahibiDetay(h.id);
  });

  // "Mevcut dam seç" ile "yeni dam" alanını birbirine göre göster/gizle
  const sec = document.getElementById('mevcut-dam');
  const yeniAlan = document.getElementById('yeni-dam-alan');
  if (sec && yeniAlan) {
    const guncelle = () => { yeniAlan.style.display = sec.value ? 'none' : 'block'; };
    sec.addEventListener('change', guncelle);
    guncelle();
  }
}

// Hak sahibine özel belge kuralları (ekstra iste / muaf tut)
async function ozelKuralBolumunuYukle(h) {
  const bolum = document.getElementById('ozel-kural-bolum');
  if (!bolum) return;
  try {
    const [kurallar, tipler] = await Promise.all([
      istek('/hak-sahipleri/' + h.id + '/ozel-kurallar'),
      istek('/belge-tipleri'),
    ]);
    durum.veri.belgeTipleri = tipler;
    bolum.innerHTML = `
      <p style="font-size:12.5px;color:var(--metin-soluk);margin-bottom:10px">Bu kişiye özel istisna: belirli bir belgeyi ekstra isteyin veya muaf tutun. (Genel liste herkese uygulanır; burası sadece bu kişi içindir.)</p>
      ${kurallar.length ? '<div class="mini-liste" style="margin-bottom:10px">' + kurallar.map(kr => `
        <div class="mini-kart">
          <div><b>${escapeHtml(kr.belge_adi)}</b><span class="alt">${kr.kural === 'muaf' ? 'Muaf tutuldu' : 'Ekstra isteniyor'}</span></div>
          <button class="btn btn-tehlike btn-mini" data-kural-sil="${kr.id}">Kaldır</button>
        </div>`).join('') + '</div>' : ''}
      <button class="btn btn-acik btn-mini" id="kural-ekle">+ Özel kural ekle</button>`;

    document.getElementById('kural-ekle').addEventListener('click', () => ozelKuralFormu(h));
    bolum.querySelectorAll('[data-kural-sil]').forEach(b => b.addEventListener('click', async () => {
      await istek('/hak-sahipleri/' + h.id + '/ozel-kurallar/' + b.dataset.kuralSil, { method: 'DELETE' });
      toast('Kural kaldırıldı.'); ozelKuralBolumunuYukle(h);
    }));
  } catch (err) {
    bolum.innerHTML = `<p style="font-size:13px;color:var(--mercan)">${escapeHtml(err.message)}</p>`;
  }
}

function ozelKuralFormu(h) {
  const tipler = durum.veri.belgeTipleri || [];
  modalKapat();
  modal('Özel belge kuralı — ' + h.ad_soyad, `
    <div class="alan"><label>Belge tipi *</label>
      <select name="belge_tipi_id" required>
        <option value="">— Seçin —</option>
        ${tipler.map(t => `<option value="${t.id}">${escapeHtml(t.ad)}</option>`).join('')}
      </select></div>
    <div class="alan"><label>Kural *</label>
      <select name="kural" required>
        <option value="ekstra">Ekstra iste (bu kişiden de istensin)</option>
        <option value="muaf">Muaf tut (bu kişiden istenmesin)</option>
      </select></div>
  `, async (form) => {
    const govde = formVeri(form);
    await istek('/hak-sahipleri/' + h.id + '/ozel-kurallar', { method: 'POST', body: JSON.stringify(govde) });
    toast('Özel kural eklendi.');
    hakSahibiDetay(h.id);
  });
}

// Detay modalı içindeki giriş hesabı bölümünü doldurur
async function hesapBolumunuYukle(hsId) {
  const bolum = document.getElementById('hesap-bolum');
  if (!bolum) return;
  try {
    const durum = await istek('/hak-sahipleri/' + hsId + '/hesap');
    if (!durum.var) {
      bolum.innerHTML = `
        <p style="font-size:13px;color:var(--metin-soluk);margin-bottom:10px">Bu hak sahibinin henüz giriş hesabı yok. Oluşturduğunuzda kendi belgelerini yükleyip takip edebilir.</p>
        <button class="btn btn-blok" id="hesap-olustur">🔑 Giriş hesabı oluştur</button>`;
      document.getElementById('hesap-olustur').addEventListener('click', () => hesapOlustur(hsId, false));
    } else {
      const aktif = durum.kullanici.aktif;
      bolum.innerHTML = `
        <div class="mini-kart" style="margin-bottom:10px">
          <div><b>Kullanıcı adı</b><span class="alt">${escapeHtml(durum.kullanici.eposta)}</span></div>
          <span class="bdurum ${aktif ? 'yesil' : 'gri'}">${aktif ? 'Aktif' : 'Pasif'}</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-acik btn-mini" id="sifre-sifirla">🔄 Şifre sıfırla</button>
          ${aktif ? '<button class="btn btn-tehlike btn-mini" id="hesap-pasif">Hesabı pasifleştir</button>' : ''}
        </div>`;
      document.getElementById('sifre-sifirla').addEventListener('click', () => hesapOlustur(hsId, true));
      const pasif = document.getElementById('hesap-pasif');
      if (pasif) pasif.addEventListener('click', async () => {
        if (!confirm('Hesap pasifleştirilsin mi? Hak sahibi artık giriş yapamaz.')) return;
        await istek('/hak-sahipleri/' + hsId + '/hesap', { method: 'DELETE' });
        toast('Hesap pasifleştirildi.'); hesapBolumunuYukle(hsId);
      });
    }
  } catch (err) {
    bolum.innerHTML = `<p style="font-size:13px;color:var(--mercan)">${escapeHtml(err.message)}</p>`;
  }
}

// Hesap oluştur veya şifre sıfırla → sonucu (kullanıcı adı + şifre) gösteren kutu
async function hesapOlustur(hsId, sifirlama) {
  try {
    const sonuc = await istek('/hak-sahipleri/' + hsId + '/hesap', { method: 'POST' });
    const bolum = document.getElementById('hesap-bolum');
    bolum.innerHTML = `
      <div style="background:rgba(58,157,106,.08);border:1px solid rgba(58,157,106,.3);border-radius:10px;padding:16px">
        <div style="font-weight:600;color:var(--yesil);margin-bottom:12px">✓ Hesap ${sonuc.islem === 'sifirlandi' ? 'şifresi sıfırlandı' : 'oluşturuldu'}</div>
        <p style="font-size:13px;color:var(--metin-soluk);margin-bottom:12px">Bu bilgileri hak sahibine iletin. Şifre yalnızca şimdi gösteriliyor, sonra tekrar görüntülenemez.</p>
        <div class="mini-kart" style="margin-bottom:8px"><div><b>Kullanıcı adı</b></div><div style="font-family:monospace;font-size:14px">${escapeHtml(sonuc.kullanici_adi)}</div></div>
        <div class="mini-kart"><div><b>Şifre</b></div><div style="font-family:monospace;font-size:16px;font-weight:700;letter-spacing:1px">${escapeHtml(sonuc.sifre)}</div></div>
        <button class="btn btn-blok btn-acik btn-mini" id="kopyala" style="margin-top:12px">📋 Bilgileri kopyala</button>
      </div>`;
    document.getElementById('kopyala').addEventListener('click', () => {
      const metin = `Liman Yönetim Sistemi giriş bilgileriniz:\nKullanıcı adı: ${sonuc.kullanici_adi}\nŞifre: ${sonuc.sifre}\nGiriş: (sistem adresi)`;
      navigator.clipboard?.writeText(metin).then(
        () => toast('Bilgiler panoya kopyalandı.'),
        () => toast('Kopyalanamadı, elle not alın.', 'hata')
      );
    });
    toast(sonuc.islem === 'sifirlandi' ? 'Şifre sıfırlandı.' : 'Giriş hesabı oluşturuldu.');
  } catch (err) {
    toast(err.message, 'hata');
  }
}

// Yönetici: bir hak sahibinin belge durumunu modal içinde göster + adına yükle
async function hakSahibiBelgeDurumu(hsId, adSoyad) {
  modalKapat();
  try {
    const durumVeri = await istek('/hak-sahipleri/' + hsId + '/belge-durumu');
    modal(`Evrak durumu — ${adSoyad}`, `<div id="yonetici-belge">${belgeDurumPaneli(durumVeri, hsId, true)}</div>`, null, 'Kapat');
    const kap = document.getElementById('yonetici-belge');
    belgeOlaylariBagla(kap, hsId, () => hakSahibiBelgeDurumu(hsId, adSoyad));
  } catch (err) { toast(err.message, 'hata'); }
}

function tekneFormu(hakSahibiId, tekne = null) {
  modalKapat();
  const d = tekne || {};
  const tipler = ['Trol', 'Gırgır', 'Olta/Paragat', 'Voli', 'Diğer'];
  modal(tekne ? 'Tekneyi düzenle' : 'Yeni tekne', `
    <div class="alan"><label>Tekne adı *</label><input name="ad" value="${escapeHtml(d.ad)}" required /></div>
    <div class="alan">
      <label>Belge sınıfı *</label>
      <select name="belge_sinifi" id="sinif-sec">
        ${Object.keys(belgeSinifi).map(k => `<option value="${k}" ${(d.belge_sinifi || 'profesyonel') === k ? 'selected' : ''}>${belgeSinifi[k].ikon} ${belgeSinifi[k].etiket} belgeli</option>`).join('')}
      </select>
    </div>
    <div class="baglama-aciklama" id="sinif-aciklama"></div>
    <div class="alan-grup">
      <div class="alan"><label>Tekne tipi</label>
        <select name="tekne_tipi"><option value="">— Seçin —</option>
          ${tipler.map(t => `<option ${d.tekne_tipi === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="alan"><label>Boy (metre)</label><input name="boy_metre" type="number" step="0.1" value="${d.boy_metre ?? ''}" /></div>
    </div>
    <div class="alan-grup">
      <div class="alan"><label>Tonaj</label><input name="tonaj" type="number" step="0.1" value="${d.tonaj ?? ''}" /></div>
      <div class="alan"><label>Bağlama kütüğü no</label><input name="baglama_kutugu_no" value="${escapeHtml(d.baglama_kutugu_no)}" /></div>
    </div>
    <div class="alan-grup">
      <div class="alan"><label>Motor no</label><input name="motor_no" value="${escapeHtml(d.motor_no)}" /></div>
      <div class="alan"><label>Tescil no</label><input name="tescil_no" value="${escapeHtml(d.tescil_no)}" /></div>
    </div>
  `, async (form) => {
    const govde = formVeri(form);
    if (tekne) {
      await istek('/tekneler/' + tekne.id, { method: 'PUT', body: JSON.stringify(govde) });
      toast('Tekne güncellendi.');
      if (durum.sayfa === 'tekneler') sayfaCiz(); else hakSahibiDetay(hakSahibiId);
    } else {
      govde.hak_sahibi_id = hakSahibiId;
      await istek('/tekneler', { method: 'POST', body: JSON.stringify(govde) });
      toast('Tekne eklendi.');
      hakSahibiDetay(hakSahibiId);
    }
  });

  // Belge sınıfı açıklaması
  const sinifSec = document.getElementById('sinif-sec');
  const sinifAciklama = document.getElementById('sinif-aciklama');
  const sinifAciklamalari = {
    profesyonel: '⚓ Ruhsatlı ticari balıkçılık teknesi. Su ürünleri ruhsat teskeresi, bağlama kütüğü gibi profesyonel belgeler gerekir.',
    amator: '🎣 Amatör/hobi amaçlı tekne. Ticari avcılık yapılmaz; amatör balıkçı belgesi yeterlidir.',
  };
  if (sinifSec && sinifAciklama) {
    const g = () => { sinifAciklama.textContent = sinifAciklamalari[sinifSec.value] || ''; };
    sinifSec.addEventListener('change', g);
    g();
  }
}

// ============ TEKNELER SAYFASI ============
async function teknelerSayfa(hedef) {
  try {
    const liste = await istek('/tekneler');
    durum.veri.tekneler = liste;
    const cokLiman = yetkili('super_admin');
    // Listedeki benzersiz tekne türlerini topla (alfabetik)
    const turler = [...new Set(liste.map(t => t.tekne_tipi).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Tekneler</h1><p>Limandaki tüm tekneler, sahipleri ve dam bilgileri</p></div>
      </div>
      <div class="filtre-bar">
        <input class="ara-kutu" id="ara" placeholder="🔍 Tekne adı, sahip veya tescil no ara…" />
        <select class="ara-kutu" id="tur-filtre" style="max-width:220px">
          <option value="">⛵ Tüm türler</option>
          ${turler.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr>
              <th>Tekne</th><th>Tip / Boy</th><th>Sahibi</th><th>Dam</th>${cokLiman ? '<th>Liman</th>' : ''}<th></th>
            </tr></thead>
            <tbody id="tekne-govde">
              ${tekneSatirlari(liste, cokLiman)}
            </tbody>
          </table>
        </div>
      </div>`;

    const ara = document.getElementById('ara');
    const turFiltre = document.getElementById('tur-filtre');
    const suzVeCiz = () => {
      const q = ara.value.toLocaleLowerCase('tr');
      const tur = turFiltre.value;
      const suz = liste.filter(t => {
        const aramaUyar = !q ||
          (t.ad || '').toLocaleLowerCase('tr').includes(q) ||
          (t.sahip_adi || '').toLocaleLowerCase('tr').includes(q) ||
          (t.tescil_no || '').toLocaleLowerCase('tr').includes(q);
        const turUyar = !tur || t.tekne_tipi === tur;
        return aramaUyar && turUyar;
      });
      document.getElementById('tekne-govde').innerHTML = tekneSatirlari(suz, cokLiman);
      tekneSatirOlaylari(hedef);
    };
    ara.addEventListener('input', suzVeCiz);
    turFiltre.addEventListener('change', suzVeCiz);
    tekneSatirOlaylari(hedef);
  } catch (err) { hataGoster(hedef, err); }
}

function tekneSatirlari(liste, cokLiman) {
  if (liste.length === 0) return `<tr><td colspan="${cokLiman ? 6 : 5}"><div class="bos-durum"><div class="ikon">⛵</div><p>Tekne kaydı yok. Hak Sahipleri sayfasından tekne ekleyebilirsiniz.</p></div></td></tr>`;
  return liste.map(t => {
    const bs = belgeSinifi[t.belge_sinifi || 'profesyonel'];
    return `
    <tr>
      <td><b>${escapeHtml(t.ad)}</b>${t.tescil_no ? `<span class="alt">Tescil: ${escapeHtml(t.tescil_no)}</span>` : ''}<br/><span class="rozet rozet-${bs.sinif}" style="margin-top:4px;display:inline-block">${bs.ikon} ${bs.etiket}</span></td>
      <td>${escapeHtml(t.tekne_tipi || '—')}${t.boy_metre ? `<span class="alt">${t.boy_metre} m${t.tonaj ? ' • ' + t.tonaj + ' ton' : ''}</span>` : ''}</td>
      <td>${escapeHtml(t.sahip_adi)}${t.sahip_telefon ? `<span class="alt">${escapeHtml(t.sahip_telefon)}</span>` : ''}</td>
      <td>${t.dam_no ? `<span class="rozet rozet-teal">${escapeHtml(t.dam_no)}</span>${t.dam_rihtim ? `<span class="alt">${escapeHtml(t.dam_rihtim)}</span>` : ''}` : '<span class="alt">— Dam yok —</span>'}</td>
      ${cokLiman ? `<td>${escapeHtml(t.liman_adi)}</td>` : ''}
      <td><div class="satir-islem">
        <button class="btn btn-acik btn-mini" data-detay="${t.id}">Detay</button>
        <button class="btn btn-acik btn-mini" data-duzenle="${t.id}">Düzenle</button>
      </div></td>
    </tr>`; }).join('');
}

function tekneSatirOlaylari(hedef) {
  hedef.querySelectorAll('[data-detay]').forEach(b => b.addEventListener('click', () => tekneDetay(b.dataset.detay)));
  hedef.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => {
    const t = (durum.veri.tekneler || []).find(x => x.id == b.dataset.duzenle);
    if (t) tekneFormu(t.hak_sahibi_id, t);
  }));
}

async function tekneDetay(id) {
  try {
    const t = await istek('/tekneler/' + id);
    const sat = (etiket, deger) => `<div class="detay-sat"><span>${etiket}</span><b>${deger ? escapeHtml(String(deger)) : '—'}</b></div>`;
    modal(`⛵ ${escapeHtml(t.ad)}`, `
      <div class="detay-grup">
        <h4>Tekne bilgileri</h4>
        ${sat('Belge sınıfı', (belgeSinifi[t.belge_sinifi || 'profesyonel'].ikon + ' ' + belgeSinifi[t.belge_sinifi || 'profesyonel'].etiket + ' belgeli'))}
        ${sat('Tip', t.tekne_tipi)}
        ${sat('Boy', t.boy_metre ? t.boy_metre + ' m' : null)}
        ${sat('Tonaj', t.tonaj ? t.tonaj + ' ton' : null)}
        ${sat('Bağlama kütüğü no', t.baglama_kutugu_no)}
        ${sat('Motor no', t.motor_no)}
        ${sat('Tescil no', t.tescil_no)}
      </div>
      <div class="detay-grup">
        <h4>Sahibi</h4>
        ${sat('Ad soyad', t.sahip_adi)}
        ${sat('Telefon', t.sahip_telefon)}
        ${yetkili('super_admin') ? sat('Liman', t.liman_adi) : ''}
      </div>
      <div class="detay-grup">
        <h4>Dam / Bağlama yeri</h4>
        ${sat('Dam no', t.dam_no)}
        ${sat('Rıhtım', t.dam_rihtim)}
      </div>
      <button class="btn btn-blok" id="tekne-duzenle-btn">✏️ Bu tekneyi düzenle</button>
    `, null, 'Kapat');
    document.getElementById('tekne-duzenle-btn').addEventListener('click', () => tekneFormu(t.hak_sahibi_id, t));
  } catch (err) { toast(err.message, 'hata'); }
}

// ============ DAMLAR ============
async function damlarSayfa(hedef) {
  try {
    const [liste, hakSahipleri] = await Promise.all([
      istek('/damlar'),
      istek('/hak-sahipleri').catch(() => []),
    ]);
    durum.veri.hakSahipleri = hakSahipleri;
    const cokLiman = yetkili('super_admin');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Damlar</h1><p>Dam / rıhtım yerleri ve atamaları</p></div>
        ${yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli') ? '<button class="btn" id="ekle-btn">+ Dam ekle</button>' : ''}
      </div>
      <div class="filtre-bar">
        <select id="durum-filtre">
          <option value="">Tüm durumlar</option>
          <option value="dolu">Dolu</option><option value="bos">Boş</option><option value="bakim">Bakımda</option>
        </select>
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr><th>Dam No</th><th>Rıhtım</th>${cokLiman ? '<th>Liman</th>' : ''}<th>Hak Sahibi</th><th>Durum</th><th></th></tr></thead>
            <tbody id="dam-govde"></tbody>
          </table>
        </div>
      </div>`;

    const ciz = (durumF = '') => {
      const veri = liste.filter(d => !durumF || d.durum === durumF);
      const govde = document.getElementById('dam-govde');
      govde.innerHTML = veri.length === 0
        ? `<tr><td colspan="${cokLiman ? 6 : 5}"><div class="bos-durum"><div class="ikon">🛟</div><p>Dam kaydı bulunamadı.</p></div></td></tr>`
        : veri.map(d => `
          <tr>
            <td><b>${escapeHtml(d.dam_no)}</b></td>
            <td>${escapeHtml(d.rihtim || '—')}</td>
            ${cokLiman ? `<td>${escapeHtml(d.liman_adi)}</td>` : ''}
            <td>${escapeHtml(d.hak_sahibi_adi || '—')}</td>
            <td><span class="rozet ${damDurumu[d.durum].sinif}">${damDurumu[d.durum].etiket}</span></td>
            <td><div class="satir-islem">
              ${yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli') ? `<button class="btn btn-acik btn-mini" data-duzenle="${d.id}">Düzenle</button>` : ''}
              ${yetkili('super_admin', 'liman_yoneticisi') ? `<button class="btn btn-tehlike btn-mini" data-sil="${d.id}">Sil</button>` : ''}
            </div></td>
          </tr>`).join('');
      govde.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => damFormu(liste.find(x => x.id == b.dataset.duzenle))));
      govde.querySelectorAll('[data-sil]').forEach(b => b.addEventListener('click', async () => {
        if (!confirm('Dam kaydı silinsin mi?')) return;
        await istek('/damlar/' + b.dataset.sil, { method: 'DELETE' }); toast('Dam silindi.'); sayfaCiz();
      }));
    };
    ciz();
    document.getElementById('durum-filtre').addEventListener('change', (e) => ciz(e.target.value));
    const ekle = document.getElementById('ekle-btn');
    if (ekle) ekle.addEventListener('click', () => damFormu());
  } catch (err) { hataGoster(hedef, err); }
}

async function damFormu(dam = null) {
  let limanlar = durum.veri.limanlar;
  if (yetkili('super_admin') && !limanlar) { limanlar = await istek('/limanlar'); durum.veri.limanlar = limanlar; }
  const hakSahipleri = durum.veri.hakSahipleri || await istek('/hak-sahipleri');
  const d = dam || {};
  const limanSecim = yetkili('super_admin')
    ? `<div class="alan"><label>Liman *</label><select name="liman_id" required>
        <option value="">— Seçin —</option>
        ${(limanlar || []).map(l => `<option value="${l.id}" ${d.liman_id == l.id ? 'selected' : ''}>${escapeHtml(l.ad)}</option>`).join('')}
       </select></div>` : '';
  modal(dam ? 'Damı düzenle' : 'Yeni dam', `
    ${limanSecim}
    <div class="alan-grup">
      <div class="alan"><label>Dam no *</label><input name="dam_no" value="${escapeHtml(d.dam_no)}" required /></div>
      <div class="alan"><label>Rıhtım</label><input name="rihtim" value="${escapeHtml(d.rihtim)}" /></div>
    </div>
    <div class="alan"><label>Hak sahibi</label>
      <select name="hak_sahibi_id"><option value="">— Boş —</option>
        ${hakSahipleri.map(h => `<option value="${h.id}" ${d.hak_sahibi_id == h.id ? 'selected' : ''}>${escapeHtml(h.ad_soyad)}</option>`).join('')}
      </select></div>
    <div class="alan"><label>Durum</label>
      <select name="durum">
        <option value="bos" ${d.durum === 'bos' ? 'selected' : ''}>Boş</option>
        <option value="dolu" ${d.durum === 'dolu' ? 'selected' : ''}>Dolu</option>
        <option value="bakim" ${d.durum === 'bakim' ? 'selected' : ''}>Bakımda</option>
      </select></div>
    <div class="alan"><label>Notlar</label><textarea name="notlar" rows="2">${escapeHtml(d.notlar)}</textarea></div>
  `, async (form) => {
    const govde = formVeri(form);
    if (dam) await istek('/damlar/' + dam.id, { method: 'PUT', body: JSON.stringify(govde) });
    else await istek('/damlar', { method: 'POST', body: JSON.stringify(govde) });
    toast(dam ? 'Dam güncellendi.' : 'Dam eklendi.');
    sayfaCiz();
  });
}

// ============ KULLANICILAR ============
async function kullanicilarSayfa(hedef) {
  try {
    const liste = await istek('/kullanicilar');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Kullanıcılar</h1><p>Sistem kullanıcıları ve yetkileri</p></div>
        <button class="btn" id="ekle-btn">+ Kullanıcı ekle</button>
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr><th>Ad Soyad</th><th>E-posta</th><th>Rol</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${liste.map(k => `
                <tr>
                  <td><b>${escapeHtml(k.ad_soyad)}</b></td>
                  <td>${escapeHtml(k.eposta)}</td>
                  <td><span class="rozet rozet-teal">${rolAdi[k.rol] || k.rol}</span></td>
                  <td><span class="rozet ${k.aktif ? 'rozet-yesil' : 'rozet-gri'}">${k.aktif ? 'Aktif' : 'Pasif'}</span></td>
                  <td><div class="satir-islem">
                    ${(yetkili('super_admin') || k.rol !== 'super_admin') ? `<button class="btn btn-acik btn-mini" data-duzenle="${k.id}">Düzenle</button>` : ''}
                  </div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
    document.getElementById('ekle-btn').addEventListener('click', () => kullaniciFormu());
    hedef.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => kullaniciFormu(liste.find(x => x.id == b.dataset.duzenle))));
  } catch (err) { hataGoster(hedef, err); }
}

async function kullaniciFormu(kul = null) {
  let limanlar = durum.veri.limanlar;
  if (yetkili('super_admin') && !limanlar) limanlar = await istek('/limanlar');
  const superAdmin = yetkili('super_admin');
  const duzenle = !!kul;
  const rolSecenek = superAdmin
    ? ['super_admin', 'liman_yoneticisi', 'liman_personeli', 'hak_sahibi', 'vekil']
    : ['liman_personeli', 'hak_sahibi', 'vekil'];
  const d = kul || {};
  modal(duzenle ? 'Kullanıcıyı düzenle' : 'Yeni kullanıcı', `
    <div class="alan"><label>Ad soyad *</label><input name="ad_soyad" value="${escapeHtml(d.ad_soyad)}" required /></div>
    <div class="alan"><label>E-posta *</label><input name="eposta" type="email" value="${escapeHtml(d.eposta)}" required /></div>
    <div class="alan-grup">
      <div class="alan"><label>Telefon</label><input name="telefon" value="${escapeHtml(d.telefon)}" /></div>
      <div class="alan"><label>Şifre ${duzenle ? '(değiştirmek için doldurun)' : '*'}</label><input name="sifre" type="password" ${duzenle ? '' : 'required'} minlength="6" placeholder="${duzenle ? 'Boş bırakırsanız değişmez' : ''}" /></div>
    </div>
    <div class="alan"><label>Rol *</label>
      <select name="rol" required>${rolSecenek.map(r => `<option value="${r}" ${d.rol === r ? 'selected' : ''}>${rolAdi[r]}</option>`).join('')}</select></div>
    ${(superAdmin && !duzenle) ? `<div class="alan"><label>Liman (rol gerektiriyorsa)</label>
      <select name="liman_id"><option value="">— Yok —</option>
        ${(limanlar || []).map(l => `<option value="${l.id}">${escapeHtml(l.ad)}</option>`).join('')}</select></div>` : ''}
    ${duzenle ? `<div class="alan" style="display:flex;align-items:center;gap:9px">
      <input type="checkbox" name="aktif" id="aktif-cb" ${d.aktif ? 'checked' : ''} style="width:auto" />
      <label for="aktif-cb" style="margin:0">Hesap aktif (kapatırsanız giriş yapamaz)</label>
    </div>` : ''}
  `, async (form) => {
    const govde = formVeri(form);
    if (duzenle) {
      govde.aktif = form.querySelector('#aktif-cb')?.checked ? 1 : 0;
      if (!govde.sifre) delete govde.sifre; // boşsa şifreyi değiştirme
      await istek('/kullanicilar/' + kul.id, { method: 'PUT', body: JSON.stringify(govde) });
      toast('Kullanıcı güncellendi.');
    } else {
      await istek('/kullanicilar', { method: 'POST', body: JSON.stringify(govde) });
      toast('Kullanıcı eklendi.');
    }
    sayfaCiz();
  });
}

// ============================================================
// FAZ 2 — BELGE MOTORU SAYFALARI
// ============================================================

// Belge durum rozeti HTML'i
function durumRozeti(durum) {
  const renk = { yuklenmedi: 'gri', reddedildi: 'kirmizi', suresi_doldu: 'kirmizi', yaklasiyor: 'sari', incelemede: 'mavi', onayli: 'yesil' }[durum] || 'gri';
  return `<span class="bdurum ${renk}">${belgeDurumEtiket[durum] || durum}</span>`;
}

// Belge satırının alt bilgisi: yüklenme durumu + kalan süre
function belgeSureBilgisi(b) {
  if (b.durum === 'yuklenmedi') {
    return '<span style="color:var(--metin-soluk)">Henüz yüklenmedi</span> • ' +
      (b.gecerlilik_ay ? b.gecerlilik_ay + ' ay geçerli olur' : 'Süresiz');
  }
  if (b.durum === 'incelemede') return '⏳ Yüklendi, yönetici onayı bekleniyor';
  if (b.durum === 'reddedildi') return '❌ Reddedildi — yeniden yüklemeniz gerekiyor';

  // Onaylı / yaklaşıyor / süresi doldu → kalan süreyi hesapla
  if (!b.gecerlilik_bitis) return '✓ Yüklendi ve onaylandı • Süresiz geçerli';
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const bitis = new Date(b.gecerlilik_bitis + 'T00:00:00');
  const kalanGun = Math.round((bitis - bugun) / 86400000);
  const tarihStr = bitis.toLocaleDateString('tr-TR');

  if (kalanGun < 0) {
    return `<span class="red">⛔ Süresi doldu (${tarihStr}, ${Math.abs(kalanGun)} gün önce) — yenileyin</span>`;
  }
  if (kalanGun === 0) return `<span class="red">⚠ Bugün son gün (${tarihStr}) — yenileyin</span>`;
  if (kalanGun <= 30) {
    return `<span style="color:#9a7414;font-weight:600">⏰ ${kalanGun} gün kaldı</span> • Son tarih: ${tarihStr}`;
  }
  // Bol zaman var
  return `✓ Geçerli • Son tarih: ${tarihStr} (${kalanGun} gün kaldı)`;
}

// ---- BELGE TİPLERİ (yönetici) ----
async function belgeTipleriSayfa(hedef) {
  try {
    const liste = await istek('/belge-tipleri');
    const cokLiman = yetkili('super_admin');
    // Kategoriye göre grupla
    const gruplar = {};
    liste.forEach(t => { (gruplar[t.kategori] = gruplar[t.kategori] || []).push(t); });

    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Belge Tipleri</h1><p>Hak sahiplerinden istenecek belgelerin tanımı</p></div>
        <button class="btn" id="ekle-btn">+ Belge tipi ekle</button>
      </div>
      ${liste.length === 0 ? `<div class="panel"><div class="bos-durum"><div class="ikon">🗂️</div><p>Henüz belge tipi tanımlanmamış.<br/>Hak sahiplerinin yüklemesi gereken belgeleri buradan ekleyin.</p></div></div>` :
        Object.keys(gruplar).map(kat => `
          <div class="kat-baslik">${kategoriAdi[kat] || kat}</div>
          <div class="belge-liste">
            ${gruplar[kat].map(t => `
              <div class="belge-satir">
                <div class="bilgi">
                  <b>${escapeHtml(t.ad)} ${t.zorunlu ? '<span class="zorunlu-yildiz" title="Zorunlu">*</span>' : ''}</b>
                  <span class="alt">${kapsamAdi[t.kapsam]} • ${t.gecerlilik_ay ? t.gecerlilik_ay + ' ay geçerli' : 'Süresiz'}${(t.kosul_min_boy || t.kosul_max_boy) ? ' • ⚙️ ' + (t.kosul_min_boy ? t.kosul_min_boy + 'm+' : '') + (t.kosul_max_boy ? ' ' + t.kosul_max_boy + 'm-altı' : '') + ' tekne' : ''}${cokLiman ? ' • ' + escapeHtml(t.liman_adi) : ''}</span>
                </div>
                <div class="sag">
                  <span class="bdurum ${t.aktif ? 'yesil' : 'gri'}">${t.aktif ? 'Aktif' : 'Pasif'}</span>
                  <button class="btn btn-acik btn-mini" data-duzenle="${t.id}">Düzenle</button>
                  <button class="btn btn-tehlike btn-mini" data-sil="${t.id}">Sil</button>
                </div>
              </div>`).join('')}
          </div>`).join('')}`;

    document.getElementById('ekle-btn').addEventListener('click', () => belgeTipiFormu());
    hedef.querySelectorAll('[data-duzenle]').forEach(b => b.addEventListener('click', () => belgeTipiFormu(liste.find(x => x.id == b.dataset.duzenle))));
    hedef.querySelectorAll('[data-sil]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Bu belge tipini silmek istediğinize emin misiniz? Bağlı yüklenmiş belgeler de silinir.')) return;
      await istek('/belge-tipleri/' + b.dataset.sil, { method: 'DELETE' }); toast('Belge tipi silindi.'); sayfaCiz();
    }));
  } catch (err) { hataGoster(hedef, err); }
}

async function belgeTipiFormu(tip = null) {
  let limanlar = durum.veri.limanlar;
  if (yetkili('super_admin') && !limanlar) { limanlar = await istek('/limanlar'); durum.veri.limanlar = limanlar; }
  const d = tip || { kategori: 'kisisel', kapsam: 'hak_sahibi', zorunlu: 1, hatirlatma_gun: 30 };
  const limanSecim = (yetkili('super_admin') && !tip)
    ? `<div class="alan"><label>Liman *</label><select name="liman_id" required>
        <option value="">— Seçin —</option>
        ${(limanlar || []).map(l => `<option value="${l.id}">${escapeHtml(l.ad)}</option>`).join('')}
       </select></div>` : '';
  const sec = (ad, secenekler, deger) =>
    `<select name="${ad}">${Object.entries(secenekler).map(([v, e]) => `<option value="${v}" ${deger === v ? 'selected' : ''}>${e}</option>`).join('')}</select>`;
  modal(tip ? 'Belge tipini düzenle' : 'Yeni belge tipi', `
    ${limanSecim}
    <div class="alan"><label>Belge adı *</label><input name="ad" value="${escapeHtml(d.ad)}" required placeholder="ör. Su ürünleri ruhsat teskeresi" /></div>
    <div class="alan-grup">
      <div class="alan"><label>Kategori</label>${sec('kategori', kategoriAdi, d.kategori)}</div>
      <div class="alan"><label>Kime ait olduğu *</label>${sec('kapsam', kapsamAdi, d.kapsam)}</div>
    </div>
    <div class="kapsam-aciklama" id="kapsam-aciklama"></div>
    <div class="alan-grup">
      <div class="alan"><label>Geçerlilik (ay)</label><input name="gecerlilik_ay" type="number" min="0" value="${d.gecerlilik_ay ?? ''}" placeholder="Boş = süresiz" /></div>
      <div class="alan"><label>Hatırlatma (gün önce)</label><input name="hatirlatma_gun" type="number" min="0" value="${d.hatirlatma_gun ?? 30}" /></div>
    </div>
    <div class="alan" style="display:flex;align-items:center;gap:9px">
      <input type="checkbox" name="zorunlu" id="zorunlu-cb" ${d.zorunlu ? 'checked' : ''} style="width:auto" />
      <label for="zorunlu-cb" style="margin:0">Bu belge zorunlu</label>
    </div>
    <div class="kosul-kutu">
      <div class="baslik">⚙️ Koşullu kural (isteğe bağlı)</div>
      <p style="font-size:12px;color:var(--metin-soluk);margin-bottom:10px">Bu belgeyi yalnızca belirli tekne boyu aralığındaki hak sahiplerinden iste. Boş bırakırsanız herkesten istenir.</p>
      <div class="alan-grup" style="margin-bottom:0">
        <div class="alan" style="margin-bottom:0"><label>Min. tekne boyu (m)</label><input name="kosul_min_boy" type="number" step="0.1" min="0" value="${d.kosul_min_boy ?? ''}" placeholder="ör. 12" /></div>
        <div class="alan" style="margin-bottom:0"><label>Maks. tekne boyu (m)</label><input name="kosul_max_boy" type="number" step="0.1" min="0" value="${d.kosul_max_boy ?? ''}" placeholder="sınırsız" /></div>
      </div>
    </div>
    <div class="alan" style="margin-top:16px"><label>Açıklama</label><textarea name="aciklama" rows="2">${escapeHtml(d.aciklama)}</textarea></div>
  `, async (form) => {
    const govde = formVeri(form);
    govde.zorunlu = form.querySelector('#zorunlu-cb').checked;
    govde.gecerlilik_ay = govde.gecerlilik_ay ? Number(govde.gecerlilik_ay) : null;
    govde.hatirlatma_gun = govde.hatirlatma_gun ? Number(govde.hatirlatma_gun) : 30;
    govde.kosul_min_boy = govde.kosul_min_boy ? Number(govde.kosul_min_boy) : null;
    govde.kosul_max_boy = govde.kosul_max_boy ? Number(govde.kosul_max_boy) : null;
    if (tip) { govde.aktif = tip.aktif; await istek('/belge-tipleri/' + tip.id, { method: 'PUT', body: JSON.stringify(govde) }); }
    else await istek('/belge-tipleri', { method: 'POST', body: JSON.stringify(govde) });
    toast(tip ? 'Belge tipi güncellendi.' : 'Belge tipi eklendi.');
    sayfaCiz();
  });

  // "Kime ait" seçimine göre açıklama göster
  const kapsamAciklamalari = {
    hak_sahibi: '👤 Kişiye ait belge — her hak sahibinden bir kez istenir (ör. nüfus cüzdanı, ikametgah, sağlık raporu).',
    tekne: '⛵ Tekneye ait belge — teknesi olan hak sahiplerinden istenir (ör. bağlama kütüğü ruhsatı, denize elverişlilik, telsiz ruhsatı).',
    dam: '🛟 Dama ait belge — dam tahsisi olan hak sahiplerinden istenir (ör. dam tahsis sözleşmesi).',
  };
  const kapsamSel = document.querySelector('[name="kapsam"]');
  const kapsamKutu = document.getElementById('kapsam-aciklama');
  if (kapsamSel && kapsamKutu) {
    const guncelle = () => { kapsamKutu.textContent = kapsamAciklamalari[kapsamSel.value] || ''; };
    kapsamSel.addEventListener('change', guncelle);
    guncelle();
  }
}

// ---- İNCELEME KUYRUĞU (yönetici) ----
async function incelemeSayfa(hedef) {
  try {
    const liste = await istek('/inceleme-kuyrugu');
    const cokLiman = yetkili('super_admin');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>İnceleme Kuyruğu</h1><p>Onay bekleyen ${liste.length} belge</p></div>
      </div>
      <div class="panel">
        ${liste.length === 0 ? `<div class="bos-durum"><div class="ikon">✅</div><p>Bekleyen belge yok. Her şey güncel.</p></div>` :
          liste.map(b => `
            <div class="kuyruk-kart">
              <div class="bilgi">
                <b>${escapeHtml(b.belge_tipi)}</b>
                <div class="alt">${escapeHtml(b.hak_sahibi_adi)}${cokLiman ? ' • ' + escapeHtml(b.liman_adi) : ''}${b.gecerlilik_bitis ? ' • Geçerlilik: ' + b.gecerlilik_bitis : ''}</div>
              </div>
              <div class="kuyruk-islem">
                <button class="btn btn-acik btn-mini" data-goster="${b.id}">Görüntüle</button>
                <button class="btn btn-onay btn-mini" data-onay="${b.id}">Onayla</button>
                <button class="btn btn-red btn-mini" data-red="${b.id}">Reddet</button>
              </div>
            </div>`).join('')}
      </div>`;

    hedef.querySelectorAll('[data-goster]').forEach(b => b.addEventListener('click', () => {
      window.open(API + '/belgeler/' + b.dataset.goster + '/dosya?token=' + durum.token, '_blank');
    }));
    hedef.querySelectorAll('[data-onay]').forEach(b => b.addEventListener('click', async () => {
      await istek('/belgeler/' + b.dataset.onay + '/incele', { method: 'PUT', body: JSON.stringify({ karar: 'onayli' }) });
      toast('Belge onaylandı.'); sayfaCiz();
    }));
    hedef.querySelectorAll('[data-red]').forEach(b => b.addEventListener('click', () => {
      modal('Belgeyi reddet', `
        <div class="alan"><label>Red gerekçesi *</label><textarea name="red_gerekce" rows="3" required placeholder="Hak sahibi bu gerekçeyi görecek (ör. belge okunaksız, süresi geçmiş)"></textarea></div>
      `, async (form) => {
        const g = formVeri(form);
        if (!g.red_gerekce) throw new Error('Gerekçe girin.');
        await istek('/belgeler/' + b.dataset.red + '/incele', { method: 'PUT', body: JSON.stringify({ karar: 'reddedildi', red_gerekce: g.red_gerekce }) });
        toast('Belge reddedildi.'); sayfaCiz();
      });
    }));
  } catch (err) { hataGoster(hedef, err); }
}

// ---- BELGE DURUM PANELİ (hem yönetici detayında hem hak sahibi self-serviste kullanılır) ----
function belgeDurumPaneli(durumVeri, hsId, duzenlenebilir) {
  const s = durumVeri.skor;
  const sinif = s.yuzde === 100 ? 'tam' : s.yuzde < 40 ? 'dusuk' : '';
  // Kategoriye göre grupla
  const gruplar = {};
  durumVeri.belgeler.forEach(b => { (gruplar[b.kategori] = gruplar[b.kategori] || []).push(b); });

  return `
    <div class="skor-kart">
      <div class="skor-halka ${sinif}" style="--p:${s.yuzde}"><span class="skor-deger">%${s.yuzde}</span></div>
      <div class="skor-bilgi">
        <h3>Evrak uygunluğu</h3>
        <p>${s.tam}/${s.toplam} zorunlu belge tamam${s.eksik ? ` • ${s.eksik} eksik/dikkat` : ''}</p>
      </div>
    </div>
    ${Object.keys(gruplar).map(kat => `
      <div class="kat-baslik">${kategoriAdi[kat] || kat}</div>
      <div class="belge-liste">
        ${gruplar[kat].map(b => `
          <div class="belge-satir">
            <div class="bilgi">
              <b>${escapeHtml(b.ad)} ${b.zorunlu ? '<span class="zorunlu-yildiz">*</span>' : ''}${b.ornek_etiket ? ` <span class="ornek-rozet">${escapeHtml(b.ornek_etiket)}</span>` : ''}${b.ozel === 'muaf' ? ' <span class="ornek-rozet muaf">Muaf</span>' : b.ozel === 'ekstra' ? ' <span class="ornek-rozet ekstra">Ek</span>' : ''}</b>
              <span class="alt">
                ${belgeSureBilgisi(b)}
                ${b.durum === 'reddedildi' && b.red_gerekce ? `<br/><span class="red">⚠ ${escapeHtml(b.red_gerekce)}</span>` : ''}
              </span>
            </div>
            <div class="sag">
              ${durumRozeti(b.durum)}
              ${b.belge_id ? `<button class="btn btn-acik btn-mini" data-bgoster="${b.belge_id}">Gör</button>` : ''}
              ${duzenlenebilir ? `<button class="btn btn-mini" data-byukle="${b.belge_tipi_id}" data-bad="${escapeHtml(b.ad)}" data-tekne="${b.tekne_id || ''}" data-dam="${b.dam_id || ''}" data-etiket="${escapeHtml(b.ornek_etiket || '')}">${b.belge_id ? 'Yenile' : 'Yükle'}</button>` : ''}
            </div>
          </div>`).join('')}
      </div>`).join('')}`;
}

// Belge görüntüleme + yükleme olaylarını bağla
function belgeOlaylariBagla(hedef, hsId, yenidenCiz) {
  hedef.querySelectorAll('[data-bgoster]').forEach(b => b.addEventListener('click', () => {
    window.open(API + '/belgeler/' + b.dataset.bgoster + '/dosya?token=' + durum.token, '_blank');
  }));
  hedef.querySelectorAll('[data-byukle]').forEach(b => b.addEventListener('click', () => {
    const ad = b.dataset.bad + (b.dataset.etiket ? ` (${b.dataset.etiket})` : '');
    belgeYuklemeModal(b.dataset.byukle, ad, hsId, yenidenCiz, b.dataset.tekne || null, b.dataset.dam || null);
  }));
}

// ---- BELGE YÜKLEME MODALI ----
function belgeYuklemeModal(belgeTipiId, belgeAdi, hsId, yenidenCiz, tekneId = null, damId = null) {
  const mobil = window.matchMedia('(max-width: 860px)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const yuklemeArayuzu = mobil
    ? `<div class="yukleme-secim">
         <button type="button" id="btn-kamera"><span class="bik">📷</span><span>Kamera ile çek</span></button>
         <button type="button" id="btn-galeri"><span class="bik">🖼️</span><span>Dosyadan seç</span></button>
       </div>`
    : `<div class="yukleme-alani" id="yukleme-alani">
         <div class="ikon">📎</div>
         <p><b>Dosya seçmek için tıklayın</b><br/>veya buraya sürükleyin (PDF, JPG, PNG — en çok 10 MB)</p>
       </div>`;
  modal(`Belge yükle: ${belgeAdi}`, `
    <div class="alan">
      <label>Belgenin düzenlenme tarihi</label>
      <input name="duzenlenme_tarihi" type="date" />
      <p style="font-size:12px;color:var(--metin-soluk);margin-top:6px">Geçerlilik süresi olan belgeler için son geçerlilik tarihi otomatik hesaplanır.</p>
    </div>
    <div class="alan">
      <label>Dosya *</label>
      ${yuklemeArayuzu}
      <input type="file" id="dosya-input" accept=".pdf,.jpg,.jpeg,.png,.webp" style="display:none" />
      <input type="file" id="kamera-input" accept="image/*" capture="environment" style="display:none" />
      <div id="secilen" class="secilen-dosya gizli"></div>
    </div>
  `, async () => {
    const input = document.getElementById('dosya-input');
    if (!input.files || !input.files[0]) throw new Error('Lütfen bir dosya seçin.');
    const fd = new FormData();
    fd.append('belge_tipi_id', belgeTipiId);
    fd.append('hak_sahibi_id', hsId);
    if (tekneId) fd.append('tekne_id', tekneId);
    if (damId) fd.append('dam_id', damId);
    const tarih = document.querySelector('[name="duzenlenme_tarihi"]').value;
    if (tarih) fd.append('duzenlenme_tarihi', tarih);
    fd.append('dosya', input.files[0]);
    await istekDosya('/belgeler', fd);
    toast('Belge yüklendi, incelemeye gönderildi.');
    if (yenidenCiz) yenidenCiz();
  });

  const input = document.getElementById('dosya-input');
  const kamera = document.getElementById('kamera-input');
  const secilen = document.getElementById('secilen');
  const gosterDosya = (dosya) => {
    if (dosya) {
      secilen.textContent = '✓ ' + (dosya.name || 'Fotoğraf çekildi');
      secilen.classList.remove('gizli');
    }
  };
  input.addEventListener('change', () => gosterDosya(input.files[0]));

  if (mobil) {
    // Kamera: çekilen fotoğrafı asıl dosya input'una aktar
    document.getElementById('btn-kamera').addEventListener('click', () => kamera.click());
    document.getElementById('btn-galeri').addEventListener('click', () => input.click());
    kamera.addEventListener('change', () => {
      if (kamera.files && kamera.files[0]) {
        const dt = new DataTransfer();
        dt.items.add(kamera.files[0]);
        input.files = dt.files;
        gosterDosya(kamera.files[0]);
      }
    });
  } else {
    const alan = document.getElementById('yukleme-alani');
    alan.addEventListener('click', () => input.click());
    alan.addEventListener('dragover', (e) => { e.preventDefault(); alan.classList.add('surukle'); });
    alan.addEventListener('dragleave', () => alan.classList.remove('surukle'));
    alan.addEventListener('drop', (e) => {
      e.preventDefault(); alan.classList.remove('surukle');
      if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; gosterDosya(input.files[0]); }
    });
  }
}

// ---- BELGELERİM (hak sahibi self-servis) ----
async function belgelerimSayfa(hedef) {
  try {
    const benim = await istek('/benim-kaydim');
    const durumVeri = await istek('/hak-sahipleri/' + benim.id + '/belge-durumu');
    // Dikkat gerektirenleri say
    const eksikler = durumVeri.belgeler.filter(b => b.zorunlu && ['yuklenmedi', 'reddedildi', 'suresi_doldu'].includes(b.durum));
    const yaklasanlar = durumVeri.belgeler.filter(b => b.durum === 'yaklasiyor');
    let uyari = '';
    if (eksikler.length || yaklasanlar.length) {
      const parcalar = [];
      if (eksikler.length) parcalar.push(`<b>${eksikler.length}</b> belge eksik veya yenilenmeli`);
      if (yaklasanlar.length) parcalar.push(`<b>${yaklasanlar.length}</b> belgenin süresi yaklaşıyor`);
      uyari = `<div class="uyari-serit">⚠️ ${parcalar.join(' • ')}. Aşağıdan ilgili belgeleri yükleyebilirsiniz.</div>`;
    } else if (durumVeri.skor.yuzde === 100) {
      uyari = `<div class="uyari-serit basarili">✓ Tüm evraklarınız tam ve güncel. Teşekkürler!</div>`;
    }
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Belgelerim</h1><p>Evraklarınızı yükleyin ve durumlarını takip edin</p></div>
      </div>
      ${uyari}
      <div id="belge-icerik">${belgeDurumPaneli(durumVeri, benim.id, true)}</div>`;
    belgeOlaylariBagla(hedef, benim.id, () => sayfaCiz());
  } catch (err) { hataGoster(hedef, err); }
}

// ---- PROFİLİM (hak sahibi) ----
async function profilimSayfa(hedef) {
  try {
    const benim = await istek('/benim-kaydim');
    const detay = await istek('/hak-sahipleri/' + benim.id);
    hedef.innerHTML = `
      <div class="sayfa-baslik"><div><h1>Profilim</h1><p>Kişisel ve tekne bilgileriniz</p></div></div>
      <div class="panel"><div style="padding:4px 4px">
        <div class="detay-grup" style="padding:18px 18px 0">
          <h4>İletişim</h4>
          <div class="mini-liste">
            <div class="mini-kart"><div><b>Ad Soyad</b></div><div>${escapeHtml(detay.ad_soyad)}</div></div>
            <div class="mini-kart"><div><b>Telefon</b></div><div>${escapeHtml(detay.telefon || '—')}</div></div>
            <div class="mini-kart"><div><b>T.C. No</b></div><div>${escapeHtml(detay.tc_no || '—')}</div></div>
          </div>
        </div>
        <div class="detay-grup" style="padding:0 18px">
          <h4>Teknelerim (${detay.tekneler.length})</h4>
          <div class="mini-liste">
            ${detay.tekneler.length === 0 ? '<div class="mini-kart"><div class="alt">Kayıtlı tekne yok.</div></div>' :
              detay.tekneler.map(t => `<div class="mini-kart"><div><b>${escapeHtml(t.ad)}</b><span class="alt">${escapeHtml(t.tekne_tipi || '')}</span></div></div>`).join('')}
          </div>
        </div>
        <div class="detay-grup" style="padding:0 18px 18px">
          <h4>Damlarım (${detay.damlar.length})</h4>
          <div class="mini-liste">
            ${detay.damlar.length === 0 ? '<div class="mini-kart"><div class="alt">Atanmış dam yok.</div></div>' :
              detay.damlar.map(dm => `<div class="mini-kart"><div><b>Dam ${escapeHtml(dm.dam_no)}</b><span class="alt">${escapeHtml(dm.rihtim || '')}</span></div></div>`).join('')}
          </div>
        </div>
        <p style="padding:0 18px 18px;font-size:13px;color:var(--metin-soluk)">Bilgilerinizde değişiklik için liman yöneticinizle iletişime geçin.</p>
      </div></div>`;
  } catch (err) { hataGoster(hedef, err); }
}

// ============================================================
// FAZ 3 — BİLDİRİMLER, DUYURULAR, PANEL
// ============================================================

// ---- BİLDİRİM ZİLİ ----
async function zilKur() {
  await zilGuncelle();
  const btn = document.getElementById('zil-btn');
  const panel = document.getElementById('zil-panel');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!panel.classList.contains('gizli')) { panel.classList.add('gizli'); return; }
    await zilPaneliAc();
  });
  document.addEventListener('click', (e) => {
    if (panel && !panel.contains(e.target) && e.target !== btn) panel.classList.add('gizli');
  });
}

async function zilGuncelle() {
  try {
    const veri = await istek('/bildirimler');
    const sayac = document.getElementById('zil-sayac');
    if (!sayac) return;
    if (veri.okunmamis > 0) { sayac.textContent = veri.okunmamis > 99 ? '99+' : veri.okunmamis; sayac.classList.remove('gizli'); }
    else sayac.classList.add('gizli');
    durum.veri.bildirimler = veri.bildirimler;
  } catch {}
}

async function zilPaneliAc() {
  const panel = document.getElementById('zil-panel');
  const veri = await istek('/bildirimler');
  durum.veri.bildirimler = veri.bildirimler;
  panel.innerHTML = `
    <div class="zil-panel-bas">
      <b>Bildirimler</b>
      ${veri.okunmamis > 0 ? '<button id="tumu-okundu">Tümünü okundu işaretle</button>' : ''}
    </div>
    ${veri.bildirimler.length === 0
      ? '<div class="zil-bos">Henüz bildiriminiz yok.</div>'
      : veri.bildirimler.map(b => `
        <div class="bildirim-sat ${b.okundu ? '' : 'okunmamis'}" data-bid="${b.id}">
          <div class="nokta"></div>
          <div class="icer">
            <b>${escapeHtml(b.baslik)}</b>
            ${b.icerik ? `<p>${escapeHtml(b.icerik)}</p>` : ''}
            <div class="zaman">${zamanFarki(b.olusturma_tarihi)}</div>
          </div>
        </div>`).join('')}`;
  panel.classList.remove('gizli');

  const to = document.getElementById('tumu-okundu');
  if (to) to.addEventListener('click', async (e) => {
    e.stopPropagation();
    await istek('/bildirimler/tumu-okundu', { method: 'PUT' });
    await zilGuncelle(); await zilPaneliAc();
  });
  panel.querySelectorAll('[data-bid]').forEach(el => el.addEventListener('click', async (e) => {
    e.stopPropagation();
    await istek('/bildirimler/' + el.dataset.bid + '/okundu', { method: 'PUT' });
    el.classList.remove('okunmamis');
    await zilGuncelle();
  }));
}

function zamanFarki(tarihStr) {
  const t = new Date(tarihStr.replace(' ', 'T') + 'Z');
  const fark = Math.floor((Date.now() - t.getTime()) / 1000);
  if (fark < 60) return 'az önce';
  if (fark < 3600) return Math.floor(fark / 60) + ' dk önce';
  if (fark < 86400) return Math.floor(fark / 3600) + ' saat önce';
  if (fark < 604800) return Math.floor(fark / 86400) + ' gün önce';
  return t.toLocaleDateString('tr-TR');
}

// ---- DUYURULAR ----
async function duyurularSayfa(hedef) {
  try {
    const liste = await istek('/duyurular');
    const yonetici = yetkili('super_admin', 'liman_yoneticisi');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Duyurular</h1><p>${yonetici ? 'Limanınıza veya tüm sisteme duyuru yayınlayın' : 'Liman ve sistem duyuruları'}</p></div>
        ${yonetici ? '<button class="btn" id="ekle-btn">+ Duyuru yayınla</button>' : ''}
      </div>
      ${liste.length === 0
        ? '<div class="panel"><div class="bos-durum"><div class="ikon">📢</div><p>Henüz duyuru yok.</p></div></div>'
        : liste.map(d => `
          <div class="duyuru-kart ${d.oncelik} ${d.okundu ? '' : 'okunmamis'}">
            <div class="ust">
              <h3>${d.okundu ? '' : '<span class="yeni-nokta" title="Yeni"></span>'}${escapeHtml(d.baslik)}</h3>
              <div style="display:flex;gap:8px;align-items:center">
                <span class="oncelik-rozet ${d.oncelik}">${d.oncelik === 'acil' ? 'Acil' : d.oncelik === 'onemli' ? 'Önemli' : 'Normal'}</span>
                ${yonetici ? `<button class="btn btn-tehlike btn-mini" data-sil="${d.id}">Sil</button>` : ''}
              </div>
            </div>
            <div class="icerik">${escapeHtml((d.icerik || '').slice(0, 140))}${(d.icerik || '').length > 140 ? '…' : ''}</div>
            <div class="meta">
              <span class="kapsam-etiket">${d.liman_id === null ? '🌐 Tüm sistem' : '⚓ ' + escapeHtml(d.liman_adi || 'Liman')}</span>
              ${d.hedef_tipi === 'secili' ? '<span class="kapsam-etiket">👁 Seçili kişiler</span>' : ''}
              ${d.dosya_adi ? '<span class="kapsam-etiket">📎 Ek dosya</span>' : ''}
              <span>${zamanFarki(d.olusturma_tarihi)}</span>
              <button class="btn btn-acik btn-mini" data-ac="${d.id}">Duyuruyu aç →</button>
            </div>
          </div>`).join('')}`;

    const ekle = document.getElementById('ekle-btn');
    if (ekle) ekle.addEventListener('click', () => duyuruFormu());
    hedef.querySelectorAll('[data-ac]').forEach(b => b.addEventListener('click', () => duyuruDetay(b.dataset.ac)));
    hedef.querySelectorAll('[data-sil]').forEach(b => b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Duyuru silinsin mi?')) return;
      await istek('/duyurular/' + b.dataset.sil, { method: 'DELETE' }); toast('Duyuru silindi.'); sayfaCiz();
    }));
  } catch (err) { hataGoster(hedef, err); }
}

// Madde 1: Duyuruyu detaylı aç (okundu işaretler, dosya indirme, hedef kişiler)
async function duyuruDetay(id) {
  try {
    const d = await istek('/duyurular/' + id);
    const yonetici = yetkili('super_admin', 'liman_yoneticisi', 'liman_personeli');
    modal(escapeHtml(d.baslik), `
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <span class="oncelik-rozet ${d.oncelik}">${d.oncelik === 'acil' ? 'Acil' : d.oncelik === 'onemli' ? 'Önemli' : 'Normal'}</span>
        <span class="kapsam-etiket">${d.liman_id === null ? '🌐 Tüm sistem' : '⚓ ' + escapeHtml(d.liman_adi || 'Liman')}</span>
        ${d.hedef_tipi === 'secili' ? '<span class="kapsam-etiket">👁 Seçili kişiler</span>' : ''}
      </div>
      <div style="white-space:pre-wrap;line-height:1.6;font-size:15px;color:var(--metin);margin-bottom:16px">${escapeHtml(d.icerik)}</div>
      ${d.dosya_adi ? `<a class="btn btn-acik btn-blok" href="${API}/duyurular/${d.id}/dosya?token=${durum.token}" target="_blank" style="margin-bottom:14px">📎 Ek dosyayı indir: ${escapeHtml(d.dosya_adi)}</a>` : ''}
      ${(yonetici && d.hedefler && d.hedefler.length) ? `
        <div class="detay-grup"><h4>Gönderilen kişiler (${d.hedefler.length})</h4>
          <div class="mini-liste">${d.hedefler.map(h => `<div class="mini-kart"><div><b>${escapeHtml(h.ad_soyad)}</b></div></div>`).join('')}</div>
        </div>` : ''}
      <div class="meta" style="margin-top:8px">
        ${d.yayinlayan_adi ? '<span>Yayınlayan: ' + escapeHtml(d.yayinlayan_adi) + '</span>' : ''}
        <span>${zamanFarki(d.olusturma_tarihi)}</span>
      </div>
    `, null, 'Kapat');
    // Açılınca okundu işaretlendi → menü rozetini ve sayfayı tazele
    rozetleriTazele();
  } catch (err) { toast(err.message, 'hata'); }
}

async function duyuruFormu() {
  let limanlar = durum.veri.limanlar;
  if (yetkili('super_admin') && !limanlar) { limanlar = await istek('/limanlar'); durum.veri.limanlar = limanlar; }
  // Hedef seçimi için hak sahipleri (yöneticinin kendi limanından)
  let hakSahipleri = [];
  try { hakSahipleri = await istek('/hak-sahipleri'); } catch {}
  const limanSecim = yetkili('super_admin')
    ? `<div class="alan"><label>Hangi liman</label>
        <select name="liman_id">
          <option value="">🌐 Tüm sistem (tüm limanlar)</option>
          ${(limanlar || []).map(l => `<option value="${l.id}">⚓ ${escapeHtml(l.ad)}</option>`).join('')}
        </select></div>`
    : '<p style="font-size:13px;color:var(--metin-soluk);margin-bottom:14px">Bu duyuru limanınızdaki hak sahiplerine iletilecek.</p>';
  modal('Yeni duyuru', `
    ${limanSecim}
    <div class="alan"><label>Başlık *</label><input name="baslik" required placeholder="ör. Av yasağı dönemi başlıyor" /></div>
    <div class="alan"><label>Öncelik</label>
      <select name="oncelik">
        <option value="normal">Normal</option>
        <option value="onemli">Önemli</option>
        <option value="acil">Acil</option>
      </select></div>
    <div class="alan"><label>İçerik *</label><textarea name="icerik" rows="4" required placeholder="Duyuru metni…"></textarea></div>
    <div class="alan"><label>Kime gönderilsin? *</label>
      <select name="hedef_tipi" id="hedef-tipi">
        <option value="herkes">👥 Herkese (tüm hak sahipleri)</option>
        <option value="secili">👁 Belli kişilere</option>
      </select></div>
    <div class="alan" id="secili-kisiler-alan" style="display:none">
      <label>Kişileri seçin</label>
      <div class="kisi-secim-kutu" id="kisi-secim">
        ${hakSahipleri.map(h => `<label class="kisi-secenek"><input type="checkbox" value="${h.id}" /> ${escapeHtml(h.ad_soyad)}${h.telefon ? ' <span class="alt-ic">(' + escapeHtml(h.telefon) + ')</span>' : ''}</label>`).join('') || '<p class="alt">Hak sahibi yok.</p>'}
      </div>
    </div>
    <div class="alan"><label>Ek dosya (isteğe bağlı)</label><input type="file" name="dosya" accept=".pdf,.jpg,.jpeg,.png,.webp" /></div>
  `, async (form) => {
    const hedefTipi = form.querySelector('[name="hedef_tipi"]').value;
    const fd = new FormData();
    fd.append('baslik', form.querySelector('[name="baslik"]').value);
    fd.append('icerik', form.querySelector('[name="icerik"]').value);
    fd.append('oncelik', form.querySelector('[name="oncelik"]').value);
    fd.append('hedef_tipi', hedefTipi);
    const limanSec = form.querySelector('[name="liman_id"]');
    if (limanSec) fd.append('liman_id', limanSec.value);
    if (hedefTipi === 'secili') {
      const secili = [...form.querySelectorAll('#kisi-secim input:checked')].map(c => Number(c.value));
      if (secili.length === 0) throw new Error('En az bir kişi seçin veya "Herkese" seçeneğini kullanın.');
      fd.append('hedef_hsler', JSON.stringify(secili));
    }
    const dosya = form.querySelector('[name="dosya"]').files[0];
    if (dosya) fd.append('dosya', dosya);
    await istekDosya('/duyurular', fd);
    toast('Duyuru yayınlandı.');
    sayfaCiz();
  });

  // "Belli kişilere" seçilince kişi listesini göster
  const hedefTipi = document.getElementById('hedef-tipi');
  const seciliAlan = document.getElementById('secili-kisiler-alan');
  if (hedefTipi && seciliAlan) {
    hedefTipi.addEventListener('change', () => {
      seciliAlan.style.display = hedefTipi.value === 'secili' ? 'block' : 'none';
    });
  }
}

// ---- TRAFİK-IŞIĞI PANELİ ----
async function panelSayfa(hedef) {
  try {
    const veri = await istek('/panel');
    const o = veri.ozet;
    const cokLiman = yetkili('super_admin');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Uygunluk Paneli</h1><p>Hak sahiplerinin evrak tamamlanma durumu</p></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn btn-acik" id="rapor-btn">📈 Rapor</button>
          <button class="btn btn-acik" id="tarama-btn">🔄 Süre taraması yap</button>
        </div>
      </div>
      <div class="trafik-ozet">
        <div class="trafik-kutu"><div class="trafik-isik yesil"></div><div><div class="sayi">${o.yesil}</div><div class="etk">Tam (%100)</div></div></div>
        <div class="trafik-kutu"><div class="trafik-isik sari"></div><div><div class="sayi">${o.sari}</div><div class="etk">Dikkat (%40-99)</div></div></div>
        <div class="trafik-kutu"><div class="trafik-isik kirmizi"></div><div><div class="sayi">${o.kirmizi}</div><div class="etk">Eksik (%40 altı)</div></div></div>
      </div>
      <div class="panel">
        <div class="tablo-sar">
          <table>
            <thead><tr><th></th><th>Hak Sahibi</th>${cokLiman ? '<th>Liman</th>' : ''}<th>Uygunluk</th><th>Durum</th><th></th></tr></thead>
            <tbody>
              ${veri.hak_sahipleri.length === 0 ? `<tr><td colspan="${cokLiman ? 6 : 5}"><div class="bos-durum"><div class="ikon">🚦</div><p>Hak sahibi yok.</p></div></td></tr>` :
                veri.hak_sahipleri.map(h => `
                <tr>
                  <td><div class="trafik-isik ${h.isik}" style="width:13px;height:13px;box-shadow:none"></div></td>
                  <td><b>${escapeHtml(h.ad_soyad)}</b>${h.telefon ? `<span class="alt">${escapeHtml(h.telefon)}</span>` : ''}</td>
                  ${cokLiman ? `<td>${escapeHtml(h.liman_adi)}</td>` : ''}
                  <td>
                    <div style="display:flex;align-items:center;gap:9px">
                      <div class="mini-bar"><span class="${h.isik}" style="width:${h.yuzde}%"></span></div>
                      <b style="font-size:13px">%${h.yuzde}</b>
                    </div>
                    <span class="alt">${h.tam}/${h.toplam} belge</span>
                  </td>
                  <td>${h.eksik_sayi === 0 ? '<span class="bdurum yesil">Tamam</span>' : `<span class="bdurum ${h.isik}">${h.eksik_sayi} eksik</span>`}</td>
                  <td><div class="satir-islem"><button class="btn btn-acik btn-mini" data-belge="${h.id}" data-ad="${escapeHtml(h.ad_soyad)}">Belgeler</button></div></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('rapor-btn').addEventListener('click', () => { durum.sayfa = 'raporlar'; uygulamaCiz(); });
    document.getElementById('tarama-btn').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Taranıyor…';
      const s = await istek('/sure-taramasi', { method: 'POST' });
      toast(`Tarama tamam: ${s.yaklasan} yaklaşan, ${s.dolan} dolmuş belge bildirildi.`);
      await zilGuncelle();
      e.target.disabled = false; e.target.textContent = '🔄 Süre taraması yap';
    });
    hedef.querySelectorAll('[data-belge]').forEach(b => b.addEventListener('click', () => hakSahibiBelgeDurumu(b.dataset.belge, b.dataset.ad)));
  } catch (err) { hataGoster(hedef, err); }
}

// ============================================================
// WEB TAMAMLAMA — RAPORLAR & TOPLU MESAJ
// ============================================================

// Token'lı indirme (yeni sekmede query token ile)
function raporIndir(yol) {
  window.open(API + yol + '?token=' + durum.token, '_blank');
}

async function raporlarSayfa(hedef) {
  hedef.innerHTML = `
    <div class="sayfa-baslik">
      <div><h1>Raporlar</h1><p>Evrak durumunu dışa aktarın veya yazdırın</p></div>
    </div>
    <div class="rapor-izgara">
      <div class="rapor-kart">
        <div class="bik">📊</div>
        <h3>Uygunluk durumu</h3>
        <p>Tüm hak sahiplerinin evrak tamamlanma yüzdeleri ve durumları.</p>
        <div class="indir">
          <button class="btn btn-mini" data-html="/api/rapor/uygunluk.html">🖨️ Yazdır / PDF</button>
          <button class="btn btn-acik btn-mini" data-csv="/api/rapor/uygunluk.csv">⬇ Excel (CSV)</button>
        </div>
      </div>
      <div class="rapor-kart">
        <div class="bik">⚠️</div>
        <h3>Eksik belgeler</h3>
        <p>Hangi hak sahibinin hangi belgesinin eksik veya sorunlu olduğunun detay listesi.</p>
        <div class="indir">
          <button class="btn btn-acik btn-mini" data-csv="/api/rapor/eksik-belgeler.csv">⬇ Excel (CSV)</button>
        </div>
      </div>
      <div class="rapor-kart">
        <div class="bik">⏰</div>
        <h3>Süresi yaklaşan belgeler</h3>
        <p>Geçerlilik tarihi yaklaşan onaylı belgeler. En acil olan en üstte listelenir.</p>
        <div class="alan" style="margin:4px 0 12px">
          <label style="font-size:12px">Zaman aralığı</label>
          <select id="yaklasan-gun">
            <option value="30">Önümüzdeki 30 gün</option>
            <option value="60" selected>Önümüzdeki 60 gün</option>
            <option value="90">Önümüzdeki 90 gün</option>
            <option value="180">Önümüzdeki 6 ay</option>
          </select>
        </div>
        <div class="indir">
          <button class="btn btn-mini" id="yaklasan-html">🖨️ Yazdır / PDF</button>
          <button class="btn btn-acik btn-mini" id="yaklasan-csv">⬇ Excel (CSV)</button>
        </div>
      </div>
    </div>
    <div class="mesaj-bilgi">💡 "Yazdır / PDF" butonu raporu yeni sekmede açar; oradan tarayıcının yazdır penceresiyle PDF olarak kaydedebilirsiniz. CSV dosyaları Excel'de açılır.</div>`;

  hedef.querySelectorAll('[data-html]').forEach(b => b.addEventListener('click', () => raporIndir(b.dataset.html.replace('/api', ''))));
  hedef.querySelectorAll('[data-csv]').forEach(b => b.addEventListener('click', () => raporIndir(b.dataset.csv.replace('/api', ''))));
  // Süresi yaklaşan: seçilen gün sayısına göre
  const gunSec = () => document.getElementById('yaklasan-gun').value;
  document.getElementById('yaklasan-html').addEventListener('click', () => raporIndir('/rapor/sure-yaklasan.html?gun=' + gunSec()));
  document.getElementById('yaklasan-csv').addEventListener('click', () => raporIndir('/rapor/sure-yaklasan.csv?gun=' + gunSec()));
}

async function mesajlarSayfa(hedef) {
  try {
    const kayitVeri = await istek('/mesaj/kayitlar');
    hedef.innerHTML = `
      <div class="sayfa-baslik">
        <div><h1>Toplu Mesaj</h1><p>Hak sahiplerine SMS veya e-posta gönderin</p></div>
        <button class="btn" id="yeni-mesaj">+ Yeni mesaj</button>
      </div>
      ${kayitVeri.simulasyon ? '<div class="mesaj-bilgi">⚙️ Sistem şu an <b>simülasyon modunda</b>. Mesajlar kaydedilir ama gerçekte gönderilmez. Gerçek SMS/e-posta için sağlayıcı (Netgsm, SMTP vb.) yapılandırması gerekir.</div>' : ''}
      <div class="panel">
        <div class="panel-baslik"><h2>Gönderim geçmişi</h2></div>
        ${kayitVeri.kayitlar.length === 0
          ? '<div class="bos-durum"><div class="ikon">✉️</div><p>Henüz mesaj gönderilmemiş.</p></div>'
          : kayitVeri.kayitlar.map(m => `
            <div class="mesaj-kayit">
              <div class="bik">${m.kanal === 'sms' ? '📱' : '📧'}</div>
              <div class="bilgi">
                <b>${escapeHtml(m.alici_ad || m.alici)}</b>
                <p>${escapeHtml(m.icerik)}</p>
              </div>
              <span class="mesaj-durum ${m.durum}">${m.durum === 'gonderildi' ? 'Gönderildi' : m.durum === 'basarisiz' ? 'Başarısız' : 'Kuyrukta'}</span>
            </div>`).join('')}
      </div>`;

    document.getElementById('yeni-mesaj').addEventListener('click', () => mesajFormu());
  } catch (err) { hataGoster(hedef, err); }
}

function mesajFormu() {
  modal('Toplu mesaj gönder', `
    <div class="alan"><label>Kanal</label>
      <div class="mesaj-kanal-sec">
        <label><input type="radio" name="kanal" value="sms" checked /><span class="bik">📱</span> SMS</label>
        <label><input type="radio" name="kanal" value="eposta" /><span class="bik">📧</span> E-posta</label>
      </div>
    </div>
    <div class="alan"><label>Alıcılar</label>
      <select name="hedef">
        <option value="tumu">Tüm hak sahipleri</option>
        <option value="eksik">Yalnızca eksik belgesi olanlar</option>
      </select>
    </div>
    <div class="alan" id="konu-alan" style="display:none"><label>Konu (e-posta)</label><input name="konu" placeholder="ör. Eksik evrak hatırlatması" /></div>
    <div class="alan"><label>Mesaj *</label><textarea name="icerik" rows="4" required placeholder="ör. Sayın hak sahibimiz, eksik belgelerinizi en kısa sürede yüklemeniz rica olunur."></textarea></div>
  `, async (form) => {
    const govde = formVeri(form);
    if (!govde.icerik) throw new Error('Mesaj içeriği girin.');
    const sonuc = await istek('/mesaj/toplu', { method: 'POST', body: JSON.stringify(govde) });
    const not = sonuc.simulasyon ? ' (simülasyon)' : '';
    toast(`${sonuc.gonderildi} mesaj gönderildi${sonuc.basarisiz ? ', ' + sonuc.basarisiz + ' başarısız' : ''}${not}.`);
    sayfaCiz();
  });

  // E-posta seçilince konu alanını göster
  const form = document.getElementById('modal-form');
  const konuAlan = document.getElementById('konu-alan');
  form.querySelectorAll('[name="kanal"]').forEach(r => r.addEventListener('change', (e) => {
    konuAlan.style.display = e.target.value === 'eposta' ? 'block' : 'none';
  }));
}


// ============ MODAL & YARDIMCILAR ============
function modal(baslik, govdeHtml, kaydet, kapatEtiketi = 'İptal') {
  modalKapat();
  const perde = document.createElement('div');
  perde.className = 'modal-perde';
  perde.id = 'modal-perde';
  perde.innerHTML = `
    <div class="modal">
      <div class="modal-baslik"><h3>${baslik}</h3><button class="modal-kapat" id="m-kapat">×</button></div>
      <form id="modal-form">
        <div class="modal-govde">${govdeHtml}</div>
        <div class="modal-alt">
          <button type="button" class="btn btn-acik" id="m-iptal">${kapatEtiketi}</button>
          ${kaydet ? '<button type="submit" class="btn" id="m-kaydet">Kaydet</button>' : ''}
        </div>
      </form>
    </div>`;
  document.body.appendChild(perde);
  document.getElementById('m-kapat').addEventListener('click', modalKapat);
  document.getElementById('m-iptal').addEventListener('click', modalKapat);
  perde.addEventListener('click', (e) => { if (e.target === perde) modalKapat(); });
  if (kaydet) {
    document.getElementById('modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('m-kaydet');
      btn.disabled = true; btn.textContent = 'Kaydediliyor…';
      try { await kaydet(e.target); modalKapat(); }
      catch (err) { toast(err.message, 'hata'); btn.disabled = false; btn.textContent = 'Kaydet'; }
    });
  }
}
function modalKapat() { const m = document.getElementById('modal-perde'); if (m) m.remove(); }

function formVeri(form) {
  const fd = new FormData(form);
  const o = {};
  for (const [k, v] of fd.entries()) o[k] = v === '' ? null : v;
  return o;
}

function hataGoster(hedef, err) {
  hedef.innerHTML = `<div class="panel"><div class="bos-durum"><div class="ikon">⚠️</div><p>${escapeHtml(err.message)}</p></div></div>`;
}

// ============================================================
// FAZ 4 — PWA KURULUM YÖNLENDİRMESİ
// ============================================================
let pwaYukleOlayi = null;

// Android/Chrome: kurulum olayını yakala
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  pwaYukleOlayi = e;
  pwaBannerGoster();
});

// Zaten kuruluysa (standalone) banner gösterme
function pwaKuruluMu() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function iosCihazMi() {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) && !window.MSStream;
}

function pwaBannerGoster() {
  if (pwaKuruluMu()) return;
  if (localStorage.getItem('pwa_banner_kapatildi') === '1') return;
  if (document.getElementById('pwa-banner')) return;
  // Sadece giriş yapılmış kullanıcılarda göster (giriş ekranını dağıtmasın)
  if (!durum.token) return;

  const banner = document.createElement('div');
  banner.className = 'pwa-banner';
  banner.id = 'pwa-banner';
  banner.innerHTML = `
    <img src="ikon-192.png" class="ikon" alt="" />
    <div class="metin">
      <b>Uygulamayı telefonuna ekle</b>
      <p>Ana ekranından tek dokunuşla aç, daha hızlı kullan.</p>
    </div>
    <button class="pwa-banner-btn" id="pwa-kur">Ekle</button>
    <button class="kapat" id="pwa-kapat">&times;</button>`;
  document.body.appendChild(banner);

  document.getElementById('pwa-kapat').addEventListener('click', () => {
    banner.remove();
    localStorage.setItem('pwa_banner_kapatildi', '1');
  });
  document.getElementById('pwa-kur').addEventListener('click', async () => {
    if (iosCihazMi()) {
      banner.remove();
      iosKurulumTalimati();
    } else if (pwaYukleOlayi) {
      pwaYukleOlayi.prompt();
      await pwaYukleOlayi.userChoice;
      pwaYukleOlayi = null;
      banner.remove();
    }
  });
}

// iOS'ta otomatik kurulum yok; Safari "Paylaş → Ana Ekrana Ekle" talimatı göster
function iosKurulumTalimati() {
  modal('Ana ekrana ekle', `
    <p style="font-size:14px;color:var(--metin-soluk);margin-bottom:14px">iPhone/iPad'de uygulamayı ana ekranınıza eklemek için:</p>
    <div class="ios-adim"><div class="no">1</div><div class="ac">Safari'nin altındaki <span class="ios-paylas-ikon">⬆️ Paylaş</span> simgesine dokunun</div></div>
    <div class="ios-adim"><div class="no">2</div><div class="ac">Açılan menüde <b>"Ana Ekrana Ekle"</b> seçeneğine dokunun</div></div>
    <div class="ios-adim"><div class="no">3</div><div class="ac">Sağ üstte <b>"Ekle"</b>ye dokunun — bitti!</div></div>
  `, null, 'Anladım');
}

// iOS kullanıcısına giriş sonrası banner (beforeinstallprompt iOS'ta yok)
function pwaIosKontrol() {
  if (iosCihazMi() && !pwaKuruluMu() && durum.token) {
    setTimeout(pwaBannerGoster, 1500);
  }
}

// ---- Başlat ----
if (durum.token && durum.kullanici) { uygulamaCiz(); pwaIosKontrol(); }
else girisEkrani();
