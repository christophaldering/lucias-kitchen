import { createContext, useContext, ReactNode } from "react";
import { useImportStatus, ImportSession } from "@/hooks/useImportStatus";

interface ImportStatusContextValue {
  session: ImportSession | null;
  isActive: boolean;
  percent: number;
}

const ImportStatusContext = createContext<ImportStatusContextValue>({
  session: null,
  isActive: false,
  percent: 0,
});

interface ImportStatusProviderProps {
  children: ReactNode;
  onImportDone?: () => void;
}

export function ImportStatusProvider({ children, onImportDone }: ImportStatusProviderProps) {
  const value = useImportStatus({ onImportDone });
  return (
    <ImportStatusContext.Provider value={value}>
      {children}
    </ImportStatusContext.Provider>
  );
}

export function useImportStatusContext(): ImportStatusContextValue {
  return useContext(ImportStatusContext);
}
