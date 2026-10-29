'use strict';
require('./helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');
const totp = require('../src/utils/totp');
const v = require('../src/utils/validators');
const { pedidosACsv, escapar } = require('../src/utils/csv');

test('TOTP: vector de prueba RFC 6238 (SHA-1, T=59 → 94287082)', () => {
  const secreto = totp.base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(totp.generarCodigo(secreto, { tiempoMs: 59 * 1000, digitos: 8 }), '94287082');
});

test('TOTP: genera, verifica y rechaza códigos', () => {
  const s = totp.generarSecreto();
  assert.match(s, /^[A-Z2-7]+$/);
  const c = totp.generarCodigo(s);
  assert.equal(totp.verificarCodigo(s, c), true);
  assert.equal(totp.verificarCodigo(s, '000000' === c ? '111111' : '000000'), false);
  assert.equal(totp.verificarCodigo(s, 'abc'), false);
  assert.match(totp.generarUrlOtpauth('a@b.com', s), /^otpauth:\/\/totp\//);
});

test('Validadores: teléfono, coordenadas, items, transiciones', () => {
  assert.equal(v.validarTelefono('+591 78911223').value, '78911223');
  assert.equal(v.validarTelefono('1234').ok, false);
  assert.equal(v.validarCoordenadas(-17.7, -63.1).ok, true);
  assert.equal(v.validarCoordenadas(40, 10).ok, false);
  assert.equal(v.validarCoordenadas('', '').ok, false);
  assert.deepEqual(v.validarItems([{ producto_id: 'a', cantidad_tons: 1 }, { producto_id: 'a', cantidad_tons: 2 }]).value, [{ producto_id: 'a', cantidad_tons: 3 }]);
  assert.equal(v.validarItems([]).ok, false);
  assert.equal(v.validarItems([{ producto_id: 'a', cantidad_tons: -1 }]).ok, false);
  assert.equal(v.transicionPermitida('Pendiente', 'En Camino'), true);
  assert.equal(v.transicionPermitida('Entregado', 'Pendiente'), false);
  assert.equal(v.validarEmail('X@Y.com').value, 'x@y.com');
  assert.equal(v.validarPassword('corta').ok, false);
});

test('CSV: separador ; y neutralización de fórmulas', () => {
  assert.equal(escapar('=SUMA(A1)'), "'=SUMA(A1)");
  assert.equal(escapar('a;b'), '"a;b"');
  assert.equal(escapar(-5), '-5');
  const csv = pedidosACsv([{ codigo_pedido: 'ESC-1', creado_en: '2026-05-01T12:00:00Z', cliente_nombre: '=cmd', detalle_pedido: [{ producto: { nombre: 'Soya' }, cantidad_tons: 2 }], estado: 'Pendiente' }]);
  assert.ok(csv.startsWith('﻿Código;'));
  assert.ok(csv.includes("'=cmd"));
  assert.ok(csv.includes('Soya (2 TM)'));
});
