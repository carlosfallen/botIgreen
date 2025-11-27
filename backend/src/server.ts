import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import makeWASocket, { useMultiFileAuthState, DisconnectReason, downloadContentFromMessage } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import puppeteer from 'puppeteer';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

const NUMERO_AUTORIZADO = '5589994333316@s.whatsapp.net';
const sessoes: { [key: string]: string[] } = {};

let sock: any = null;
let qrCode: string | null = null;
let isConnected = false;

async function downloadMedia(msg: any) {
  const tipo = Object.keys(msg.message)[0];
  const stream = await downloadContentFromMessage(msg.message[tipo], 'image');
  let buffer = Buffer.from([]);
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }
  return buffer;
}

async function ocrImage(imagePath: string) {
  const img = fs.readFileSync(imagePath);
  const { data: { text } } = await Tesseract.recognize(img, 'por');
  return text;
}

function extrairDados(texto: string) {
  const cepMatch = texto.match(/\d{5}-\d{3}/);
  const cep = cepMatch ? cepMatch[0] : null;

  const numInstalacaoMatch = texto.match(/(Instalação|INSTALAÇÃO|Nº INSTALAÇÃO|UC)[^\d]*(\d{5,})/);
  const numInstalacao = numInstalacaoMatch ? numInstalacaoMatch[2] : null;

  const phoneMatch = texto.match(/(\(?\d{2}\)?\s?\d{4,5}-?\d{4})/);
  const telefone = phoneMatch ? phoneMatch[0].replace(/\D/g, '') : null;

  const emailMatch = texto.match(/([a-zA-Z0-9._%+-]+)@?gmail\.com/);
  let email = null;
  if (emailMatch) {
    const firstPart = emailMatch[1].replace(/@.*/, '');
    email = `${firstPart}@gmail.com`;
  }

  const nomeMatch = texto.match(/NOME[:\s]+([A-ZÀ-Ú\s]{5,})/i);
  const nome = nomeMatch ? nomeMatch[1].trim() : null;

  const cpfMatch = texto.match(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/);
  const cpf = cpfMatch ? cpfMatch[0] : null;

  const ruaMatch = texto.match(/(RUA|AV|AVENIDA|TRAVESSA|R\.)[^\n]{5,}/i);
  const rua = ruaMatch ? ruaMatch[0].trim() : null;

  const numeroMatch = texto.match(/N[ºÚ°]?\s*(\d+)/i);
  const numero = numeroMatch ? numeroMatch[1] : null;

  const bairroMatch = texto.match(/BAIRRO[:\s]+([A-ZÀ-Ú\s]{3,})/i);
  const bairro = bairroMatch ? bairroMatch[1].trim() : null;

  const cidadeMatch = texto.match(/CIDADE[:\s]+([A-ZÀ-Ú\s]{3,})/i);
  const cidade = cidadeMatch ? cidadeMatch[1].trim() : 'Marabá';

  const estadoMatch = texto.match(/ESTADO[:\s]+([A-Z]{2})/i);
  const estado = estadoMatch ? estadoMatch[1].toUpperCase() : 'PA';

  return {
    nome,
    cpf,
    telefone,
    email,
    numInstalacao,
    endereco: { rua, numero, bairro, cidade, estado, cep }
  };
}

async function processarDocumento(imagePaths: any) {
  const textoConta = await ocrImage(imagePaths.conta);
  const textoFrente = await ocrImage(imagePaths.frente);
  const textoVerso = await ocrImage(imagePaths.verso);

  const textoCompleto = `${textoFrente}\n${textoVerso}\n${textoConta}`;
  const dados = extrairDados(textoCompleto);

  return { ...dados, imagens: imagePaths };
}

async function enviarCadastroIgreen(dados: any) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('https://digital.igreenenergy.com.br/?id=107315', {
    waitUntil: 'networkidle2'
  });

  await page.type('#nome', dados.nome || '');
  await page.type('#cpf', dados.cpf || '');
  await page.type('#email', dados.email || '');
  await page.type('#telefone', dados.telefone || '');
  await page.type('#cep', dados.endereco.cep || '');
  await page.type('#rua', dados.endereco.rua || '');
  await page.type('#numero', dados.endereco.numero || '');
  await page.type('#bairro', dados.endereco.bairro || '');
  await page.type('#cidade', dados.endereco.cidade || '');
  await page.select('#estado', dados.endereco.estado || 'PA');
  await page.type('#numeroInstalacao', dados.numInstalacao || '');

  const inputFrente = await page.$('input[name="doc_frente"]');
  await inputFrente?.uploadFile(dados.imagens.frente);

  const inputVerso = await page.$('input[name="doc_verso"]');
  await inputVerso?.uploadFile(dados.imagens.verso);

  const inputConta = await page.$('input[name="conta_luz"]');
  await inputConta?.uploadFile(dados.imagens.conta);

  await page.click('#btn-enviar');
  await page.waitForTimeout(5000);
  await browser.close();
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth');
  
  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update: any) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCode = qr;
      io.emit('qr', qr);
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      isConnected = false;
      io.emit('status', { connected: false });
      
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      isConnected = true;
      qrCode = null;
      io.emit('status', { connected: true });
      io.emit('message', { type: 'success', text: 'WhatsApp conectado com sucesso!' });
    }
  });

  sock.ev.on('messages.upsert', async (m: any) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const remoteJid = msg.key.remoteJid;
    if (remoteJid !== NUMERO_AUTORIZADO) return;

    const tipo = Object.keys(msg.message)[0];
    if (tipo === 'imageMessage') {
      const buffer = await downloadMedia(msg);
      const folder = path.join(__dirname, 'data', 'raw', remoteJid.replace('@s.whatsapp.net', ''));
      fs.mkdirSync(folder, { recursive: true });

      if (!sessoes[remoteJid]) sessoes[remoteJid] = [];
      
      const timestamp = Date.now();
      const filename = path.join(folder, `${timestamp}.jpg`);
      fs.writeFileSync(filename, buffer);

      sessoes[remoteJid].push(filename);

      io.emit('message', { 
        type: 'info', 
        text: `Imagem ${sessoes[remoteJid].length}/3 recebida` 
      });

      if (sessoes[remoteJid].length === 3) {
        io.emit('message', { type: 'info', text: 'Processando documentos...' });

        const imagePaths = {
          frente: sessoes[remoteJid][0],
          verso: sessoes[remoteJid][1],
          conta: sessoes[remoteJid][2]
        };

        try {
          const dados = await processarDocumento(imagePaths);
          
          io.emit('message', { type: 'info', text: 'Preenchendo formulário Igreen...' });
          await enviarCadastroIgreen(dados);

          const mensagem = `✅ Cadastro concluído!\n\nNome: ${dados.nome}\nCPF: ${dados.cpf}\nInstalação: ${dados.numInstalacao}\nCEP: ${dados.endereco.cep}`;
          
          await sock.sendMessage(remoteJid, { text: mensagem });

          io.emit('message', { 
            type: 'success', 
            text: 'Cadastro concluído e enviado!',
            data: dados
          });

          delete sessoes[remoteJid];
        } catch (error: any) {
          io.emit('message', { 
            type: 'error', 
            text: `Erro: ${error.message}` 
          });
        }
      }
    }
  });
}

app.get('/status', (req, res) => {
  res.json({ connected: isConnected, qrCode });
});

io.on('connection', (socket) => {
  console.log('Cliente conectado');
  
  if (qrCode) {
    socket.emit('qr', qrCode);
  }
  
  socket.emit('status', { connected: isConnected });
});

const PORT = process.env.PORT || 3001;

httpServer.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  connectToWhatsApp();
});