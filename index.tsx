import React, { useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã';
type ToolType = 'regador' | 'adubo' | 'colher';

interface PlantInfo {
  name: PlantType;
  phenotype: string;
}

const PLANT_CONFIG: Record<PlantType, PlantInfo> = {
  Abóbora: { name: 'Abóbora', phenotype: '🎃' },
  Milho: { name: 'Milho', phenotype: '🌽' },
  Girassol: { name: 'Girassol', phenotype: '🌻' },
  Maçã: { name: 'Maçã', phenotype: '🍎' },
};

type PlantStage = 'sprout' | 'grown';

interface PlantState {
  type: PlantType;
  stage: PlantStage;
  phenotype: string;
}

interface PlotState {
  id: number;
  plant: PlantState | null;
  isWatered: boolean;
  isFertilized: boolean;
}

const App = () => {
  const [selectedTool, setSelectedTool] = useState<PlantType | ToolType | null>(null);
  const [garden, setGarden] = useState<PlotState[]>(
    Array.from({ length: 16 }, (_, i) => ({ id: i, plant: null, isWatered: false, isFertilized: false }))
  );
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [isInstructionsOpen, setInstructionsOpen] = useState(true);
  const [animatingPlots, setAnimatingPlots] = useState<number[]>([]);
  const [showReproductionMessage, setShowReproductionMessage] = useState(false);


  const createPlant = (type: PlantType): PlantState => {
    const phenotype = PLANT_CONFIG[type].phenotype;
    return { type, stage: 'sprout', phenotype };
  };

  const handleCombination = (grownPlotId: number, currentGarden: PlotState[]): { newGarden: PlotState[]; parents: number[]; newSproutPlanted: boolean } => {
    const newGarden = [...currentGarden];
    const grownPlot = newGarden[grownPlotId];
    const grownPlant = grownPlot.plant;

    if (!grownPlant) return { newGarden: currentGarden, parents: [], newSproutPlanted: false };

    const { type: grownType } = grownPlant;
    const size = 4;
    const row = Math.floor(grownPlotId / size);
    const col = grownPlotId % size;

    let matchingNeighborId: number | null = null;

    // Check 8 neighbors for a matching grown plant
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const newRow = row + dr;
            const newCol = col + dc;

            if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size) {
                const neighborId = newRow * size + newCol;
                const neighborPlot = newGarden[neighborId];
                if (neighborPlot.plant?.stage === 'grown' && neighborPlot.plant.type === grownType) {
                    matchingNeighborId = neighborId;
                    break;
                }
            }
        }
        if (matchingNeighborId !== null) break;
    }
    
    if (matchingNeighborId === null) return { newGarden: currentGarden, parents: [], newSproutPlanted: false };
    
    const parents = [grownPlotId, matchingNeighborId];

    // Match found! Now find an empty plot adjacent to the *original* plot to plant a new sprout
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;

            const newRow = row + dr;
            const newCol = col + dc;

             if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size) {
                const neighborId = newRow * size + newCol;
                if (!newGarden[neighborId].plant) {
                    newGarden[neighborId].plant = createPlant(grownType);
                    return { newGarden, parents, newSproutPlanted: true }; // Exit after creating one plant
                }
            }
        }
    }
    
    // Return parents for animation even if no empty spot was found
    return { newGarden, parents, newSproutPlanted: false };
  };

  const growPlant = (plotId: number) => {
    setTimeout(() => {
      setGarden(currentGarden => {
        // FIX: Add 'as const' to ensure TypeScript infers 'grown' as a literal type,
        // which is compatible with PlantStage, preventing it from being widened to 'string'.
        const gardenAfterGrowth = currentGarden.map(p => 
          p.id === plotId && p.plant ? { ...p, plant: { ...p.plant, stage: 'grown' as const } } : p
        );
        const combinationResult = handleCombination(plotId, gardenAfterGrowth);

        if (combinationResult.parents.length > 0) {
            setAnimatingPlots(combinationResult.parents);
            setTimeout(() => {
                setAnimatingPlots([]);
                 if (combinationResult.newSproutPlanted) {
                    setShowReproductionMessage(true);
                }
            }, 800);
        }

        return combinationResult.newGarden;
      });
    }, 3000);
  };
  
  const handlePlotClick = useCallback((plotId: number) => {
    setGarden(currentGarden => {
      const newGarden = [...currentGarden];
      const plot = newGarden.find(p => p.id === plotId);
      if (!plot) return currentGarden;

      // Action: Plant a seed
      if (selectedTool && Object.keys(PLANT_CONFIG).includes(selectedTool) && !plot.plant) {
        plot.plant = createPlant(selectedTool as PlantType);
        return newGarden;
      }
      
      // Action: Water a sprout
      if (selectedTool === 'regador' && plot.plant?.stage === 'sprout' && !plot.isWatered) {
        plot.isWatered = true;
        // Trigger growth immediately upon watering, regardless of fertilizer
        growPlant(plot.id);
        return newGarden;
      }

      // Action: Fertilize a sprout
      if (selectedTool === 'adubo' && plot.plant?.stage === 'sprout' && !plot.isFertilized) {
         plot.isFertilized = true;
         // Fertilizer is now optional and does not trigger growth directly
         return newGarden;
      }

      // Action: Harvest a grown plant
      if (selectedTool === 'colher' && plot.plant?.stage === 'grown') {
        const harvestedPhenotype = plot.plant.phenotype;
        setInventory(currentInventory => ({
          ...currentInventory,
          [harvestedPhenotype]: (currentInventory[harvestedPhenotype] || 0) + 1,
        }));
        plot.plant = null;
        plot.isWatered = false;
        plot.isFertilized = false;
        return newGarden;
      }

      return currentGarden;
    });
  }, [selectedTool]);

  return (
    <div className="app-container">
      <header className="header">
        <h1>Fazenda Genética</h1>
        <p>Plante, cuide e colha para ver a genética em ação!</p>
      </header>
      
      <button className="instructions-button" onClick={() => setInstructionsOpen(true)} aria-label="Abrir instruções">?</button>

      <main className="garden-container">
        <div className="garden-grid">
          {garden.map(plot => (
            <div
              key={plot.id}
              className={`garden-plot ${plot.isWatered ? 'watered' : ''} ${plot.isFertilized ? 'fertilized' : ''} ${animatingPlots.includes(plot.id) ? 'combining' : ''}`}
              onClick={() => handlePlotClick(plot.id)}
              role="button"
              aria-label={`Lote de terra ${plot.id + 1}. ${plot.plant ? `Contém ${plot.plant.phenotype}` : 'Vazio'}`}
            >
              {plot.plant && (
                <div className="plant">
                  {plot.plant.stage === 'sprout' ? '🌱' : plot.plant.phenotype}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

       <div className="floating-panel tools-panel">
        <button
            className={`tool-button ${selectedTool === 'regador' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'regador' ? null : 'regador')}
            aria-pressed={selectedTool === 'regador'}
        >
            <svg className="tool-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12.7 4.73a1 1 0 00-1.4 1.42l.7.7-4.43 2.95a1 1 0 00-.57 1.1l1.5 5.25a1 1 0 00.95.77H13a1 1 0 000-2H8.38l-.9-3.15 7.42-4.95 1.52 2.64a1 1 0 001.74-.99l-2.73-4.74zM18 11a1 1 0 00-1 1v5a1 1 0 002 0v-5a1 1 0 00-1-1z"></path>
            </svg>
            Regador
        </button>
        <button
            className={`tool-button ${selectedTool === 'adubo' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'adubo' ? null : 'adubo')}
            aria-pressed={selectedTool === 'adubo'}
        >
            <svg className="tool-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3L9.5 8.5 4 10l5.5 4.5L8 21l4-3.5L16 21l-1.5-6.5L20 10l-5.5-1.5z"/>
            </svg>
            Adubo
        </button>
         <button
            className={`tool-button ${selectedTool === 'colher' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'colher' ? null : 'colher')}
            aria-pressed={selectedTool === 'colher'}
        >
            <svg className="tool-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M18.84,11.23,12.2,4.59a1.62,1.62,0,0,0-2.29,0L3.27,11.23a1.62,1.62,0,0,0,0,2.29l6.64,6.64a1.62,1.62,0,0,0,2.29,0l6.64-6.64A1.62,1.62,0,0,0,18.84,11.23ZM10.91,19v2.5a.5.5,0,0,0,1,0V19a1,1,0,0,0-1,0Z"/>
            </svg>
            Colher
        </button>
      </div>

      <div className="floating-panel seed-panel">
        <h2>Sementes</h2>
        <div className="seed-selection-grid">
          {(Object.keys(PLANT_CONFIG) as PlantType[]).map(type => (
            <button
              key={type}
              className={`seed-button ${selectedTool === type ? 'selected' : ''}`}
              onClick={() => setSelectedTool(selectedTool === type ? null : type)}
              aria-pressed={selectedTool === type}
            >
              <span className="emoji">{PLANT_CONFIG[type].phenotype}</span>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="floating-panel inventory-panel">
        <h2>Inventário</h2>
        {Object.keys(inventory).length > 0 ? (
          <ul className="inventory-list">
            {Object.entries(inventory).map(([phenotype, count]) => (
              <li key={phenotype} className="inventory-item">
                <span><span className="emoji">{phenotype}</span></span>
                <span className="inventory-count">{count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-inventory-text">Sua colheita aparecerá aqui.</p>
        )}
      </div>

      {isInstructionsOpen && (
        <div className="modal-overlay" onClick={() => setInstructionsOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={() => setInstructionsOpen(false)} aria-label="Fechar instruções">&times;</button>
                <h2>Jogo da Colheita</h2>
                <ol className="instructions-list">
                    <li><strong>Selecione uma semente ou ferramenta:</strong> Escolha o que usar nos painéis.</li>
                    <li><strong>Plante:</strong> Com uma semente selecionada, clique em um lote de terra vazio.</li>
                    <li><strong>Cuide da planta:</strong> Um broto (🌱) precisa de <strong>água</strong> para crescer. Use o regador (💧).</li>
                    <li><strong>Aguarde:</strong> Após regar, a planta crescerá em 3 segundos.</li>
                    <li><strong>Combine:</strong> Se uma planta crescer ao lado de outra planta adulta da mesma espécie, uma nova muda brotará em um lote vazio adjacente!</li>
                    <li><strong>Colha:</strong> Selecione a ferramenta de colher (pazinha) e clique em uma planta crescida para adicioná-la ao seu inventário.</li>
                </ol>
            </div>
        </div>
      )}

      {showReproductionMessage && (
        <div className="modal-overlay">
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Cruzamento!</h2>
                <p>Ocorreu um cruzamento entre linhagens distintas gerando um novo broto</p>
                <button className="ok-button" onClick={() => setShowReproductionMessage(false)}>OK</button>
            </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);