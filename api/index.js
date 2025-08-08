const axios = require('axios');

// Pega as chaves das variáveis de ambiente configuradas na Vercel
const SPTRANS_TOKEN = process.env.SPTRANS_TOKEN;
const Maps_API_KEY = process.env.Maps_API_KEY;

// URLs das APIs externas
const SPTRANS_API_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';
const GOOGLE_ROUTES_API_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const METRO_CPTM_API_URL = 'https://www.diretodostrens.com.br/api/status';

// Variáveis de cache para otimizar as chamadas
let spTansCookie = null;
let painelCache = null;
let painelCacheTime = null;

// ===================================================================
// FUNÇÕES DE COLETA DE DADOS
// ===================================================================

async function autenticarSPTrans() {
    console.log("LOG: Tentando autenticar com SPTrans...");
    if (!SPTRANS_TOKEN) {
        console.error("LOG ERROR: Token da SPTrans não configurado.");
        throw new Error("Token da SPTrans não configurado.");
    }
    try {
        const response = await axios.post(`${SPTRANS_API_URL}/Login/Autenticar?token=${SPTRANS_TOKEN}`, {});
        if (response.data !== true) {
            console.error("LOG ERROR: Falha na autenticação. Token pode ser inválido.");
            throw new Error("Token da SPTrans é inválido ou expirou.");
        }
        spTansCookie = response.headers['set-cookie'][0];
        console.log('LOG: Autenticação com SPTrans renovada com sucesso!');
    } catch (error) {
        spTansCookie = null;
        console.error('LOG ERROR: Erro crítico ao autenticar com SPTrans:', error.message);
        throw error;
    }
}

function getRodizioData() {
    console.log("LOG: Calculando dados do rodízio...");
    const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    const hoje = new Date();
    hoje.setHours(hoje.getHours() - 3); // Ajusta para o fuso horário de São Paulo (UTC-3)
    const diaDaSemana = hoje.getDay();
    let placas = ['N/A'];
    switch (diaDaSemana) {
        case 1: placas = ['1', '2']; break;
        case 2: placas = ['3', '4']; break;
        case 3: placas = ['5', '6']; break;
        case 4: placas = ['7', '8']; break;
        case 5: placas = ['9', '0']; break;
    }
    console.log("LOG: Dados do rodízio calculados.");
    return { dia: dias[diaDaSemana], placas: placas };
}

async function getBusSpeedData() {
    console.log("LOG: Buscando dados de velocidade dos ônibus...");
    try {
        await axios.get(`${SPTRANS_API_URL}/Corredor`, { headers: { 'Cookie': spTansCookie } });
        console.log("LOG: Dados de corredores recebidos com sucesso da SPTrans.");
        return { centroBairro: 18, bairroCentro: 19 }; // Retornando dados de exemplo
    } catch (error) {
        console.error("LOG ERROR: Erro ao buscar dados de velocidade dos ônibus:", error.message);
        return { centroBairro: '--', bairroCentro: '--' };
    }
}

async function getTrafficData() {
    console.log("LOG: Buscando dados de tráfego do Google...");
    if (!Maps_API_KEY) {
        console.error("LOG ERROR: Chave da API do Google Maps não configurada!");
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
        const headers = {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': Maps_API_KEY,
            'X-Goog-FieldMask': 'routes.duration,routes.staticDuration'
        };
        const body = {
            origin: { location: { latLng: { latitude: rota.start.lat, longitude: rota.start.lng } } },
            destination: { location: { latLng: { latitude: rota.end.lat, longitude: rota.end.lng } } },
            travelMode: 'DRIVE',
            routingPreference: 'TRAFFIC_AWARE'
        };
        try {
            const response = await axios.post(GOOGLE_ROUTES_API_URL, body, { headers });
            const routeInfo = response.data.routes[0];
            const duracaoComTransito = parseInt(routeInfo.duration.slice(0, -1));
            const duracaoSemTransito = parseInt(routeInfo.staticDuration.slice(0, -1));
            if (duracaoSemTransito === 0) return { zona: rota.zona, km: 0 };
            const atrasoPercentual = (duracaoComTransito - duracaoSemTransito) / duracaoSemTransito;
            const kmDeLentidao = Math.round(rota.distanciaKm * atrasoPercentual * 2.5);
            return { zona: rota.zona, km: Math.max(0, kmDeLentidao) };
        } catch (error) {
            console.error(`LOG ERROR: Erro ao buscar dados da rota ${rota.nome}:`, error.response?.data?.error?.message || error.message);
            return { zona: rota.zona, km: 0 };
        }
    });
    const resultados = await Promise.all(promessasDeRotas);
    const lentidaoPorRegiao = resultados.reduce((acc, current) => {
        acc[current.zona] = { km: current.km };
        return acc;
    }, {});
    console.log("LOG: Dados de tráfego do Google coletados.");
    return lentidaoPorRegiao;
}

async function getMetroCptmStatus() {
    console.log("LOG: Buscando status do Metrô/CPTM...");
    try {
        // --- INÍCIO DA MELHORIA ---
        // Mapeamento de número da linha para nome
        const nomesDasLinhas = {
            '1': 'Azul',
            '2': 'Verde',
            '3': 'Vermelha',
            '4': 'Amarela',
            '5': 'Lilás',
            '7': 'Rubi',
            '8': 'Diamante',
            '9': 'Esmeralda',
            '10': 'Turquesa',
            '11': 'Coral',
            '12': 'Safira',
            '13': 'Jade',
            '15': 'Prata'
        };

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        };
        const response = await axios.get(METRO_CPTM_API_URL, { headers });
        
        const linhas = response.data.map(item => {
            const numeroLinha = item.line || item.codigo;
            const nomeLinha = nomesDasLinhas[numeroLinha] || `Linha ${numeroLinha}`; // Usa o nome do mapa ou o padrão
            return {
                name: `${numeroLinha}-${nomeLinha}`,
                statusDescription: item.status || item.situacao
            };
        });
        // --- FIM DA MELHORIA ---

        console.log("LOG: Status do Metrô/CPTM recebido com sucesso.");
        return linhas.filter(l => l.statusDescription);
    } catch (error) {
        console.error("LOG ERROR: Erro ao buscar status do Metrô/CPTM:", error.message);
        return [];
    }
}

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

    if (path === '/painel-transito') {
        if (painelCache && painelCacheTime && (new Date() - painelCacheTime < 3 * 60 * 1000)) {
            console.log("LOG: Servindo dados do painel a partir do cache.");
            return res.status(200).json(painelCache);
        }
        try {
            console.log("LOG: Função principal iniciada. Buscando novos dados...");
            if (!spTansCookie) await autenticarSPTrans();

            console.log("LOG: Buscando todos os dados em paralelo...");
            const [trafficData, busData, rodizioData, metroCptmStatus] = await Promise.all([
                getTrafficData(),
                getBusSpeedData(),
                getRodizioData(),
                getMetroCptmStatus()
            ]);
            console.log("LOG: Todos os dados foram coletados.");

            const responseData = {
                lentidaoPorRegiao: trafficData,
                velocidadeOnibus: busData,
                rodizio: rodizioData,
                metroCptm: metroCptmStatus,
                ultimaAtualizacao: new Date().toISOString()
            };

            painelCache = responseData;
            painelCacheTime = new Date();
            console.log("LOG: Enviando resposta de sucesso.");
            return res.status(200).json(responseData);

        } catch (error) {
            console.error("ERRO FATAL NO HANDLER:", error.message);
            if (error.response) {
                console.error("Detalhes do erro (axios):", error.response.data);
            }
            painelCache = null;
            return res.status(503).json({ 
                error: "Erro ao processar a requisição no servidor.", 
                details: error.message 
            });
        }
    }

    return res.status(404).json({ error: "Endpoint não encontrado. Use /api?path=/painel-transito" });
};
