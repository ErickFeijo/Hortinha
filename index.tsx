
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã' | 'Feijão';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher' | 'polinizacao_manual';
type FertilizerType = 'organic' | 'chemical' | null; // This type definition will no longer be used directly for plot.fertilizer
type BeeState = 'hidden' | 'visible' | 'dying';
type PlantSize = 'small' | 'normal' | 'large';
type WeatherType = 'sunny' | 'raining' | 'sunny_windy' | 'raining_windy';

interface PlantInfo {
  name: PlantType;
  phenotype: string;
}

const PLANT_CONFIG: Record<PlantType, PlantInfo> = {
  Abóbora: { name: 'Abóbora', phenotype: '🎃' },
  Milho: { name: 'Milho', phenotype: '🌽' },
  Girassol: { name: 'Girassol', phenotype: '🌻' },
  Maçã: { name: 'Maçã', phenotype: '🍎' },
  Feijão: { name: 'Feijão', phenotype: '🫘' },
};

const SEED_TOOLTIPS: Record<PlantType, string> = {
  Abóbora: "Precisa de abelhas. Se não tiver, se autofecunda após um tempo.",
  Milho: "Usa o vento para cruzar. Precisa de um parceiro para se reproduzir.",
  Girassol: "Atrai abelhas! Poliniza com elas ou se autofecunda lentamente.",
  Maçã: "Exige abelhas e outra macieira para gerar sementes.",
  Feijão: "Se autofecunda após 15s, gerando uma planta de tamanho normal.",
};

// New mapping for tool emojis for the selected tool indicator
const TOOL_EMOJIS: Record<ToolType, string> = {
  regador: '🚿',
  adubo_organico: '💩',
  agrotoxico: '☠️',
  colher: '🧺',
  polinizacao_manual: '🖌️',
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
  isBoosted?: boolean;
}

interface PlotState {
  id: number;
  plant: PlantState | null;
  isWatered: boolean;
  hasOrganicFertilizer: boolean; // New: Can have organic fertilizer
  hasChemicalFertilizer: boolean; // New: Can have chemical fertilizer
  hasGreenManureFromBean: boolean; // NEW: Indicates green manure effect from beans
}

interface Connection {
    from: number;
    to: number;
    type: 'Abóbora' | 'Girassol' | 'Maçã' | 'Milho';
}

// NEW: Type definition for inventory counts including pesticide status
type InventoryCounts = {
    count: number;
    withPesticide: number;
};
type InventoryState = Partial<Record<PlantType, Record<PlantSize, InventoryCounts>>>;


interface Notification {
    id: string;
    title: string;
    message: string;
    timestamp: number;
    isNew: boolean;
    onDismiss?: () => void; // Adicionado callback opcional
}

interface PollenSack {
  plant: PlantState;
  sourcePlotId: number;
}

interface ActiveBacterium {
    id: string; // Unique ID for this animation instance
    plotId: number; // The plot it's targeting
    startX: number; // For animation positioning
    startY: number; // For animation positioning
    targetX: number; // For animation positioning
    targetY: number; // For animation positioning
}

// Helper to generate a random starting forecast
const generateInitialForecast = (): WeatherType[] => {
    const weathers: WeatherType[] = ['sunny', 'sunny', 'raining', 'sunny_windy', 'raining_windy'];
    // Simple shuffle
    return Array.from({ length: 4 }, () => weathers[Math.floor(Math.random() * weathers.length)]);
};

const CONNECTION_STYLES: Record<Connection['type'], { color: string; marker: string }> = {
    Abóbora: { color: '#FF8C00', marker: 'url(#arrowhead-pumpkin)' },
    Girassol: { color: '#FFD700', marker: 'url(#arrowhead-sunflower)' },
    Maçã: { color: '#ff4d4d', marker: 'url(#arrowhead-apple)' },
    Milho: { color: '#fefcbf', marker: 'url(#arrowhead-corn)' },
};


const App = () => {
  const [selectedTool, setSelectedTool] = useState<PlantType | ToolType | null>(null);
  const [garden, setGarden] = useState<PlotState[]>(
    Array.from({ length: 16 }, (_, i) => ({ id: i, plant: null, isWatered: false, hasOrganicFertilizer: false, hasChemicalFertilizer: false, hasGreenManureFromBean: false }))
  );
  const [inventory, setInventory] = useState<InventoryState>({});
  const [isInstructionsOpen, setInstructionsOpen] = useState(true);
  const [animatingPlots, setAnimatingPlots] = useState<number[]>([]);
  const [fertilizingPlots, setFertilizingPlots] = useState<number[]>([]);
  
  // State to track the most recently grown plant to trigger reproduction logic for non-beans
  const [lastGrownId, setLastGrownId] = useState<number | null>(null);

  // --- NOTIFICATION SYSTEM ---
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modalStack, setModalStack] = useState<Notification[]>([]);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  
  // --- WEATHER SYSTEM ---
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [forecast, setForecast] = useState<WeatherType[]>(generateInitialForecast());

  // --- MANUAL POLLINATION ---
  const [pollenSack, setPollenSack] = useState<PollenSack | null>(null);
  
  // --- BEAN BACTERIUM ANIMATION ---
  const [activeBacteriumAnimations, setActiveBacteriumAnimations] = useState<ActiveBacterium[]>([]);
  const newlyGrownBeansQueue = useRef(new Set<number>()); // Use a Set for unique plot IDs
  const [beanProcessingTrigger, setBeanProcessingTrigger] = useState(0); // Trigger to process beans

  // Animation state
  const [beeState, setBeeState] = useState<BeeState>('hidden');
  const [manualBeeMode, setManualBeeMode] = useState(false); // New state for manual bee button
  const [isWindy, setIsWindy] = useState(false);
  const [isPollinating, setIsPollinating] = useState(false);
  const [activeConnections, setActiveConnections] = useState<Connection[]>([]);
  const [reproductionTrigger, setReproductionTrigger] = useState(0);

  const cornTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reproducedPlantsRef = useRef<Set<string>>(new Set());
  const growingSproutsRef = useRef(new Set<number>());
  const prevWeatherRef = useRef<WeatherType | undefined>(undefined);

  const hasSunflowers = garden.some(plot => plot.plant?.type === 'Girassol' && plot.plant.stage === 'grown');
  // Check for any chemical pesticides in the garden
  const hasPesticides = garden.some(plot => plot.hasChemicalFertilizer);

  // Derived state for Corn Hint Effect
  const cornPlots = garden.filter(plot => plot.plant?.type === 'Milho');
  const cornCount = cornPlots.length;
  // Check if there is exactly 1 corn and it is fully grown
  const isSingleGrownCorn = cornCount === 1 && cornPlots[0].plant?.stage === 'grown';

  // --- MOBILE UI STATES ---
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
  const [activeMobilePanel, setActiveMobilePanel] = useState<'tools' | 'seeds' | 'inventory' | null>(null);

  // Detect mobile viewport size
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 900);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Helper to add notifications - Agora aceita um callback onDismiss
  const addNotification = useCallback((title: string, message: string, onDismiss?: () => void) => {
      const newNote: Notification = {
          id: Date.now().toString() + Math.random(),
          title,
          message,
          timestamp: Date.now(),
          isNew: true,
          onDismiss, // Armazena o callback
      };

      setNotifications(prev => [newNote, ...prev]);

      // Adiciona ao topo da pilha de modais
      setModalStack(prev => [newNote, ...prev]);

      return newNote.id; // Retorna o ID para possível rastreamento
  }, []);
  
  // Função para fechar o modal superior e executar seu callback onDismiss
  const closeTopModal = useCallback(() => {
    setModalStack(prev => {
        const modalToClose = prev[0]; // Obtém o modal superior antes de fatiar
        const newStack = prev.slice(1);

        if (modalToClose && modalToClose.onDismiss) {
            modalToClose.onDismiss(); // Executa o callback
        }
        return newStack;
    });
  }, []);

  const handleOpenHistory = () => {
      setHistoryOpen(!isHistoryOpen);
      if (!isHistoryOpen) {
          // Mark all as read (visually) when opening
          setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
      }
  };

  const unreadCount = notifications.filter(n => n.isNew).length;

  const findEmptySpot = useCallback((centerId: number, currentGarden: PlotState[]): number | null => {
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
  }, []);

  const createPlant = (type: PlantType, parentIds: string[] = [], isSmall: boolean = false, isHybrid: boolean = false): PlantState => {
    const phenotype = PLANT_CONFIG[type].phenotype;
    return { 
        instanceId: Math.random().toString(36).substring(2, 9),
        type, 
        stage: 'sprout', 
        phenotype, 
        parentIds,
        isSmall,
        isHybrid,
        isBoosted: false
    };
  };

  // Logic for determining offspring genetics (Size rules)
  const determineOffspringGenetics = useCallback((plantA: PlantState, plantB: PlantState) => {
      let isInbreeding = false;
      let isHybrid = false;

      // Check for inbreeding first
      const isAparentOfB = plantB.parentIds?.includes(plantA.instanceId);
      const isBparentOfA = plantA.parentIds?.includes(plantB.instanceId);
      const isSelf = plantA.instanceId === plantB.instanceId;
      
      isInbreeding = isAparentOfB || isBparentOfA || isSelf;

      // Hybrid vigor condition: both parents are small AND they are NOT inbred.
      if (plantA.isSmall && plantB.isSmall && !isInbreeding) {
          isHybrid = true;
      }
      
      return { isInbreeding, isHybrid };
  }, []);

  // New function to handle the entire bean growth and reproduction sequence
  const processBeanGrowth = useCallback((plotId: number, plantInstanceId: string) => {
    const bacteriumAnimationId = Math.random().toString(36).substring(2, 9);
    
    // Set initial bacterium animation, actual positioning done in useEffect
    setActiveBacteriumAnimations(prev => [...prev, { id: bacteriumAnimationId, plotId, startX: 0, startY: 0, targetX: 0, targetY: 0 }]);
    setAnimatingPlots(prev => [...prev, plotId]); // Add plot to animating

    setTimeout(() => {
        // Remove bacterium animation
        setActiveBacteriumAnimations(prev => prev.filter(anim => anim.id !== bacteriumAnimationId));
        setAnimatingPlots(prev => prev.filter(pId => pId !== plotId)); // Remove plot from animating

        setGarden(currentGarden => {
            const targetPlot = currentGarden.find(p => p.id === plotId);
            if (targetPlot?.plant?.instanceId === plantInstanceId) {
                return currentGarden.map(p =>
                    p.id === plotId
                        ? { ...p, plant: { ...p.plant!, isBoosted: true } }
                        : p
                );
            }
            return currentGarden;
        });
        addNotification(
            "Fixação de Nitrogênio 🦠",
            "As raízes do feijão soltam substâncias químicas no solo que atraem bactérias do gênero Rhizobium. A bactéria possui uma enzima chamada nitrogenase, que faz a mágica: Transforma N₂ do ar → em NH₃ (amônia)"
        );

        // --- SELF-POLLINATION (after fixation) ---
        setTimeout(() => {
            setGarden(currentGarden => { // Using a fresh state for verification
                const plantStillThere = currentGarden[plotId]?.plant?.instanceId === plantInstanceId;
                
                if (plantStillThere) {
                    setAnimatingPlots(prev => [...prev, plotId]); // Start animation for self-pollination effect
                    
                    setTimeout(() => {
                        setAnimatingPlots(prev => prev.filter(pId => pId !== plotId));
                        let plantAdded = false;
                        setGarden(innerGarden => { // Use innerGarden to avoid stale closure
                            const parentPlot = innerGarden[plotId];
                            if (!parentPlot?.plant || parentPlot.plant.instanceId !== plantInstanceId) {
                                return innerGarden;
                            }

                            const emptySpotId = findEmptySpot(plotId, innerGarden);
                            
                            if (emptySpotId !== null) {
                                const newGarden = [...innerGarden];
                                newGarden[emptySpotId].plant = createPlant(
                                    'Feijão',
                                    [plantInstanceId],
                                    false,
                                    false
                                );
                                plantAdded = true;
                                return newGarden;
                            }
                            return innerGarden;
                        });
                        
                        if (plantAdded) {
                            addNotification("Auto-fecundação (Feijão) 🫘", "O feijão é uma planta autógama. Ele se reproduz sozinho mantendo seu tamanho normal, sem perda de vigor!");
                        }
                    }, 1500); // Duration for self-pollination visual effect
                }
                return currentGarden; // Ensure previous garden state is passed through if no changes
            });
        }, 15000); // 15 seconds for self-pollination after nitrogen fixation

    }, 6000); // Animation duration for bacterium
  }, [addNotification, findEmptySpot]); // Dependencies for processBeanGrowth

  const growPlant = useCallback((plotId: number) => {
    if (growingSproutsRef.current.has(plotId)) return;
    growingSproutsRef.current.add(plotId);

    setTimeout(() => {
        let plantGrew = false;
        let plantType: PlantType | null = null;
        setGarden(currentGarden => {
            const plot = currentGarden.find(p => p.id === plotId);
            if (plot?.plant?.stage === 'sprout') {
                plantGrew = true;
                plantType = plot.plant.type; // Capture type here
                return currentGarden.map(p =>
                    p.id === plotId ? { ...p, plant: { ...p.plant, stage: 'grown' as const } } : p
                );
            }
            return currentGarden;
        });

        if (plantGrew) {
            if (plantType === 'Feijão') {
                newlyGrownBeansQueue.current.add(plotId);
                setBeanProcessingTrigger(prev => prev + 1); // Trigger the processing effect for beans
            } else {
                setLastGrownId(plotId); // Only for non-bean plants
            }
        }
        growingSproutsRef.current.delete(plotId);
    }, 2000);
  }, [setLastGrownId]); // setLastGrownId is a stable state setter, no need in dependency array

  // Effect to process the queue of newly grown beans
  useEffect(() => {
    if (newlyGrownBeansQueue.current.size === 0) return;

    // Get the first plotId from the queue
    const plotId = newlyGrownBeansQueue.current.values().next().value;
    if (plotId === undefined) return; // Should not happen with size check

    const grownPlot = garden[plotId];
    if (!grownPlot || !grownPlot.plant || grownPlot.plant.stage !== 'grown') {
        newlyGrownBeansQueue.current.delete(plotId); // Remove invalid entry
        setBeanProcessingTrigger(prev => prev + 1); // Re-trigger to check next item
        return;
    }
    
    // Call the dedicated processing function for this bean
    processBeanGrowth(plotId, grownPlot.plant.instanceId);

    // Remove it from the queue immediately after initiating its process
    newlyGrownBeansQueue.current.delete(plotId);

    // Use a small delay and re-trigger if there are more beans in the queue
    const timer = setTimeout(() => {
      if (newlyGrownBeansQueue.current.size > 0) {
        setBeanProcessingTrigger(prev => prev + 1); // Process next bean if available
      }
    }, 100); // Small delay to allow React to update
    return () => clearTimeout(timer);

  }, [beanProcessingTrigger, garden, processBeanGrowth]); // Dependencies for this effect


  // Effect to position the bacterium animations
  useEffect(() => {
    setActiveBacteriumAnimations(prevActiveAnimations => {
        let updatedAnimations = false;
        const newAnimations = prevActiveAnimations.map(bacterium => {
            // Only position if start/target are not yet set (or a better flag)
            // And if it targets a valid plot
            if (bacterium.startX === 0 && bacterium.startY === 0) {
                const plotElement = document.querySelector(`.garden-plot[aria-label^="Lote de terra ${bacterium.plotId + 1}"]`);
                const appContainer = document.querySelector('.app-container');
                
                if (plotElement && appContainer) {
                    const plotRect = plotElement.getBoundingClientRect();
                    const appRect = appContainer.getBoundingClientRect();

                    const targetX = (plotRect.left - appRect.left) + (plotRect.width / 2);
                    const targetY = (plotRect.top - appRect.top) + (plotRect.height / 2);

                    const startSide = Math.floor(Math.random() * 4);
                    let startX, startY;

                    switch(startSide) {
                        case 0: // Top
                            startX = Math.random() * appRect.width;
                            startY = -50;
                            break;
                        case 1: // Right
                            startX = appRect.width + 50;
                            startY = Math.random() * appRect.height;
                            break;
                        case 2: // Bottom
                            startX = Math.random() * appRect.width;
                            startY = appRect.height + 50;
                            break;
                        default: // Left
                            startX = -50;
                            startY = Math.random() * appRect.height;
                    }
                    updatedAnimations = true;
                    return { ...bacterium, startX, startY, targetX, targetY };
                }
            }
            return bacterium;
        });
        return updatedAnimations ? newAnimations : prevActiveAnimations;
    });
  }, [activeBacteriumAnimations]); // Only re-run when activeBacteriumAnimations state changes


    const checkCornPollination = useCallback(() => {
        let pollinationHappened = false;
        setGarden(currentGarden => {
            const availableCorns = currentGarden.filter(p =>
                p.plant?.type === 'Milho' &&
                p.plant.stage === 'grown' &&
                !reproducedPlantsRef.current.has(p.plant.instanceId)
            );

            if (availableCorns.length < 2) {
                return currentGarden;
            }

            const shuffledCorns = [...availableCorns].sort(() => 0.5 - Math.random());
            const availableSpots = currentGarden
                .map((plot, id) => !plot.plant ? id : -1)
                .filter(id => id !== -1)
                .sort(() => 0.5 - Math.random());

            const pairs = [];
            for (let i = 0; i < Math.floor(shuffledCorns.length / 2); i++) {
                pairs.push([shuffledCorns[i * 2], shuffledCorns[i * 2 + 1]]);
            }
            
            if (pairs.length === 0) return currentGarden;

            const newPlantsInfo: { plotId: number; plant: PlantState; isHybrid: boolean; isInbreeding: boolean }[] = [];
            const newConnections: Connection[] = [];
            
            pairs.forEach((pair) => {
                if (availableSpots.length === 0) return;

                const [cornA, cornB] = pair;
                const emptySpotId = availableSpots.pop();

                if (emptySpotId !== undefined && cornA.plant && cornB.plant) {
                    reproducedPlantsRef.current.add(cornA.plant.instanceId);
                    reproducedPlantsRef.current.add(cornB.plant.instanceId);

                    newConnections.push({ from: cornA.id, to: cornB.id, type: 'Milho' });
                    newConnections.push({ from: cornB.id, to: cornA.id, type: 'Milho' });

                    const { isInbreeding, isHybrid } = determineOffspringGenetics(cornA.plant, cornB.plant);
                    const newPlant = createPlant('Milho', [cornA.plant.instanceId, cornB.plant.instanceId], isInbreeding, isHybrid);
                    newPlantsInfo.push({ plotId: emptySpotId, plant: newPlant, isHybrid, isInbreeding });
                }
            });

            if (newConnections.length > 0) {
              pollinationHappened = true;
              setActiveConnections(newConnections);

              setTimeout(() => {
                  setActiveConnections([]);
                  if (newPlantsInfo.length > 0) {
                      setGarden(g => {
                          const newGarden = [...g];
                          newPlantsInfo.forEach(info => {
                              if (!newGarden[info.plotId].plant) {
                                  newGarden[info.plotId].plant = info.plant;
                              }
                          });
                          return newGarden;
                      });

                      newPlantsInfo.forEach(info => {
                          if (info.isHybrid) addNotification("Vigor Híbrido (Heterose) 🚀", "O vento cruzou duas plantas e gerou um híbrido vigoroso!");
                          else if (info.isInbreeding) addNotification("Depressão Endogâmica 🧬", "O vento cruzou plantas parentes, gerando uma menor.");
                          else addNotification("Polinização do Milho 🌽", "O vento polinizou um par de milhos com sucesso!");
                      });
                  }
              }, 3500);
            }
            
            return currentGarden;
        });

        if (pollinationHappened) {
            setIsPollinating(true);
            setTimeout(() => setIsPollinating(false), 3500);
        }

    }, [determineOffspringGenetics, addNotification]);

  const advanceWeather = useCallback(() => {
    setForecast(currentForecast => {
        const [nextWeather, ...rest] = currentForecast;
        setWeather(nextWeather); // Update current weather
        
        // Add a new random forecast to the end
        const weathers: WeatherType[] = ['sunny', 'sunny', 'raining', 'sunny_windy', 'raining_windy'];
        const newRandomWeather = weathers[Math.floor(Math.random() * weathers.length)];
        return [...rest, newRandomWeather];
    });
  }, []);

  // Combined Weather Effects Logic
  useEffect(() => {
    const prevWeather = prevWeatherRef.current;
    
    const isCurrentlyWindy = weather.includes('_windy');
    const wasPreviouslyWindy = prevWeather ? prevWeather.includes('_windy') : false;
    const isCurrentlyRaining = weather.includes('raining');
    const wasPreviouslyRaining = prevWeather ? prevWeather.includes('raining') : false;

    // --- Set visual state based on current weather ---
    setIsWindy(isCurrentlyWindy);

    // --- Handle weather change LOGIC ---

    // RAIN LOGIC (runs if it is raining now)
    if (isCurrentlyRaining) {
        const dryPlots = garden.filter(p => !p.isWatered);
        const sproutsOnWateredPlots = garden.filter(p => p.isWatered && p.plant?.stage === 'sprout');

        sproutsOnWateredPlots.forEach(plot => {
            growPlant(plot.id);
        });

        if (dryPlots.length > 0) {
            setGarden(currentGarden => 
                currentGarden.map(p => 
                    !p.isWatered ? { ...p, isWatered: true } : p
                )
            );

            const sproutsOnDryPlots = dryPlots.filter(p => p.plant?.stage === 'sprout');
            sproutsOnDryPlots.forEach(plot => {
                growPlant(plot.id);
            });
        }
    }
    // DRY PLOTS AFTER RAIN LOGIC (runs if it was raining, but not anymore)
    else if (wasPreviouslyRaining && !isCurrentlyRaining) {
        setGarden(currentGarden => 
            currentGarden.map(p => ({ ...p, isWatered: false }))
        );
    }

    // WIND LOGIC
    if (!wasPreviouslyWindy && isCurrentlyWindy) {
        reproducedPlantsRef.current.clear();
        const grownCorns = garden.filter(p => p.plant?.type === 'Milho' && p.plant.stage === 'grown');
        if (grownCorns.length < 2) {
            setIsPollinating(false);
            setTimeout(() => addNotification("Vento sem Sementes 🌬️", "O vento soprou, mas não havia milhos suficientes para polinizar."), 1000);
        } else {
            checkCornPollination();
        }
    } 
    else if (wasPreviouslyWindy && !isCurrentlyWindy) {
        setIsPollinating(false);
        reproducedPlantsRef.current.clear();
    }

    prevWeatherRef.current = weather;

}, [weather, garden, addNotification, growPlant, checkCornPollination]);


  // Effect 1: State Transitions based on Garden Conditions (Bees)
  useEffect(() => {
    if (hasPesticides) {
        if (beeState === 'visible') {
            setBeeState('dying');
        }
    } else {
        // Bees appear if there are sunflowers OR if manually activated
        const shouldHaveBees = hasSunflowers || manualBeeMode;

        if (shouldHaveBees) {
            if (beeState !== 'visible') {
                setBeeState('visible');
            }
        } else {
            if (beeState !== 'hidden') {
                setBeeState('hidden');
            }
        }
    }
  }, [hasSunflowers, hasPesticides, beeState, manualBeeMode]);

  // Effect 2: Animation Timer for Dying Bees
  useEffect(() => {
    if (beeState === 'dying') {
        const timer = setTimeout(() => {
            setBeeState('hidden');
            // If manual mode was on, turn it off to reflect the "death" event, or keep it on?
            // Let's keep the state simple: Pesticides override everything.
            addNotification(
                "Alerta Ambiental ⚠️",
                "O uso de agrotóxicos afeta abelhas causando mortalidade, alterando seu comportamento e prejudicando a colônia."
            );
        }, 3500); 
        return () => clearTimeout(timer);
    }
  }, [beeState, addNotification]);

  // Effect 3: Corn Hint Timer
  useEffect(() => {
    if (isSingleGrownCorn) {
        // If exactly one grown corn exists and timer isn't running, start it
        if (!cornTimeoutRef.current) {
            cornTimeoutRef.current = setTimeout(() => {
                addNotification(
                    "Dica do Milho 🌽",
                    "Deseja plantar outra muda de milho? O milho prefere a fecundação cruzada. Sozinho ele tem dificuldade de se reproduzir. A parte masculina amadurece antes da feminina (protandria)"
                );
                cornTimeoutRef.current = null;
            }, 30000); // 30 seconds
        }
    } else {
        // If condition not met (0 corn, >1 corn, or 1 sprout), clear timer
        if (cornTimeoutRef.current) {
            clearTimeout(cornTimeoutRef.current);
            cornTimeoutRef.current = null;
        }
    }

    return () => {
        if (cornTimeoutRef.current) {
            clearTimeout(cornTimeoutRef.current);
        }
    };
  }, [isSingleGrownCorn, cornCount, addNotification]);

  // Effect: Clear pollen sack if tool changes
  useEffect(() => {
    if (selectedTool !== 'polinizacao_manual') {
      setPollenSack(null);
    }
  }, [selectedTool]);


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

  // Reusable function for Pollination logic (Pumpkin, Apple, Sunflower)
  // Returns true if a pollination was initiated
  const tryPollination = useCallback((currentGarden: PlotState[], plantType: 'Abóbora' | 'Girassol' | 'Maçã') => {
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

      // NEW: Check for parent-child incompatibility in Apples (Maçã)
      if (plantType === 'Maçã') {
        const isSourceParentOfPartner = partner.plant!.parentIds?.includes(source.plant!.instanceId);
        const isPartnerParentOfSource = source.plant!.parentIds?.includes(partner.plant!.instanceId);
        if (isSourceParentOfPartner || isPartnerParentOfSource) {
            addNotification("Polinização Inválida (Maçã) 🍎", "Autoincompatibilidade gametofítica: A polinização entre plantas parentes é evitada para manter a diversidade genética.");
            reproducedPlantsRef.current.add(sourceId); // Still mark source as used to avoid immediate re-attempt
            reproducedPlantsRef.current.add(partnerId); // Mark partner too
            return false; // Prevent pollination
        }
      }

      // EXECUTE
      setActiveConnections([{ from: source.id, to: partner.id, type: plantType }]);
      setAnimatingPlots([source.id, partner.id]);

      // Mark source as used immediately
      reproducedPlantsRef.current.add(sourceId);
      // If partner was also a seeker, mark them too so they don't initiate their own separate event immediately
      if (!reproducedPlantsRef.current.has(partnerId)) {
         reproducedPlantsRef.current.add(partnerId);
      }

      setTimeout(() => {
          setActiveConnections([]);
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
                  if (isHybrid) {
                      addNotification("Vigor Híbrido (Heterose) 🚀", "Sua planta cresceu mais forte! O cruzamento entre duas linhagens puras (pequenas) diferentes gerou um híbrido vigoroso e maior que os pais!");
                  } else if (isInbreeding) {
                      addNotification("Depressão Endogâmica 🧬", "Sua planta diminuiu! O cruzamento entre parentes próximos ou auto-fecundação aumentou a homozigose. Isso pode levar a perda de vigor.");
                  } else {
                      if (plantType === 'Abóbora') {
                          addNotification("Polinização Cruzada (Abóbora) 🐝", "Graças às abelhas, o pólen viajou de uma flor para outra! Isso garante maior diversidade genética.");
                      }
                      if (plantType === 'Maçã') {
                          addNotification("Polinização Cruzada (Maçã) 🐝🍎", "As abelhas viajaram pelo pomar e polinizaram suas macieiras com sucesso!");
                      }
                      if (plantType === 'Girassol') {
                          addNotification("Polinização Solar (Girassol) 🌻🐝", "As abelhas transportaram pólen de girassol por todo o jardim! Sementes vigorosas e cheias foram geradas.");
                      }
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
  }, [beeState, determineOffspringGenetics, addNotification, findEmptySpot]);


  // Effect: Check for Bee Pollination loop (Pumpkin, Apple, Sunflower)
  // This runs when bees are visible or when the garden updates (via reproduction trigger)
  useEffect(() => {
      if (beeState === 'visible') {
          const timer = setTimeout(() => {
              // Try Pumpkin
              const pumpkinSuccess = tryPollination(garden, 'Abóbora');
              // Try Sunflower (Scenario A)
              const sunflowerSuccess = tryPollination(garden, 'Girassol');

              if (!pumpkinSuccess && !sunflowerSuccess) {
                   // Try Apple
                   tryPollination(garden, 'Maçã');
              }
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [beeState, garden, reproductionTrigger, tryPollination]);


  // Effect 4: Reproduction Logic for non-bean plants (Triggered when a plant finishes growing)
  useEffect(() => {
    if (lastGrownId === null) return;

    const grownPlot = garden[lastGrownId];
    if (!grownPlot || !grownPlot.plant || grownPlot.plant.stage !== 'grown') {
        setLastGrownId(null);
        return;
    }

    const plantType = grownPlot.plant.type;
    
    // Immediate check for corn pollination when it grows during windy weather
    if (plantType === 'Milho' && weather.includes('_windy')) {
        checkCornPollination();
    }


    if (plantType === 'Abóbora') {
        const currentPlantId = grownPlot.plant.instanceId;
        setTimeout(() => {
            setGarden(currentGarden => {
                if (beeState === 'visible') {
                    return currentGarden;
                }
                const parentPlot = currentGarden.find(p => p.id === lastGrownId);
                if (!parentPlot || !parentPlot.plant || parentPlot.plant.instanceId !== currentPlantId || reproducedPlantsRef.current.has(currentPlantId)) {
                    return currentGarden;
                }
                const hasPartner = currentGarden.some(p => p.plant?.type === 'Abóbora' && p.plant.stage === 'grown' && p.plant.instanceId !== currentPlantId);
                if (hasPartner) {
                    return currentGarden;
                }
                const emptySpotId = findEmptySpot(lastGrownId, currentGarden);
                if (emptySpotId !== null) {
                    reproducedPlantsRef.current.add(currentPlantId);
                    // Notify here to ensure it's triggered when the logic branch is taken
                    addNotification("Auto-polinização (Abóbora)", "Sem abelhas ou parceiros por perto, a planta se auto-fecundou. Isso aumenta a chance de depressão endogâmica.");
                    const newGarden = [...currentGarden];
                    newGarden[emptySpotId].plant = createPlant('Abóbora', [currentPlantId], true, false);
                    return newGarden;
                }
                return currentGarden;
            });
        }, 30000);
    } else if (plantType === 'Girassol') {
        const currentPlantId = grownPlot.plant.instanceId;
        setTimeout(() => {
            setGarden(currentGarden => {
                if (beeState === 'visible') {
                    return currentGarden;
                }
                const parentPlot = currentGarden.find(p => p.id === lastGrownId);
                if (!parentPlot || !parentPlot.plant || parentPlot.plant.instanceId !== currentPlantId || reproducedPlantsRef.current.has(currentPlantId)) {
                    return currentGarden;
                }
                const hasPartner = currentGarden.some(p => p.plant?.type === 'Girassol' && p.plant.stage === 'grown' && p.plant.instanceId !== currentPlantId);
                if (hasPartner) {
                    return currentGarden;
                }
                const emptySpotId = findEmptySpot(lastGrownId, currentGarden);
                if (emptySpotId !== null) {
                    reproducedPlantsRef.current.add(currentPlantId);
                    const newGarden = [...currentGarden];
                    newGarden[emptySpotId].plant = createPlant('Girassol', [currentPlantId], true, false);
                    
                    // Trigger notification directly here for Sunflower
                    addNotification("Auto-polinização (Girassol) 🌻", "Sem abelhas ou outros girassóis por perto, a planta se auto-polinizou. Isso gera sementes menores.");
                    
                    return newGarden;
                }
                return currentGarden;
            });
        }, 30000);
    } else if (plantType === 'Maçã') {
        // APPLE LOGIC
        if (beeState === 'visible') {
            setReproductionTrigger(prev => prev + 1);
        }
    }

    setLastGrownId(null); // Reset trigger
  }, [lastGrownId, garden, beeState, determineOffspringGenetics, addNotification, weather, checkCornPollination, findEmptySpot]);
  
  const handlePlotClick = useCallback((plotId: number) => {
    // If a mobile panel is open, close it first.
    // BUT DO NOT return, continue processing the plot click.
    if (isMobile && activeMobilePanel !== null) {
      setActiveMobilePanel(null);
      // Do not return here. The plot click logic should proceed.
    }

    const plot = garden.find(p => p.id === plotId);
    if (!plot) return;

    if (selectedTool === 'polinizacao_manual') {
        // --- MANUAL POLLINATION LOGIC ---
        if (!pollenSack) {
            // 1. COLLECT POLLEN
            if (plot.plant && plot.plant.stage === 'grown') {
                setPollenSack({ plant: plot.plant, sourcePlotId: plot.id });
            }
        } else {
            // 2. APPLY POLLEN
            const sourcePlant = pollenSack.plant;

            // CASE A: Self-Pollination
            if (pollenSack.sourcePlotId === plotId) {
                if (sourcePlant.type === 'Maçã') {
                    addNotification("Polinização Inválida 🍎", "Autoincompatibilidade gametofítica: impede que o próprio pólen fecunde as flores da mesma planta ou de plantas geneticamente muito próximas.");
                    return;
                }
                
                const emptySpotId = findEmptySpot(plotId, garden);
                if (emptySpotId !== null) {
                    const { isInbreeding, isHybrid } = determineOffspringGenetics(sourcePlant, sourcePlant);
                    
                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant(sourcePlant.type, [sourcePlant.instanceId], isInbreeding, isHybrid);
                        return newGarden;
                    });
                    
                    addNotification("Autofecundação Manual 🖌️", `${sourcePlant.type} foi autofecundada com sucesso.`);
                    setPollenSack(null);
                } else {
                    addNotification("Sem Espaço!", "Não há espaço para um novo broto.");
                }
            } 
            // CASE B: Cross-Pollination
            else if (plot.plant && plot.plant.stage === 'grown' && plot.plant.type === sourcePlant.type) {
                const targetPlant = plot.plant;

                // NEW: Check for parent-child incompatibility in Apples (Maçã) for manual pollination
                if (sourcePlant.type === 'Maçã') {
                    const isSourceParentOfTarget = targetPlant.parentIds?.includes(sourcePlant.instanceId);
                    const isTargetParentOfSource = sourcePlant.parentIds?.includes(targetPlant.instanceId);
                    if (isSourceParentOfTarget || isTargetParentOfSource) {
                        addNotification("Polinização Inválida (Maçã) 🍎", "Autoincompatibilidade gametofítica: A polinização manual entre plantas parentes é evitada.");
                        setPollenSack(null); // Clear pollen sack even on invalid attempt
                        return; // Prevent pollination
                    }
                }

                const emptySpotId = findEmptySpot(plotId, garden);

                if (emptySpotId !== null) {
                    const { isInbreeding, isHybrid } = determineOffspringGenetics(sourcePlant, targetPlant);

                    setGarden(prev => {
                        const newGarden = [...prev];
                        newGarden[emptySpotId].plant = createPlant(sourcePlant.type, [sourcePlant.instanceId, targetPlant.instanceId], isInbreeding, isHybrid);
                        return newGarden;
                    });
                    
                    if (isHybrid) addNotification("Vigor Híbrido Manual 🚀", "A polinização manual entre as duas plantas gerou um híbrido!");
                    else if (isInbreeding) addNotification("Endogamia Manual 🧬", "O cruzamento manual entre parentes gerou uma planta menor.");
                    else addNotification("Polinização Cruzada Manual 🖌️", `${sourcePlant.type} foi polinizado com sucesso!`);
                    
                    setPollenSack(null);
                } else {
                    addNotification("Sem Espaço!", "Não há espaço para um novo broto.");
                }
            } else {
                addNotification("Alvo Inválido", "Você só pode polinizar plantas adultas da mesma espécie.");
            }
        }
    } else if (selectedTool === 'colher' && plot.plant) {
        // --- UNIFIED HARVEST LOGIC ---
        const harvestedPlot = plot; // The plot at the time of click
        const harvestedPlant = harvestedPlot.plant!;
        const type = harvestedPlant.type;

        // 1. Calculate size and update inventory immediately based on the state AT CLICK TIME
        // Only if it is grown
        if (harvestedPlant.stage === 'grown') {
            let size: PlantSize = 'normal';
            const hadChemicalFertilizer = harvestedPlot.hasChemicalFertilizer; // Capture this flag
            if (harvestedPlant.isHybrid || harvestedPlot.hasOrganicFertilizer || harvestedPlot.hasChemicalFertilizer || harvestedPlant.isBoosted || harvestedPlot.hasGreenManureFromBean) size = 'large';
            else if (harvestedPlant.isSmall) size = 'small';

            setInventory(currentInventory => {
                const currentTypeInventory = currentInventory[type] || {};
                const currentSizeCounts = currentTypeInventory[size] || { count: 0, withPesticide: 0 };
                
                return {
                    ...currentInventory,
                    [type]: {
                        ...currentTypeInventory,
                        [size]: {
                            count: currentSizeCounts.count + 1,
                            withPesticide: currentSizeCounts.withPesticide + (hadChemicalFertilizer ? 1 : 0),
                        }
                    }
                };
            });
        }

        // 2. Handle garden updates and side-effects
        if (type === 'Feijão' && harvestedPlant.stage === 'grown') {
            const otherPlantPlotIds = garden.filter(p => p.id !== plotId && p.plant).map(p => p.id);

            // IMEDIATO: Feijão desaparece do campo
            // Update: Reset fertilizer flags for the harvested plot
            setGarden(currentGarden => currentGarden.map(p => (p.id === plotId ? { ...p, plant: null, isWatered: false, hasOrganicFertilizer: false, hasChemicalFertilizer: false, hasGreenManureFromBean: false } : p)));

            // 1. Mostrar mensagem "Dica de Colheita (Feijão)"
            addNotification(
                "Dica de Colheita (Feijão) 🌱", 
                "Corte a planta na superfície, deixando as raízes no solo. Os nódulos das bactérias ficam e liberam nitrogênio no solo.",
                () => {
                    // Este callback é executado quando a "Dica de Colheita" é dispensada
                    // console.log("Dica de Colheita dismissed. Showing Adubação Verde...");
                    // 2. Mostrar mensagem "Adubação Verde" - Envolvido em setTimeout para evitar race condition
                    setTimeout(() => {
                        addNotification(
                            "Adubação Verde! 🌱✨",
                            "As raízes do feijão liberaram nitrogênio, fertilizando todas as outras plantas na sua horta!",
                            () => {
                                // Este callback é executado quando a "Adubação Verde" é dispensada
                                // console.log("Adubação Verde dismissed. Triggering animation...");

                                if (otherPlantPlotIds.length > 0) {
                                    setFertilizingPlots(otherPlantPlotIds); // Inicia a animação

                                    setTimeout(() => {
                                        setFertilizingPlots([]); // Termina a animação
                                        setGarden(currentGarden => {
                                            return currentGarden.map(p => {
                                                if (otherPlantPlotIds.includes(p.id)) {
                                                    // Update: Set NEW green manure flag
                                                    return { ...p, hasGreenManureFromBean: true };
                                                }
                                                return p;
                                            });
                                        });
                                        // console.log("Fertilization animation complete and fertilizer applied.");
                                    }, 3500); // Duração da animação (1.5s) + um pequeno delay para garantir que seja visível
                                } else {
                                    addNotification("Sem Plantas para Adubar", "Não há outras plantas na horta para se beneficiar da adubação verde.");
                                    // console.log("No other plants to fertilize.");
                                }
                            }
                        );
                    }, 0); // Pequeno atraso para garantir que o modal anterior seja fechado
                }
            );
        } else {
            // For other plants or sprouts, just update the garden immediately
            // Update: Reset fertilizer flags
            setGarden(currentGarden => currentGarden.map(p => (p.id === plotId ? { ...p, plant: null, isWatered: false, hasOrganicFertilizer: false, hasChemicalFertilizer: false, hasGreenManureFromBean: false } : p)));
        }
    } else {
        // --- OTHER TOOLS LOGIC ---
        setGarden(currentGarden => {
            const newGarden = [...currentGarden];
            const currentPlot = newGarden.find(p => p.id === plotId);
            if (!currentPlot) return currentGarden;

            // Reset green manure from bean if planting a new plant
            if (selectedTool && Object.keys(PLANT_CONFIG).includes(selectedTool) && !currentPlot.plant) {
                currentPlot.plant = createPlant(selectedTool as PlantType);
                currentPlot.hasGreenManureFromBean = false; // New plant resets this
                currentPlot.hasOrganicFertilizer = false;
                currentPlot.hasChemicalFertilizer = false;

                if (weather.includes('raining')) {
                    currentPlot.isWatered = true;
                    growPlant(currentPlot.id);
                }
                return newGarden;
            }
            
            if (selectedTool === 'regador' && currentPlot.plant?.stage === 'sprout' && !currentPlot.isWatered) {
                currentPlot.isWatered = true;
                growPlant(currentPlot.id);
                return newGarden;
            }

            if (selectedTool === 'adubo_organico' && currentPlot.plant) {
                // Update: Set organic fertilizer flag, clear green manure from bean
                currentPlot.hasOrganicFertilizer = true;
                currentPlot.hasGreenManureFromBean = false;
                return newGarden;
            }

            if (selectedTool === 'agrotoxico' && currentPlot.plant) {
                // Update: Set chemical fertilizer flag, clear green manure from bean
                currentPlot.hasChemicalFertilizer = true;
                currentPlot.hasGreenManureFromBean = false;
                return newGarden;
            }
            
            return currentGarden;
        });
    }
  }, [selectedTool, growPlant, weather, pollenSack, garden, determineOffspringGenetics, addNotification, isMobile, activeMobilePanel, findEmptySpot]);

  // Helper to get coordinates for SVG line
  const getCoordinates = (index: number) => {
    const col = index % 4;
    const row = Math.floor(index / 4);
    // Return center of the cell (0.5 to 3.5 range)
    return { x: col + 0.5, y: row + 0.5 };
  };

  const getWeatherIcon = (weatherType: WeatherType) => {
    switch (weatherType) {
        case 'raining': return '🌧️';
        case 'sunny_windy': return '☀️🌬️';
        case 'raining_windy': return '🌧️🌬️';
        default: return '☀️';
    }
  }

  // Handle tool/seed selection and close mobile panel if active
  const handleSelectTool = useCallback((tool: PlantType | ToolType | null) => {
    setSelectedTool(tool);
    if (isMobile) {
      setActiveMobilePanel(null); // Close the panel on selection
    }
  }, [isMobile]);

  return (
    <div className={`app-container ${weather.includes('raining') ? 'is-raining' : ''} ${isMobile ? 'is-mobile' : ''}`}>
      {/* Wind Overlay */}
      {isWindy && (
          <div className={`wind-overlay ${isPollinating ? 'is-pollinating' : ''}`}>
              <div className="wind-line"></div>
              <div className="wind-line"></div>
              <div className="wind-line"></div>
              <div className="wind-line"></div>
              <div className="wind-line"></div>
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
      
      {/* Bacterium Animation */}
      {activeBacteriumAnimations.map(bacterium => (
        <div 
            key={bacterium.id}
            className="bacterium-animation" 
            style={{ 
                '--start-x': `${bacterium.startX}px`,
                '--start-y': `${bacterium.startY}px`,
                '--target-x': `${bacterium.targetX}px`,
                '--target-y': `${bacterium.targetY}px`,
            } as React.CSSProperties}
        >🦠</div>
      ))}
      
      {/* NOTIFICATION SYSTEM UI */}
      <div className="notification-wrapper">
          <button 
            className={`notification-bell ${unreadCount > 0 ? 'has-unread' : ''}`} 
            onClick={handleOpenHistory}
            aria-label="Notificações"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22ZM18 16V11C18 7.93 16.36 5.36 13.5 4.68V4C13.5 3.17 12.83 2 12 2C11.17 2 10.5 3.17 10.5 4V4.68C7.63 5.36 6 7.92 6 11V16L4 18V19H20V18L18 16Z"/>
            </svg>
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>

          {isHistoryOpen && (
              <div className="history-panel">
                  <h3>Histórico</h3>
                  {notifications.length === 0 ? (
                      <p className="empty-history">Nenhuma notificação ainda.</p>
                  ) : (
                      <div className="history-list">
                          {notifications.map(note => (
                              <div key={note.id} className={`history-item ${note.isNew ? 'unread' : ''}`}>
                                  <div className="history-title">{note.title}</div>
                                  <div className="history-message">{note.message}</div>
                                  <div className="history-time">
                                      {new Date(note.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </div>
                              </div>
                          ))}
                      </div>
                  )}
              </div>
          )}
      </div>

      {/* WEATHER FORECAST UI */}
      {/* Desktop Version */}
      {!isMobile && (
        <div className="weather-forecast">
            <div className="forecast-now">
                <span>Agora:</span>
                <span className="weather-icon">{getWeatherIcon(weather)}</span>
            </div>
            <div className="forecast-future">
                {forecast.map((fc, index) => (
                    <div key={index} className="forecast-item">
                        <span className="weather-icon">{getWeatherIcon(fc)}</span>
                    </div>
                ))}
            </div>
            <button 
              className="advance-weather-button" 
              onClick={advanceWeather}
              data-tooltip="Avançar tempo"
              aria-label="Avançar previsão do tempo"
            >
              ⏭️
            </button>
        </div>
      )}

      {/* Mobile Version (new button) */}
      {isMobile && (
        <button
          className="mobile-weather-button"
          onClick={advanceWeather}
          aria-label={`Tempo atual: ${weather}. Clique para avançar.`}
        >
          <span className="weather-icon">{getWeatherIcon(weather)}</span>
        </button>
      )}

      <header className="header">
        <h1>Germina</h1>
        <p>Plante, cuide e colha para ver a genética em ação!</p>
      </header>
      
      <main className={`garden-container ${pollenSack ? 'carrying-pollen' : ''}`}>
        {/* Connection Overlay for Corn and Pumpkin */}
        <svg className="connection-overlay" viewBox="0 0 4 4" preserveAspectRatio="none">
             <defs>
                <marker id="arrowhead-pumpkin" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill="#FF8C00" />
                </marker>
                <marker id="arrowhead-sunflower" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill="#FFD700" />
                </marker>
                <marker id="arrowhead-apple" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill="#ff4d4d" />
                </marker>
                <marker id="arrowhead-corn" markerWidth="5" markerHeight="3.5" refX="4" refY="1.75" orient="auto">
                    <polygon points="0 0, 5 1.75, 0 3.5" fill="#fefcbf" />
                </marker>
            </defs>
            {activeConnections.map((conn, index) => {
                const style = CONNECTION_STYLES[conn.type];
                return (
                    <line 
                        key={index}
                        x1={getCoordinates(conn.from).x} 
                        y1={getCoordinates(conn.from).y} 
                        x2={getCoordinates(conn.to).x} 
                        y2={getCoordinates(conn.to).y} 
                        className={`connection-line ${conn.type === 'Milho' ? 'corn-connection' : 'bee-connection'}`}
                        stroke={style.color}
                        markerEnd={style.marker}
                    />
                );
            })}
        </svg>

        <div className="garden-grid">
          {garden.map(plot => (
            <div
              key={plot.id}
              className={`garden-plot ${plot.isWatered ? 'watered' : ''} ${plot.hasChemicalFertilizer ? 'chemical-soil' : ''} ${animatingPlots.includes(plot.id) ? 'combining' : ''} ${fertilizingPlots.includes(plot.id) ? 'fertilizing-effect' : ''} ${pollenSack?.sourcePlotId === plot.id ? 'pollen-source' : ''}`}
              onClick={() => handlePlotClick(plot.id)}
              role="button"
              aria-label={`Lote de terra ${plot.id + 1}. ${plot.plant ? `Contém ${plot.plant.phenotype}` : 'Vazio'}`}
            >
              {plot.plant && (
                <div className={`plant ${plot.hasOrganicFertilizer || plot.hasChemicalFertilizer ? 'plant-large' : ''} ${plot.plant.isSmall ? 'plant-small' : ''} ${plot.plant.isHybrid ? 'plant-hybrid' : ''} ${plot.plant.isBoosted ? 'boosted' : ''}`}>
                  {plot.plant.stage === 'sprout' ? (
                    <div className="sprout-container">
                      <span className="sprout-emoji">🌱</span>
                      <span className="sprout-type-icon">{plot.plant.phenotype}</span>
                    </div>
                  ) : (
                    plot.plant.phenotype
                  )}
                </div>
              )}
              {/* NEW: Fertilizer Icons Container */}
              <div className="fertilizer-icons-container">
                {/* Conditionally render organic fertilizer icon, but not if it's green manure from bean */}
                {!plot.hasGreenManureFromBean && plot.hasOrganicFertilizer && (
                  <span className="fertilizer-icon organic-icon" aria-label="Adubo Orgânico" data-tooltip="Adubo Orgânico">💩</span>
                )}
                {plot.hasChemicalFertilizer && (
                  <span className="fertilizer-icon chemical-icon" aria-label="Agrotóxico" data-tooltip="Agrotóxico">☠️</span>
                )}
                {/* NEW: Green Manure from Bean icon */}
                {plot.hasGreenManureFromBean && (
                  <span className="fertilizer-icon green-manure-icon" aria-label="Adubação Verde (Feijão)" data-tooltip="Nitrogênio do Feijão">🫘</span>
                )}
                {plot.plant?.isBoosted && plot.plant.type === 'Feijão' && (
                  <span className="fertilizer-icon boosted-icon" aria-label="Nitrogênio Fixado" data-tooltip="Nitrogênio Fixado">🫘</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

       <div className={`floating-panel tools-panel ${isMobile && activeMobilePanel === 'tools' ? 'mobile-panel-active' : ''}`}>
        <button
            className={`tool-button ${selectedTool === 'regador' ? 'selected' : ''}`}
            onClick={() => handleSelectTool(selectedTool === 'regador' ? null : 'regador')}
            aria-pressed={selectedTool === 'regador'}
            data-tooltip="Rega os brotos para fazê-los crescer."
        >
            <span className="emoji tool-emoji">🚿</span>
            Regador
        </button>
        <button
            className={`tool-button ${selectedTool === 'adubo_organico' ? 'selected' : ''}`}
            onClick={() => handleSelectTool(selectedTool === 'adubo_organico' ? null : 'adubo_organico')}
            aria-pressed={selectedTool === 'adubo_organico'}
            data-tooltip="Fertiliza a planta para uma colheita grande."
        >
            <span className="emoji tool-emoji">💩</span>
            Adubo Orgânico
        </button>
        <button
            className={`tool-button ${selectedTool === 'agrotoxico' ? 'selected' : ''}`}
            onClick={() => handleSelectTool(selectedTool === 'agrotoxico' ? null : 'agrotoxico')}
            aria-pressed={selectedTool === 'agrotoxico'}
            data-tooltip="Garante uma colheita grande."
        >
            <span className="emoji tool-emoji">☠️</span>
            Agrotóxico
        </button>
        <button
            className={`tool-button ${manualBeeMode ? 'selected' : ''}`}
            onClick={() => setManualBeeMode(!manualBeeMode)}
            aria-pressed={manualBeeMode}
            data-tooltip="Cultive abelhas para ajudar na polinização."
        >
            <span className="emoji tool-emoji">🐝</span>
            Cultivar Abelhas
        </button>
         <button
            className={`tool-button ${selectedTool === 'polinizacao_manual' ? 'selected' : ''}`}
            onClick={() => handleSelectTool(selectedTool === 'polinizacao_manual' ? null : 'polinizacao_manual')}
            aria-pressed={selectedTool === 'polinizacao_manual'}
            data-tooltip="Colete pólen de uma planta para polinizar outra manualmente."
        >
            <span className="emoji tool-emoji">🖌️</span>
            Polinização Manual
        </button>
         <button
            className={`tool-button ${selectedTool === 'colher' ? 'selected' : ''}`}
            onClick={() => handleSelectTool(selectedTool === 'colher' ? null : 'colher')}
            aria-pressed={selectedTool === 'colher'}
            data-tooltip="Coleta plantas adultas para o seu inventário."
        >
            <span className="emoji tool-emoji">🧺</span>
            Colher
        </button>
      </div>

      <div className={`floating-panel seed-panel ${isMobile && activeMobilePanel === 'seeds' ? 'mobile-panel-active' : ''}`}>
        <h2>Sementes</h2>
        <div className="seed-selection-grid">
          {(Object.keys(PLANT_CONFIG) as PlantType[]).map(type => (
            <button
              key={type}
              className={`seed-button ${selectedTool === type ? 'selected' : ''}`}
              onClick={() => handleSelectTool(selectedTool === type ? null : type)}
              aria-pressed={selectedTool === type}
              data-tooltip={SEED_TOOLTIPS[type]}
            >
              <span className="emoji">{PLANT_CONFIG[type].phenotype}</span>
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className={`floating-panel inventory-panel ${isMobile && activeMobilePanel === 'inventory' ? 'mobile-panel-active' : ''}`}>
        <h2>Inventário</h2>
        {Object.keys(inventory).length > 0 ? (
          <div className="inventory-list">
            {(Object.entries(inventory) as [PlantType, Record<PlantSize, InventoryCounts>][]).map(([type, sizeCounts]) => {
                // Calculate total for this plant type
                const total = (sizeCounts.small?.count || 0) + (sizeCounts.normal?.count || 0) + (sizeCounts.large?.count || 0);
                if (total === 0) return null;

                return (
                    <div key={type} className="inventory-group">
                        <div className="inventory-header">
                            <span className="inventory-header-emoji">{PLANT_CONFIG[type].phenotype}</span>
                            {type}
                        </div>
                        <div className="inventory-variants">
                            {/* Small Plants */}
                            {sizeCounts.small && sizeCounts.small.count > 0 && (
                                <div className="inventory-variant variant-small" title="Pequeno">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{sizeCounts.small.count}</span>
                                    {sizeCounts.small.withPesticide > 0 && (
                                        <span className="pesticide-indicator" data-tooltip={`${sizeCounts.small.withPesticide} com Agrotóxico`}>☠️</span>
                                    )}
                                </div>
                            )}
                            {/* Normal Plants */}
                            {sizeCounts.normal && sizeCounts.normal.count > 0 && (
                                <div className="inventory-variant variant-normal" title="Normal">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{sizeCounts.normal.count}</span>
                                    {sizeCounts.normal.withPesticide > 0 && (
                                        <span className="pesticide-indicator" data-tooltip={`${sizeCounts.normal.withPesticide} com Agrotóxico`}>☠️</span>
                                    )}
                                </div>
                            )}
                            {/* Large Plants */}
                            {sizeCounts.large && sizeCounts.large.count > 0 && (
                                <div className="inventory-variant variant-large" title="Grande">
                                    <span className="variant-emoji">{PLANT_CONFIG[type].phenotype}</span>
                                    <span className="variant-count">{sizeCounts.large.count}</span>
                                    {sizeCounts.large.withPesticide > 0 && (
                                        <span className="pesticide-indicator" data-tooltip={`${sizeCounts.large.withPesticide} com Agrotóxico`}>☠️</span>
                                    )}
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

      {/* Rain Animation */}
      {weather.includes('raining') && (
        <div className="rain-container" aria-hidden="true">
            {Array.from({ length: 50 }).map((_, i) => (
                <div key={i} className="raindrop" style={{ 
                    left: `${Math.random() * 100}%`,
                    animationDelay: `${Math.random() * 2}s`,
                    animationDuration: `${0.5 + Math.random() * 0.5}s`
                }}></div>
            ))}
        </div>
      )}

      {(beeState !== 'hidden') && (
        <div className="bees-container" aria-hidden="true">
          <div className={`bee bee-1 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
          <div className={`bee bee-2 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
          <div className={`bee bee-3 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
          {/* Extra bees if Sunflowers are present AND manual mode is on (3 + 3) */}
          {hasSunflowers && manualBeeMode && (
            <>
                <div className={`bee bee-4 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
                <div className={`bee bee-5 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
                <div className={`bee bee-6 ${beeState === 'dying' ? 'dying' : ''}`}>🐝</div>
            </>
          )}
        </div>
      )}

      {isInstructionsOpen && (
        <div className="modal-overlay" onClick={() => setInstructionsOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="close-button" onClick={() => setInstructionsOpen(false)} aria-label="Fechar instruções">&times;</button>
                <h2>Jogo da Colheita</h2>
                {isMobile ? (
                    <ol className="instructions-list">
                        <li><strong>1. Selecione Semente/Ferramenta.</strong></li>
                        <li><strong>2. Plante:</strong> Clique em um lote vazio.</li>
                        <li><strong>3. Regue (🌱):</strong> Botoes precisam de água para crescer.</li>
                        <li><strong>4. Fertilize:</strong> Adubo orgânico/agrotóxico para plantas grandes.</li>
                        <li><strong>5. ATENÇÃO:</strong> Agrotóxicos espantam abelhas! 🐝🚫</li>
                        <li><strong>6. Colha:</strong> Use a cesta para coletar.</li>
                    </ol>
                ) : (
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
                )}
            </div>
        </div>
      )}

      {/* Dynamic Central Notification Modal Stack */}
      {modalStack.length > 0 && (
        <div className="modal-overlay center-notification-modal" onClick={closeTopModal}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>{modalStack[0].title}</h2>
                <p>{modalStack[0].message}</p>
                <button className="ok-button" onClick={closeTopModal}>Entendi</button>
            </div>
        </div>
      )}

      {/* Indicator for selected tool/seed */}
      {selectedTool && (
        <button
          className="selected-tool-indicator"
          onClick={() => setSelectedTool(null)}
          aria-label={`Ferramenta selecionada: ${Object.keys(PLANT_CONFIG).includes(selectedTool as PlantType) ? selectedTool : `o ${selectedTool}`}. Clique para deselecionar.`}
        >
          <span className="emoji">
            {Object.keys(PLANT_CONFIG).includes(selectedTool as PlantType)
              ? PLANT_CONFIG[selectedTool as PlantType].phenotype
              : TOOL_EMOJIS[selectedTool as ToolType]}
          </span>
        </button>
      )}

      {/* Mobile Navigation Bar */}
      {isMobile && (
        <>
            {activeMobilePanel !== null && (
                <div className="mobile-backdrop-overlay" onClick={() => setActiveMobilePanel(null)}></div>
            )}
            <nav className="mobile-nav-bar">
                <button 
                    className={`mobile-nav-button ${activeMobilePanel === 'tools' ? 'selected' : ''}`}
                    onClick={() => setActiveMobilePanel(activeMobilePanel === 'tools' ? null : 'tools')}
                    aria-expanded={activeMobilePanel === 'tools'}
                    aria-label="Abrir ferramentas"
                >
                    <span className="emoji">🛠️</span>
                    Ferramentas
                </button>
                <button 
                    className={`mobile-nav-button ${activeMobilePanel === 'seeds' ? 'selected' : ''}`}
                    onClick={() => setActiveMobilePanel(activeMobilePanel === 'seeds' ? null : 'seeds')}
                    aria-expanded={activeMobilePanel === 'seeds'}
                    aria-label="Abrir sementes"
                >
                    <span className="emoji">🌱</span>
                    Sementes
                </button>
                <button 
                    className={`mobile-nav-button ${activeMobilePanel === 'inventory' ? 'selected' : ''}`}
                    onClick={() => setActiveMobilePanel(activeMobilePanel === 'inventory' ? null : 'inventory')}
                    aria-expanded={activeMobilePanel === 'inventory'}
                    aria-label="Abrir inventário"
                >
                    <span className="emoji">🧺</span>
                    Inventário
                </button>
            </nav>
        </>
      )}

    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);