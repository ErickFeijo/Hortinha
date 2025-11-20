import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher';
type FertilizerType = 'organic' | 'chemical' | null;
type BeeState = 'hidden' | 'visible' | 'dying';
type PlantSize = 'small' | 'normal' | 'large';

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
  instanceId: string;
  type: PlantType;
  stage: PlantStage;
  phenotype: string;
  parentIds: string[];
  isSmall?: boolean;
  isHybrid?: boolean;
}

interface PlotState {
  id: number;
  plant: PlantState | null;
  isWatered: boolean;
  fertilizer: FertilizerType;
}

interface Connection {
    from: number;
    to: number;
    color?: string;
}

type InventoryState = Partial<Record<PlantType, Record<PlantSize, number>>>;

const App = () => {
  const [selectedTool, setSelectedTool] = useState<PlantType | ToolType | null>(null);
  const [garden, setGarden] = useState<PlotState[]>(
    Array.from({ length: 16 }, (_, i) => ({ id: i, plant: null, isWatered: false, fertilizer: null }))
  );
  const [inventory, setInventory] = useState<InventoryState>({});
  const [isInstructionsOpen, setInstructionsOpen] = useState(true);
  const [animatingPlots, setAnimatingPlots] = useState<number[]>([]);
  
  // State to track the most recently grown plant to trigger reproduction logic
  const [lastGrownId, setLastGrownId] = useState<number | null>(null);

  // Modals state
  const [showReproductionMessage, setShowReproductionMessage] = useState(false);
  const [showCornReproductionMessage, setShowCornReproductionMessage] = useState(false);
  const [showInbreedingMessage, setShowInbreedingMessage] = useState(false);
  const [showHeterosisMessage, setShowHeterosisMessage] = useState(false);
  const [showCornHint, setShowCornHint] = useState(false);
  const [showBeeDeathMessage, setShowBeeDeathMessage] = useState(false);
  
  // New Pumpkin Modals
  const [showPumpkinSelfMessage, setShowPumpkinSelfMessage] = useState(false);
  const [showPumpkinCrossMessage, setShowPumpkinCrossMessage] = useState(false);
  
  // New Apple Modals
  const [showAppleCrossMessage, setShowAppleCrossMessage] = useState(false);

  // Animation state
  const [beeState, setBeeState] = useState<BeeState>('hidden');
  const [isWindy, setIsWindy] = useState(false);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [reproductionTrigger, setReproductionTrigger] = useState(0);

  const cornTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reproducedPlantsRef = useRef<Set<string>>(new Set());

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

  // Logic for determining offspring genetics (Size rules)
  const determineOffspringGenetics = useCallback((plantA: PlantState, plantB: PlantState) => {
      let isInbreeding = false;
      let isHybrid = false;

      // Logic Priority 1: Heterosis (Two small parents -> Big Hybrid)
      if (plantA.isSmall && plantB.isSmall) {
          isHybrid = true;
          isInbreeding = false;
      } else {
            // Logic Priority 2: Inbreeding (Parent-Child or Siblings -> Small)
            // Also covers Self-pollination where plantA.instanceId === plantB.instanceId
          const isAparentOfB = plantB.parentIds?.includes(plantA.instanceId);
          const isBparentOfA = plantA.parentIds?.includes(plantB.instanceId);
          const isSelf = plantA.instanceId === plantB.instanceId;
          
          isInbreeding = isAparentOfB || isBparentOfA || isSelf;
      }
      
      return { isInbreeding, isHybrid };
  }, []);

  const findNeighbor = (centerId: number, type: PlantType): number | null => {
        const size = 4;
        const row = Math.floor(centerId / size);
        const col = centerId % size;
        
        // Check 8 neighbors
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const newRow = row + dr;
                const newCol = col + dc;
                if (newRow >= 0 && newRow < size && newCol >= 0 && newCol < size) {
                    const neighborId = newRow * size + newCol;
                    const neighborPlot = garden[neighborId];
                    if (neighborPlot.plant?.stage === 'grown' && neighborPlot.plant.type === type) {
                        return neighborId;
                    }
                }
            }
        }
        return null;
  };

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

  const createPlant = (type: PlantType, parentIds: string[] = [], isSmall: boolean = false, isHybrid: boolean = false): PlantState => {
    const phenotype = PLANT_CONFIG[type].phenotype;
    return { 
        instanceId: Math.random().toString(36).substring(2, 9),
        type, 
        stage: 'sprout', 
        phenotype, 
        parentIds,
        isSmall,
        isHybrid
    };
  };

  // Reusable function for Pollination logic (Pumpkin and Apple)
  // Returns true if a pollination was initiated
  const tryPollination = useCallback((currentGarden: PlotState[], plantType: PlantType, color: string) => {
      if (beeState !== 'visible') return false;
      
      // 1. Identify seekers: Grown plants of type that haven't reproduced yet
      const seekers = currentGarden.filter(p => 
        p.plant?.type === plantType && 
        p.plant.stage === 'grown' && 
        !reproducedPlantsRef.current.has(p.plant.instanceId)
      );

      if (seekers.length === 0) return false;

      // Process the first seeker found
      const source = seekers[0];
      const sourceId = source.plant!.instanceId;

      // 2. Find a partner
      // Potential partners: Any OTHER grown plant of same type.
      // Priority: Unused ones (Seekers) > Used ones (Experienced)
      let partners = currentGarden.filter(p => 
        p.plant?.type === plantType && 
        p.plant.stage === 'grown' && 
        p.plant.instanceId !== sourceId
      );

      if (partners.length === 0) return false;

      // Sort: Unused first (Seekers)
      partners.sort((a, b) => {
          const aUnused = !reproducedPlantsRef.current.has(a.plant!.instanceId);
          const bUnused = !reproducedPlantsRef.current.has(b.plant!.instanceId);
          if (aUnused && !bUnused) return -1;
          if (!aUnused && bUnused) return 1;
          return 0;
      });

      const partner = partners[0];
      const partnerId = partner.plant!.instanceId;

      // EXECUTE
      setActiveConnection({ from: source.id, to: partner.id, color: color });
      setAnimatingPlots([source.id, partner.id]);

      // Mark source as used immediately
      reproducedPlantsRef.current.add(sourceId);
      // If partner was also a seeker, mark them too so they don't initiate their own separate event immediately
      if (!reproducedPlantsRef.current.has(partnerId)) {
         reproducedPlantsRef.current.add(partnerId);
      }

      setTimeout(() => {
          setActiveConnection(null);
          setAnimatingPlots([]);

          const emptySpotId = findEmptySpot(source.id, currentGarden);
          
          if (emptySpotId !== null) {
              const { isInbreeding, isHybrid } = determineOffspringGenetics(source.plant!, partner.plant!);
              
              setGarden(prev => {
                  const newGarden = [...prev];
                  // Re-check if spot is still empty
                  if (!newGarden[emptySpotId].plant) {
                      newGarden[emptySpotId].plant = createPlant(
                          plantType, 
                          [sourceId, partnerId],
                          isInbreeding, 
                          isHybrid
                      );
                  }
                  return newGarden;
              });

              setTimeout(() => {
                  if (isHybrid) setShowHeterosisMessage(true);
                  else if (isInbreeding) setShowInbreedingMessage(true);
                  else {
                      if (plantType === 'Abóbora') setShowPumpkinCrossMessage(true);
                      if (plantType === 'Maçã') setShowAppleCrossMessage(true);
                  }

                  // Trigger check for next pair/seeker
                  setReproductionTrigger(prev => prev + 1);
              }, 500);
          } else {
              // Even if failed to plant, we consume the chance and move to next
              setReproductionTrigger(prev => prev + 1);
          }
      }, 2000);

      return true;
  }, [beeState, determineOffspringGenetics]);


  // Effect: Check for Bee Pollination loop (Pumpkin and Apple)
  // This runs when bees are visible or when the garden updates (via reproduction trigger)
  useEffect(() => {
      if (beeState === 'visible') {
          const timer = setTimeout(() => {
              // Try Pumpkin first
              const pumpkinSuccess = tryPollination(garden, 'Abóbora', '#FF8C00');
              if (!pumpkinSuccess) {
                   // If no pumpkin pollination, try Apple
                   tryPollination(garden, 'Maçã', '#ff4d4d');
              }
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [beeState, garden, reproductionTrigger, tryPollination]);


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
        // CORN LOGIC
        const otherCorns = garden.filter(p => p.id !== lastGrownId && p.plant?.type === 'Milho' && p.plant.stage === 'grown');

        if (otherCorns.length > 0) {
            const partner = otherCorns[Math.floor(Math.random() * otherCorns.length)];

            setActiveConnection({ from: partner.id, to: lastGrownId, color: '#FFD700' });
            setIsWindy(true);

            setTimeout(() => {
                setIsWindy(false);
                setActiveConnection(null); 
                
                const emptySpotId = findEmptySpot(lastGrownId, garden);
                
                if (emptySpotId !== null && grownPlot.plant && partner.plant) {
                    const { isInbreeding, isHybrid } = determineOffspringGenetics(grownPlot.plant, partner.plant);

                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant(
                            'Milho', 
                            [grownPlot.plant!.instanceId, partner.plant!.instanceId], 
                            isInbreeding,
                            isHybrid
                        );
                        return newGarden;
                    });
                    
                    setTimeout(() => {
                        if (isHybrid) setShowHeterosisMessage(true);
                        else if (isInbreeding) setShowInbreedingMessage(true);
                        else setShowCornReproductionMessage(true);
                    }, 1500);
                }
            }, 4000); 
        }
    } else if (plantType === 'Abóbora') {
        // PUMPKIN LOGIC - Fallback for Self-Pollination ONLY
        // Cross-pollination is handled by the beeState/queue effect.
        
        const currentPlantId = grownPlot.plant.instanceId;
        
        // Schedule check for self-pollination if no bees present
        setTimeout(() => {
            setGarden(currentGarden => {
                const parentPlot = currentGarden[lastGrownId];
                
                // Conditions for Self-Pollination:
                // 1. Plant must still exist and be same instance
                // 2. Must NOT have reproduced yet (checked via Ref)
                // 3. Bees must NOT be visible (if bees arrived, they handle it)
                if (parentPlot && 
                    parentPlot.plant && 
                    parentPlot.plant.instanceId === currentPlantId &&
                    !reproducedPlantsRef.current.has(currentPlantId)
                ) {
                        // If Bees are visible now, we SKIP self-pollination and let the bee queue handle it
                        if (beeState === 'visible') return currentGarden;

                        // Execute Self-Pollination
                        const emptySpotId = findEmptySpot(lastGrownId, currentGarden);
                        if (emptySpotId !== null) {
                            reproducedPlantsRef.current.add(currentPlantId); // Mark used

                            const newGarden = [...currentGarden];
                            newGarden[emptySpotId].plant = createPlant(
                            'Abóbora',
                            [currentPlantId],
                            true, // Inbreeding
                            false
                            );
                            setShowPumpkinSelfMessage(true);
                            return newGarden;
                        }
                }
                return currentGarden;
            });
        }, 30000); // 30 Seconds delay

    } else if (plantType === 'Maçã') {
        // APPLE LOGIC
        // Apples strictly rely on the Bee Polination Effect loop.
        // Unlike Pumpkin, they DO NOT have a fallback timer for self-pollination.
        // If bees are present, the effect picks it up. If not, it waits.
        
        // Trigger an immediate check in case bees are already active
        if (beeState === 'visible') {
            setReproductionTrigger(prev => prev + 1);
        }

    } else {
        // OTHER PLANTS LOGIC (Girassol) - Simple neighbor check
        const neighborId = findNeighbor(lastGrownId, plantType);

        if (neighborId !== null) {
            const neighborPlant = garden[neighborId].plant;
            setAnimatingPlots([lastGrownId, neighborId]);
            
            setTimeout(() => {
                setAnimatingPlots([]);
                const emptySpotId = findEmptySpot(lastGrownId, garden); 
                if (emptySpotId !== null && grownPlot.plant && neighborPlant) {
                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant(plantType, [grownPlot.plant!.instanceId, neighborPlant.instanceId]);
                        return newGarden;
                    });
                    setShowReproductionMessage(true);
                }
            }, 800);
        }
    }

    setLastGrownId(null); // Reset trigger
  }, [lastGrownId, garden, beeState, determineOffspringGenetics]);


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
        const type = plot.plant.type;

        // Determine size
        let size: PlantSize = 'normal';
        if (plot.plant.isHybrid || plot.fertilizer) {
            size = 'large';
        } else if (plot.plant.isSmall) {
            size = 'small';
        }

        setInventory(currentInventory => {
            const plantCounts = currentInventory[type] || { small: 0, normal: 0, large: 0 };
            return {
                ...currentInventory,
                [type]: {
                    ...plantCounts,
                    [size]: plantCounts[size] + 1
                }
            };
        });

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

        {/* Connection Overlay for Corn and Pumpkin */}
        <svg className="connection-overlay" viewBox="0 0 4 4" preserveAspectRatio="none">
             <defs>
                <marker id="arrowhead" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill={activeConnection?.color || "#FFD700"} />
                </marker>
            </defs>
            {activeConnection && (
                <line 
                    x1={getCoordinates(activeConnection.from).x} 
                    y1={getCoordinates(activeConnection.from).y} 
                    x2={getCoordinates(activeConnection.to).x} 
                    y2={getCoordinates(activeConnection.to).y} 
                    className="connection-line"
                    stroke={activeConnection.color || "#FFD700"}
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
                <div className={`plant ${plot.fertilizer ? 'plant-large' : ''} ${plot.plant.isSmall ? 'plant-small' : ''} ${plot.plant.isHybrid ? 'plant-hybrid' : ''}`}>
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
          <div className="inventory-list">
            {(Object.entries(inventory) as [PlantType, Record<PlantSize, number>][]).map(([type, counts]) => {
                const total = counts.small + counts.normal + counts.large;
                if (total === 0) return null;

                return (
                    <div key={type} className="inventory-group">
                        <div className="inventory-header">
                            <span className="inventory-header-emoji">{PLANT_CONFIG[type].phenotype}</span>
                            {type}
                        </div>
                        <div className="inventory-variants">
                            {counts.small > 0 && (
                                <div className="inventory-variant variant-small" title="Pequeno">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{counts.small}</span>
                                </div>
                            )}
                            {counts.normal > 0 && (
                                <div className="inventory-variant variant-normal" title="Normal">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{counts.normal}</span>
                                </div>
                            )}
                            {counts.large > 0 && (
                                <div className="inventory-variant variant-large" title="Grande">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{counts.large}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
          </div>
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
                    <li><strong>Abóboras, Maçãs e Milhos:</strong> Têm regras especiais de genética e polinização. Descubra todas as variantes!</li>
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
                <p>O cruzamento do milho ocorre principalmente pela polinização cruzada, impulsionada pelo vento.</p>
                <button className="ok-button" onClick={() => setShowCornReproductionMessage(false)}>Entendi</button>
            </div>
        </div>
      )}

      {showPumpkinCrossMessage && (
        <div className="modal-overlay" onClick={() => setShowPumpkinCrossMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Polinização Cruzada (Abóbora) 🐝</h2>
                <p>Graças às abelhas, o pólen viajou de uma flor para outra! Isso garante maior diversidade genética.</p>
                <button className="ok-button" onClick={() => setShowPumpkinCrossMessage(false)}>Ótimo!</button>
            </div>
        </div>
      )}

       {showAppleCrossMessage && (
        <div className="modal-overlay" onClick={() => setShowAppleCrossMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Polinização Cruzada (Maçã) 🐝🍎</h2>
                <p>As abelhas viajaram pelo pomar e polinizaram suas macieiras com sucesso!</p>
                <button className="ok-button" onClick={() => setShowAppleCrossMessage(false)}>Delícia!</button>
            </div>
        </div>
      )}

      {showPumpkinSelfMessage && (
        <div className="modal-overlay" onClick={() => setShowPumpkinSelfMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Auto-polinização (Abóbora)</h2>
                <p>Sem abelhas ou parceiros por perto, a planta realizou a auto-fecundação após um tempo.</p>
                <p>Isso aumenta a chance de <strong>depressão endogâmica</strong> (plantas menores e mais fracas).</p>
                <button className="ok-button" onClick={() => setShowPumpkinSelfMessage(false)}>Entendi</button>
            </div>
        </div>
      )}

      {showInbreedingMessage && (
        <div className="modal-overlay" onClick={() => setShowInbreedingMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Depressão Endogâmica 🧬</h2>
                <p><strong>Sua planta diminuiu!</strong> O cruzamento entre parentes próximos ou auto-fecundação aumentou a homozigose.</p>
                <p>Isso pode levar a perda de vigor e produtividade (plantas pequenas).</p>
                <button className="ok-button" onClick={() => setShowInbreedingMessage(false)}>Entendi</button>
            </div>
        </div>
      )}

       {showHeterosisMessage && (
        <div className="modal-overlay" onClick={() => setShowHeterosisMessage(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Vigor Híbrido (Heterose) 🚀</h2>
                <p><strong>Sua planta cresceu mais forte!</strong></p>
                <p>O cruzamento entre duas linhagens puras (pequenas) diferentes gerou um híbrido vigoroso e maior que os pais!</p>
                <button className="ok-button" onClick={() => setShowHeterosisMessage(false)}>Incrível!</button>
            </div>
        </div>
      )}

      {showCornHint && (
        <div className="modal-overlay" onClick={() => setShowCornHint(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Dica do Milho 🌽</h2>
                <p>Deseja plantar outra muda de milho? O milho prefere a fecundação cruzada. Sozinho ele tem dificuldade de se reproduzir.</p>
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