/**
 * Resumo do registo da Igreja por província e lista do que falta completar. Código puro.
 * @param reg  tabelas carregadas (loadRegistry)
 * @param idx  indexRegistry(reg)
 */
export function registrySummary(reg, idx) {
  const activeDistricts = reg.districts.filter((d) => d.active);
  const activeChurches = reg.churches.filter((c) => c.active);
  const activePastors = reg.pastors.filter((p) => p.status === 'activo');

  const byProvince = new Map();
  const row = (id) => {
    if (!byProvince.has(id)) byProvince.set(id, { id, name: idx.provinceName(id) || 'Sem província', districts: 0, churches: 0, pastors: 0, munis: new Set() });
    return byProvince.get(id);
  };
  activeDistricts.forEach((d) => { row(d.province_id || '').districts += 1; });
  activeChurches.forEach((c) => {
    const r = row(c.province_id || '');
    r.churches += 1;
    if (c.municipality_id) r.munis.add(idx.municipalityName(c.municipality_id));
  });
  activePastors.forEach((p) => { row(p.province_id || '').pastors += 1; });

  const order = new Map(reg.provinces.map((p, i) => [p.id, p.sort_order ?? i]));
  const provinces = [...byProvince.values()]
    .sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1) || (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99))
    .map(({ munis, ...r }) => ({ ...r, municipalities: [...munis].sort() }));

  const issues = [
    { key: 'sem-titular', tab: 'distritos', label: 'distritos activos sem pastor titular', count: activeDistricts.filter((d) => !idx.titularOf.has(d.id)).length },
    { key: 'sem-provincia', tab: 'distritos', label: 'distritos sem província', count: activeDistricts.filter((d) => !d.province_id).length },
    { key: 'igreja-sem-distrito', tab: 'igrejas', label: 'igrejas sem distrito', count: activeChurches.filter((c) => !c.district_id).length },
    { key: 'igreja-sem-municipio', tab: 'igrejas', label: 'igrejas sem município', count: activeChurches.filter((c) => !c.municipality_id).length },
    { key: 'distrital-sem-distrito', tab: 'pastores', label: 'pastores distritais sem distrito', count: activePastors.filter((p) => p.role === 'pastor_distrital' && !idx.districtsOfPastor.has(p.id)).length },
    { key: 'sem-telefone', tab: 'pastores', label: 'pastores sem telefone', count: activePastors.filter((p) => !p.phone).length },
  ].filter((i) => i.count > 0);

  return {
    totals: { districts: activeDistricts.length, churches: activeChurches.length, pastors: activePastors.length },
    byProvince: provinces,
    issues,
  };
}
