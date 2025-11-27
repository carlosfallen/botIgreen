import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import QRCode from 'react-qr-code';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, AlertCircle, Loader2, Smartphone } from 'lucide-react';

interface Message {
  type: 'success' | 'error' | 'info';
  text: string;
  data?: any;
}

function App() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);

  useEffect(() => {
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    newSocket.on('qr', (qr: string) => {
      setQrCode(qr);
      setConnected(false);
    });

    newSocket.on('status', (status: { connected: boolean }) => {
      setConnected(status.connected);
      if (status.connected) {
        setQrCode(null);
      }
    });

    newSocket.on('message', (msg: Message) => {
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      newSocket.close();
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold text-white">Bot Igreen</h1>
          <p className="text-slate-400">Sistema de Cadastro Automático</p>
        </div>

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">Status da Conexão</CardTitle>
                <CardDescription className="text-slate-400">
                  Número: 89 99433-3316
                </CardDescription>
              </div>
              {connected ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/50">
                  <CheckCircle2 className="w-4 h-4 mr-1" />
                  Conectado
                </Badge>
              ) : (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/50">
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Aguardando
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!connected && qrCode ? (
              <div className="space-y-4">
                <div className="bg-white p-6 rounded-lg w-fit mx-auto">
                  <QRCode value={qrCode} size={256} />
                </div>
                <div className="flex items-center justify-center gap-2 text-slate-300">
                  <Smartphone className="w-5 h-5" />
                  <p>Escaneie o QR Code com seu WhatsApp</p>
                </div>
              </div>
            ) : connected ? (
              <Alert className="bg-green-500/10 border-green-500/50">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <AlertDescription className="text-green-400">
                  WhatsApp conectado! Aguardando envio de documentos...
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex items-center justify-center gap-2 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
                <p>Iniciando conexão...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {messages.length > 0 && (
          <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-white">Log de Atividades</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-96 overflow-y-auto">
              {messages.map((msg, idx) => (
                <Alert
                  key={idx}
                  className={`${
                    msg.type === 'success'
                      ? 'bg-green-500/10 border-green-500/50'
                      : msg.type === 'error'
                      ? 'bg-red-500/10 border-red-500/50'
                      : 'bg-blue-500/10 border-blue-500/50'
                  }`}
                >
                  {msg.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : msg.type === 'error' ? (
                    <AlertCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                  )}
                  <AlertDescription
                    className={`${
                      msg.type === 'success'
                        ? 'text-green-400'
                        : msg.type === 'error'
                        ? 'text-red-400'
                        : 'text-blue-400'
                    }`}
                  >
                    {msg.text}
                  </AlertDescription>
                </Alert>
              ))}
            </CardContent>
          </Card>
        )}

        <Card className="border-slate-700 bg-slate-800/50 backdrop-blur">
          <CardHeader>
            <CardTitle className="text-white">Como Usar</CardTitle>
          </CardHeader>
          <CardContent className="text-slate-300 space-y-2">
            <p>1. Escaneie o QR Code com seu WhatsApp</p>
            <p>2. Envie 3 fotos para o número 89 99433-3316:</p>
            <ul className="list-disc list-inside pl-4 space-y-1">
              <li>Foto da frente do documento</li>
              <li>Foto do verso do documento</li>
              <li>Foto da conta de luz</li>
            </ul>
            <p>3. O sistema processará automaticamente e preencherá o formulário</p>
            <p>4. Você receberá uma confirmação no WhatsApp</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default App;