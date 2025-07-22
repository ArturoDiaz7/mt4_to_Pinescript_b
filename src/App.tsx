
import React, { useState, useCallback, useRef } from 'react';
import { GroupedTrades, Trade } from './types';
import { processReport } from './services/tradeProcessor';
import { generatePineScript } from './services/pineScriptGenerator';

const App: React.FC = () => {
  const [groupedTrades, setGroupedTrades] = useState<GroupedTrades | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [beTolerance, setBeTolerance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastProcessedContent = useRef<string | null>(null);

  const handleProcessReport = useCallback(async (content: string, tolerance: number) => {
    if (!content) return;
    setIsLoading(true);
    setError(null);
    setGroupedTrades(null);
    try {
      const result = await processReport(content, tolerance);
      setGroupedTrades(result);
      lastProcessedContent.current = content;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        handleProcessReport(content, beTolerance);
      };
      reader.readAsText(file);
    }
  };

  const handleToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTolerance = parseFloat(e.target.value) || 0;
    setBeTolerance(newTolerance);
    if(lastProcessedContent.current) {
        handleProcessReport(lastProcessedContent.current, newTolerance);
    }
  };

  const handleLoadReportClick = () => {
    fileInputRef.current?.click();
  };

  const toggleCollapsible = (item: string) => {
    const content = document.getElementById(`content-${item}`);
    const icon = document.getElementById(`icon-${item}`);
    if (content && icon) {
      content.classList.toggle('expanded');
      icon.textContent = content.classList.contains('expanded') ? '▲' : '▼';
    }
  };

  const copyPineScript = (item: string) => {
    if (groupedTrades && groupedTrades[item]) {
      const script = generatePineScript(item, groupedTrades[item]);
      navigator.clipboard.writeText(script).then(() => {
        setCopiedItem(item);
        setTimeout(() => setCopiedItem(null), 2000);
      });
    }
  };

  const TradeItem: React.FC<{ trade: Trade, type: 'winner' | 'loser' | 'breakeven' }> = ({ trade, type }) => (
    <div className="trade-item text-sm p-2 border-b border-gray-700 grid grid-cols-5 gap-2 items-center">
      <span className="col-span-1">T: {trade.ticket}</span>
      <span className="col-span-2">O: {trade.openTimeRaw} @ {trade.openPrice}</span>
       {type === 'winner' && (
         <span className="col-span-2">C: {trade.closeTimeRaw} @ {trade.closePrice}</span>
       )}
       {type !== 'winner' && <span className="col-span-2"></span>}
       <span className={`col-span-1 text-right font-mono ${trade.profit > 0 ? 'text-green-400' : trade.profit < 0 ? 'text-red-400' : 'text-blue-400'}`}>
        {trade.profit.toFixed(2)}
      </span>
    </div>
  );

  return (
    <div id="mt4-to-tv-converter" className="min-h-screen bg-gray-900 text-gray-300 p-4 sm:p-6 lg:p-8">
      <div className="container mx-auto max-w-4xl">
        <header className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-white">Convertidor de Reportes MT4 a Pine Script</h1>
          <p className="text-gray-400 mt-2">Carga tu reporte HTM, clasifica tus trades y visualízalos en TradingView.</p>
        </header>

        <div className="card bg-gray-800 p-6 rounded-lg shadow-lg mb-8">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <input
              type="file"
              id="fileInput"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".htm,.html"
            />
            <button id="loadReportBtn" onClick={handleLoadReportClick} className="btn-primary w-full sm:w-auto">
              Cargar Reporte
            </button>
            <span id="fileNameDisplay" className="text-gray-400 italic flex-grow text-center sm:text-left">{fileName || "Ningún archivo seleccionado"}</span>
            <div className="flex items-center gap-2">
              <label htmlFor="beTolerance" className="font-semibold text-white">Tolerancia BE:</label>
              <input
                type="number"
                id="beTolerance"
                value={beTolerance}
                onChange={handleToleranceChange}
                step="0.01"
                className="input-field bg-gray-700 border border-gray-600 text-white rounded-md p-2 w-24 text-center focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {isLoading && (
            <div className="flex justify-center items-center my-8">
                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                 <span className="ml-4 text-white text-lg">Procesando...</span>
            </div>
        )}

        {error && (
          <div id="errorMessage" className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-md relative" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}

        {groupedTrades && (
          <div id="resultsSection" className="space-y-4">
            {Object.keys(groupedTrades).sort().map(item => (
              <div key={item} className="card bg-gray-800 rounded-lg shadow-md overflow-hidden">
                <div 
                    id={`header-${item}`}
                    className="collapsible-header bg-gray-700 p-4 flex justify-between items-center cursor-pointer hover:bg-gray-600 transition-colors"
                    onClick={() => toggleCollapsible(item)}
                >
                  <h2 className="text-xl font-bold text-white uppercase">{item}</h2>
                  <span id={`icon-${item}`} className="text-xl text-white">▼</span>
                </div>
                <div id={`content-${item}`} className="collapsible-content">
                    <div className="p-4">
                         {/* Winners */}
                        <div className="mb-4">
                             <h3 className="text-lg font-semibold text-green-400">Ganadores ({groupedTrades[item].winners.length})</h3>
                             {groupedTrades[item].winners.length > 0 ? (
                                groupedTrades[item].winners.map(trade => <TradeItem key={trade.ticket} trade={trade} type="winner" />)
                             ) : <p className="text-gray-500 italic p-2">Sin trades ganadores.</p>}
                        </div>
                        {/* Break Even */}
                        <div className="mb-4">
                            <h3 className="text-lg font-semibold text-blue-400">Break Even ({groupedTrades[item].breakeven.length})</h3>
                             {groupedTrades[item].breakeven.length > 0 ? (
                                groupedTrades[item].breakeven.map(trade => <TradeItem key={trade.ticket} trade={trade} type="breakeven" />)
                             ) : <p className="text-gray-500 italic p-2">Sin trades break even.</p>}
                        </div>
                        {/* Losers */}
                        <div>
                            <h3 className="text-lg font-semibold text-red-400">Perdedores ({groupedTrades[item].losers.length})</h3>
                             {groupedTrades[item].losers.length > 0 ? (
                                groupedTrades[item].losers.map(trade => <TradeItem key={trade.ticket} trade={trade} type="loser" />)
                             ) : <p className="text-gray-500 italic p-2">Sin trades perdedores.</p>}
                        </div>

                         <div className="mt-6 text-center">
                            <button onClick={() => copyPineScript(item)} className="btn-secondary">
                                {copiedItem === item ? 'Copiado!' : `Copiar Pine Script para ${item.toUpperCase()}`}
                            </button>
                        </div>
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
