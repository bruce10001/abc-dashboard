// Import JSON data at build time
// These will be bundled into the app

export interface PoolStats {
  snapshotDate: string
  epochNumber: number
  chain: string
  version: string
  stakerNumber: number
  totalPOS: number
}

export interface TeslaSnapshot {
  snapshotDate: string
  espaceAddr: string
  posAmount: number
  abcAmount: number
  vote: number
}

// Dynamic imports for JSON data
export async function loadPoolStats(): Promise<PoolStats[]> {
  try {
    const response = await fetch('./data/poolStats.json')
    if (!response.ok) {
      console.warn('Could not load poolStats.json, using empty array')
      return []
    }
    return await response.json()
  } catch (error) {
    console.warn('Error loading poolStats.json:', error)
    return []
  }
}

export async function loadTeslaSnapshot(): Promise<TeslaSnapshot[]> {
  try {
    const response = await fetch('./data/teslaSnapshot.json')
    if (!response.ok) {
      console.warn('Could not load teslaSnapshot.json, using empty array')
      return []
    }
    return await response.json()
  } catch (error) {
    console.warn('Error loading teslaSnapshot.json:', error)
    return []
  }
}
