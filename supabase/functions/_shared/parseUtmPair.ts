/**
 * Extrai nome e ID do par "Nome|id" usado nos UTMs do Meta.
 *
 * O nome pode conter "|" (ex.: conjunto "05 - Teste 1 - Imagem | 16/6"), então
 * o corte é pelo ÚLTIMO pipe, e o ID só é aceito se for numérico — IDs do Meta
 * são sempre dígitos, o que também descarta placeholders não resolvidos
 * ("{{adset.id}}"). O ID pode vir com sufixo "::<hash>" (fbclid embutido pelo
 * checkout), que é removido antes da validação.
 */
export function parseUtmPair(value: string | null): { name: string | null; id: string | null } {
  if (!value || value === "Não Informado") return { name: null, id: null };
  const idx = value.lastIndexOf("|");
  if (idx > 0) {
    let id = value.substring(idx + 1).trim();
    const colonIdx = id.indexOf("::");
    if (colonIdx > 0) id = id.substring(0, colonIdx);
    if (/^\d+$/.test(id)) return { name: value.substring(0, idx).trim(), id };
  }
  return { name: value, id: null };
}
