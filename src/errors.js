// Kullanıcıya gösterilen hatalar kodla taşınır; metni arayüz o anki dile göre üretir (errors.<kod>).
class AppError extends Error {
  constructor(code, params = {}, message) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    this.params = params;
  }
}

// Bir hatayı, seçili dilde okunur metne çevirir.
function errorText(err, t) {
  if (err && err.code && t) {
    const s = t(`errors.${err.code}`, err.params || {});
    if (s !== `errors.${err.code}`) return s;
  }
  return (err && err.message) || String(err);
}

module.exports = { AppError, errorText };
