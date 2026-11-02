import { createContext, useContext } from 'react'
export const KCtx = createContext(null)
export const useK = () => useContext(KCtx)
