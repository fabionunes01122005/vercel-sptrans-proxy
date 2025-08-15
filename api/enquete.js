// api/enquete.js
import { kv } from '@vercel/kv';

export default async function handler(request, response) {
    // Permite que a aplicação da TV acesse esta API
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (request.method === 'OPTIONS') {
        return response.status(200).end();
    }

    // Rota para buscar os votos atuais
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

    // Rota para registrar um novo voto
    if (request.method === 'POST') {
        try {
            const { option } = request.body;
            if (!['sim', 'nao', 'melhorar'].includes(option)) {
                return response.status(400).json({ error: 'Opção de voto inválida.' });
            }
            await kv.incr(`votos_${option}`); // Incrementa a chave correta
            return response.status(200).json({ success: true });
        } catch (error) {
            return response.status(500).json({ error: 'Erro ao registrar voto.' });
        }
    }

    return response.status(404).json({ error: 'Endpoint não encontrado.' });
}