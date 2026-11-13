// Contexto del idioma del ronqueo (separado de idioma.tsx para que Fast Refresh
// solo vea componentes allá).
import { createContext, useContext } from 'react'
import * as ES from './contenido'

export type Idioma = 'es' | 'en'
export type Contenido = typeof ES
export type Ctx = { idioma: Idioma; c: Contenido; cambiar: () => void }
export const IdiomaCtx = createContext<Ctx>({ idioma: 'es', c: ES, cambiar: () => {} })

export const useIdioma = () => useContext(IdiomaCtx)
export const useContenido = () => useContext(IdiomaCtx).c
