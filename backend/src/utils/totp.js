/**
 * TOTP (RFC 6238) / HOTP (RFC 4226) sin dependencias externas.
 * Compatible con Google Authenticator, Microsoft Authenticator y Authy
 * (SHA-1, 6 dígitos, periodo de 30 s).
 */
'use strict';

const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let valor = 0;
  let salida = '';
  for (const byte of buffer) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
    valor &= (1 << bits) - 1;
  }
  if (bits > 0) salida += ALFABETO[(valor << (5 - bits)) & 31];
  return salida;
}

function base32Decode(texto) {
  const limpio = String(texto).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let valor = 0;
  const bytes = [];
  for (const caracter of limpio) {
    const indice = ALFABETO.indexOf(caracter);
    if (indice === -1) throw new Error('Secreto base32 inválido.');
    valor = (valor << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255);
      bits -= 8;
      valor &= (1 << bits) - 1;
    }
  }
  return Buffer.from(bytes);
}

/** Secreto aleatorio de 160 bits codificado en base32 (32 caracteres). */
function generarSecreto(longitudBytes = 20) {
  return base32Encode(crypto.randomBytes(longitudBytes));
}

function hotp(claveBuffer, contador, digitos = 6) {
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));
  const hmac = crypto.createHmac('sha1', claveBuffer).update(mensaje).digest();
  const desplazamiento = hmac[hmac.length - 1] & 0x0f;
  const codigo =
    ((hmac[desplazamiento] & 0x7f) << 24) |
    ((hmac[desplazamiento + 1] & 0xff) << 16) |
    ((hmac[desplazamiento + 2] & 0xff) << 8) |
    (hmac[desplazamiento + 3] & 0xff);
  return String(codigo % 10 ** digitos).padStart(digitos, '0');
}

function generarCodigo(secretoBase32, { tiempoMs = Date.now(), periodo = 30, digitos = 6 } = {}) {
  const contador = Math.floor(tiempoMs / 1000 / periodo);
  return hotp(base32Decode(secretoBase32), contador, digitos);
}

/**
 * Verifica un código con tolerancia de ±`ventana` periodos (desfase de reloj).
 * La comparación es de tiempo constante.
 */
function verificarCodigo(secretoBase32, codigo, { tiempoMs = Date.now(), periodo = 30, digitos = 6, ventana = 1 } = {}) {
  const texto = String(codigo ?? '').trim();
  if (!new RegExp(`^\\d{${digitos}}$`).test(texto)) return false;

  let clave;
  try {
    clave = base32Decode(secretoBase32);
  } catch {
    return false;
  }

  const contadorActual = Math.floor(tiempoMs / 1000 / periodo);
  const recibido = Buffer.from(texto);
  let valido = false;
  for (let i = -ventana; i <= ventana; i++) {
    const esperado = Buffer.from(hotp(clave, contadorActual + i, digitos));
    if (crypto.timingSafeEqual(esperado, recibido)) valido = true;
  }
  return valido;
}

function generarUrlOtpauth(email, secreto, emisor = 'Ensilados Santa Cruz') {
  const etiqueta = `${encodeURIComponent(emisor)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}

module.exports = {
  base32Encode,
  base32Decode,
  generarSecreto,
  generarCodigo,
  verificarCodigo,
  generarUrlOtpauth,
  hotp,
};
