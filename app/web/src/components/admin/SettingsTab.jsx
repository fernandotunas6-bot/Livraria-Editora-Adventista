// Livraria Editora Adventista — Desenvolvido por Valentino Canguele · 926 445 277 · valentinocanguele@gmail.com
// © 2026 Valentino Canguele. Todos os direitos reservados. Proibido copiar, alterar ou redistribuir sem autorização escrita do autor.

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Save, Mail, Bell, Sparkles, RotateCcw } from 'lucide-react';
import pb from '@/lib/dataClient';
import { applyOptionalColumns, hasColumn } from '@/lib/optionalColumns';
import { ligacaoDaApp } from '@/lib/appDownload';
import { SORT_OPTIONS, normalizeSort } from '@/lib/productSort';
import { embedOnlyVideoPlatform } from '@/lib/videoUrl';
import { useToast } from '@/hooks/use-toast';
import { useSiteSettings } from '@/hooks/useSiteSettings';
import { useIntegrations } from '@/hooks/useIntegrations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
// As vistas (Marca, Envio, Rodapé…) vêm do registo do painel (lib/adminSections.js) e a aberta
// do endereço (/admin?tab=settings&vista=shipping). `Tabs`/`TabsContent` aqui são os painéis das
// vistas: só a aberta é montada, como nos separadores de antes.
import { AdminViewNav, ViewPanel as TabsContent, ViewPanels as Tabs, useSectionView } from '@/components/admin/shell/AdminViewNav';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageField, { uploadImageToRecord, removeImageFromRecord, syncUploadedImageUrl } from '@/components/admin/ImageField';
import { sanitizeImageUrlForSave } from '@/lib/imageUrl';
import { pbErrorMessage } from '@/lib/mediaSave';
import { isUploadPending } from '@/lib/mediaUpload';
import PhoneInput from '@/components/PhoneInput';
import { formatAngolaPhone, localDigits } from '@/lib/angolaPhone';
import { clearSecret, loadSecretStatus, secretsForSave, withoutSecrets } from '@/lib/siteSecrets';
import { Checkbox } from '@/components/ui/checkbox';
import { FLOATING_PAGES, hiddenPages } from '@/lib/floatingButtons';

/**
 * Campo de palavra-passe ou chave. Com a migração `segredos_fora_da_api` o valor guardado
 * nunca volta ao browser: o campo vem vazio, diz se há valor definido, e gravar vazio mantém-no.
 */
export function SecretField({ id, label, value, onChange, status, placeholder, className, onClear }) {
  const known = status !== null && status !== undefined;
  const isSet = known && !!status?.set;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {known && (
          <span className={isSet ? 'text-xs font-medium text-emerald-700 dark:text-emerald-400' : 'text-xs text-muted-foreground'}>
            {isSet ? 'Definida' : 'Não definida'}
          </span>
        )}
      </div>
      <Input
        id={id}
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isSet ? 'Guardada — escreva só para substituir' : placeholder}
        className={className}
      />
      {isSet && (
        <button type="button" className="text-xs text-destructive hover:underline" onClick={onClear}>
          Retirar o valor guardado
        </button>
      )}
    </div>
  );
}

const empty = {
  site_name: 'Livraria Adventista',
  tagline: '',
  primary_color: '#0ea5c9',
  logo_url: '',
  favicon_url: '',
  login_bg_url: '',
  about_top_image_url: '',
  about_side_image_url: '',
  about_team: [],
  contact_email: '',
  contact_phone: '',
  contact_address: '',
  whatsapp: '',
  facebook: '',
  instagram: '',
  youtube: '',

  pwa_enabled: true,
  pwa_name: '',
  pwa_short_name: 'Livraria',
  app_android_url: '',
  app_ios_url: '',
  pwa_theme_color: '#0c4a6e',
  shipping_free_threshold: 20000,
  shipping_cost: 1500,
  maintenance_mode: false,
  google_oauth_enabled: false,
  header_welcome_logged: 'Bem-vindo de volta, {nome}',
  header_welcome_guest: 'Envio em todo o país · Compre sem conta',
  header_cta_text: 'Explorar novidades',
  header_cta_link: '/shop',
  footer_tagline: '',
  footer_copyright: '',
  footer_columns: null,
  show_stores_in_footer: true,
  shop_hero_title: 'Todos os Livros',
  shop_hero_subtitle: 'O catálogo completo da livraria — pesquisa avançada, pré-visualização e compra segura.',
  shop_hero_badge: 'Catálogo da livraria',
  shop_default_sort: 'featured',
  shop_per_page: 24,
  shop_show_featured: true,
  shop_show_collections: true,
  shop_show_low_stock: true,
  shop_grid_columns: 4,
  shipping_express_cost: 3000,
  order_number_prefix: 'ENC-',
  checkout_notes_max: 2000,
  checkout_rate_per_minute: 15,
  track_rate_per_minute: 20,
  receipt_per_order_per_minute: 3,
  unpaid_cancel_days: 0,
  // Migração cancelar_nao_confirmadas: encomendas na entrega que ninguém confirmou.
  unconfirmed_cancel_days: 0,
  chat_ai_daily_limit: 500,
  // Migração relatorio_de_pagamentos.
  unpaid_orders_per_contact: 3,
  company_legal_name: '',
  company_nif: '',
  low_stock_threshold: 5,
  book_code_prefix: 'LIV-',
  ui_glass_enabled: true,
  ui_glass_opacity: 0.72,
  shop_bg_mode: 'gradient',
  shop_bg_image_url: '',
  shop_bg_video_url: '',
  shop_bg_overlay: 0.55,
  google_maps_embed_key: '',
  order_email_enabled: false,
  email_provider: 'brevo',
  sendgrid_api_key: '',
  brevo_api_key: '',
  cloudflare_email_token: '',
  cloudflare_account_id: '',
  smtp_from_email: '',
  smtp_from_name: '',
  smtp_host: '',
  smtp_port: 465,
  smtp_user: '',
  smtp_password: '',
  push_enabled: false,
  vapid_public_key: '',
  vapid_private_key: '',
  chat_enabled: true,
  chat_provider: 'gemini',
  gemini_api_key: '',
  deepseek_api_key: '',
  chat_model: '',
  chat_welcome: '',
};

const clampInt = (value, min, max, fallback) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(Math.max(n, min), max) : fallback;
};

export default function SettingsTab() {
  const sv = useSectionView('settings');
  const { toast } = useToast();
  const { refresh } = useSiteSettings();
  const { driveImageConfig } = useIntegrations();
  const [recordId, setRecordId] = useState(null);
  const [form, setForm] = useState(empty);
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [faviconRemoved, setFaviconRemoved] = useState(false);
  const [hadLogoFile, setHadLogoFile] = useState(false);
  const [hadFaviconFile, setHadFaviconFile] = useState(false);
  // As imagens da página Sobre dependem da migração `imagens_sobre`. Enquanto as colunas não
  // existirem, os campos não aparecem e não são gravados: enviá-los faria o PostgREST
  // recusar o registo inteiro e partir o gravar das Configurações.
  // A coluna `youtube` nasce numa migração. Enquanto não estiver aplicada, o campo não é
  // enviado: um pedido com uma coluna que não existe é recusado pelo PostgREST inteiro, e a
  // equipa ficava sem gravar configuração nenhuma. É o mesmo padrão das colunas abaixo.
  const [hasYoutube, setHasYoutube] = useState(false);
  // As ligações para descarregar os apps (migração `ligacoes_dos_apps`, página /app do site).
  const [hasAppLinks, setHasAppLinks] = useState(false);
  const [hasAboutImages, setHasAboutImages] = useState(false);
  const [hasAboutTeam, setHasAboutTeam] = useState(false);
  // Colunas da migração 20261106050000: antes dela, enviá-las partia a gravação das definições.
  const [hasNewRules, setHasNewRules] = useState(false);
  const [hasUnconfirmedRule, setHasUnconfirmedRule] = useState(false);
  const [hasPaymentRules, setHasPaymentRules] = useState(false);
  // Colunas da migração 20261106180000 (páginas sem os botões flutuantes).
  const [hasFloating, setHasFloating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Que segredos estão guardados (sem os valores). `null` = base de dados sem a migração.
  const [secretStatus, setSecretStatus] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, status] = await Promise.all([
        pb.collection('site_settings').getFullList(),
        loadSecretStatus().catch(() => null),
      ]);
      setSecretStatus(status);
      if (list.length > 0) {
        const r = list[0];
        setRecordId(r.id);
        setHasYoutube(hasColumn(r, 'youtube'));
        setHasAppLinks(hasColumn(r, 'app_android_url'));
        setHasAboutImages(hasColumn(r, 'about_top_image_url'));
        setHasAboutTeam(hasColumn(r, 'about_team'));
        setHasNewRules(hasColumn(r, 'unpaid_cancel_days'));
        setHasUnconfirmedRule(hasColumn(r, 'unconfirmed_cancel_days'));
        setHasPaymentRules(hasColumn(r, 'unpaid_orders_per_contact'));
        setHasFloating(hasColumn(r, 'chat_hidden_on'));
        setHadLogoFile(!!r.logo);
        setHadFaviconFile(!!r.favicon);
        setLogoRemoved(false);
        setFaviconRemoved(false);
        setLogoFile(null);
        setFaviconFile(null);
        const logoFromFile = r.logo ? pb.files.getURL(r, r.logo) : '';
        const favFromFile = r.favicon ? pb.files.getURL(r, r.favicon) : '';
        setForm({
          site_name: r.site_name || empty.site_name,
          tagline: r.tagline || '',
          primary_color: r.primary_color || '#0ea5c9',
          logo_url: logoFromFile || sanitizeImageUrlForSave(r.logo_url) || '',
          favicon_url: favFromFile || sanitizeImageUrlForSave(r.favicon_url) || '',
          login_bg_url: r.login_bg_url || '',
          about_top_image_url: r.about_top_image_url || '',
          about_side_image_url: r.about_side_image_url || '',
          about_team: Array.isArray(r.about_team) ? r.about_team : [],
          contact_email: r.contact_email || '',
          contact_phone: r.contact_phone ? formatAngolaPhone(r.contact_phone) : '',
          contact_address: r.contact_address || '',
          whatsapp: r.whatsapp ? formatAngolaPhone(r.whatsapp) : '',
          facebook: r.facebook || '',
          instagram: r.instagram || '',
          youtube: r.youtube || '',
          pwa_enabled: !!r.pwa_enabled,
          pwa_name: r.pwa_name || '',
          pwa_short_name: r.pwa_short_name || 'Livraria',
          app_android_url: r.app_android_url || '',
          app_ios_url: r.app_ios_url || '',
          pwa_theme_color: r.pwa_theme_color || '#0c4a6e',
          shipping_free_threshold: r.shipping_free_threshold ?? 20000,
          shipping_cost: r.shipping_cost ?? 1500,
          maintenance_mode: !!r.maintenance_mode,
          google_oauth_enabled: !!r.google_oauth_enabled,
          header_welcome_logged: r.header_welcome_logged || empty.header_welcome_logged,
          header_welcome_guest: r.header_welcome_guest || empty.header_welcome_guest,
          header_cta_text: r.header_cta_text || empty.header_cta_text,
          header_cta_link: r.header_cta_link || empty.header_cta_link,
          footer_tagline: r.footer_tagline || '',
          footer_copyright: r.footer_copyright || '',
          footer_columns: r.footer_columns || null,
          show_stores_in_footer: r.show_stores_in_footer !== false,
          shop_hero_title: r.shop_hero_title || empty.shop_hero_title,
          shop_hero_subtitle: r.shop_hero_subtitle || empty.shop_hero_subtitle,
          shop_hero_badge: r.shop_hero_badge || empty.shop_hero_badge,
          shop_default_sort: r.shop_default_sort || empty.shop_default_sort,
          shop_per_page: r.shop_per_page ?? empty.shop_per_page,
          shop_show_featured: r.shop_show_featured !== false,
          shop_show_collections: r.shop_show_collections !== false,
          shop_show_low_stock: r.shop_show_low_stock !== false,
          shop_grid_columns: r.shop_grid_columns ?? empty.shop_grid_columns,
          shipping_express_cost: r.shipping_express_cost ?? empty.shipping_express_cost,
          order_number_prefix: r.order_number_prefix ?? empty.order_number_prefix,
          checkout_notes_max: r.checkout_notes_max ?? empty.checkout_notes_max,
          checkout_rate_per_minute: r.checkout_rate_per_minute ?? empty.checkout_rate_per_minute,
          track_rate_per_minute: r.track_rate_per_minute ?? empty.track_rate_per_minute,
          receipt_per_order_per_minute: r.receipt_per_order_per_minute ?? empty.receipt_per_order_per_minute,
          unpaid_cancel_days: r.unpaid_cancel_days ?? empty.unpaid_cancel_days,
          unconfirmed_cancel_days: r.unconfirmed_cancel_days ?? empty.unconfirmed_cancel_days,
          chat_ai_daily_limit: r.chat_ai_daily_limit ?? empty.chat_ai_daily_limit,
          unpaid_orders_per_contact: r.unpaid_orders_per_contact ?? empty.unpaid_orders_per_contact,
          company_legal_name: r.company_legal_name || '',
          company_nif: r.company_nif || '',
          low_stock_threshold: r.low_stock_threshold ?? empty.low_stock_threshold,
          book_code_prefix: r.book_code_prefix ?? empty.book_code_prefix,
          ui_glass_enabled: r.ui_glass_enabled !== false,
          ui_glass_opacity: r.ui_glass_opacity ?? empty.ui_glass_opacity,
          shop_bg_mode: r.shop_bg_mode || empty.shop_bg_mode,
          shop_bg_image_url: r.shop_bg_image_url || '',
          shop_bg_video_url: r.shop_bg_video_url || '',
          shop_bg_overlay: r.shop_bg_overlay ?? empty.shop_bg_overlay,
          google_maps_embed_key: r.google_maps_embed_key || '',
          order_email_enabled: !!r.order_email_enabled,
          // Vazio na base de dados = SMTP no servidor (deliverEmail): o painel mostra o mesmo, para
          // gravar outra definição não trocar o fornecedor em silêncio.
          email_provider: !r.email_provider ? 'smtp' : r.email_provider,
          sendgrid_api_key: r.sendgrid_api_key || '',
          brevo_api_key: '',
          cloudflare_email_token: '',
          cloudflare_account_id: r.cloudflare_account_id || '',
          smtp_from_email: r.smtp_from_email || '',
          smtp_from_name: r.smtp_from_name || '',
          smtp_host: r.smtp_host || '',
          smtp_port: r.smtp_port ?? 465,
          smtp_user: r.smtp_user || '',
          smtp_password: r.smtp_password || '',
          push_enabled: !!r.push_enabled,
          vapid_public_key: r.vapid_public_key || '',
          vapid_private_key: r.vapid_private_key || '',
          chat_enabled: r.chat_enabled !== false,
          chat_provider: r.chat_provider || 'gemini',
          gemini_api_key: r.gemini_api_key || '',
          deepseek_api_key: r.deepseek_api_key || '',
          chat_model: r.chat_model || '',
          chat_welcome: r.chat_welcome || '',
          chat_hidden_on: hiddenPages(r, 'chat'),
          scroll_top_hidden_on: hiddenPages(r, 'top'),
        });
      }
    } catch {
      // coleção ainda não migrada
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const removeSecret = async (key, label) => {
    try {
      await clearSecret(key);
      setSecretStatus(await loadSecretStatus().catch(() => null));
      set(key, '');
      toast({ title: `${label} retirada` });
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: pbErrorMessage(err) });
    }
  };
  const secretProps = (key, label) => ({
    id: `secret-${key}`,
    label,
    value: form[key],
    onChange: (v) => set(key, v),
    status: secretStatus ? secretStatus[key] || { set: false } : null,
    onClear: () => removeSecret(key, label),
  });

  // Equipa da página Sobre
  const teamSet = (index, key, value) => setForm((f) => {
    const team = [...(f.about_team || [])];
    team[index] = { ...team[index], [key]: value };
    return { ...f, about_team: team };
  });
  const teamAdd = () => setForm((f) => ({ ...f, about_team: [...(f.about_team || []), { name: '', role: '', photo_url: '' }] }));
  const teamRemove = (index) => setForm((f) => ({ ...f, about_team: (f.about_team || []).filter((_, i) => i !== index) }));
  const teamMove = (index, dir) => setForm((f) => {
    const team = [...(f.about_team || [])];
    const j = index + dir;
    if (j < 0 || j >= team.length) return f;
    [team[index], team[j]] = [team[j], team[index]];
    return { ...f, about_team: team };
  });

  // Alterações por gravar: compara com o estado carregado do servidor.
  const [baseline, setBaseline] = useState('');
  useEffect(() => {
    if (!loading) setBaseline(JSON.stringify(form));
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !loading && (baseline !== JSON.stringify(form) || !!logoFile || !!faviconFile || logoRemoved || faviconRemoved);
  const discard = () => {
    setLogoFile(null);
    setFaviconFile(null);
    load();
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (isUploadPending(form.login_bg_url, form.shop_bg_image_url, form.about_top_image_url, form.about_side_image_url)) {
      toast({ title: 'A enviar imagem…', description: 'Aguarde que o envio termine e guarde de novo.' });
      return;
    }
    // Uma ligação mal escrita não se grava a meio: ia para o botão «Descarregar» da página /app.
    if (hasAppLinks && [form.app_android_url, form.app_ios_url].some((v) => String(v || '').trim() && !ligacaoDaApp(v))) {
      toast({ variant: 'destructive', title: 'Ligação dos apps inválida', description: 'Em PWA / telemóvel, as ligações para descarregar têm de começar por https://' });
      return;
    }
    setSaving(true);
    try {
      const data = {
        ...form,
        logo_url: form.logo_url?.startsWith('blob:') ? '' : sanitizeImageUrlForSave(form.logo_url),
        favicon_url: form.favicon_url?.startsWith('blob:') ? '' : sanitizeImageUrlForSave(form.favicon_url),
        login_bg_url: sanitizeImageUrlForSave(form.login_bg_url),
        shop_bg_image_url: sanitizeImageUrlForSave(form.shop_bg_image_url),
        shipping_free_threshold: Number(form.shipping_free_threshold),
        shipping_cost: Number(form.shipping_cost),
        shipping_express_cost: Number(form.shipping_express_cost),
        // Regras da loja: os mesmos limites que a base de dados aceita.
        order_number_prefix: String(form.order_number_prefix || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8),
        checkout_notes_max: clampInt(form.checkout_notes_max, 0, 5000, 2000),
        checkout_rate_per_minute: clampInt(form.checkout_rate_per_minute, 1, 60, 15),
        track_rate_per_minute: clampInt(form.track_rate_per_minute, 1, 120, 20),
        receipt_per_order_per_minute: clampInt(form.receipt_per_order_per_minute, 1, 10, 3),
        low_stock_threshold: clampInt(form.low_stock_threshold, 0, 1000, 5),
        book_code_prefix: String(form.book_code_prefix || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8) || 'LIV-',
        shop_per_page: Number(form.shop_per_page) || 24,
        shop_grid_columns: Number(form.shop_grid_columns) || 4,
        ui_glass_opacity: Number(form.ui_glass_opacity) || 0.72,
        // 0 é válido (sem escurecimento); só o campo vazio volta ao valor por omissão.
        shop_bg_overlay: form.shop_bg_overlay === '' || Number.isNaN(Number(form.shop_bg_overlay)) ? 0.55 : Number(form.shop_bg_overlay),
        smtp_port: Number(form.smtp_port) || 465,
        cloudflare_account_id: String(form.cloudflare_account_id || '').trim().slice(0, 64),
        shop_bg_mode: form.shop_bg_mode || 'gradient',
        primary_color: form.primary_color || '#0ea5c9',
        pwa_theme_color: form.pwa_theme_color || '#0c4a6e',
        footer_columns: typeof form.footer_columns === 'string'
          ? (() => { try { return JSON.parse(form.footer_columns); } catch { return null; } })()
          : form.footer_columns,
      };

      let id = recordId;
      if (logoRemoved && id) {
        await removeImageFromRecord('site_settings', id, 'logo', 'logo_url');
        data.logo_url = '';
      }
      if (faviconRemoved && id) {
        await removeImageFromRecord('site_settings', id, 'favicon', 'favicon_url');
        data.favicon_url = '';
      }

      // Colunas que nasceram em migrações: só vão no pedido quando existem mesmo na base de
      // dados. Ver `lib/optionalColumns.js` — e lá está também porque é que o padrão antigo
      // (um spread condicional depois do `...form`) não chegava a apagar nada.
      applyOptionalColumns(data, [
        [hasAboutImages, {
          about_top_image_url: sanitizeImageUrlForSave(form.about_top_image_url),
          about_side_image_url: sanitizeImageUrlForSave(form.about_side_image_url),
        }],
        [hasNewRules, {
          unpaid_cancel_days: clampInt(form.unpaid_cancel_days, 0, 60, 0),
          chat_ai_daily_limit: clampInt(form.chat_ai_daily_limit, 0, 100000, 500),
        }],
        [hasUnconfirmedRule, {
          unconfirmed_cancel_days: clampInt(form.unconfirmed_cancel_days, 0, 60, 0),
        }],
        [hasPaymentRules, {
          unpaid_orders_per_contact: clampInt(form.unpaid_orders_per_contact, 0, 20, 3),
          company_legal_name: String(form.company_legal_name || '').trim().slice(0, 160),
          company_nif: String(form.company_nif || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20),
        }],
        [hasAboutTeam, {
          // Sem nome não é ninguém: essas linhas não são gravadas.
          about_team: (form.about_team || [])
            .map((m) => ({
              name: (m.name || '').trim().slice(0, 120),
              role: (m.role || '').trim().slice(0, 120),
              photo_url: sanitizeImageUrlForSave(m.photo_url || ''),
            }))
            .filter((m) => m.name),
        }],
        [hasYoutube, { youtube: (form.youtube || '').trim() }],
        [hasAppLinks, {
          app_android_url: ligacaoDaApp(form.app_android_url),
          app_ios_url: ligacaoDaApp(form.app_ios_url),
        }],
        [hasFloating, {
          chat_hidden_on: hiddenPages(form, 'chat'),
          scroll_top_hidden_on: hiddenPages(form, 'top'),
        }],
      ]);

      // Segredos: só seguem os que foram escritos agora (ver lib/siteSecrets.js).
      const payload = { ...withoutSecrets(data), ...secretsForSave(form, secretStatus) };
      if (id) {
        await pb.collection('site_settings').update(id, payload);
      } else {
        const created = await pb.collection('site_settings').create(payload);
        id = created.id;
        setRecordId(id);
      }

      if (logoFile && id) {
        await uploadImageToRecord('site_settings', id, 'logo', logoFile);
        await syncUploadedImageUrl('site_settings', id, 'logo', 'logo_url');
      } else if (data.logo_url && !logoRemoved && hadLogoFile && !logoFile) {
        await removeImageFromRecord('site_settings', id, 'logo');
      }

      if (faviconFile && id) {
        await uploadImageToRecord('site_settings', id, 'favicon', faviconFile);
        await syncUploadedImageUrl('site_settings', id, 'favicon', 'favicon_url');
      } else if (data.favicon_url && !faviconRemoved && hadFaviconFile && !faviconFile) {
        await removeImageFromRecord('site_settings', id, 'favicon');
      }

      setLogoFile(null);
      setFaviconFile(null);
      setLogoRemoved(false);
      setFaviconRemoved(false);

      await refresh();
      toast({ title: 'Configurações guardadas' });
      load();
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro', description: pbErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <Tabs value={sv.view} className={sv.localNav ? 'grid lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start' : ''}>
        <AdminViewNav state={sv} variant="aside" />
        <div className="min-w-0 rounded-xl border border-border bg-background p-5 md:p-6">

        <TabsContent value="brand" className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="config-nome">Nome do Sistema *</Label>
            <Input id="config-nome" value={form.site_name} onChange={(e) => set('site_name', e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-slogan">Slogan / Tagline</Label>
            <Input id="config-slogan" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cor Principal</Label>
            <div className="flex gap-2">
              <Input type="color" value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} className="w-14 h-10 p-1" aria-label="Cor principal (escolher)" />
              <Input value={form.primary_color} onChange={(e) => set('primary_color', e.target.value)} className="font-mono" aria-label="Cor principal (código)" />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.maintenance_mode} onCheckedChange={(v) => set('maintenance_mode', v)} aria-label="Modo manutenção (bloqueia as compras)" />
            <Label>Modo manutenção (bloqueia as compras)</Label>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.google_oauth_enabled} onCheckedChange={(v) => set('google_oauth_enabled', v)} aria-label="Login com Google" />
            <div>
              <Label>Login com Google</Label>
              <p className="text-xs text-muted-foreground">Feito pelo Firebase Authentication (adicione o domínio do site em Authorized domains)</p>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="images" className="space-y-6 max-w-2xl">
          <ImageField
            label="Logotipo"
            value={form.logo_url}
            onChange={(v) => { set('logo_url', v); setLogoRemoved(false); }}
            onFileChange={(f) => { setLogoFile(f); if (f) setLogoRemoved(false); }}
            onClear={() => setLogoRemoved(true)}
            aspect="quadrado ou horizontal"
            hint="Logotipo: PNG ou WebP com fundo transparente · 200×200px mínimo · Aparece em todo o site (header, login, admin, rodapé)"
            previewClassName="h-20 w-40"
            driveConfig={driveImageConfig}
          />
          <ImageField
            label="Favicon"
            value={form.favicon_url}
            onChange={(v) => { set('favicon_url', v); setFaviconRemoved(false); }}
            onFileChange={(f) => { setFaviconFile(f); if (f) setFaviconRemoved(false); }}
            onClear={() => setFaviconRemoved(true)}
            aspect="1:1"
            maxSizeMB={0.5}
            hint="Favicon: PNG ou ICO · 32×32 ou 64×64px · Ícone do separador do browser e PWA"
            previewClassName="h-12 w-12"
            driveConfig={driveImageConfig}
          />
          <ImageField
            label="Imagem de fundo do Login"
            gallery="login"
            value={form.login_bg_url}
            onChange={(v) => set('login_bg_url', v)}
            aspect="16:9"
            hint="Fundo login: JPG/WebP · 1920×1080px recomendado"
            previewClassName="h-24 w-40"
            driveConfig={driveImageConfig}
            uploadFolder="site_settings"
          />
          {hasAboutImages && (
          <>
          <ImageField
            label="Página Sobre — imagem do topo"
            gallery="sobre-topo"
            value={form.about_top_image_url}
            onChange={(v) => set('about_top_image_url', v)}
            aspect="16:9"
            hint="Topo da página Sobre · 1920×1000px recomendado · vazio = a imagem que vem com o site"
            previewClassName="h-24 w-40"
            driveConfig={driveImageConfig}
            uploadFolder="site_settings"
          />
          <ImageField
            label="Página Sobre — imagem lateral"
            gallery="sobre-lateral"
            value={form.about_side_image_url}
            onChange={(v) => set('about_side_image_url', v)}
            aspect="4:3"
            hint="Lateral da página Sobre · 1200×1000px recomendado · vazio = a imagem que vem com o site"
            previewClassName="h-24 w-32"
            driveConfig={driveImageConfig}
            uploadFolder="site_settings"
          />
          </>
          )}

          {hasAboutTeam && (
            <div className="space-y-3 rounded-xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <Label className="text-base">Equipa na página Sobre</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Nome, função e fotografia de cada pessoa. Sem ninguém na lista, a secção não
                    aparece no site. Linhas sem nome não são gravadas.
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={teamAdd}>Acrescentar</Button>
              </div>

              {(form.about_team || []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Ainda não há ninguém na lista.</p>
              ) : (
                <div className="space-y-4">
                  {(form.about_team || []).map((member, i) => (
                    <div key={i} className="grid gap-3 sm:grid-cols-[auto_1fr] items-start border-t pt-4 first:border-t-0 first:pt-0">
                      <div className="w-32">
                        <ImageField
                          label="Fotografia"
                          value={member.photo_url || ''}
                          onChange={(v) => teamSet(i, 'photo_url', v)}
                          aspect="1:1"
                          previewClassName="h-20 w-20 rounded-full"
                          showDrive={false}
                          driveConfig={driveImageConfig}
                          uploadFolder="site_settings"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={member.name || ''}
                              onChange={(e) => teamSet(i, 'name', e.target.value)}
                              maxLength={120}
                              placeholder="Nome da pessoa"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Função</Label>
                            <Input
                              value={member.role || ''}
                              onChange={(e) => teamSet(i, 'role', e.target.value)}
                              maxLength={120}
                              placeholder="Ex.: Atendimento ao cliente"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button type="button" variant="ghost" size="sm" onClick={() => teamMove(i, -1)} disabled={i === 0}>Subir</Button>
                          <Button type="button" variant="ghost" size="sm" onClick={() => teamMove(i, 1)} disabled={i === (form.about_team || []).length - 1}>Descer</Button>
                          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => teamRemove(i)}>Remover</Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="contact" className="space-y-4 max-w-xl">
          {!localDigits(form.contact_phone) && !localDigits(form.whatsapp) && (
            // Sem número o site esconde o telefone e o botão de WhatsApp do rodapé: melhor do
            // que mostrar um provisório, mas o cliente fica só com o email.
            <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
              O site não mostra nenhum telefone nem o botão de WhatsApp enquanto estes campos estiverem vazios.
            </p>
          )}
          <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} /></div>
          <div className="space-y-2"><Label>Telefone</Label><PhoneInput value={form.contact_phone} onChange={(v) => set('contact_phone', v)} /></div>
          <div className="space-y-2"><Label>Morada</Label><Input value={form.contact_address} onChange={(e) => set('contact_address', e.target.value)} /></div>
          {hasPaymentRules && (
            <>
              <div className="space-y-2">
                <Label htmlFor="empresa-nome">Nome legal da empresa (no recibo)</Label>
                <Input id="empresa-nome" value={form.company_legal_name} maxLength={160} onChange={(e) => set('company_legal_name', e.target.value)} placeholder="Ex.: Livraria e Editora Adventista" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="empresa-nif">NIF (no recibo)</Label>
                <Input id="empresa-nif" value={form.company_nif} maxLength={20} onChange={(e) => set('company_nif', e.target.value)} inputMode="numeric" />
              </div>
            </>
          )}
          <div className="space-y-2"><Label>WhatsApp</Label><PhoneInput value={form.whatsapp} onChange={(v) => set('whatsapp', v)} /></div>
          <div className="space-y-2"><Label>Facebook URL</Label><Input value={form.facebook} onChange={(e) => set('facebook', e.target.value)} /></div>
          <div className="space-y-2"><Label>Instagram URL</Label><Input value={form.instagram} onChange={(e) => set('instagram', e.target.value)} /></div>
          {hasYoutube && (
            <div className="space-y-2"><Label>Canal do YouTube</Label><Input value={form.youtube} onChange={(e) => set('youtube', e.target.value)} placeholder="https://www.youtube.com/@..." /></div>
          )}
        </TabsContent>

        <TabsContent value="pwa" className="space-y-4 max-w-xl">
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.pwa_enabled} onCheckedChange={(v) => set('pwa_enabled', v)} aria-label="Permitir instalação como app (PWA)" />
            <Label>Permitir instalação como app (PWA)</Label>
          </div>
          <div className="space-y-2"><Label>Nome da App</Label><Input value={form.pwa_name} onChange={(e) => set('pwa_name', e.target.value)} placeholder={form.site_name} /></div>
          <div className="space-y-2">
            <Label htmlFor="pwa-nome-curto">Nome Curto (ícone)</Label>
            <Input id="pwa-nome-curto" value={form.pwa_short_name} onChange={(e) => set('pwa_short_name', e.target.value)} maxLength={12} aria-describedby="pwa-nomes-quando" />
          </div>
          {/* O nome e o nome curto vão para o manifesto na publicação do site (scripts/pwa-manifesto.mjs):
              é o que o telemóvel lê ao instalar. Dizê-lo aqui evita que se mude e se fique à espera. */}
          <p id="pwa-nomes-quando" className="text-xs text-muted-foreground">
            O nome curto aparece por baixo do ícone, no ecrã do telemóvel. Os nomes chegam à app na próxima publicação do site;
            quem já a instalou vê a mudança quando o Android actualizar a app — no iPhone, só ao instalar de novo.
          </p>
          <div className="space-y-2">
            <Label>Cor do Tema Mobile</Label>
            <div className="flex gap-2">
              <Input type="color" value={form.pwa_theme_color} onChange={(e) => set('pwa_theme_color', e.target.value)} className="w-14 h-10 p-1" />
              <Input value={form.pwa_theme_color} onChange={(e) => set('pwa_theme_color', e.target.value)} className="font-mono" />
            </div>
          </div>

          {hasAppLinks && (
            <div className="space-y-4 border-t pt-4" data-ligacoes-dos-apps>
              <div>
                <h3 className="text-lg font-semibold">Apps para descarregar</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Para onde vão os botões da página <a href="/app" target="_blank" rel="noreferrer" className="font-medium text-primary underline">/app</a> («Descarregar a app»).
                  Sem ligação, a página oferece a instalação da app web, como até aqui.
                </p>
              </div>
              {[
                ['app_android_url', 'app-android', 'Android', 'O APK servido pelo site (workflow «App Android») ou a página da Google Play.', 'https://livrariaadventista.ao/downloads/livraria-adventista.apk'],
                ['app_ios_url', 'app-ios', 'iPhone e iPad', 'A página da App Store ou o convite público do TestFlight.', 'https://apps.apple.com/…'],
              ].map(([campo, id, nome, ajuda, exemplo]) => {
                const escrito = String(form[campo] || '').trim();
                const invalida = !!escrito && !ligacaoDaApp(escrito);
                return (
                  <div key={campo} className="space-y-2">
                    <Label htmlFor={id}>{nome} — ligação para descarregar</Label>
                    <Input
                      id={id} type="url" inputMode="url" value={form[campo]} maxLength={500} placeholder={exemplo}
                      onChange={(e) => set(campo, e.target.value)} aria-describedby={`${id}-ajuda`} aria-invalid={invalida}
                    />
                    <p id={`${id}-ajuda`} className={invalida ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                      {invalida ? 'Tem de ser uma ligação completa, começada por https://' : ajuda}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="messaging" className="space-y-6 max-w-xl">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Email de confirmação de encomenda</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Confirmações de encomenda, avisos de cada passo, respostas da equipa aos clientes e alertas à equipa.
              O servidor envia por API: Brevo (grátis, 300 por dia) ou Cloudflare (o domínio da loja já lá está; plano pago).
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.order_email_enabled} onCheckedChange={(v) => set('order_email_enabled', v)} aria-label="Activar email automático de confirmação" />
            <Label>Activar email automático de confirmação</Label>
          </div>
          <div className="space-y-2">
            <Label>Provedor de email</Label>
            <Select value={form.email_provider || 'smtp'} onValueChange={(v) => set('email_provider', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brevo">Brevo — API (recomendado; grátis até 300 por dia)</SelectItem>
                <SelectItem value="cloudflare">Cloudflare Email Sending — API (plano Workers Paid)</SelectItem>
                <SelectItem value="sendgrid">SendGrid — API (sem plano gratuito)</SelectItem>
                <SelectItem value="smtp">SMTP (só porta 465; 25 e 587 estão bloqueadas no Supabase)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.email_provider === 'smtp' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
              <p className="text-xs text-muted-foreground">Credenciais SMTP do seu provedor (ex.: smtp.hostinger.com, smtp-relay.brevo.com). Use a porta 465 (SSL): o Supabase bloqueia as portas 25 e 587.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="config-smtp-host">Servidor SMTP</Label>
                  <Input id="config-smtp-host" value={form.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.hostinger.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="config-smtp-port">Porta</Label>
                  <Input id="config-smtp-port" type="number" value={form.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} placeholder="465" />
                  {[25, 587].includes(Number(form.smtp_port)) && (
                    <p className="text-xs font-medium text-destructive">A porta {form.smtp_port} está bloqueada no Supabase: nenhum email sairia. Use 465 ou, melhor, a Brevo por API.</p>
                  )}
                </div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="config-smtp-user">Utilizador SMTP</Label>
                  <Input id="config-smtp-user" value={form.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} placeholder="noreply@dominio.ao" />
                </div>
                <SecretField {...secretProps('smtp_password', 'Password SMTP')} />
              </div>
            </div>
          )}
          {form.email_provider === 'sendgrid' && (
            <SecretField {...secretProps('sendgrid_api_key', 'Chave SendGrid')} placeholder="SG...." className="font-mono text-sm" />
          )}
          {form.email_provider === 'brevo' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>Crie conta grátis em <a href="https://www.brevo.com" target="_blank" rel="noreferrer" className="text-primary underline">brevo.com</a>.</li>
                <li>Em <strong>Senders, domains &amp; dedicated IPs → Domains</strong>, adicione <strong>livrariaadventista.ao</strong> e copie os registos DNS (Brevo code, DKIM, DMARC) para o Cloudflare (DNS do domínio).</li>
                <li>Em <strong>SMTP &amp; API → API keys</strong>, crie uma chave e cole-a aqui.</li>
                <li>Use como remetente um endereço desse domínio (ex.: <em>loja@livrariaadventista.ao</em>) e carregue em <strong>Enviar teste</strong>.</li>
              </ol>
              <SecretField {...secretProps('brevo_api_key', 'Chave da API Brevo')} placeholder="xkeysib-…" className="font-mono text-sm" />
            </div>
          )}
          {form.email_provider === 'cloudflare' && (
            <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
              <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
                <li>No Cloudflare (conta da loja), active o plano <strong>Workers Paid</strong> (5 USD/mês, 3000 emails incluídos).</li>
                <li>Em <strong>Compute &amp; AI → Email Service → Email Sending → Onboard Domain</strong>, escolha <strong>livrariaadventista.ao</strong> e aceite os registos DNS.</li>
                <li>Crie um <strong>API token</strong> com permissão de envio de email e cole-o aqui, com o ID da conta.</li>
              </ol>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                O Cloudflare só aceita mensagens transaccionais (encomendas, conta, avisos). Campanhas e novidades
                não podem sair por aqui: para essas, use a Brevo.
              </p>
              <div className="space-y-2">
                <Label htmlFor="config-cloudflare-account-id">ID da conta Cloudflare</Label>
                <Input id="config-cloudflare-account-id" value={form.cloudflare_account_id} onChange={(e) => set('cloudflare_account_id', e.target.value)} placeholder="701800d01d428c5141fa1fdb60ee01ae" className="font-mono text-xs" />
              </div>
              <SecretField {...secretProps('cloudflare_email_token', 'Token da API Cloudflare')} className="font-mono text-sm" />
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="config-smtp-from-email">Email remetente</Label>
              <Input id="config-smtp-from-email" type="email" value={form.smtp_from_email} onChange={(e) => set('smtp_from_email', e.target.value)} placeholder="loja@livrariaadventista.ao" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-smtp-from-name">Nome remetente</Label>
              <Input id="config-smtp-from-name" value={form.smtp_from_name} onChange={(e) => set('smtp_from_name', e.target.value)} placeholder="Livraria Adventista" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-3">
            Tem de ser um endereço do domínio verificado no fornecedor (<em>…@livrariaadventista.ao</em>). Vazio, usa o email de contacto.
            As respostas dos clientes vão para o email de contacto ({form.contact_email || 'por preencher'}), que tem de receber correio
            (Cloudflare → Email Routing).
          </p>

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Bell className="h-4 w-4 text-primary" /> Notificações Push (PWA)</h3>
            <p className="text-xs text-muted-foreground mt-1">Gere chaves VAPID em <a href="https://vapidkeys.com" target="_blank" rel="noreferrer" className="text-primary underline">vapidkeys.com</a></p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.push_enabled} onCheckedChange={(v) => set('push_enabled', v)} aria-label="Activar notificações push na PWA" />
            <Label>Activar notificações push na PWA</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-vapid-public-key">Chave pública VAPID</Label>
            <Input id="config-vapid-public-key" value={form.vapid_public_key} onChange={(e) => set('vapid_public_key', e.target.value)} className="font-mono text-xs" />
          </div>
          <SecretField {...secretProps('vapid_private_key', 'Chave privada VAPID')} className="font-mono text-xs" />

          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> Assistente IA (chat)</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Widget de ajuda fixo no site com sugestões, catálogo e links. Recomendado: <strong>Gemini Flash Lite</strong> (mais barato). Fallback automático para FAQ sem chave.
            </p>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.chat_enabled} onCheckedChange={(v) => set('chat_enabled', v)} aria-label="Mostrar assistente no site" />
            <Label>Mostrar assistente no site</Label>
          </div>
          <div className="space-y-2">
            <Label>Provedor de IA</Label>
            <Select value={form.chat_provider || 'gemini'} onValueChange={(v) => set('chat_provider', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gemini">Google Gemini (recomendado — mais barato)</SelectItem>
                <SelectItem value="deepseek">DeepSeek</SelectItem>
                <SelectItem value="faq">Apenas FAQ local (sem IA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.chat_provider !== 'faq' && (
            <>
              <SecretField {...secretProps('gemini_api_key', 'Chave Gemini')} placeholder="AIza… ou variável GEMINI_API_KEY" className="font-mono text-xs" />
              <SecretField {...secretProps('deepseek_api_key', 'Chave DeepSeek')} placeholder="sk-… ou variável DEEPSEEK_API_KEY (opcional)" className="font-mono text-xs" />
              {hasNewRules && (
                <div className="space-y-2">
                  <Label htmlFor="chat-ia-limite">Respostas com IA por dia (loja toda)</Label>
                  <Input id="chat-ia-limite" type="number" min={0} max={100000} value={form.chat_ai_daily_limit} onChange={(e) => set('chat_ai_daily_limit', e.target.value)} />
                  <p className="text-xs text-muted-foreground">Limita o custo da IA. Acima disto, e acima de 60 por visitante, o assistente responde com as perguntas frequentes. 0 = nunca usa IA.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="config-chat-model">Modelo (opcional)</Label>
                <Input id="config-chat-model" value={form.chat_model} onChange={(e) => set('chat_model', e.target.value)} placeholder="gemini-2.0-flash-lite ou deepseek-chat" className="font-mono text-xs" />
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="config-chat-welcome">Mensagem de boas-vindas</Label>
            <Textarea id="config-chat-welcome" rows={2} value={form.chat_welcome} onChange={(e) => set('chat_welcome', e.target.value)} placeholder="Olá! Sou o assistente da livraria…" />
          </div>

          {hasFloating && (
            <div className="border-t pt-6 space-y-3">
              <div>
                <h3 className="text-lg font-semibold">Botões flutuantes</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Em que páginas aparecem o botão do assistente e o de voltar ao topo. Tire-os onde taparem botões ou formulários, sobretudo no telemóvel.
                </p>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="text-left font-medium px-3 py-2">Página</th>
                      <th scope="col" className="font-medium px-3 py-2 w-28">Assistente</th>
                      <th scope="col" className="font-medium px-3 py-2 w-28">Voltar ao topo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FLOATING_PAGES.map((page) => (
                      <tr key={page.key} className="border-t">
                        <th scope="row" className="text-left font-normal px-3 py-2">{page.label}</th>
                        {[['chat_hidden_on', 'Assistente'], ['scroll_top_hidden_on', 'Voltar ao topo']].map(([field, name]) => {
                          const hidden = (form[field] || []).includes(page.key);
                          return (
                            <td key={field} className="px-3 py-2 text-center">
                              <Checkbox
                                checked={!hidden}
                                aria-label={`${name} em ${page.label}`}
                                onCheckedChange={(v) => set(field, v
                                  ? (form[field] || []).filter((k) => k !== page.key)
                                  : [...(form[field] || []), page.key])}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Marcado = aparece. O assistente também se desliga por completo em "Mostrar assistente no site".</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="shipping" className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label htmlFor="config-shipping-free-threshold">Envio grátis acima de (Kz)</Label>
            <Input id="config-shipping-free-threshold" type="number" value={form.shipping_free_threshold} onChange={(e) => set('shipping_free_threshold', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-shipping-cost">Custo de envio padrão (Kz)</Label>
            <Input id="config-shipping-cost" type="number" value={form.shipping_cost} onChange={(e) => set('shipping_cost', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-shipping-express-cost">Custo de envio expresso (Kz)</Label>
            <Input id="config-shipping-express-cost" type="number" value={form.shipping_express_cost} onChange={(e) => set('shipping_express_cost', e.target.value)} />
          </div>
        </TabsContent>

        <TabsContent value="rules" className="space-y-5 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Regras aplicadas pelo servidor em cada encomenda. Os métodos de pagamento aceites são os que estiverem activos em <strong>Vendas → Pagamentos</strong>.
          </p>
          <div className="space-y-2">
            <Label htmlFor="config-order-number-prefix">Prefixo do número de encomenda</Label>
            <Input id="config-order-number-prefix"
              value={form.order_number_prefix}
              onChange={(e) => set('order_number_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))}
              placeholder="ENC-"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Até 8 caracteres (letras, números e hífen). Exemplo de número: <span className="font-mono">{form.order_number_prefix || ''}K3F9QA7XP</span>. Só afecta as encomendas novas.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="config-low-stock-threshold">Stock baixo: até quantas unidades</Label>
              <Input id="config-low-stock-threshold" type="number" min={0} max={1000} value={form.low_stock_threshold} onChange={(e) => set('low_stock_threshold', e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Livros com {Number(form.low_stock_threshold) || 0} ou menos unidades ficam marcados como "Últimas unidades" e aparecem no alerta do painel. Ao guardar, todos os livros são recalculados.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-book-code-prefix">Prefixo do código de livro (SKU)</Label>
              <Input id="config-book-code-prefix"
                value={form.book_code_prefix}
                onChange={(e) => set('book_code_prefix', e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8))}
                placeholder="LIV-"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Usado quando um livro é criado sem código: <span className="font-mono">{form.book_code_prefix || 'LIV-'}101</span>, <span className="font-mono">{form.book_code_prefix || 'LIV-'}102</span>… Os códigos não se podem repetir.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-checkout-notes-max">Máximo de caracteres nas notas da encomenda</Label>
            <Input id="config-checkout-notes-max" type="number" min={0} max={5000} value={form.checkout_notes_max} onChange={(e) => set('checkout_notes_max', e.target.value)} />
            <p className="text-xs text-muted-foreground">0 a 5000. Com 0, as notas do cliente não são guardadas.</p>
          </div>
          {hasNewRules && (
            <div className="space-y-2">
              <Label htmlFor="cancelar-por-pagar">Cancelar encomendas por pagar ao fim de (dias)</Label>
              <Input id="cancelar-por-pagar" type="number" min={0} max={60} value={form.unpaid_cancel_days} onChange={(e) => set('unpaid_cancel_days', e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Só transferência e Multicaixa, sem pagamento nem referência indicada, ainda não preparadas. O stock volta ao catálogo e o
                cliente e a equipa são avisados. 0 = nunca (a encomenda fica à espera, com alerta às 48 h).
              </p>
            </div>
          )}
          {hasUnconfirmedRule && (
            <div className="space-y-2">
              <Label htmlFor="cancelar-nao-confirmadas">Cancelar encomendas na entrega que ninguém confirmou ao fim de (dias)</Label>
              <Input id="cancelar-nao-confirmadas" type="number" min={0} max={60} value={form.unconfirmed_cancel_days} onChange={(e) => set('unconfirmed_cancel_days', e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Pagamento na entrega ou no balcão, sem nada pago, que ninguém da equipa viu nem preparou. Cada encomenda reserva o
                stock: sem este prazo, uma encomenda que ninguém trata tira livros da loja para sempre. O stock volta ao catálogo e o
                cliente e a equipa são avisados. 0 = nunca.
              </p>
            </div>
          )}
          {hasPaymentRules && (
            <div className="space-y-2">
              <Label htmlFor="por-pagar-contacto">Encomendas por pagar ao mesmo tempo, por cliente</Label>
              <Input id="por-pagar-contacto" type="number" min={0} max={20} value={form.unpaid_orders_per_contact} onChange={(e) => set('unpaid_orders_per_contact', e.target.value)} />
              <p className="text-xs text-muted-foreground">
                Pelo mesmo telefone ou email, nos últimos 30 dias. O stock é reservado ao encomendar: sem limite, alguém
                podia reservar a loja inteira sem pagar. 0 = sem limite.
              </p>
            </div>
          )}
          <div className="rounded-lg border p-4 space-y-4 bg-muted/20">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Protecção contra abusos (por minuto)</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Compras por dispositivo</Label>
                <Input type="number" min={1} max={60} value={form.checkout_rate_per_minute} onChange={(e) => set('checkout_rate_per_minute', e.target.value)} />
                <p className="text-[11px] text-muted-foreground">1 a 60</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pesquisas de rastreio</Label>
                <Input type="number" min={1} max={120} value={form.track_rate_per_minute} onChange={(e) => set('track_rate_per_minute', e.target.value)} />
                <p className="text-[11px] text-muted-foreground">1 a 120</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Recibos WhatsApp por encomenda</Label>
                <Input type="number" min={1} max={10} value={form.receipt_per_order_per_minute} onChange={(e) => set('receipt_per_order_per_minute', e.target.value)} />
                <p className="text-[11px] text-muted-foreground">1 a 10</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="shop" className="space-y-4 max-w-2xl">
          <p className="text-sm text-muted-foreground">
            Personalize a página <strong>/shop</strong> — centro do catálogo. A cor principal (aba Marca) aplica-se automaticamente ao hero e botões.
          </p>
          <div className="space-y-2">
            <Label htmlFor="config-shop-hero-badge">Badge do hero</Label>
            <Input id="config-shop-hero-badge" value={form.shop_hero_badge} onChange={(e) => set('shop_hero_badge', e.target.value)} placeholder="Catálogo da livraria" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-shop-hero-title">Título do hero</Label>
            <Input id="config-shop-hero-title" value={form.shop_hero_title} onChange={(e) => set('shop_hero_title', e.target.value)} placeholder="Todos os Livros" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-shop-hero-subtitle">Subtítulo do hero</Label>
            <Textarea id="config-shop-hero-subtitle" rows={2} value={form.shop_hero_subtitle} onChange={(e) => set('shop_hero_subtitle', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ordenação por defeito</Label>
              {/* Da lista partilhada (lib/productSort.js), e não escrita aqui à mão: esta
                  cópia tinha cinco critérios quando a loja passou a ter oito, com nomes
                  diferentes ("Preço ↑" aqui, "Preço: do menor" na loja). Quem escolhesse aqui
                  não conseguia pôr a loja a abrir pelas promoções ou pelos mais procurados. */}
              <Select value={normalizeSort(form.shop_default_sort)} onValueChange={(v) => set('shop_default_sort', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Por que ordem a loja abre. Quem lá estiver pode mudá-la, e o que estiver no
                endereço (<code>?sort=</code>) manda sempre.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-shop-per-page">Livros por página</Label>
              <Input id="config-shop-per-page" type="number" min={12} max={96} value={form.shop_per_page} onChange={(e) => set('shop_per_page', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Colunas da grelha (desktop)</Label>
              <Select value={String(form.shop_grid_columns)} onValueChange={(v) => set('shop_grid_columns', Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 colunas</SelectItem>
                  <SelectItem value="4">4 colunas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border p-4 text-sm" style={{ background: `linear-gradient(135deg, ${form.pwa_theme_color || '#0c4a6e'}, ${form.primary_color || '#0ea5c9'})` }}>
            <p className="text-white/80 text-xs mb-1">Pré-visualização do hero</p>
            <p className="text-white font-bold text-lg">{form.shop_hero_title || 'Todos os Livros'}</p>
            <p className="text-white/85 text-sm">{form.shop_hero_subtitle || form.tagline}</p>
          </div>
          <div className="space-y-3 p-4 rounded-xl border">
            <p className="text-sm font-medium">Fundo do hero da loja</p>
            <Select value={form.shop_bg_mode} onValueChange={(v) => set('shop_bg_mode', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gradient">Gradiente (cores da marca)</SelectItem>
                <SelectItem value="image">Imagem (JPG, PNG, WebP)</SelectItem>
                <SelectItem value="video">Vídeo (MP4/WebM)</SelectItem>
                <SelectItem value="slides">Slider da loja (slides com localização «shop»)</SelectItem>
              </SelectContent>
            </Select>
            {(form.shop_bg_mode === 'image' || form.shop_bg_mode === 'video') && (
              <>
                <ImageField
                  label="Imagem de fundo do hero da loja"
                  gallery="loja"
                  value={form.shop_bg_image_url}
                  onChange={(v) => set('shop_bg_image_url', v)}
                  aspect="16:9"
                  previewClassName="h-24 w-40"
                  driveConfig={driveImageConfig}
                  hint="JPG, PNG ou WebP · 1920×1080 recomendado"
                  uploadFolder="site_settings"
                />
                {form.shop_bg_mode === 'video' && (
                  <div className="space-y-2">
                    <Label htmlFor="fundo-video">URL do vídeo</Label>
                    <Input
                      id="fundo-video"
                      value={form.shop_bg_video_url}
                      onChange={(e) => set('shop_bg_video_url', e.target.value)}
                      placeholder="https://...mp4"
                      aria-invalid={embedOnlyVideoPlatform(form.shop_bg_video_url) ? 'true' : undefined}
                    />
                    {embedOnlyVideoPlatform(form.shop_bg_video_url) ? (
                      <p className="text-sm text-destructive">
                        Isto é um link do {embedOnlyVideoPlatform(form.shop_bg_video_url)}. O
                        fundo em vídeo precisa de um ficheiro (MP4 ou WebM) que o navegador
                        saiba tocar; com um link de plataforma o fundo cai no gradiente. Um
                        vídeo do YouTube mostra-se na ficha do produto, em Livros → Mídia.
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Um ficheiro que toque sozinho, sem som e em ciclo.
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="config-shop-bg-overlay">Opacidade do overlay (0–1)</Label>
                  <Input id="config-shop-bg-overlay" type="number" step="0.05" min="0" max="1" value={form.shop_bg_overlay} onChange={(e) => set('shop_bg_overlay', e.target.value)} />
                </div>
              </>
            )}
            {form.shop_bg_mode === 'slides' && (
              <p className="text-xs text-muted-foreground">Crie slides em Admin → Slider com localização «Loja» ou «Ambos».</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="theme" className="space-y-4 max-w-xl">
          <p className="text-sm text-muted-foreground">Opacidade suave estilo macOS — translúcido com blur, sem efeitos extra.</p>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.ui_glass_enabled} onCheckedChange={(v) => set('ui_glass_enabled', v)} aria-label="Activar superfícies opacas (header, rodapé, painéis)" />
            <Label>Activar superfícies opacas (header, rodapé, painéis)</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-ui-glass-opacity">Opacidade do vidro (0.5 – 0.95)</Label>
            <Input id="config-ui-glass-opacity" type="number" step="0.05" min="0.5" max="0.95" value={form.ui_glass_opacity} onChange={(e) => set('ui_glass_opacity', e.target.value)} />
            <p className="text-xs text-muted-foreground">Recomendado: 0.72 (similar ao macOS)</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-google-maps-embed-key">Google Maps Embed API Key (opcional)</Label>
            <Input id="config-google-maps-embed-key" value={form.google_maps_embed_key} onChange={(e) => set('google_maps_embed_key', e.target.value)} placeholder="AIza..." className="font-mono text-sm" />
            <p className="text-xs text-muted-foreground">Para mapas embutidos nas lojas físicas. Sem chave, usa links Google Maps.</p>
          </div>
          <div className={`p-4 rounded-xl border glass-surface ${!form.ui_glass_enabled ? 'opacity-60' : ''}`}>
            <p className="text-sm font-medium">Pré-visualização do efeito vidro</p>
            <p className="text-xs text-muted-foreground mt-1">Header e rodapé usam este estilo quando activado.</p>
          </div>
        </TabsContent>

        <TabsContent value="header" className="space-y-4 max-w-xl">
          <p className="text-sm text-muted-foreground">
            Personalize a barra superior do site. Use <code className="text-primary">{'{nome}'}</code> para inserir o primeiro nome do utilizador.
          </p>
          <div className="space-y-2">
            <Label htmlFor="config-header-welcome-logged">Mensagem (utilizador logado)</Label>
            <Input id="config-header-welcome-logged" value={form.header_welcome_logged} onChange={(e) => set('header_welcome_logged', e.target.value)} placeholder="Bem-vindo de volta, {nome}" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-header-welcome-guest">Mensagem (visitante)</Label>
            <Input id="config-header-welcome-guest" value={form.header_welcome_guest} onChange={(e) => set('header_welcome_guest', e.target.value)} />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="config-header-cta-text">Texto do link CTA</Label>
              <Input id="config-header-cta-text" value={form.header_cta_text} onChange={(e) => set('header_cta_text', e.target.value)} placeholder="Explorar novidades" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="config-header-cta-link">Link CTA</Label>
              <Input id="config-header-cta-link" value={form.header_cta_link} onChange={(e) => set('header_cta_link', e.target.value)} placeholder="/shop" />
            </div>
          </div>
          <div className="rounded-lg border p-3 bg-muted/30 text-sm">
            <p className="text-muted-foreground mb-1">Pré-visualização (logado):</p>
            <p>
              {(form.header_welcome_logged || '').replace('{nome}', 'Maria')}
              {' · '}
              <span className="underline">{form.header_cta_text || 'Explorar'}</span>
            </p>
          </div>
        </TabsContent>

        <TabsContent value="footer" className="space-y-4 max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="config-footer-tagline">Tagline do Rodapé</Label>
            <Input id="config-footer-tagline" value={form.footer_tagline} onChange={(e) => set('footer_tagline', e.target.value)} placeholder="Literatura cristã, educação e inspiração..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="config-footer-copyright">Texto de Copyright</Label>
            <Input id="config-footer-copyright" value={form.footer_copyright} onChange={(e) => set('footer_copyright', e.target.value)} placeholder="© 2026 Livraria Adventista. Todos os direitos reservados." />
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg border">
            <Switch checked={form.show_stores_in_footer} onCheckedChange={(v) => set('show_stores_in_footer', v)} aria-label="Mostrar lojas físicas no rodapé" />
            <Label>Mostrar lojas físicas no rodapé</Label>
          </div>
          <div className="space-y-2">
            <Label>Colunas do Rodapé (JSON)</Label>
            <Textarea
              rows={10}
              value={form.footer_columns ? JSON.stringify(form.footer_columns, null, 2) : ''}
              onChange={(e) => {
                try {
                  const parsed = e.target.value ? JSON.parse(e.target.value) : null;
                  set('footer_columns', parsed);
                } catch {
                  set('footer_columns', e.target.value);
                }
              }}
              placeholder={'[\n  {\n    "title": "Apoio ao Cliente",\n    "links": [{"label": "FAQ", "url": "/faq", "internal": true}]\n  }\n]'}
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">Deixe vazio para usar colunas padrão. Cada link: label, url, internal (true para rotas internas).</p>
          </div>
        </TabsContent>

        </div>
      </Tabs>

      <div className={`sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm transition-colors ${dirty ? 'border-amber-400/60 bg-amber-50/95 dark:bg-amber-950/80' : 'border-border bg-background/95'}`}>
        <p className={`text-sm ${dirty ? 'text-amber-900 dark:text-amber-200 font-medium' : 'text-muted-foreground'}`}>
          {dirty ? 'Há alterações por gravar.' : 'Tudo gravado.'}
        </p>
        <div className="flex gap-2">
          {dirty && (
            <Button type="button" variant="outline" onClick={discard} disabled={saving}>
              <RotateCcw className="mr-2 h-4 w-4" /> Descartar
            </Button>
          )}
          <Button type="submit" className="btn-primary" disabled={saving || !dirty}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar configurações
          </Button>
        </div>
      </div>
    </form>
  );
}
