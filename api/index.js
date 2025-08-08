const axios = require('axios');

const SPTRANS_API_URL = 'https://api.olhovivo.sptrans.com.br/v2.1';
const SPTRANS_TOKEN = process.env.SPTRANS_TOKEN; // A Vercel usará esta variável de ambiente

let apiCookie = null; // Variável para armazenar o cookie de sessão

// Função para autenticar
async function autenticar() {
  try {
    const response = await axios.post(`${SPTRANS_API_URL}/Login/Autenticar?token=${SPTRANS_TOKEN}`, {});
    if (response.data === true) {
      apiCookie = response.headers['set-cookie'][0];
      return true;
    }
    return false;
  } catch (error) {
    console.error("Erro na autenticação com SPTrans:", error.message);
    return false;
  }
}

// Esta é a nossa função Serverless. É o que será executado quando a URL for chamada.
module.exports = async (req, res) => {
  // Se não temos um cookie, autentica.
  if (!apiCookie) {
    const autenticado = await autenticar();
    if (!autenticado) {
      return res.status(503).json({ error: "Falha ao autenticar com o serviço da SPTrans." });
    }
  }

  // Pega os parâmetros da URL da requisição original (ex: path=/Linha/Buscar&termosBusca=Lapa)
  const { path, ...queryParams } = req.query;
  const params = new URLSearchParams(queryParams).toString();

  if (!path) {
    return res.status(400).json({ error: "O parâmetro 'path' é obrigatório." });
  }

  try {
    const apiUrl = `${SPTRANS_API_URL}${path}?${params}`;
    const response = await axios.get(apiUrl, {
      headers: { 'Cookie': apiCookie }
    });

    // Adiciona headers para permitir que sua TV (ou qualquer outra origem) acesse a API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

    // Retorna os dados da SPTrans
    return res.status(200).json(response.data);

  } catch (error) {
    // Se o erro for 'Não Autorizado', limpa o cookie para tentar re-autenticar na próxima vez
    if (error.response && error.response.status === 401) {
      apiCookie = null;
    }
    return res.status(500).json({ error: "Erro ao consultar o recurso na SPTrans." });
  }
};
