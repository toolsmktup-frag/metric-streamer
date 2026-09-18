// Contexto de upsell para automações de pré-venda.
//
// Caso real (17/09/2026): o cliente comprou o Guia (produto 46342), recebeu o
// acesso e três minutos depois gerou o Pix do Curso Mestre (47629), que é o
// order bump da página de obrigado. O cancelamento automático de pré-venda só
// olha o MESMO produto, então não se aplicava — e o fluxo disparou uma mensagem
// de "seu pedido não foi concluído" para quem tinha acabado de comprar.
//
// Esta função responde: o gatilho de pré-venda que acabou de chegar vem logo
// depois de uma compra de OUTRO produto? Se vem, é upsell, e o fluxo deve falar
// com essa pessoa como compradora, não como pendência.

export interface RecentPurchase {
  /** product_id da compra aprovada */
  productId: string | number | null | undefined;
  /** nome comercial do produto comprado, quando disponível */
  productName?: string | null;
  /** ISO timestamp da compra */
  at: string;
}

export interface UpsellContext {
  isUpsell: boolean;
  recentPurchaseProductName: string | null;
}

/** Gatilhos que tratam o contato como quem ainda não comprou. */
export const PRE_SALE_TRIGGERS = [
  "pix_generated",
  "boleto_generated",
  "cart_abandoned",
  "pix_expired",
  "payment_refused",
] as const;

export function isPreSaleTrigger(status: string): boolean {
  return (PRE_SALE_TRIGGERS as readonly string[]).includes(status);
}

/**
 * @param currentProductId produto do evento de pré-venda que acabou de chegar
 * @param recentPurchases compras aprovadas recentes do MESMO telefone
 * @param windowMinutes janela considerada "logo depois" (padrão 30 min)
 * @param now instante de referência (injetável para teste)
 */
export function detectUpsellContext(
  currentProductId: string | number | null | undefined,
  recentPurchases: RecentPurchase[],
  windowMinutes = 30,
  now: Date = new Date(),
): UpsellContext {
  const cutoff = now.getTime() - windowMinutes * 60_000;

  const other = recentPurchases
    .filter((p) => {
      const t = Date.parse(p.at);
      return Number.isFinite(t) && t >= cutoff && t <= now.getTime();
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .find((p) => {
      if (p.productId === null || p.productId === undefined || p.productId === "") return false;
      // produto diferente do que gerou o pedido agora
      return String(p.productId) !== String(currentProductId ?? "");
    });

  return other
    ? { isUpsell: true, recentPurchaseProductName: other.productName ?? null }
    : { isUpsell: false, recentPurchaseProductName: null };
}
