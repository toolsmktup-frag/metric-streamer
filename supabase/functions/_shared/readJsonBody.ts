// ════════════════════════════════════════════════════════════════════
// Leitura de corpo JSON tolerante a charset.
//
// Plataformas BR (Ticto/Eduzz/Guru) às vezes enviam o corpo em latin-1
// (ISO-8859-1) em vez de UTF-8. `req.json()` decodifica SEMPRE como UTF-8,
// então um "á" em latin-1 vira "�" (U+FFFD) de forma DESTRUTIVA já na entrada.
//
// Aqui lemos os bytes crus e:
//   1) tentamos UTF-8 estrito (fatal) — o caso normal;
//   2) se falhar (bytes não são UTF-8 válido), decodificamos como latin-1,
//      que nunca falha e recupera os acentos.
//
// Para JSON isso é seguro: os caracteres estruturais ({ } " : ,) são ASCII
// nos dois encodings, então só o texto acentuado muda.
// ════════════════════════════════════════════════════════════════════
export async function readJsonBody(req: Request): Promise<any> {
  const buf = new Uint8Array(await req.arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder("iso-8859-1").decode(buf);
  }
  return JSON.parse(text);
}
