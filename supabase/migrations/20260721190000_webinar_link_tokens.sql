-- Link curto rastreável de webinário — usado quando o destino vai numa variável de
-- template WhatsApp oficial (limite prático de ~150 chars por variável; o link
-- assinado longo (?p&d&k) passa de 200 chars). O token não precisa de assinatura
-- própria: só existe porque nós o geramos (webinar-redirect só aceita token conhecido).
create table if not exists webinar_link_tokens (
  token text primary key,
  phone text not null,
  dest text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_webinar_link_tokens_created_at on webinar_link_tokens(created_at);
