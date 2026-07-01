// Helpers de telefone BR — colapsam as variações de DDI (55) e do "9º dígito"
// para casar o mesmo contato gravado em formatos diferentes.
// Espelha a lógica da edge function supabase/functions/whatsapp-chats/index.ts.

export function normalizePhone(phone: string | null | undefined): string {
  return String(phone || '').replace(/\D/g, '');
}

// Descasca o DDI 55 e devolve DDD + local (10 ou 11 dígitos); null se não parecer BR.
function brDddLocal(phone: string | null | undefined): { ddd: string; local: string } | null {
  let d = normalizePhone(phone);
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return { ddd: d.slice(0, 2), local: d.slice(2) };
}

/**
 * Todas as formas plausíveis em que o número pode estar gravado (com/sem 9º
 * dígito, com/sem DDI, com/sem "+"). Para números que não parecem BR completos
 * (ex.: 9 dígitos sem DDD), devolve só as variações básicas de DDI.
 */
export function brPhoneForms(phone: string | null | undefined): string[] {
  const digits = normalizePhone(phone);
  if (!digits) return [];

  const parsed = brDddLocal(phone);
  if (!parsed) {
    // Fallback: número fora do padrão BR (ex.: incompleto). Só variações de DDI.
    const set = new Set<string>([digits, `+${digits}`]);
    if (digits.startsWith('55') && digits.length >= 12) {
      set.add(digits.slice(2));
      set.add(`+${digits.slice(2)}`);
    } else if (digits.length >= 10 && digits.length <= 11) {
      set.add(`55${digits}`);
      set.add(`+55${digits}`);
    }
    return [...set];
  }

  const { ddd, local } = parsed;
  const isMobile = local.length === 9 && local[0] === '9';
  const base8 = isMobile ? local.slice(1) : local;
  const locals = new Set<string>([local]);
  // Só pareia as formas 8↔9 dígitos para celulares (base começa em 6-9).
  if (/[6-9]/.test(base8[0])) {
    locals.add(base8);
    locals.add(`9${base8}`);
  }
  const forms = new Set<string>();
  for (const loc of locals) {
    forms.add(`${ddd}${loc}`);
    forms.add(`55${ddd}${loc}`);
    forms.add(`+55${ddd}${loc}`);
    forms.add(`+${ddd}${loc}`);
  }
  return [...forms];
}
