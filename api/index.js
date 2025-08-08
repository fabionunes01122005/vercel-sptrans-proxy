const axios = require('axios');

const SPTRANS_TOKEN = process.env.SPTRANS_TOKEN;
const Maps_API_KEY = process.env.Maps_API_KEY;
// ... (outras constantes e variáveis de cache)

// ... (funções autenticarSPTrans, getRodizioData, getBusSpeedData, getTrafficData) ...

// ===================================================================
// FUNÇÃO SERVERLESS PRINCIPAL (HANDLER)
// ===================================================================
module.exports = async (req, res) => {
    // Define os headers de CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { path } = req.query;

    try {
        // Garante a autenticação com a SPTrans para qualquer chamada
        if (!spTansCookie) {
            await autenticarSPTrans();
        }

        // --- LÓGICA DE ROTEAMENTO ---
        if (path === '/painel-transito') {
            // Se a chamada for para o painel, executa a lógica do painel
            const painelData = await getPainelData();
            return res.status(200).json(painelData);

        } else if (path) {
            // Se for qualquer outro 'path', atua como um proxy genérico
            delete req.query.path;
            const params = new URLSearchParams(req.query).toString();
            const apiUrl = `${SPTRANS_API_URL}${path}?${params}`;
            
            const response = await axios.get(apiUrl, {
                headers: { 'Cookie': spTansCookie }
            });
            return res.status(200).json(response.data);

        } else {
            // Se nenhum 'path' for fornecido
            return res.status(400).json({ error: "O parâmetro 'path' é obrigatório." });
        }
        // --- FIM DA LÓGICA DE ROTEAMENTO ---

    } catch (error) {
        console.error("ERRO GERAL NO HANDLER:", error.message);
        if (error.response) {
            console.error("Detalhes do erro (axios):", error.response.data);
        }
        return res.status(503).json({ 
            error: "Erro ao processar a requisição no servidor.", 
            details: error.message 
        });
    }
};

// Função auxiliar para organizar a lógica do painel e o cache
async function getPainelData() {
    if (painelCache && painelCacheTime && (new Date() - painelCacheTime < 3 * 60 * 1000)) {
        console.log("Servindo dados do painel a partir do cache.");
        return painelCache;
    }

    console.log("Buscando novos dados para o painel...");
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

// ... (Cole aqui as funções completas: autenticarSPTrans, getRodizioData, getBusSpeedData, getTrafficData)
