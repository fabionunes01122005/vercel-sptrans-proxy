// Versão corrigida em formato CommonJS
const { kv } = require('@vercel/kv');

module.exports = async (request, response) => {
    // Configuração de CORS (essencial)
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Responde ao "preflight request" do navegador
    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Rota GET: Retorna os votos
    if (request.method === 'GET') {
        try {
            const [sim, nao, melhorar] = await kv.mget('votos_sim', 'votos_nao', 'votos_melhorar');
            return response.status(200).json({
                sim: Number(sim || 0),
                nao: Number(nao || 0),
                melhorar: Number(melhorar || 0),
            });
        } catch (error) {
            return response.status(500).json({ error: 'Erro ao buscar votos.' });
        }
    }

    // Rota POST: Registra um voto
    if (request.method === 'POST') {
        try {
            const { option } = request.body;
            if (!['sim', 'nao', 'melhorar'].includes(option)) {
                return response.status(400).json({ error: 'Opção de voto inválida.' });
            }
            await kv.incr(`votos_${option}`);
            return response.status(200).json({ success: true });
        } catch (error) {
            return response.status(500).json({ error: 'Erro ao registrar voto.' });
        }
    }

    // Se o método não for GET ou POST
    return response.status(405).json({ error: 'Método não permitido.' });
};