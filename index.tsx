import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã' | 'Feijão';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher' | 'polinizacao_manual';
type FertilizerType = 'organic' | 'chemical' | null;
type BeeState = 'hidden' | 'visible' | 'dying';
type PlantSize = 'small' | 'normal' | 'large';
type WeatherType = 'sunny' | 'raining';

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
    const weathers: WeatherType[] = ['sunny', 'sunny', 'sunny', 'raining'];
    // Simple shuffle
    return Array.from({ length: 4 }, () => weathers[Math.floor(Math.random() * weathers.length)]);
};


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

  // --- NOTIFICATION SYSTEM ---
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [modalStack, setModalStack] = useState<Notification[]>([]);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  
  // --- WEATHER SYSTEM ---
  const [weather, setWeather] = useState<WeatherType>('sunny');
  const [forecast, setForecast] = useState<WeatherType[]>(generateInitialForecast());

  // --- MANUAL POLLINATION ---
  const [pollenSack, setPollenSack] = useState<PollenSack | null>(null);

  // Animation state
  const [beeState, setBeeState] = useState<BeeState>('hidden');
  const [manualBeeMode, setManualBeeMode] = useState(false); // New state for manual bee button
  const [isWindy, setIsWindy] = useState(false);
  const [activeConnection, setActiveConnection] = useState<Connection | null>(null);
  const [reproductionTrigger, setReproductionTrigger] = useState(0);

  const cornTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reproducedPlantsRef = useRef<Set<string>>(new Set());
  // FIX: Explicitly initialize useRef with undefined to fix "Expected 1 arguments, but got 0" error.
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
  }, []);

  // Effect: Weather Cycle
  useEffect(() => {
    const weatherTimer = setInterval(() => {
        setForecast(currentForecast => {
            const [nextWeather, ...rest] = currentForecast;
            setWeather(nextWeather); // Update current weather
            
            // Add a new random forecast to the end
            const newRandomWeather: WeatherType = Math.random() < 0.3 ? 'raining' : 'sunny';
            return [...rest, newRandomWeather];
        });
    }, 60000); // Change weather every 60 seconds

    return () => clearInterval(weatherTimer);
  }, []);

  // Effect: Apply Rain effect
  useEffect(() => {
    if (weather === 'raining') {
        const dryPlotIds = garden.filter(p => !p.isWatered).map(p => p.id);
        
        if (dryPlotIds.length > 0) {
            addNotification("Chuva Forte 🌧️", "A chuva regou toda a sua horta! Brotos em terra seca começaram a crescer.");
            
            setGarden(currentGarden => 
                currentGarden.map(p => 
                    dryPlotIds.includes(p.id) ? { ...p, isWatered: true } : p
                )
            );
            
            const sproutsInDryPlots = garden.filter(p => dryPlotIds.includes(p.id) && p.plant?.stage === 'sprout').map(p => p.id);
            sproutsInDryPlots.forEach((plotId, index) => {
                setTimeout(() => growPlant(plotId), index * 200); // Stagger growth animation
            });
        }
    }
  }, [weather, garden, addNotification, growPlant]);

  // Effect: When sun comes after rain, dry the plots
  useEffect(() => {
    const prevWeather = prevWeatherRef.current;
    if (prevWeather === 'raining' && weather === 'sunny') {
        addNotification("O Sol Chegou! ☀️", "O sol forte secou toda a horta que estava molhada pela chuva.");
        setGarden(currentGarden => 
            currentGarden.map(p => ({ ...p, isWatered: false }))
        );
    }
    // Update ref for next render
    prevWeatherRef.current = weather;
  }, [weather, addNotification]);


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

  // Reusable function for Pollination logic (Pumpkin, Apple, Sunflower)
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
              const pumpkinSuccess = tryPollination(garden, 'Abóbora', '#FF8C00');
              // Try Sunflower (Scenario A)
              const sunflowerSuccess = tryPollination(garden, 'Girassol', '#FFD700');

              if (!pumpkinSuccess && !sunflowerSuccess) {
                   // Try Apple
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
                        if (isHybrid) addNotification("Vigor Híbrido (Heterose) 🚀", "Sua planta cresceu mais forte! O cruzamento gerou um híbrido vigoroso.");
                        else if (isInbreeding) addNotification("Depressão Endogâmica 🧬", "Sua planta diminuiu devido ao cruzamento entre parentes.");
                        else addNotification("Polinização do Milho", "O cruzamento do milho ocorre principalmente pela polinização cruzada, impulsionada pelo vento.");
                    }, 1500);
                }
            }, 4000); 
        }
    } else if (plantType === 'Abóbora') {
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
                  addNotification("Auto-polinização (Abóbora)", "Sem abelhas ou parceiros por perto, a planta realizou a auto-fecundação. Isso aumenta a chance de depressão endogâmica.");
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
        // FEIJÃO LOGIC - Strict Self-Pollination (Autogamy)
        const currentPlantId = grownPlot.plant.instanceId;

        // Delay to simulate self-pollination wait time
        setTimeout(() => {
             setAnimatingPlots([lastGrownId]); // Pulse animation on the parent
             
             setTimeout(() => {
                setAnimatingPlots([]);
                setGarden(currentGarden => {
                    // Verify parent still exists
                    const parentPlot = currentGarden[lastGrownId];
                    if (!parentPlot?.plant || parentPlot.plant.instanceId !== currentPlantId) return currentGarden;

                    // Self-pollination ignores bees and partners. Just finds a spot.
                    const emptySpotId = findEmptySpot(lastGrownId, currentGarden);
                    
                    if (emptySpotId !== null) {
                        // Genetic Rule: Self-pollination normally causes inbreeding (Small),
                        // BUT Feijão is adapted to autogamy and maintains normal vigor.
                        
                        const newGarden = [...currentGarden];
                        newGarden[emptySpotId].plant = createPlant(
                            'Feijão',
                            [currentPlantId], // Parent is itself
                            false, // Normal size (Special rule for Feijão)
                            false // Not Hybrid
                        );
                        
                        return newGarden;
                    }
                    return currentGarden;
                });
                
                addNotification("Auto-fecundação (Feijão) 🫘", "O feijão é uma planta autógama. Ele se reproduz sozinho mantendo seu tamanho normal, sem perda de vigor!");
             }, 1500);

        }, 30000); // 30 Seconds delay

    } else {
        // GENERIC FALLBACK
        const neighborId = findNeighbor(lastGrownId, plantType);
        if (neighborId !== null) {
             // Existing generic neighbor logic...
        }
    }

    setLastGrownId(null); // Reset trigger
  }, [lastGrownId, garden, beeState, determineOffspringGenetics, addNotification]);
  
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
    } else {
        // --- REGULAR TOOL LOGIC ---
        setGarden(currentGarden => {
          const newGarden = [...currentGarden];
          const currentPlot = newGarden.find(p => p.id === plotId);
          if (!currentPlot) return currentGarden;

          if (selectedTool && Object.keys(PLANT_CONFIG).includes(selectedTool) && !currentPlot.plant) {
            currentPlot.plant = createPlant(selectedTool as PlantType);
            if (weather === 'raining') {
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

          if (selectedTool === 'colher' && currentPlot.plant?.stage === 'grown') {
            const type = currentPlot.plant.type;
            let size: PlantSize = 'normal';
            if (currentPlot.plant.isHybrid || currentPlot.fertilizer) size = 'large';
            else if (currentPlot.plant.isSmall) size = 'small';

            setInventory(currentInventory => {
                const plantCounts = currentInventory[type] || { small: 0, normal: 0, large: 0 };
                return {
                    ...currentInventory,
                    [type]: { ...plantCounts, [size]: plantCounts[size] + 1 }
                };
            });

            currentPlot.plant = null;
            currentPlot.isWatered = false;
            currentPlot.fertilizer = null;
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
    return weatherType === 'raining' ? '🌧️' : '☀️';
  }

  return (
    <div className={`app-container ${weather === 'raining' ? 'is-raining' : ''}`}>
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
          <h3>Previsão do Tempo</h3>
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
      </div>

      <header className="header">
        <h1>Fazenda Genética</h1>
        <p>Plante, cuide e colha para ver a genética em ação!</p>
      </header>
      
      <main className={`garden-container ${pollenSack ? 'carrying-pollen' : ''}`}>
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
              className={`garden-plot ${plot.isWatered ? 'watered' : ''} ${plot.fertilizer ? 'fertilized' : ''} ${plot.fertilizer === 'chemical' ? 'chemical-soil' : ''} ${animatingPlots.includes(plot.id) ? 'combining' : ''} ${pollenSack?.sourcePlotId === plot.id ? 'pollen-source' : ''}`}
              onClick={() => handlePlotClick(plot.id)}
              role="button"
              aria-label={`Lote de terra ${plot.id + 1}. ${plot.plant ? `Contém ${plot.plant.phenotype}` : 'Vazio'}`}
            >
              {plot.plant && (
                <div className={`plant ${plot.fertilizer ? 'plant-large' : ''} ${plot.plant.isSmall ? 'plant-small' : ''} ${plot.plant.isHybrid ? 'plant-hybrid' : ''}`}>
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
      {weather === 'raining' && (
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
