import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher';
type FertilizerType = 'organic' | 'chemical' | null;
type BeeState = 'hidden' | 'visible' | 'dying';

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
  fertilizer: FertilizerType;
}

interface CornConnection {
    from: number;
    to: number;
}

const App = () => {
  const [selectedTool, setSelectedTool] = useState<PlantType | ToolType | null>(null);
  const [garden, setGarden] = useState<PlotState[]>(
    Array.from({ length: 16 }, (_, i) => ({ id: i, plant: null, isWatered: false, fertilizer: null }))
  );
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [isInstructionsOpen, setInstructionsOpen] = useState(true);
  const [animatingPlots, setAnimatingPlots] = useState<number[]>([]);
  
  // State to track the most recently grown plant to trigger reproduction logic
  const [lastGrownId, setLastGrownId] = useState<number | null>(null);

  // Modals state
  const [showReproductionMessage, setShowReproductionMessage] = useState(false);
  const [showCornReproductionMessage, setShowCornReproductionMessage] = useState(false);
  const [showCornHint, setShowCornHint] = useState(false);
  const [showBeeDeathMessage, setShowBeeDeathMessage] = useState(false);

  // Animation state
  const [beeState, setBeeState] = useState<BeeState>('hidden');
  const [isWindy, setIsWindy] = useState(false);
  const [cornConnection, setCornConnection] = useState<CornConnection | null>(null);

  const cornTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasSunflowers = garden.some(plot => plot.plant?.type === 'Girassol' && plot.plant.stage === 'grown');
  const hasPesticides = garden.some(plot => plot.fertilizer === 'chemical');

  // Derived state for Corn Hint Effect
  const cornPlots = garden.filter(plot => plot.plant?.type === 'Milho');
  const cornCount = cornPlots.length;
  // Check if there is exactly 1 corn and it is fully grown
  const isSingleGrownCorn = cornCount === 1 && cornPlots[0].plant?.stage === 'grown';

  // Effect 1: State Transitions based on Garden Conditions (Bees)
  useEffect(() => {
    if (hasPesticides) {
        if (beeState === 'visible') {
            setBeeState('dying');
        }
    } else {
        if (hasSunflowers) {
            if (beeState !== 'visible') {
                setBeeState('visible');
            }
        } else {
            if (beeState !== 'hidden') {
                setBeeState('hidden');
            }
        }
    }
  }, [hasSunflowers, hasPesticides, beeState]);

  // Effect 2: Animation Timer for Dying Bees
  useEffect(() => {
    if (beeState === 'dying') {
        const timer = setTimeout(() => {
            setBeeState('hidden');
            setShowBeeDeathMessage(true);
        }, 3500); 
        return () => clearTimeout(timer);
    }
  }, [beeState]);

  // Effect 3: Corn Hint Timer
  useEffect(() => {
    if (isSingleGrownCorn) {
        // If exactly one grown corn exists and timer isn't running, start it
        if (!cornTimeoutRef.current) {
            cornTimeoutRef.current = setTimeout(() => {
                setShowCornHint(true);
                cornTimeoutRef.current = null;
            }, 30000); // 30 seconds
        }
    } else {
        // If condition not met (0 corn, >1 corn, or 1 sprout), clear timer
        if (cornTimeoutRef.current) {
            clearTimeout(cornTimeoutRef.current);
            cornTimeoutRef.current = null;
        }
        if (cornCount > 1) {
            setShowCornHint(false);
        }
    }

    return () => {
        if (cornTimeoutRef.current) {
            clearTimeout(cornTimeoutRef.current);
        }
    };
  }, [isSingleGrownCorn, cornCount]);

  // Effect 4: Reproduction Logic (Triggered when a plant finishes growing)
  useEffect(() => {
    if (lastGrownId === null) return;

    const grownPlot = garden[lastGrownId];
    if (!grownPlot || !grownPlot.plant || grownPlot.plant.stage !== 'grown') {
        setLastGrownId(null);
        return;
    }

    const plantType = grownPlot.plant.type;

    if (plantType === 'Milho') {
        // CORN LOGIC: Global check (no adjacency needed)
        const otherCorns = garden.filter(p => p.id !== lastGrownId && p.plant?.type === 'Milho' && p.plant.stage === 'grown');

        if (otherCorns.length > 0) {
            // Randomly select a partner if more than one exists
            const partner = otherCorns[Math.floor(Math.random() * otherCorns.length)];

            // 1. Set connection visual
            setCornConnection({ from: partner.id, to: lastGrownId });

            // 2. Trigger Wind
            setIsWindy(true);

            // 3. Wait for wind animation to finish, then reproduce
            setTimeout(() => {
                setIsWindy(false);
                setCornConnection(null); // Clear connection arrows
                
                // Find an empty spot
                const emptySpotId = findEmptySpot(lastGrownId, garden);
                
                if (emptySpotId !== null) {
                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant('Milho');
                        return newGarden;
                    });
                    
                    // 4. Wait for the new sprout animation to play before showing message
                    setTimeout(() => {
                        setShowCornReproductionMessage(true);
                    }, 1500);
                }
            }, 4000); // 4 seconds wind duration
        }
    } else {
        // OTHER PLANTS LOGIC: Neighbor check
        const size = 4;
        const row = Math.floor(lastGrownId / size);
        const col = lastGrownId % size;
        let matchingNeighborId: number | null = null;

        // Check 8 neighbors
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size) {
                    const neighborId = newRow * size + newCol;
                    const neighborPlot = garden[neighborId];
                    if (neighborPlot.plant?.stage === 'grown' && neighborPlot.plant.type === plantType) {
                        matchingNeighborId = neighborId;
                        break;
                    }
                }
            }
            if (matchingNeighborId !== null) break;
        }

        if (matchingNeighborId !== null) {
            // Found a mate, animate parents and spawn child
            setAnimatingPlots([lastGrownId, matchingNeighborId]);
            
            setTimeout(() => {
                setAnimatingPlots([]);
                const emptySpotId = findEmptySpot(lastGrownId, garden); // Search near parent first
                if (emptySpotId !== null) {
                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant(plantType);
                        return newGarden;
                    });
                    setShowReproductionMessage(true);
                }
            }, 800);
        }
    }

    setLastGrownId(null); // Reset trigger
  }, [lastGrownId, garden]);

  const findEmptySpot = (centerId: number, currentGarden: PlotState[]): number | null => {
    const size = 4;
    const row = Math.floor(centerId / size);
    const col = centerId % size;

    // 1. Try neighbors first
    for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const newRow = row + dr;
            const newCol = col + dc;
             if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size) {
                const neighborId = newRow * size + newCol;
                if (!currentGarden[neighborId].plant) {
                    return neighborId;
                }
            }
        }
    }

    // 2. If no neighbors, find any empty spot
    const anyEmpty = currentGarden.find(p => !p.plant);
    return anyEmpty ? anyEmpty.id : null;
  };

  const createPlant = (type: PlantType): PlantState => {
    const phenotype = PLANT_CONFIG[type].phenotype;
    return { type, stage: 'sprout', phenotype };
  };

  const growPlant = (plotId: number) => {
    setTimeout(() => {
      setGarden(currentGarden => {
        // Only grow the plant, logic for reproduction is handled by effect
        return currentGarden.map(p => 
          p.id === plotId && p.plant ? { ...p, plant: { ...p.plant, stage: 'grown' as const } } : p
        );
      });
      // Trigger the reproduction check effect
      setLastGrownId(plotId);
    }, 2000);
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
        // Trigger growth immediately upon watering
        growPlant(plot.id);
        return newGarden;
      }

      // Action: Fertilize (Organic)
      if (selectedTool === 'adubo_organico' && plot.plant && !plot.fertilizer) {
         plot.fertilizer = 'organic';
         return newGarden;
      }

      // Action: Pesticide (Chemical)
      if (selectedTool === 'agrotoxico' && plot.plant && !plot.fertilizer) {
         plot.fertilizer = 'chemical';
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
        plot.fertilizer = null;
        return newGarden;
      }

      return currentGarden;
    });
  }, [selectedTool]);

  // Helper to get coordinates for SVG line
  const getCoordinates = (index: number) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    // Return center of the cell (0.5 to 3.5 range)
    return { x: col + 0.5, y: row + 0.5 };
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Fazenda Genética</h1>
        <p>Plante, cuide e colha para ver a genética em ação!</p>
      </header>
      
      <button className="instructions-button" onClick={() => setInstructionsOpen(true)} aria-label="Abrir instruções">?</button>

      <main className="garden-container">
        {/* Wind Overlay */}
        {isWindy && (
            <div className="wind-overlay">
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                <div className="wind-line"></div>
                {/* Pollen particles */}
                <div className="wind-pollen"></div>
                <div className="wind-pollen"></div>
                <div className="wind-pollen"></div>
                <div className="wind-pollen"></div>
                <div className="wind-pollen"></div>
            </div>
        )}

        {/* Connection Overlay for Corn */}
        <svg className="connection-overlay" viewBox="0 0 4 4" preserveAspectRatio="none">
             <defs>
                <marker id="arrowhead" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill="#FFD700" />
                </marker>
            </defs>
            {cornConnection && (
                <line 
                    x1={getCoordinates(cornConnection.from).x} 
                    y1={getCoordinates(cornConnection.from).y} 
                    x2={getCoordinates(cornConnection.to).x} 
                    y2={getCoordinates(cornConnection.to).y} 
                    className="connection-line"
                    markerEnd="url(#arrowhead)"
                />
            )}
        </svg>

        <div className="garden-grid">
          {garden.map(plot => (
            <div
              key={plot.id}
              className={`garden-plot ${plot.isWatered ? 'watered' : ''} ${plot.fertilizer ? 'fertilized' : ''} ${plot.fertilizer === 'chemical' ? 'chemical-soil' : ''} ${animatingPlots.includes(plot.id) ? 'combining' : ''}`}
              onClick={() => handlePlotClick(plot.id)}
              role="button"
              aria-label={`Lote de terra ${plot.id + 1}. ${plot.plant ? `Contém ${plot.plant.phenotype}` : 'Vazio'}`}
            >
              {plot.plant && (
                <div className={`plant ${plot.fertilizer ? 'plant-large' : ''}`}>
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
            className={`tool-button ${selectedTool === 'adubo_organico' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'adubo_organico' ? null : 'adubo_organico')}
            aria-pressed={selectedTool === 'adubo_organico'}
        >
            <svg className="tool-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M12 3L9.5 8.5 4 10l5.5 4.5L8 21l4-3.5L16 21l-1.5-6.5L20 10l-5.5-1.5z"/>
            </svg>
            Adubo Orgânico
        </button>
        <button
            className={`tool-button ${selectedTool === 'agrotoxico' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'agrotoxico' ? null : 'agrotoxico')}
            aria-pressed={selectedTool === 'agrotoxico'}
        >
            <svg className="tool-icon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M9 3C9 1.9 9.9 1 11 1H13C14.1 1 15 1.9 15 3V5H9V3ZM5 5V19C5 21.21 6.79 23 9 23H15C17.21 23 19 21.21 19 19V5H5ZM14 16H10V14H14V16ZM12 8C13.1 8 14 8.9 14 10C14 11.1 13.1 12 12 12C10.9 12 10 11.1 10 10C10 8.9 10.9 8 12 8Z"/>
            </svg>
            Agrotóxico
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

      {(beeState !== 'hidden') && (
        <div className="bees-container" aria-hidden="true">
          <div className={`bee bee-1 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
          <div className={`bee bee-2 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
          <div className={`bee bee-3 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
        </div>
      )}

      {isInstructionsOpen && (
        <div className="modal-overlay" onClick={() => setInstructionsOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={() => setInstructionsOpen(false)} aria-label="Fechar instruções">&times;</button>
                <h2>Jogo da Colheita</h2>
                <ol className="instructions-list">
                    <li><strong>Selecione uma semente ou ferramenta:</strong> Escolha o que usar nos painéis.</li>
                    <li><strong>Plante:</strong> Com uma semente selecionada, clique em um lote de terra vazio.</li>
                    <li><strong>Cuide da planta:</strong> Um broto (🌱) precisa de <strong>água</strong> para crescer. Use o regador (💧).</li>
                    <li><strong>Cresça mais:</strong> Use <strong>Adubo Orgânico</strong> ou <strong>Agrotóxicos</strong> para fazer a planta ficar gigante!</li>
                    <li><strong>Atenção:</strong> Agrotóxicos funcionam bem, mas espantam as abelhas! 🐝🚫</li>
                    <li><strong>Combine:</strong> Plantas vizinhas iguais criam novos brotos!</li>
                    <li><strong>Colha:</strong> Use a pá para colher.</li>
                </ol>
            </div>
        </div>
      )}

      {showReproductionMessage && (
        <div className="modal-overlay" onClick={() => setShowReproductionMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Cruzamento!</h2>
                <p>Ocorreu um cruzamento entre linhagens distintas gerando um novo broto</p>
                <button className="ok-button" onClick={() => setShowReproductionMessage(false)}>OK</button>
            </div>
        </div>
      )}

      {showCornReproductionMessage && (
        <div className="modal-overlay" onClick={() => setShowCornReproductionMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Polinização do Milho</h2>
                <p>O cruzamento do milho ocorre principalmente pela polinização cruzada, impulsionada pelo vento, que transporta grãos de pólen das flores masculinas (pendões) para as flores femininas (cabelos da espiga).</p>
                <button className="ok-button" onClick={() => setShowCornReproductionMessage(false)}>Entendi</button>
            </div>
        </div>
      )}

      {showCornHint && (
        <div className="modal-overlay" onClick={() => setShowCornHint(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Dica do Milho 🌽</h2>
                <p>Deseja plantar outra muda de milho? O milho prefere a fecundação cruzada. Nele acontece a protandria: O pendão, a inflorescência masculina, amadurece e libera o pólen antes dos estigmas da espiga estarem prontos para recebê-lo</p>
                <button className="ok-button" onClick={() => setShowCornHint(false)}>OK</button>
            </div>
        </div>
      )}

      {showBeeDeathMessage && (
        <div className="modal-overlay" onClick={() => setShowBeeDeathMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Alerta Ambiental ⚠️</h2>
                <p>O uso de agrotóxicos afeta abelhas causando mortalidade, alterando seu comportamento e prejudicando a colônia</p>
                <button className="ok-button" onClick={() => setShowBeeDeathMessage(false)}>Entendi</button>
            </div>
        </div>
      )}
    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);