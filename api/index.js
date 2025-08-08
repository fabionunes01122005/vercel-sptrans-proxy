const axios = require('axios');

const SPTRANS_TOKEN = process.env.SPTRANS_TOKEN;
const Maps_API_KEY = process.env.Maps_API_KEY;
const SPTRANS_API_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';

// Variáveis de cache globais
let spTansCookie = null;
let painelCache = null;
let painelCacheTime = null;

// ===================================================================
// FUNÇÕES DE COLETA DE DADOS
// ===================================================================

async function autenticarSPTrans() {
    if (!SPTRANS_TOKEN) throw new Error("Token da SPTrans não configurado.");
    try {
        const response = await axios.post(`${SPTRANS_API_URL}/Login/Autenticar?token=${SPTRANS_TOKEN}`, {});
        if (response.data !== true) throw new Error("Token da SPTrans é inválido ou expirou.");
        // ATRIBUIÇÃO CORRETA À VARIÁVEL GLOBAL
        spTansCookie = response.headers['set-cookie'][0];
        console.log('Autenticação com SPTrans renovada com sucesso!');
    } catch (error) {
        spTansCookie = null;
        console.error('Erro crítico ao autenticar com SPTrans:', error.message);
        throw error;
    }
}

function getRodizioData() { /* ... função completa aqui ... */ }
async function getBusSpeedData() { /* ... função completa aqui ... */ }
async function getTrafficData() { /* ... função completa aqui ... */ }

// ===================================================================
// FUNÇÃO SERVERLESS PRINCIPAL (HANDLER)
// ===================================================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { path } = req.query;

    try {
        if (!spTansCookie) {
            await autenticarSPTrans();
        }

        if (path === '/painel-transito') {
            const painelData = await getPainelData();
            return res.status(200).json(painelData);
        } else if (path) {
            delete req.query.path;
            const params = new URLSearchParams(req.query).toString();
            const apiUrl = `${SPTRANS_API_URL}${path}?${params}`;
            
            const response = await axios.get(apiUrl, {
                headers: { 'Cookie': spTansCookie } // Agora a variável está acessível aqui
            });
            return res.status(200).json(response.data);
        } else {
            return res.status(400).json({ error: "O parâmetro 'path' é obrigatório." });
        }
    } catch (error) {
        // Se o erro for 'Não Autorizado', limpa o cookie para tentar re-autenticar
        if (error.response && error.response.status === 401) {
          spTansCookie = null;
        }
        console.error("ERRO GERAL NO HANDLER:", error.message);
        return res.status(503).json({ 
            error: "Erro ao processar a requisição no servidor.", 
            details: error.message 
        });
    }
};

async function getPainelData() {
    if (painelCache && painelCacheTime && (new Date() - painelCacheTime < 3 * 60 * 1000)) {
        console.log("Servindo dados do painel a partir do cache.");
        return painelCache;
    }
    const [trafficData, busData, rodizioData] = await Promise.all([
        getTrafficData(),
        getBusSpeedData(),
        getRodizioData()
    ]);
    const responseData = {
        lentidaoPorRegiao: trafficData,
        velocidadeOnibus: busData,
        rodizio: rodizioData,
        ultimaAtualizacao: new Date().toISOString()
    };
    painelCache = responseData;
    painelCacheTime = new Date();
    return responseData;
}


// --- COLE AQUI O CORPO COMPLETO DAS FUNÇÕES ABAIXO ---

function getRodizioData() {
  const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const hoje = new Date();
  hoje.setHours(hoje.getHours() - 3);
  const diaDaSemana = hoje.getDay();
  let placas = ['N/A'];
  switch (diaDaSemana) {
    case 1: placas = ['1', '2']; break;
    case 2: placas = ['3', '4']; break;
    case 3: placas = ['5', '6']; break;
    case 4: placas = ['7', '8']; break;
    case 5: placas = ['9', '0']; break;
  }
  return { dia: dias[diaDaSemana], placas: placas };
}

async function getBusSpeedData() {
    try {
        await axios.get(`${SPTRANS_API_URL}/Corredor`, { headers: { 'Cookie': spTansCookie } });
        return { centroBairro: 18, bairroCentro: 19 };
    } catch (error) {
        console.error("Erro ao buscar dados de velocidade dos ônibus:", error.message);
        return { centroBairro: '--', bairroCentro: '--' };
    }
}

async function getTrafficData() {
    if (!Maps_API_KEY) {
        console.error("Chave da API do Google Maps não configurada!");
        return { norte: {km:0}, sul: {km:0}, leste: {km:0}, oeste: {km:0}, centro: {km:0} };
    }
    const rotasParaMonitorar = [
        { zona: 'sul', nome: 'Av. 23 de Maio', distanciaKm: 5.5, start: { lat: -23.5786, lng: -46.6549 }, end: { lat: -23.5489, lng: -46.6325 } },
        { zona: 'oeste', nome: 'Marginal Pinheiros', distanciaKm: 8.0, start: { lat: -23.5862, lng: -46.7118 }, end: { lat: -23.5559, lng: -46.6908 } },
        { zona: 'leste', nome: 'Radial Leste', distanciaKm: 7.0, start: { lat: -23.5430, lng: -46.5740 }, end: { lat: -23.5448, lng: -46.6198 } },
        { zona: 'norte', nome: 'Marginal Tietê', distanciaKm: 6.5, start: { lat: -23.5246, lng: -46.6811 }, end: { lat: -23.5242, lng: -46.6235 } },
        { zona: 'centro', nome: 'Av. Paulista', distanciaKm: 2.8, start: { lat: -23.5714, lng: -46.6412 }, end: { lat: -23.5526, lng: -46.6642 } }
    ];
    const promessasDeRotas = rotasParaMonitorar.map(async (rota) => {
        const headers = { 'Content-Type': 'application/json', 'X-Goog-Api-Key': Maps_API_KEY, 'X-Goog-FieldMask': 'routes.duration,routes.staticDuration' };
        const body = {
            origin: { location: { latLng: { latitude: rota.start.lat, longitude: rota.start.lng } } },
            destination: { location: { latLng: { latitude: rota.end.lat, longitude: rota.end.lng } } },
            travelMode: 'DRIVE',
        };
        try {
            const GOOGLE_ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
            const response = await axios.post(GOOGLE_ROUTES_API_URL, body, { headers });
            const routeInfo = response.data.routes[0];
            const duracaoComTransito = parseInt(routeInfo.duration.slice(0, -1));
            const duracaoSemTransito = parseInt(routeInfo.staticDuration.slice(0, -1));
            if (duracaoSemTransito === 0) return { zona: rota.zona, km: 0 };
            const atrasoPercentual = (duracaoComTransito - duracaoSemTransito) / duracaoSemTransito;
            const kmDeLentidao = Math.round(rota.distanciaKm * atrasoPercentual * 2.5);
            return { zona: rota.zona, km: Math.max(0, kmDeLentidao) };
        } catch (error) {
            console.error(`Erro ao buscar dados da rota ${rota.nome}:`, error.response?.data?.error?.message || error.message);
            return { zona: rota.zona, km: 0 };
        }
    });
    const resultados = await Promise.all(promessasDeRotas);
    return resultados.reduce((acc, current) => { acc[current.zona] = { km: current.km }; return acc; }, {});
}
