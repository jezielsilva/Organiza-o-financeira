import { createContext, useContext } from "react";
import { currentMonth, type YearMonth } from "../domain/month";

export interface MonthContextValue {
  month: YearMonth;
  setMonth: (month: YearMonth) => void;
}

export const MonthContext = createContext<MonthContextValue>({ month: currentMonth(), setMonth: () => {} });

export function useMonth() {
  return useContext(MonthContext);
}
