/**
 * Importação do registo da Igreja a partir dos ficheiros que já existiam (churches.json e
 * pastores.json). Código puro: recebe os dois ficheiros e a geografia da base de dados e
 * devolve um plano para a função `church_registry_import` mais uma pré-visualização com avisos,
 * para a equipa rever antes de gravar.
 *
 * O que os ficheiros têm de traiçoeiro, e que este módulo resolve ou assinala:
 * - Províncias com o nome antigo ou abreviado ("Quando" é a província do Cuando, RGPH-2024).
 * - O mesmo distrito com nomes diferentes nos dois ficheiros ("Distrito do Andulo" e "Andulo").
 * - O mesmo nome de distrito em províncias diferentes ("Distrito Centro" no Huambo e no Cuito).
 * - No pastores.json, o campo "distrito" às vezes é um cargo ("Presidente - Missão",
 *   "Tesoureiro", "Jubilado"), uma instituição ("ISPAB – Bongo", "Livraria") ou um campo
 *   ("Missão Sul", "União Sudoeste"). Nada disso é um distrito.
 * - Nomes parecidos que podem ser a mesma pessoa ou o mesmo distrito (Feka/Feca,
 *   Cholohanga/Tcholoanga): não se juntam sozinhos — sugerem-se.
 * - Telefones repetidos ou em sequência (parecem preenchidos à mão).
 * As avaliações dos pastores ficam de fora (decisão do dono).
 */

export const PASTOR_ROLES = {
  presidente: 'Presidente',
  secretario_executivo: 'Secretário Executivo',
  tesoureiro: 'Tesoureiro',
  pastor_distrital: 'Pastor Distrital',
  pastor_departamental: 'Pastor Departamental',
  pastor_licenciado: 'Pastor Licenciado',
  pastor_jubilado: 'Pastor Jubilado',
  professor: 'Professor / Pastor',
  auditor: 'Auditor / Pastor',
  director_livraria: 'Director de Livraria',
  lider: 'Líder / Pastor',
  outro: 'Outro',
};

export const FIELD_KINDS = {
  uniao: 'União',
  associacao: 'Associação',
  missao: 'Missão',
  campo: 'Campo',
};

/** Minúsculas, sem acentos nem pontuação, espaços simples. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[–—-]/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave de distrito: sem o "Distrito do/da/de" do início. */
export function districtKey(name) {
  return normalizeName(name).replace(/^distrito( (de|do|da|dos|das))? /, '');
}

const TITLES = [
  [/^(pr|pastor)\.?\s+/i, 'Pr.'],
  [/^(anc|anciao|ancião)\.?\s+/i, 'Anc.'],
  [/^(dr|doutor)\.?\s+/i, 'Dr.'],
  [/^(prof|professor)\.?\s+/i, 'Prof.'],
];

/** "Pr. Enoque Paulino" → { title: 'Pr.', name: 'Enoque Paulino' }. */
export function splitTitle(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  for (const [re, title] of TITLES) {
    if (re.test(text)) return { title, name: text.replace(re, '').trim() };
  }
  return { title: '', name: text };
}

/** Cargo como vem no ficheiro → chave de `pastors.role`. */
export function roleFromCargo(cargo) {
  const c = normalizeName(cargo);
  if (!c) return 'outro';
  if (c.startsWith('presidente')) return 'presidente';
  if (c.startsWith('secretario')) return 'secretario_executivo';
  if (c.startsWith('tesoureiro')) return 'tesoureiro';
  if (c.includes('jubilado')) return 'pastor_jubilado';
  if (c.includes('departamental')) return 'pastor_departamental';
  if (c.includes('licenciado')) return 'pastor_licenciado';
  if (c.includes('distrital')) return 'pastor_distrital';
  if (c.startsWith('professor')) return 'professor';
  if (c.startsWith('auditor')) return 'auditor';
  if (c.includes('livraria')) return 'director_livraria';
  if (c.startsWith('lider')) return 'lider';
  return 'outro';
}

// Nomes antigos ou abreviados → nome RGPH-2024.
const PROVINCE_ALIASES = {
  quando: 'cuando',
  kuando: 'cuando',
  kubango: 'cubango',
  bie: 'bie',
  'kuanza norte': 'cuanza norte',
  'kuanza sul': 'cuanza sul',
  uige: 'uige',
  huila: 'huila',
};

export function matchProvince(name, provinces) {
  const n = normalizeName(name);
  if (!n) return null;
  const target = PROVINCE_ALIASES[n] || n;
  return (provinces || []).find((p) => normalizeName(p.name) === target) || null;
}

const MUNICIPALITY_ALIASES = { kuito: 'cuito', caala: 'caala', bailundo: 'bailundo' };

export function matchMunicipality(name, provinceId, municipalities) {
  const n = normalizeName(name);
  if (!n) return null;
  const target = MUNICIPALITY_ALIASES[n] || n;
  const inProvince = (municipalities || []).filter((m) => !provinceId || m.province === provinceId);
  return inProvince.find((m) => normalizeName(m.name) === target) || null;
}

/** Distância de edição (Levenshtein). */
export function editDistance(a, b) {
  const s = String(a);
  const t = String(b);
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, i) => i);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/** 1 = iguais; 0 = nada em comum. Sobre os nomes normalizados. */
export function similarity(a, b) {
  const s = normalizeName(a);
  const t = normalizeName(b);
  if (!s || !t) return 0;
  return 1 - editDistance(s, t) / Math.max(s.length, t.length);
}

// O "distrito" do pastores.json que não é um distrito.
const POSTING_PATTERNS = [
  /^presidente/, /^secretario/, /^tesoureiro/, /^jubilado/, /^livraria/, /^auditoria/, /^ispab/,
];
const FIELD_PATTERN = /^(missao|uniao|associacao)\b/;

function fieldKindFor(name) {
  const n = normalizeName(name);
  if (n.startsWith('uniao')) return 'uniao';
  if (n.startsWith('associacao')) return 'associacao';
  return 'missao';
}

const PHONE_RE = /^9\d{8}$/;

/** Telefones em sequência (3 ou mais números seguidos) — quase sempre preenchidos à mão. */
export function sequentialPhones(phones) {
  const nums = [...new Set(phones.filter((p) => PHONE_RE.test(p)))].map(Number).sort((a, b) => a - b);
  const out = new Set();
  let run = [nums[0]];
  for (let i = 1; i <= nums.length; i++) {
    if (i < nums.length && nums[i] === run[run.length - 1] + 1) { run.push(nums[i]); continue; }
    if (run.length >= 3) run.forEach((n) => out.add(String(n)));
    run = [nums[i]];
  }
  return out;
}

/**
 * Monta o plano de importação.
 * @param {object} input
 * @param {Array} input.churches  conteúdo do churches.json
 * @param {Array} input.pastors   conteúdo do pastores.json
 * @param {Array} input.provinces [{id, name}]
 * @param {Array} input.municipalities [{id, name, province}]
 * @param {object} input.defaultField {name, short_name, kind} — campo de quem não indica outro
 */
export function buildImportPlan({ churches = [], pastors = [], provinces = [], municipalities = [], defaultField }) {
  const warnings = [];
  const warn = (level, message, ref = '') => warnings.push({ level, message, ref });
  const provinceName = (id) => provinces.find((p) => p.id === id)?.name || '';

  // Campos -----------------------------------------------------------------------------
  const fields = new Map(); // normalizado → item
  const def = {
    key: 'f1',
    name: String(defaultField?.name || '').trim() || 'Missão',
    short_name: String(defaultField?.short_name || '').trim(),
    kind: defaultField?.kind || 'missao',
  };
  fields.set(normalizeName(def.name), def);
  const fieldFor = (name) => {
    const n = normalizeName(name);
    // "Missão Centro" e "Missão Centro de Angola" são o mesmo campo.
    for (const [k, f] of fields) {
      if (k === n) return f;
      const [short, long] = k.length < n.length ? [k, n] : [n, k];
      if (short.split(' ').length >= 2 && long.startsWith(short + ' ')) return f;
    }
    const item = { key: `f${fields.size + 1}`, name: String(name).trim(), short_name: '', kind: fieldKindFor(name) };
    fields.set(n, item);
    return item;
  };

  // Distritos --------------------------------------------------------------------------
  const districts = new Map(); // `${provinceId}|${districtKey}` → item
  const districtFor = (name, provinceId, source) => {
    const key = `${provinceId || ''}|${districtKey(name)}`;
    let d = districts.get(key);
    if (!d) {
      d = { key: `d${districts.size + 1}`, field_key: def.key, name: String(name).replace(/\s+/g, ' ').trim(), province_id: provinceId || '', municipality_id: '', sources: new Set(), _munis: new Map() };
      districts.set(key, d);
    }
    d.sources.add(source);
    return d;
  };

  // Igrejas ------------------------------------------------------------------------------
  const churchItems = [];
  const seenCn = new Map();
  churches.forEach((c, i) => {
    const ref = `Igreja ${c.cn || i + 1} · ${c.nome || ''}`;
    const prov = matchProvince(c.provincia, provinces);
    if (!prov && c.provincia) warn('erro', `Província desconhecida: "${c.provincia}".`, ref);
    const muni = matchMunicipality(c.municipio, prov?.id, municipalities);
    if (!muni && c.municipio) warn('aviso', `Município "${c.municipio}" não encontrado em ${prov?.name || 'nenhuma província'}.`, ref);
    const d = c.distrito ? districtFor(c.distrito, prov?.id, 'igrejas') : null;
    if (!d) warn('aviso', 'Igreja sem distrito.', ref);
    if (d && muni) d._munis.set(muni.id, (d._munis.get(muni.id) || 0) + 1);
    const cn = String(c.cn ?? '').trim();
    if (cn && seenCn.has(cn)) warn('erro', `Número de igreja ${cn} repetido (também em "${seenCn.get(cn)}"). Só a primeira é importada.`, ref);
    if (cn && seenCn.has(cn)) return;
    if (cn) seenCn.set(cn, c.nome);
    churchItems.push({
      key: `c${churchItems.length + 1}`,
      cn: /^[0-9A-Za-z-]{1,12}$/.test(cn) ? cn : '',
      name: String(c.nome || '').trim(),
      district_key: d?.key || '',
      province_id: prov?.id || '',
      municipality_id: muni?.id || '',
      delegate_name: String(c.delegado || '').trim(),
      delegate_pastor_key: '',
      congress_label: String(c.data_congresso || '').trim(),
      _ref: ref,
    });
  });

  // Pastores ------------------------------------------------------------------------------
  const pastorItems = [];
  const byName = new Map();
  const assignments = [];
  const titulars = new Map(); // district key → pastor name
  pastors.forEach((p, i) => {
    const { title, name } = splitTitle(p.nome);
    const ref = `Pastor ${p.id ?? i + 1} · ${p.nome || ''}`;
    if (!name) { warn('erro', 'Pastor sem nome — ignorado.', ref); return; }
    const n = normalizeName(name);
    if (byName.has(n)) { warn('aviso', `Pastor repetido no ficheiro ("${name}"). Fica só o primeiro.`, ref); return; }
    const role = roleFromCargo(p.cargo);
    const prov = matchProvince(p.provincia, provinces);
    if (!prov && p.provincia) warn('erro', `Província desconhecida: "${p.provincia}".`, ref);
    const raw = String(p.distrito || '').replace(/\s+/g, ' ').trim();
    const rawN = normalizeName(raw);
    let field = def;
    let posting = '';
    let district = null;
    if (!raw) {
      // nada
    } else if (POSTING_PATTERNS.some((re) => re.test(rawN))) {
      posting = raw;
    } else if (FIELD_PATTERN.test(rawN) && role !== 'pastor_distrital') {
      field = fieldFor(raw);
    } else if (provinces.some((pv) => normalizeName(pv.name) === rawN)) {
      // "Huambo" como distrito: é a província, falta saber o distrito.
      posting = raw;
      if (role === 'pastor_distrital') warn('aviso', `Distrito indicado só como "${raw}" (nome da província). Fica sem distrito; atribua-o depois.`, ref);
    } else {
      district = districtFor(raw, prov?.id, 'pastores');
    }
    const phone = String(p.contacto ?? '').replace(/\D/g, '');
    if (phone && !PHONE_RE.test(phone)) warn('aviso', `Telefone "${p.contacto}" não parece um número angolano (9 dígitos a começar por 9).`, ref);
    const item = {
      key: `p${pastorItems.length + 1}`,
      title,
      name,
      role,
      field_key: field.key,
      province_id: prov?.id || '',
      posting,
      phone: phone.slice(0, 15),
      notes: '',
      _ref: ref,
      _district: district,
    };
    pastorItems.push(item);
    byName.set(n, item);
    if (district) {
      let kind = role === 'pastor_distrital' || role === 'lider' ? 'titular' : 'associado';
      if (kind === 'titular' && titulars.has(district.key)) {
        warn('aviso', `"${district.name}" já tem titular (${titulars.get(district.key)}); ${name} entra como associado.`, ref);
        kind = 'associado';
      }
      if (kind === 'titular') titulars.set(district.key, name);
      assignments.push({ pastor_key: item.key, district_key: district.key, kind });
    }
  });

  // Telefones repetidos ou em sequência.
  const phones = new Map();
  pastorItems.forEach((p) => { if (p.phone) phones.set(p.phone, [...(phones.get(p.phone) || []), p.name]); });
  for (const [phone, names] of phones) {
    if (names.length > 1) warn('aviso', `O telefone ${phone} aparece em ${names.join(' e ')}.`, 'Telefones');
  }
  const seq = sequentialPhones(pastorItems.map((p) => p.phone));
  if (seq.size) {
    const names = pastorItems.filter((p) => seq.has(p.phone)).map((p) => p.name);
    warn('aviso', `${seq.size} telefones em sequência (${[...seq].sort()[0]}…): parecem preenchidos à mão. Confirme-os: ${names.join(', ')}.`, 'Telefones');
  }

  // Delegados das igrejas → pastor, só com o nome igual; parecidos ficam como sugestão.
  const suggestions = [];
  churchItems.forEach((c) => {
    if (!c.delegate_name) return;
    const { name } = splitTitle(c.delegate_name);
    const exact = byName.get(normalizeName(name));
    if (exact) { c.delegate_pastor_key = exact.key; return; }
    let best = null;
    for (const p of pastorItems) {
      const s = similarity(name, p.name);
      if (s >= 0.8 && (!best || s > best.s)) best = { p, s };
    }
    if (best) {
      suggestions.push({ kind: 'delegado', a: c.delegate_name, b: `${best.p.title} ${best.p.name}`.trim(), score: best.s, ref: c._ref });
    }
  });

  // Município de cada distrito: o mais comum entre as suas igrejas.
  for (const d of districts.values()) {
    const top = [...d._munis.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) d.municipality_id = top[0];
  }

  // Distritos parecidos na mesma província (sugestão de fusão).
  const ds = [...districts.values()];
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      const a = ds[i];
      const b = ds[j];
      if (a.province_id !== b.province_id) continue;
      const ka = districtKey(a.name);
      const kb = districtKey(b.name);
      const contains = ka.length >= 5 && kb.length >= 5 && (ka.includes(kb) || kb.includes(ka));
      const s = similarity(ka, kb);
      if (contains || s >= 0.8) suggestions.push({ kind: 'distrito', a: a.name, b: b.name, score: contains ? Math.max(s, 0.8) : s, ref: provinceName(a.province_id) });
    }
  }
  // Pastores parecidos.
  for (let i = 0; i < pastorItems.length; i++) {
    for (let j = i + 1; j < pastorItems.length; j++) {
      const s = similarity(pastorItems[i].name, pastorItems[j].name);
      if (s >= 0.85) suggestions.push({ kind: 'pastor', a: pastorItems[i].name, b: pastorItems[j].name, score: s, ref: 'Pastores' });
    }
  }

  const strip = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_') && k !== 'sources'));
  const plan = {
    fields: [...fields.values()].map(strip),
    districts: ds.map(strip),
    pastors: pastorItems.map(strip),
    assignments,
    churches: churchItems.map(strip),
  };

  const districtName = new Map(ds.map((d) => [d.key, d.name]));
  const fieldName = new Map(plan.fields.map((f) => [f.key, f.name]));
  const muniName = (id) => municipalities.find((m) => m.id === id)?.name || '';
  const preview = {
    fields: plan.fields.map((f) => ({ ...f, kindLabel: FIELD_KINDS[f.kind] || f.kind })),
    districts: ds.map((d) => ({
      key: d.key, name: d.name, province: provinceName(d.province_id), municipality: muniName(d.municipality_id),
      sources: [...d.sources].join(' + '), churches: churchItems.filter((c) => c.district_key === d.key).length,
      titular: titulars.get(d.key) || '',
    })),
    pastors: pastorItems.map((p) => ({
      key: p.key, title: p.title, name: p.name, role: PASTOR_ROLES[p.role] || p.role,
      field: fieldName.get(p.field_key) || '', province: provinceName(p.province_id),
      district: p._district ? p._district.name : '', posting: p.posting, phone: p.phone,
    })),
    churches: churchItems.map((c) => ({
      key: c.key, cn: c.cn, name: c.name, district: districtName.get(c.district_key) || '',
      province: provinceName(c.province_id), municipality: muniName(c.municipality_id),
      delegate: c.delegate_name, delegateLinked: !!c.delegate_pastor_key, congress: c.congress_label,
    })),
    suggestions: suggestions.sort((a, b) => b.score - a.score),
    counts: {
      fields: plan.fields.length, districts: plan.districts.length, pastors: plan.pastors.length,
      assignments: assignments.length, churches: plan.churches.length,
      errors: warnings.filter((w) => w.level === 'erro').length, warnings: warnings.filter((w) => w.level === 'aviso').length,
    },
  };
  return { plan, preview, warnings };
}

/** Lê o JSON de um ficheiro e confirma que é o que se espera. */
export function parseRegistryFile(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('O ficheiro não é JSON válido.'); }
  if (!Array.isArray(data)) throw new Error('O ficheiro tem de ser uma lista (JSON a começar por "[").');
  const sample = data.find((x) => x && typeof x === 'object') || {};
  if ('cn' in sample || 'delegado' in sample) return { kind: 'churches', rows: data };
  if ('cargo' in sample || 'contacto' in sample) return { kind: 'pastors', rows: data };
  throw new Error('Não reconheço o ficheiro: esperava igrejas (cn, nome, distrito…) ou pastores (nome, cargo, contacto…).');
}
