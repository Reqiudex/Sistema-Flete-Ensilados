const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'ensilados-santa-cruz-jwt-secret-2024';

// Simple TOTP implementation (compatible with Google Authenticator)
function generateTOTPSecret() {
  return crypto.randomBytes(20).toString('base32').substring(0, 16).toUpperCase();
}

function generateTOTPToken(secret, timeStep = 30) {
  const epoch = Math.floor(Date.now() / 1000);
  const time = Math.floor(epoch / timeStep);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
  timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
  
  // Decode base32 secret
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const secretBytes = [];
  for (const char of secret.toUpperCase()) {
    const idx = base32Chars.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      secretBytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  
  const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
  hmac.update(timeBuffer);
  const hmacResult = hmac.digest();
  
  const offset = hmacResult[hmacResult.length - 1] & 0xf;
  const code = ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);
  
  return String(code % 1000000).padStart(6, '0');
}

function verifyTOTPToken(secret, token) {
  // Check current and adjacent windows for clock skew tolerance
  for (let i = -1; i <= 1; i++) {
    const timeStep = 30;
    const epoch = Math.floor(Date.now() / 1000);
    const time = Math.floor(epoch / timeStep) + i;
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeUInt32BE(Math.floor(time / 0x100000000), 0);
    timeBuffer.writeUInt32BE(time & 0xffffffff, 4);
    
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = 0, value = 0;
    const secretBytes = [];
    for (const char of secret.toUpperCase()) {
      const idx = base32Chars.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        secretBytes.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    
    const hmac = crypto.createHmac('sha1', Buffer.from(secretBytes));
    hmac.update(timeBuffer);
    const hmacResult = hmac.digest();
    
    const offset = hmacResult[hmacResult.length - 1] & 0xf;
    const code = ((hmacResult[offset] & 0x7f) << 24) |
      ((hmacResult[offset + 1] & 0xff) << 16) |
      ((hmacResult[offset + 2] & 0xff) << 8) |
      (hmacResult[offset + 3] & 0xff);
    
    const expectedToken = String(code % 1000000).padStart(6, '0');
    if (expectedToken === String(token).padStart(6, '0')) return true;
  }
  return false;
}

function generateOTPAuthURL(email, secret, issuer = 'Ensilados Santa Cruz') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// In-memory user store for demo (replaced by Supabase in production)
const demoUsers = [
  {
    id: '1',
    email: 'superadmin@ensilados.com',
    password_hash: '$2b$10$rY78H0Kq8i4tVbQy5L0wQ.oBw8mZgA.kU1U8E1S/yA4Uu7p3N2pG.',
    role: 'Superadmin',
    two_factor_enabled: false,
    two_factor_secret: null,
    created_at: '2024-01-01T00:00:00Z'
  },
  {
    id: '2',
    email: 'admin@ensilados.com',
    password_hash: '$2b$10$wN1d3K9e3v1WzTq5D7.XyOqU2.j8Q9u4lD72.K.6p1oW5Yh1i3DqS',
    role: 'Admin',
    two_factor_enabled: false,
    two_factor_secret: null,
    created_at: '2024-01-01T00:00:00Z'
  }
];

// Store real bcrypt hashes by generating them at startup
let usersInitialized = false;
async function initializeDemoUsers() {
  if (usersInitialized) return;
  demoUsers[0].password_hash = await bcrypt.hash('superadmin123', 10);
  demoUsers[1].password_hash = await bcrypt.hash('admin123', 10);
  usersInitialized = true;
}

async function login(req, res) {
  try {
    await initializeDemoUsers();
    const { email, password, totp_code } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos.' });
    }
    
    const user = demoUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Credenciales inválidas.' });
    }
    
    // Check 2FA if enabled
    if (user.two_factor_enabled && user.two_factor_secret) {
      if (!totp_code) {
        return res.status(200).json({
          requires_2fa: true,
          message: 'Se requiere verificación de doble factor.',
          temp_email: email
        });
      }
      
      const isValidToken = verifyTOTPToken(user.two_factor_secret, totp_code);
      if (!isValidToken) {
        return res.status(401).json({ error: 'Código de verificación 2FA incorrecto o expirado.' });
      }
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return res.json({
      success: true,
      message: `Bienvenido, ${user.email}`,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        two_factor_enabled: user.two_factor_enabled,
        created_at: user.created_at
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

async function verifyTwoFactor(req, res) {
  try {
    await initializeDemoUsers();
    const { email, totp_code } = req.body;
    
    if (!email || !totp_code) {
      return res.status(400).json({ error: 'Email y código TOTP son requeridos.' });
    }
    
    const user = demoUsers.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !user.two_factor_secret) {
      return res.status(400).json({ error: 'Usuario no encontrado o 2FA no configurado.' });
    }
    
    const isValid = verifyTOTPToken(user.two_factor_secret, totp_code);
    if (!isValid) {
      return res.status(401).json({ error: 'Código 2FA incorrecto o expirado.' });
    }
    
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        two_factor_enabled: user.two_factor_enabled
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
}

function generateTwoFactorSetup(req, res) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ error: 'No autorizado.' });
  }
  
  const secret = generateTOTPSecret();
  const otpauthUrl = generateOTPAuthURL(user.email, secret);
  
  // Store the secret temporarily (in production, persist in DB)
  const userObj = demoUsers.find(u => u.id === user.id);
  if (userObj) {
    userObj.two_factor_secret = secret;
  }
  
  return res.json({
    success: true,
    secret,
    otpauth_url: otpauthUrl,
    qr_data: otpauthUrl,
    message: 'Escanee el código QR con Google Authenticator o Authy. Ingrese un código para confirmar activación.'
  });
}

function enableTwoFactor(req, res) {
  const { totp_code } = req.body;
  const user = req.user;
  
  const userObj = demoUsers.find(u => u.id === user.id);
  if (!userObj || !userObj.two_factor_secret) {
    return res.status(400).json({ error: 'Primero genere la configuración 2FA.' });
  }
  
  const isValid = verifyTOTPToken(userObj.two_factor_secret, totp_code);
  if (!isValid) {
    return res.status(401).json({ error: 'Código 2FA incorrecto. Verifique la aplicación de autenticación.' });
  }
  
  userObj.two_factor_enabled = true;
  
  return res.json({
    success: true,
    message: '✅ Verificación de doble factor activada exitosamente.',
    two_factor_enabled: true
  });
}

function disableTwoFactor(req, res) {
  const { totp_code } = req.body;
  const user = req.user;
  
  const userObj = demoUsers.find(u => u.id === user.id);
  if (!userObj) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }
  
  if (userObj.two_factor_enabled && userObj.two_factor_secret) {
    const isValid = verifyTOTPToken(userObj.two_factor_secret, totp_code);
    if (!isValid) {
      return res.status(401).json({ error: 'Código 2FA incorrecto.' });
    }
  }
  
  userObj.two_factor_enabled = false;
  userObj.two_factor_secret = null;
  
  return res.json({
    success: true,
    message: 'Verificación de doble factor desactivada.',
    two_factor_enabled: false
  });
}

function getProfile(req, res) {
  const user = req.user;
  const userObj = demoUsers.find(u => u.id === user.id);
  
  if (!userObj) {
    return res.status(404).json({ error: 'Perfil no encontrado.' });
  }
  
  return res.json({
    id: userObj.id,
    email: userObj.email,
    role: userObj.role,
    two_factor_enabled: userObj.two_factor_enabled,
    created_at: userObj.created_at
  });
}

module.exports = {
  login,
  verifyTwoFactor,
  generateTwoFactorSetup,
  enableTwoFactor,
  disableTwoFactor,
  getProfile,
  demoUsers
};
