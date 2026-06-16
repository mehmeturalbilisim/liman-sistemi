// auth.js — JWT ve yetki middleware
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'liman-sistemi-gizli-anahtar-degistir';

export function tokenUret(kullanici) {
  return jwt.sign(
    {
      id: kullanici.id,
      rol: kullanici.rol,
      liman_id: kullanici.liman_id,
      ad_soyad: kullanici.ad_soyad,
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

export function girisGerekli(req, res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : null;
  // Yeni sekmede dosya açma için query token da kabul edilir
  if (!token && req.query && req.query.token) token = req.query.token;
  if (!token) return res.status(401).json({ hata: 'Oturum açmanız gerekiyor.' });
  try {
    req.kullanici = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ hata: 'Oturum süresi doldu, tekrar giriş yapın.' });
  }
}

// Belirli rollere izin verir
export function rolGerekli(...roller) {
  return (req, res, next) => {
    if (!req.kullanici || !roller.includes(req.kullanici.rol)) {
      return res.status(403).json({ hata: 'Bu işlem için yetkiniz yok.' });
    }
    next();
  };
}
