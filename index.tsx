import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

type PlantType = 'Abóbora' | 'Milho' | 'Girassol' | 'Maçã' | 'Feijão';
type ToolType = 'regador' | 'adubo_organico' | 'agrotoxico' | 'colher';
type FertilizerType = 'organic' | 'chemical' | null;
type BeeState = 'hidden' | 'visible' | 'dying';
type PlantSize = 'small' | 'normal' | 'large';

interface PlantInfo {
  name: PlantType;
  phenotype: string;
}

const PLANT_CONFIG: Record<PlantType, PlantInfo> = {
  Abóbora: { name: 'Abóbora', phenotype: '🍊' },
  Milho: { name: 'Milho', phenotype: '🌽' },
  Girassol: { name: 'Girassol', phenotype: '🌻' },
  Maçã: { name: 'Maçã', phenotype: '🍎' },
  Feijão: { name: 'Feijão', phenotype: '🫘' },
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
  const [activeModalNotification, setActiveModalNotification] = useState<Notification | null>(null);
  const [isHistoryOpen, setHistoryOpen] = useState(false);
  
  // Track which message titles have been shown as a modal to prevent repetition
  const seenTitlesRef = useRef<Set<string>>(new Set());

  // Animation state
  const [beeState, setBeeState] = useState<BeeState>('hidden');
  const [manualBeeMode, setManualBeeMode] = useState(false); // New state for manual bee button
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

      // Only show the center modal if the user hasn't seen this title before
      if (!seenTitlesRef.current.has(title)) {
          seenTitlesRef.current.add(title);
          setActiveModalNotification(newNote);
      }
  }, []);

  const handleOpenHistory = () => {
      setHistoryOpen(!isHistoryOpen);
      if (!isHistoryOpen) {
          // Mark all as read (visually) when opening
          setNotifications(prev => prev.map(n => ({ ...n, isNew: false })));
      }
  };

  const unreadCount = notifications.filter(n => n.isNew).length;


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
