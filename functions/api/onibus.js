export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/onibus') {
      const endpoints = [
        { url: 'https://its.mobilidade.rio/v1/geolocalizacao/veiculos', tipo: 'ITS Central' },
        { url: 'https://dados.mobilidade.rio/sistema-rio/maxtrack/gps', tipo: 'Sistema RIO' },
        { url: 'https://dados.mobilidade.rio/gps/brt', tipo: 'BRT Rio' },
        { url: 'https://dados.mobilidade.rio/sppo/conecta/gps', tipo: 'SPPO Conecta' },
        { url: 'https://dados.mobilidade.rio/sppo/zirix/gps', tipo: 'SPPO Zirix' }
      ];

      const promessas = endpoints.map(async (fonte) => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 7000);
          
          const res = await fetch(fonte.url, {
            headers: { 
              'User-Agent': 'Mozilla/5.0 (compatible; RioBusTracker/1.0)',
              'Accept': 'application/json'
            },
            signal: controller.signal
          });
          clearTimeout(timeout);

          if (!res.ok) return [];
          const json = await res.json();
          
          // Suporta array direto, { data: [...] }, { veiculos: [...] } ou { results: [...] }
          const registros = Array.isArray(json) 
            ? json 
            : (json.data || json.veiculos || json.results || json.veiculo || []);
          
          return registros
            .map((item, idx) => normalizarVeiculo(item, fonte.tipo, idx))
            .filter(Boolean);
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
            if (v && v.ordem) {
              // Se tiver ordem real, evita duplicados entre as APIs
              if (v.ordem.startsWith('AUTO_') || !ordensVistas.has(v.ordem)) {
                ordensVistas.add(v.ordem);
                veiculosUnificados.push(v);
              }
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
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=15, s-maxage=15'
        }
      });
    }

    return new Response("RioBus API Online. Acesse /api/onibus", {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
};

function normalizarVeiculo(v, fonte, idx) {
  const lat = parseFloat(v.latitude || v.lat || 0);
  const lon = parseFloat(v.longitude || v.long || v.lng || v.lon || 0);

  // Filtra coordenadas válidas da Região Metropolitana do Rio
  if (isNaN(lat) || isNaN(lon) || lat > -22.5 || lat < -23.2 || lon > -43.0 || lon < -43.8) {
    return null;
  }

  // Mapeia todas as variações de campos da SMTR, BRT e telemetrias
  const ordem = String(
    v.id_veiculo || v.codigo || v.ordem || v.veiculo || v.id || v.numero_ordem || `AUTO_${idx}_${lat.toFixed(4)}`
  ).trim();

  let linha = String(
    v.servico || v.linha || v.route_id || v.linha_id || 'S/L'
  ).trim();

  // Caso venha linha vazia ou 0 (comum no BRT fora de viagem)
  if (!linha || linha === '0') linha = 'S/L';

  return {
    ordem: ordem,
    linha: linha,
    lat: lat,
    lon: lon,
    velocidade: parseFloat(v.velocidade || v.speed || 0),
    sentido: String(v.sentido || v.direcao || 'N/D'),
    atualizacao: v.datahora || v.data_hora || v.dataHora || v.timestamp || new Date().toISOString(),
    fonte: v.modo ? `${v.modo.toUpperCase()} (${fonte})` : fonte
  };
}
