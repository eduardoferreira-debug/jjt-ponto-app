import React, { useState, useRef } from 'react';
import { supabase } from './supabase';
import {
  MapPin,
  CheckCircle,
  AlertTriangle,
  Clock,
  ArrowRight,
  User,
  Camera,
  RefreshCw,
} from 'lucide-react';

function calcularDistancia(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371e3;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function App() {
  const [nif, setNif] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [passo, setPasso] = useState<
    'identificacao' | 'gps' | 'camera' | 'preview' | 'sucesso'
  >('identificacao');
  const [funcionario, setFuncionario] = useState<any>(null);
  const [obraValidada, setObraValidada] = useState<any>(null);
  const [tipoRegisto, setTipoRegisto] = useState<'entrada' | 'saida'>(
    'entrada'
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fotoUri, setFotoUri] = useState<string | null>(null);

  const identificarTrabalhador = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErro('');
    try {
      const { data, error } = await supabase
        .from('funcionarios')
        .select('id, nome, empresa_id')
        .eq('nif', nif.trim())
        .single();
      if (error || !data)
        throw new Error('Trabalhador não encontrado. Verifica o NIF.');
      setFuncionario(data);
      verificarLocalizacao(data.id);
    } catch (err: any) {
      setErro(err.message);
      setLoading(false);
    }
  };

  const verificarLocalizacao = async (funcId: number) => {
    setPasso('gps');
    setErro('');
    if (!navigator.geolocation) {
      setErro('O teu telemóvel não suporta GPS ou está desativado.');
      setLoading(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const userLat = position.coords.latitude;
        const userLon = position.coords.longitude;
        try {
          const { data: obrasAtivas } = await supabase
            .from('obras')
            .select('*')
            .eq('status', 'ativa');
          if (!obrasAtivas || obrasAtivas.length === 0)
            throw new Error('Não existem estaleiros ativos.');

          let obraMaisProxima = null;
          let menorDistancia = Infinity;

          obrasAtivas.forEach((obra) => {
            const dist = calcularDistancia(
              userLat,
              userLon,
              obra.latitude,
              obra.longitude
            );
            if (dist < menorDistancia) {
              menorDistancia = dist;
              obraMaisProxima = { ...obra, distanciaCalculada: dist };
            }
          });

          if (
            obraMaisProxima &&
            menorDistancia <= (obraMaisProxima as any).raio_metros
          ) {
            setObraValidada(obraMaisProxima);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            const { data: ultimaPicagem } = await supabase
              .from('registos_ponto')
              .select('tipo')
              .eq('funcionario_id', funcId)
              .gte('data_hora', hoje.toISOString())
              .order('data_hora', { ascending: false })
              .limit(1)
              .single();

            setTipoRegisto(
              ultimaPicagem && ultimaPicagem.tipo === 'entrada'
                ? 'saida'
                : 'entrada'
            );
            setLoading(false);
            iniciarCamera();
          } else {
            throw new Error(
              `Demasiado longe! Encontras-te a ${Math.round(
                menorDistancia
              )} metros de distância do estaleiro.`
            );
          }
        } catch (err: any) {
          setErro(err.message);
          setLoading(false);
          setPasso('identificacao');
        }
      },
      () => {
        setErro(
          'Tens de dar permissão de Localização ao browser para picar o ponto!'
        );
        setLoading(false);
        setPasso('identificacao');
      },
      { enableHighAccuracy: true }
    );
  };

  const iniciarCamera = async () => {
    setPasso('camera');
    setErro('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setErro('Permissão de câmara negada ou indisponível.');
      setPasso('identificacao');
    }
  };

  const capturarFoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0);
      const urlBase64 = canvas.toDataURL('image/jpeg', 0.8);
      setFotoUri(urlBase64);
      const stream = video.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setPasso('preview');
    }
  };

  const repetirFoto = () => {
    setFotoUri(null);
    iniciarCamera();
  };

  const registarPontoFinal = async () => {
    setLoading(true);
    try {
      if (!fotoUri) throw new Error('A foto é obrigatória.');
      const res = await fetch(fotoUri);
      const blob = await res.blob();
      const nomeFicheiro = `${funcionario.id}_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from('fotos_ponto')
        .upload(nomeFicheiro, blob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('fotos_ponto')
        .getPublicUrl(nomeFicheiro);
      const fotoPublicUrl = publicUrlData.publicUrl;

      const { error } = await supabase.from('registos_ponto').insert([
        {
          funcionario_id: funcionario.id,
          obra_id: obraValidada.id,
          tipo: tipoRegisto,
          distancia_obra_metros: obraValidada.distanciaCalculada,
          foto_url: fotoPublicUrl,
        },
      ]);

      if (error) throw error;
      setPasso('sucesso');
    } catch (err: any) {
      setErro('Erro ao registar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col justify-center items-center p-4">
      <div className="max-w-sm w-full bg-[#111827] rounded-3xl shadow-2xl border border-gray-800 p-8 overflow-hidden relative">
        {['identificacao', 'sucesso', 'gps'].includes(passo) && (
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
              <Clock className="text-white" size={32} />
            </div>
          </div>
        )}

        {passo === 'identificacao' && (
          <div className="animate-in fade-in zoom-in-95 duration-300">
            <h2 className="text-center text-2xl font-bold text-white mb-2">
              JJT Ponto
            </h2>
            <p className="text-center text-sm text-gray-400 mb-8">
              Insere o teu NIF para iniciar a validação.
            </p>
            <form onSubmit={identificarTrabalhador} className="space-y-6">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="tel"
                  required
                  value={nif}
                  onChange={(e) => setNif(e.target.value.replace(/\D/g, ''))}
                  maxLength={9}
                  className="w-full pl-12 pr-4 py-4 bg-[#1F2937] border border-gray-700 rounded-xl text-white font-mono text-lg tracking-widest focus:ring-2 focus:ring-blue-500 outline-none text-center"
                  placeholder="NIF (9 dígitos)"
                />
              </div>
              {erro && (
                <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-lg flex items-center gap-3 text-red-400 text-sm">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0" />
                  <span className="leading-tight">{erro}</span>
                </div>
              )}
              <button
                type="submit"
                disabled={loading || nif.length < 9}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  'A validar...'
                ) : (
                  <>
                    Continuar <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        {passo === 'gps' && loading && (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
            <h3 className="text-xl font-bold text-white mb-2">
              A validar GPS...
            </h3>
            <p className="text-gray-400 text-sm">
              Aguarde enquanto verificamos a tua localização na obra.
            </p>
          </div>
        )}

        {passo === 'camera' && (
          <div className="animate-in fade-in zoom-in-95 duration-300 flex flex-col items-center">
            <h2 className="text-xl font-bold text-white mb-1">Prova de Vida</h2>
            <p className="text-sm text-gray-400 mb-4">
              Tira uma selfie para validar a {tipoRegisto}.
            </p>
            <div className="relative w-full aspect-[3/4] bg-black rounded-2xl overflow-hidden mb-6 border border-gray-700 shadow-inner">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              <canvas ref={canvasRef} className="hidden" />
            </div>
            <button
              onClick={capturarFoto}
              className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-colors shadow-[0_0_20px_rgba(255,255,255,0.4)]"
            >
              <Camera size={28} className="text-black" />
            </button>
            <button
              onClick={() => {
                setPasso('identificacao');
                setNif('');
              }}
              className="mt-6 text-gray-500 text-sm hover:text-white"
            >
              Cancelar
            </button>
          </div>
        )}

        {passo === 'preview' && fotoUri && (
          <div className="animate-in fade-in duration-300 flex flex-col items-center">
            <div className="w-12 h-12 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <MapPin size={24} />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Local e Rosto Validados
            </h2>
            <p className="text-xs text-gray-400 mb-4">
              {Math.round(obraValidada.distanciaCalculada)}m da{' '}
              {obraValidada.nome}
            </p>
            <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-gray-700 mb-6 shadow-xl mx-auto">
              <img
                src={fotoUri}
                alt="Selfie"
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              <button
                onClick={repetirFoto}
                disabled={loading}
                className="absolute bottom-0 w-full bg-black/60 py-1.5 flex justify-center hover:bg-black/80"
              >
                <RefreshCw size={16} className="text-white" />
              </button>
            </div>
            {erro && (
              <p className="text-red-400 text-sm text-center mb-4">{erro}</p>
            )}
            <button
              onClick={registarPontoFinal}
              disabled={loading}
              className={`w-full font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 ${
                tipoRegisto === 'entrada'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-orange-600 hover:bg-orange-700 text-white'
              } disabled:opacity-50`}
            >
              {loading
                ? 'A registar...'
                : `Confirmar ${tipoRegisto.toUpperCase()}`}
            </button>
          </div>
        )}

        {passo === 'sucesso' && (
          <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
              <CheckCircle className="text-white" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {tipoRegisto === 'entrada' ? 'Entrada' : 'Saída'} Registada!
            </h2>
            <p className="text-gray-400 mb-8">
              {new Date().toLocaleTimeString('pt-PT')} • {obraValidada.nome}
            </p>
            <button
              onClick={() => {
                setPasso('identificacao');
                setNif('');
                setFotoUri(null);
                setFuncionario(null);
              }}
              className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-all"
            >
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
