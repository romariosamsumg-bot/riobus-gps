export async function onRequestGet(context) {
  const endpoints = [
    { url: 'https://dados.mobilidade.rio/sistema-rio/maxtrack/gps', tipo: 'Sistema RIO' },
    { url: 'https://dados.mobilidade.rio/sppo/conecta/gps', tipo: 'SPPO Conecta' },
    { url: 'https://dados.mobilidade.rio/sppo/zirix/gps', tipo: 'SPPO Zirix' },
    { url: 'https://dados.mobilidade.rio/gps/brt', tipo: 'BRT Rio' },
    { url: 'https://its.mobilidade.rio/v1/geolocalizacao/veiculos', tipo: 'ITS Central' }
  ];

  const promessas = endpoints.map(async (fonte) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      
      const res = await fetch(fonte.url, {
        headers: { 'User-Agent': 'RioBusTracker/1.0' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (!res.ok) return [];
      const json = await res.json();
      const registros = Array.isArray(json) ? json : (json.veiculos || json.data || []);
      
      return registros.map(item => normalizarVeiculo(item, fonte.tipo)).filter(Boolean);
    } catch {
      return [];
    }
  });

  const resultados = await Promise.allSettled(promessas);
  const veiculosUnificados = [];
  const ordensVistas = new Set();

  for (const r of resultados) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const v of r.value) {
        if (v && v.ordem && !ordensVistas.has(v.ordem)) {
          ordensVistas.add(v.ordem);
          veiculosUnificados.push(v);
        }
      }
    }
  }

  return new Response(JSON.stringify({
    total: veiculosUnificados.length,
    timestamp: new Date().toISOString(),
    veiculos: veiculosUnificados
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=15, s-maxage=15'
    }
  });
}

function normalizarVeiculo(v, fonte) {
  const lat = parseFloat(v.latitude || v.lat || 0);
  const lon = parseFloat(v.longitude || v.long || v.lng || 0);

  if (isNaN(lat) || isNaN(lon) || lat > -22.5 || lat < -23.2 || lon > -43.0 || lon < -43.8) {
    return null;
  }

  const ordem = String(v.ordem || v.id || v.veiculo || '').trim();
  const linha = String(v.linha || v.servico || v.route_id || '').trim();

  return {
    ordem: ordem || 'N/D',
    linha: linha || 'N/D',
    lat: lat,
    lon: lon,
    velocidade: parseFloat(v.velocidade || v.speed || 0),
    sentido: v.sentido || v.direcao || 'N/D',
    atualizacao: v.datahora || v.datahoraenvio || v.timestamp || new Date().toISOString(),
    fonte: fonte
  };
}
