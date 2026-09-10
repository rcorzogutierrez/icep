/** Alfabeto sin caracteres ambiguos (sin 0/O, 1/I/L) para que el código se pueda leer/tipear a mano. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** Compartido entre InvitationsService (individual) y CourseInvitationsService (por curso). */
export function generateInvitationCode(): string {
  const randomValues = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(randomValues);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomValues[i] % CODE_ALPHABET.length];
  }
  return code;
}
