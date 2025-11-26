import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã' | 'Feijão';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher' | 'polinizacao_manual';
type FertilizerType = 'organic' | 'chemical' | null;
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
  Feijão: "Se autofecunda após 30s, gerando uma planta de tamanho normal.",
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
  fertilizer: FertilizerType;
}

interface Connection {
    from: number;
    to: number;
    type: 'Abóbora' | 'Girassol' | 'Maçã' | 'Milho';
}

type InventoryState = Partial<Record<PlantType, Record<PlantSize, number>>>;

interface Notification {
    id: string;
    title: string;
    message: string;
    timestamp: number;
    isNew: boolean;
}

interface PollenSack {
  plant: PlantState;
  sourcePlotId: number;
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
    Array.from({ length: 16 }, (_, i) => ({ id: i, plant: null, isWatered: false, fertilizer: null }))
  );
  const [inventory, setInventory] = useState<InventoryState>({});
  const [isInstructionsOpen, setInstructionsOpen] = useState(true);
  const [animatingPlots, setAnimatingPlots] = useState<number[]>([]);
  const [fertilizingPlots, setFertilizingPlots] = useState<number[]>([]);
  
  // State to track the most recently grown plant to trigger reproduction logic
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
  const [bacteriumAnimation, setBacteriumAnimation] = useState<{ active: boolean; targetPlotId: number | null }>({ active: false, targetPlotId: null });
  const bacteriumRef = useRef<HTMLDivElement>(null);


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
  const hasPesticides = garden.some(plot => plot.fertilizer === 'chemical');

  // Derived state for Corn Hint Effect
  const cornPlots = garden.filter(plot => plot.plant?.type === 'Milho');
  const cornCount = cornPlots.length;
  // Check if there is exactly 1 corn and it is fully grown
  const isSingleGrownCorn = cornCount === 1 && cornPlots[0].plant?.stage === 'grown';

  // Helper to add notifications
  const addNotification = useCallback((title: string, message: string) => {
      const newNote: Notification = {
          id: Date.now().toString() + Math.random(),
          title,
          message,
          timestamp: Date.now(),
          isNew: true
      };

      setNotifications(prev => [newNote, ...prev]);

      // Add to the top of the modal stack
      setModalStack(prev => [newNote, ...prev]);
  }, []);
  
  const closeTopModal = useCallback(() => {
    setModalStack(prev => prev.slice(1));
  }, []);

  const handleOpenHistory = () => {
      setHistoryOpen(!isHistoryOpen);
      if (!isHistoryOpen) {
          // Mark all as read (visually) when opening
          setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
      }
  };

  const unreadCount = notifications.filter(n => n.isNew).length;

  const growPlant = useCallback((plotId: number) => {
    // Prevent multiple simultaneous growth calls for the same plot
    if (growingSproutsRef.current.has(plotId)) return;
    growingSproutsRef.current.add(plotId);

    setTimeout(() => {
        let plantGrew = false;
        setGarden(currentGarden => {
            const plot = currentGarden.find(p => p.id === plotId);
            // Only grow if it's still a sprout
            if (plot?.plant?.stage === 'sprout') {
                plantGrew = true;
                return currentGarden.map(p =>
                    p.id === plotId ? { ...p, plant: { ...p.plant, stage: 'grown' as const } } : p
                );
            }
            return currentGarden; // No change needed
        });

        if (plantGrew) {
            setLastGrownId(plotId);
        }
        // Clean up ref after operation
        growingSproutsRef.current.delete(plotId);
    }, 2000);
  }, [setLastGrownId]);

  // FIX: Moved determineOffspringGenetics function before its usage in useEffects to prevent declaration errors.
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

    const checkCornPollination = useCallback(() => {
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
                const [cornA, cornB] = pair;
                // Clone availableSpots for this iteration to avoid permanently removing spots if pairing fails
                const tempAvailableSpots = [...availableSpots];
                const emptySpotId = tempAvailableSpots.pop();


                if (emptySpotId !== undefined && cornA.plant && cornB.plant) {
                    reproducedPlantsRef.current.add(cornA.plant.instanceId);
                    reproducedPlantsRef.current.add(cornB.plant.instanceId);

                    // Add two-way arrows for visual feedback
                    newConnections.push({ from: cornA.id, to: cornB.id, type: 'Milho' });
                    newConnections.push({ from: cornB.id, to: cornA.id, type: 'Milho' });

                    const { isInbreeding, isHybrid } = determineOffspringGenetics(cornA.plant, cornB.plant);
                    const newPlant = createPlant('Milho', [cornA.plant.instanceId, cornB.plant.instanceId], isInbreeding, isHybrid);
                    newPlantsInfo.push({ plotId: emptySpotId, plant: newPlant, isHybrid, isInbreeding });
                    
                    // "Use up" the spot
                    availableSpots.pop();
                }
            });

            if (newConnections.length > 0) {
                setActiveConnections(newConnections);
                setIsPollinating(true); // Start animation

                setTimeout(() => {
                    setActiveConnections([]);
                    setIsPollinating(false); // Stop animation

                    if (newPlantsInfo.length > 0) {
                        setGarden(g => {
                            const newGarden = [...g];
                            newPlantsInfo.forEach(info => {
                                // Double-check if the spot is still free, another process might have taken it
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

  // Effect: Periodic Corn Pollination Check during Wind
  useEffect(() => {
      const isCurrentlyWindy = weather.includes('_windy');

      if (isCurrentlyWindy) {
          const pollinationInterval = setInterval(() => {
              checkCornPollination();
          }, 5000); // Check every 5 seconds

          return () => clearInterval(pollinationInterval);
      }
  }, [weather, checkCornPollination]);

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
                    "Deseja plantar outra muda de milho? O milho prefere a fecundação cruzada. Sozinho ele tem dificuldade de se reproduzir."
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

  // Effect: Position the bacterium for its animation
  useEffect(() => {
    if (bacteriumAnimation.active && bacteriumAnimation.targetPlotId !== null && bacteriumRef.current) {
        const plotElement = document.querySelector(`.garden-plot[aria-label^="Lote de terra ${bacteriumAnimation.targetPlotId + 1}"]`);
        const appContainer = document.querySelector('.app-container');
        const bacteriumElement = bacteriumRef.current;

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

            bacteriumElement.style.setProperty('--target-x', `${targetX}px`);
            bacteriumElement.style.setProperty('--target-y', `${targetY}px`);
            bacteriumElement.style.setProperty('--start-x', `${startX}px`);
            bacteriumElement.style.setProperty('--start-y', `${startY}px`);
        }
    }
  }, [bacteriumAnimation]);


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
        isHybrid,
        isBoosted: false
    };
  };

  // Reusable function for Pollination logic (Pumpkin, Apple, Sunflower)
  // Returns true if a pollination was initiated
  // FIX: Narrowed the type of `plantType` to match its intended use with bee-pollinated plants.
  // This resolves a type error where the broader `PlantType` was not assignable to `Connection['type']`.
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
  }, [beeState, determineOffspringGenetics, addNotification]);


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


  // Effect 4: Reproduction Logic (Triggered when a plant finishes growing)
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
        // PUMPKIN LOGIC - Fallback for Self-Pollination ONLY
        
        const currentPlantId = grownPlot.plant.instanceId;
        
        // Schedule check for self-pollination if no bees present
        setTimeout(() => {
            setGarden(currentGarden => {
                const parentPlot = currentGarden[lastGrownId];
                
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
                            
                            return newGarden;
                        }
                }
                return currentGarden;
            });

            // Notification trigger
             if (beeState !== 'visible') {
                  addNotification("Auto-polinização (Abóbora)", "Sem parceiros por perto, a planta realizou a auto-fecundação. Isso aumenta a chance de depressão endogâmica.");
             }

        }, 30000); // 30 Seconds delay

    } else if (plantType === 'Girassol') {
        // SUNFLOWER LOGIC - Fallback for Self-Pollination ONLY
        const currentPlantId = grownPlot.plant.instanceId;

        setTimeout(() => {
            setGarden(currentGarden => {
                const parentPlot = currentGarden[lastGrownId];
                
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
                                'Girassol',
                                [currentPlantId],
                                true, // Inbreeding (Small)
                                false
                            );
                            return newGarden;
                        }
                }
                return currentGarden;
            });

            if (beeState !== 'visible') {
                addNotification("Auto-polinização (Girassol) 🌻", "Sem abelhas para levar o pólen longe, o girassol se auto-polinizou. Isso gera sementes menores.");
            }
        }, 30000);

    } else if (plantType === 'Maçã') {
        // APPLE LOGIC
        if (beeState === 'visible') {
            setReproductionTrigger(prev => prev + 1);
        }

    } else if (plantType === 'Feijão') {
        const currentPlantId = grownPlot.plant.instanceId;

        // --- BACTERIUM ANIMATION ---
        setAnimatingPlots([lastGrownId]); 
        setBacteriumAnimation({ active: true, targetPlotId: lastGrownId });

        setTimeout(() => {
            setAnimatingPlots([]);
            setBacteriumAnimation({ active: false, targetPlotId: null });

            setGarden(currentGarden => {
                const targetPlot = currentGarden.find(p => p.id === lastGrownId);
                if (targetPlot?.plant?.instanceId === currentPlantId) {
                    return currentGarden.map(p =>
                        p.id === lastGrownId
                            ? { ...p, plant: { ...p.plant!, isBoosted: true } }
                                                        : p
                    );
                }
                return currentGarden;
            });
            addNotification(
                "Fixação de Nitrogênio 🦠",
                "Bactérias benéficas formaram nódulos nas raízes do seu feijão, fornecendo-lhe nitrogênio e tornando a planta mais forte e maior!"
            );

            // --- SELF-POLLINATION (after fixation) ---
            setTimeout(() => {
                 setAnimatingPlots([lastGrownId]);
                 
                 setTimeout(() => {
                    setAnimatingPlots([]);
                    setGarden(currentGarden => {
                        const parentPlot = currentGarden[lastGrownId];
                        if (!parentPlot?.plant || parentPlot.plant.instanceId !== currentPlantId) return currentGarden;

                        const emptySpotId = findEmptySpot(lastGrownId, currentGarden);
                        
                        if (emptySpotId !== null) {
                            const newGarden = [...currentGarden];
                            newGarden[emptySpotId].plant = createPlant(
                                'Feijão',
                                [currentPlantId],
                                false,
                                false
                            );
                            return newGarden;
                        }
                        return currentGarden;
                    });
                    
                    addNotification("Auto-fecundação (Feijão) 🫘", "O feijão é uma planta autógama. Ele se reproduz sozinho mantendo seu tamanho normal, sem perda de vigor!");
                 }, 1500);

            }, 30000);

        }, 6000); // Animation duration

    } else {
        // GENERIC FALLBACK
        const neighborId = findNeighbor(lastGrownId, plantType);
        if (neighborId !== null) {
             // Existing generic neighbor logic...
        }
    }

    setLastGrownId(null); // Reset trigger
  }, [lastGrownId, garden, beeState, determineOffspringGenetics, addNotification, weather, checkCornPollination]);
  
  const handlePlotClick = useCallback((plotId: number) => {
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
                    addNotification("Polinização Inválida 🍎", "A Macieira não pode se autofecundar, mesmo manualmente. Ela precisa de pólen de outra macieira.");
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
    } else if (selectedTool === 'colher' && plot.plant?.stage === 'grown') {
        // --- UNIFIED HARVEST LOGIC ---
        const harvestedPlot = plot; // The plot at the time of click
        const harvestedPlant = harvestedPlot.plant;
        const type = harvestedPlant.type;

        // 1. Calculate size and update inventory immediately based on the state AT CLICK TIME
        let size: PlantSize = 'normal';
        if (harvestedPlant.isHybrid || harvestedPlot.fertilizer || harvestedPlant.isBoosted) size = 'large';
        else if (harvestedPlant.isSmall) size = 'small';

        setInventory(currentInventory => {
            const plantCounts = currentInventory[type] || { small: 0, normal: 0, large: 0 };
            return {
                ...currentInventory,
                [type]: { ...plantCounts, [size]: plantCounts[size] + 1 }
            };
        });

        // 2. Handle garden updates and side-effects
        if (type === 'Feijão') {
            const otherPlantPlotIds = garden.filter(p => p.id !== plotId && p.plant).map(p => p.id);
            setFertilizingPlots(otherPlantPlotIds);

            setTimeout(() => {
                setFertilizingPlots([]);
                setGarden(currentGarden => {
                    return currentGarden.map(p => {
                        if (otherPlantPlotIds.includes(p.id)) return { ...p, fertilizer: 'organic' };
                        if (p.id === plotId) return { ...p, plant: null, isWatered: false, fertilizer: null };
                        return p;
                    });
                });
                
                addNotification(
                    "Dica de Colheita (Feijão) 🌱", 
                    "Corte a planta na superfície, deixando as raízes no solo. Os nódulos das bactérias ficam e liberam nitrogênio no solo."
                );
                 addNotification(
                    "Adubação Verde! 🌱✨",
                    "As raízes do feijão liberaram nitrogênio, fertilizando todas as outras plantas na sua horta!"
                );

            }, 3500); // 1.5s animation + 2s delay
        } else {
            // For other plants, just update the garden immediately
            setGarden(currentGarden => currentGarden.map(p => (p.id === plotId ? { ...p, plant: null, isWatered: false, fertilizer: null } : p)));
        }
    } else {
        // --- OTHER TOOLS LOGIC ---
        setGarden(currentGarden => {
            const newGarden = [...currentGarden];
            const currentPlot = newGarden.find(p => p.id === plotId);
            if (!currentPlot) return currentGarden;

            if (selectedTool && Object.keys(PLANT_CONFIG).includes(selectedTool) && !currentPlot.plant) {
            currentPlot.plant = createPlant(selectedTool as PlantType);
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

            if (selectedTool === 'adubo_organico' && currentPlot.plant && !currentPlot.fertilizer) {
                currentPlot.fertilizer = 'organic';
                return newGarden;
            }

            if (selectedTool === 'agrotoxico' && currentPlot.plant && !currentPlot.fertilizer) {
                currentPlot.fertilizer = 'chemical';
                return newGarden;
            }
            
            return currentGarden;
        });
    }
  }, [selectedTool, growPlant, weather, pollenSack, garden, determineOffspringGenetics, addNotification]);

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

  return (
    <div className={`app-container ${weather.includes('raining') ? 'is-raining' : ''}`}>
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
      {bacteriumAnimation.active && (
        <div ref={bacteriumRef} className="bacterium-animation">🦠</div>
      )}
      
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

      <header className="header">
        <h1>Fazenda Genética</h1>
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
              className={`garden-plot ${plot.isWatered ? 'watered' : ''} ${plot.fertilizer ? 'fertilized' : ''} ${plot.fertilizer === 'chemical' ? 'chemical-soil' : ''} ${animatingPlots.includes(plot.id) ? 'combining' : ''} ${fertilizingPlots.includes(plot.id) ? 'fertilizing-effect' : ''} ${pollenSack?.sourcePlotId === plot.id ? 'pollen-source' : ''}`}
              onClick={() => handlePlotClick(plot.id)}
              role="button"
              aria-label={`Lote de terra ${plot.id + 1}. ${plot.plant ? `Contém ${plot.plant.phenotype}` : 'Vazio'}`}
            >
              {plot.plant && (
                <div className={`plant ${plot.fertilizer ? 'plant-large' : ''} ${plot.plant.isSmall ? 'plant-small' : ''} ${plot.plant.isHybrid ? 'plant-hybrid' : ''} ${plot.plant.isBoosted ? 'boosted' : ''}`}>
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
            </div>
          ))}
        </div>
      </main>

       <div className="floating-panel tools-panel">
        <button
            className={`tool-button ${selectedTool === 'regador' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'regador' ? null : 'regador')}
            aria-pressed={selectedTool === 'regador'}
            data-tooltip="Rega os brotos para fazê-los crescer."
        >
            <span className="emoji tool-emoji">🚿</span>
            Regador
        </button>
        <button
            className={`tool-button ${selectedTool === 'adubo_organico' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'adubo_organico' ? null : 'adubo_organico')}
            aria-pressed={selectedTool === 'adubo_organico'}
            data-tooltip="Fertiliza a planta para uma colheita grande."
        >
            <span className="emoji tool-emoji">💩</span>
            Adubo Orgânico
        </button>
        <button
            className={`tool-button ${selectedTool === 'agrotoxico' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'agrotoxico' ? null : 'agrotoxico')}
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
            onClick={() => setSelectedTool(selectedTool === 'polinizacao_manual' ? null : 'polinizacao_manual')}
            aria-pressed={selectedTool === 'polinizacao_manual'}
            data-tooltip="Colete pólen de uma planta para polinizar outra manualmente."
        >
            <span className="emoji tool-emoji">🖌️</span>
            Polinização Manual
        </button>
         <button
            className={`tool-button ${selectedTool === 'colher' ? 'selected' : ''}`}
            onClick={() => setSelectedTool(selectedTool === 'colher' ? null : 'colher')}
            aria-pressed={selectedTool === 'colher'}
            data-tooltip="Coleta plantas adultas para o seu inventário."
        >
            <span className="emoji tool-emoji">🧺</span>
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
              data-tooltip={SEED_TOOLTIPS[type]}
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

    </div>
  );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);