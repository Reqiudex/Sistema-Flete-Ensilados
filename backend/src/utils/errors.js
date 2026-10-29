/**
 * Error de negocio controlado: se traduce a una respuesta HTTP con código estable.
 */
'use strict';

class ErrorNegocio extends Error {
  constructor(mensaje, codigo = 'ERROR_NEGOCIO', status = 400) {
    super(mensaje);
    this.name = 'ErrorNegocio';
    this.codigo = codigo;
    this.status = status;
  }
}

/** Envía la respuesta adecuada para un error (de negocio o inesperado). */
function responderError(res, error, contexto = '') {
  if (error instanceof ErrorNegocio) {
    return res.status(error.status).json({ error: error.message, codigo: error.codigo });
  }
  console.error(`[Error]${contexto ? ' ' + contexto + ':' : ''}`, error);
  return res.status(500).json({ error: 'Error interno del servidor.', codigo: 'ERROR_SERVIDOR' });
}

module.exports = { ErrorNegocio, responderError };
