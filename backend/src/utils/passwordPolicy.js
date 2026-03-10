'use strict';

const PASSWORD_MIN_LENGTH = 8;

function validatePasswordStrength(password) {
  const value = String(password || '');
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Senha deve ter no minimo ${PASSWORD_MIN_LENGTH} caracteres`;
  }
  if (!/[a-z]/.test(value)) {
    return 'Senha deve ter pelo menos uma letra minuscula';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Senha deve ter pelo menos uma letra maiuscula';
  }
  if (!/[0-9]/.test(value)) {
    return 'Senha deve ter pelo menos um numero';
  }
  return null;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  validatePasswordStrength,
};
