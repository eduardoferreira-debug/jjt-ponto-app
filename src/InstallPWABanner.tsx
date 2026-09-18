import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export function InstallPWABanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      // Impede o Chrome de mostrar o mini-aviso padrão
      e.preventDefault();
      // Guarda o evento para dispararmos quando o utilizador clicar no botão
      setDeferredPrompt(e);
      // Mostra o nosso banner bonito
      setIsVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Mostra a janela de instalação nativa do telemóvel
    deferredPrompt.prompt();
    
    // Espera que o utilizador responda
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsVisible(false);
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#1F2937] border-t border-gray-700 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-[100] flex items-center justify-between animate-in slide-in-from-bottom-full duration-500">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[#0B1120] rounded-xl flex items-center justify-center border border-gray-600 overflow-hidden shadow-inner">
          {/* Usa o teu ícone escuro oficial */}
          <img src="/LOGORP.png" alt="App Icon" className="w-full h-full object-cover" />
        </div>
        <div className="text-white">
          <h4 className="font-bold text-sm">Instalar JJT Ponto</h4>
          <p className="text-xs text-gray-400">Acesso rápido e ecrã inteiro</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button 
          onClick={handleInstallClick}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg transition-colors"
        >
          Instalar
        </button>
        <button onClick={() => setIsVisible(false)} className="text-gray-400 hover:text-white p-2">
          <X size={20} />
        </button>
      </div>
    </div>
  );
}