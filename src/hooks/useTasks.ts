import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DerivedTask, Metrics, Task } from '@/types';
import {
  computeAverageROI,
  computePerformanceGrade,
  computeRevenuePerHour,
  computeTimeEfficiency,
  computeTotalRevenue,
  withDerived,
  sortTasks as sortDerived,
} from '@/utils/logic';
// Local storage removed per request; keep everything in memory
import { generateSalesTasks } from '@/utils/seed';

interface UseTasksState {
  tasks: Task[];
  loading: boolean;
  error: string | null;
  derivedSorted: DerivedTask[];
  metrics: Metrics;
  lastDeleted: Task | null;
  addTask: (task: Omit<Task, 'id'> & { id?: string }) => void;
  updateTask: (id: string, patch: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  undoDelete: () => void;
  clearLastDeleted:()=>void;
}

const INITIAL_METRICS: Metrics = {
  totalRevenue: 0,
  totalTimeTaken: 0,
  timeEfficiencyPct: 0,
  revenuePerHour: 0,
  averageROI: 0,
  performanceGrade: 'Needs Improvement',
};

export function useTasks(): UseTasksState {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<Task | null>(null);
  const fetchedRef = useRef(false);

  function normalizeTasks(input: any[]): Task[] {
    const now = Date.now();
    return (Array.isArray(input) ? input : []).map((t, idx) => {
      // Validate and sanitize input
      const id = typeof t.id === 'string' ? t.id : `task-${Date.now()}-${idx}`;
      const title = typeof t.title === 'string' ? t.title.trim() : `Task ${idx + 1}`;
      
      // Ensure revenue is a valid number, default to 0 if invalid
      const revenue = typeof t.revenue === 'number' && Number.isFinite(t.revenue) 
        ? Math.max(0, t.revenue) 
        : 0;
      
      // Ensure timeTaken is a valid positive number, default to 1 if invalid
      const timeTaken = typeof t.timeTaken === 'number' && Number.isFinite(t.timeTaken) && t.timeTaken > 0 
        ? t.timeTaken 
        : 1;
      
      // Validate priority
      const priority = ['High', 'Medium', 'Low'].includes(t.priority) 
        ? t.priority as 'High' | 'Medium' | 'Low' 
        : 'Medium';
      
      // Validate status
      const status = ['Todo', 'In Progress', 'Done'].includes(t.status)
        ? t.status as 'Todo' | 'In Progress' | 'Done'
        : 'Todo';
      
      // Handle dates
      const createdAt = t.createdAt && !isNaN(new Date(t.createdAt).getTime())
        ? new Date(t.createdAt)
        : new Date(now - (idx + 1) * 24 * 3600 * 1000);
      
      const completedAt = (t.status === 'Done' && !t.completedAt)
        ? new Date(createdAt.getTime() + 24 * 3600 * 1000).toISOString()
        : (t.completedAt && !isNaN(new Date(t.completedAt).getTime()))
          ? new Date(t.completedAt).toISOString()
          : undefined;
      
      return {
        id,
        title,
        revenue,
        timeTaken,
        priority,
        status,
        notes: typeof t.notes === 'string' ? t.notes : '',
        createdAt: createdAt.toISOString(),
        completedAt,
      };
    });
  }

  // Initial load: public JSON -> fallback generated dummy
  useEffect(() => {
    let isMounted = true;
    
    // Prevent double fetch in development with React.StrictMode
    if (fetchedRef.current) return;
    
    async function load() {
      try {
        const res = await fetch('/tasks.json');
        if (!res.ok) throw new Error(`Failed to load tasks.json (${res.status})`);
        const data = (await res.json()) as any[];
        const normalized: Task[] = normalizeTasks(data);
        const finalData = normalized.length > 0 ? normalized : generateSalesTasks(50);
        
        if (isMounted) {
          setTasks(finalData);
          setLoading(false);
          fetchedRef.current = true;
        }
      } catch (e: any) {
        if (isMounted) {
          setError(e?.message ?? 'Failed to load tasks');
          setLoading(false);
        }
      }
    }
    
    load();
    
    return () => {
      isMounted = false;
    };
  }, []);

 

  const derivedSorted = useMemo<DerivedTask[]>(() => {
    const withRoi = tasks.map(withDerived);
    return sortDerived(withRoi);
  }, [tasks]);

  const metrics = useMemo<Metrics>(() => {
    if (tasks.length === 0) return INITIAL_METRICS;
    const totalRevenue = computeTotalRevenue(tasks);
    const totalTimeTaken = tasks.reduce((s, t) => s + t.timeTaken, 0);
    const timeEfficiencyPct = computeTimeEfficiency(tasks);
    const revenuePerHour = computeRevenuePerHour(tasks);
    const averageROI = computeAverageROI(tasks);
    const performanceGrade = computePerformanceGrade(averageROI);
    return { totalRevenue, totalTimeTaken, timeEfficiencyPct, revenuePerHour, averageROI, performanceGrade };
  }, [tasks]);

  const addTask = useCallback((task: Omit<Task, 'id'> & { id?: string }) => {
    setTasks(prev => {
      const id = task.id ?? crypto.randomUUID();
      const timeTaken = task.timeTaken <= 0 ? 1 : task.timeTaken; // auto-correct
      const createdAt = new Date().toISOString();
      const status = task.status;
      const completedAt = status === 'Done' ? createdAt : undefined;
      return [...prev, { ...task, id, timeTaken, createdAt, completedAt }];
    });
  }, []);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    setTasks(prev => {
      const next = prev.map(t => {
        if (t.id !== id) return t;
        const merged = { ...t, ...patch } as Task;
        if (t.status !== 'Done' && merged.status === 'Done' && !merged.completedAt) {
          merged.completedAt = new Date().toISOString();
        }
        return merged;
      });
      // Ensure timeTaken remains > 0
      return next.map(t => (t.id === id && (patch.timeTaken ?? t.timeTaken) <= 0 ? { ...t, timeTaken: 1 } : t));
    });
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => {
      const target = prev.find(t => t.id === id) || null;
      setLastDeleted(target);
      return prev.filter(t => t.id !== id);
    });
  }, []);

  const undoDelete = useCallback(() => {
    setLastDeleted(prevDeleted => {
      if (!prevDeleted) return null;
      setTasks(prev => [...prev, prevDeleted]);
      return null; // Clear the lastDeleted immediately after undo
    });
  }, []);

  const clearLastDeleted=useCallback(()=>{
    setLastDeleted(null);

  },[]);

  return { tasks, loading, error, derivedSorted, metrics, lastDeleted, addTask, updateTask, deleteTask, undoDelete, clearLastDeleted};
}


