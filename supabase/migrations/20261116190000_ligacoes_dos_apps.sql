-- As ligações para descarregar os apps iOS e Android (página /app do site, docs/APPS.md).
--
-- O painel (Configurações → PWA / telemóvel) guarda aqui para onde vão os botões «Descarregar»:
-- no Android, o APK publicado no GitHub ou a página da Google Play; no iPhone, a App Store ou o
-- convite público do TestFlight. Sem valor, a página /app oferece a instalação da app web (PWA),
-- como até aqui — nada muda para quem não as preencher.
--
-- Reverter: alter table public.site_settings drop column app_android_url, drop column app_ios_url;

alter table public.site_settings
  add column if not exists app_android_url text default '',
  add column if not exists app_ios_url text default '';

comment on column public.site_settings.app_android_url is
  'Ligação https para descarregar a app Android (APK ou Google Play). Aparece na página /app quando preenchida.';
comment on column public.site_settings.app_ios_url is
  'Ligação https para a app do iPhone (App Store ou TestFlight). Aparece na página /app quando preenchida.';
