import type { ModSource, ProjectType } from './types'

export type ModSearchSort = 'relevance' | 'downloads' | 'newest' | 'updated'
export type ModFilterEnvironment = 'client' | 'server'

/**
 * Additive search filters. Version and loader use `'*'` to explicitly request
 * "all"; an omitted value follows the selected instance.
 */
export interface ModSearchFilters {
  gameVersion?: string
  loader?: string
  environment?: ModFilterEnvironment
}

export interface ModSearchOptions {
  instanceId?: string
  category?: string
  offset?: number
  limit?: number
  sort?: ModSearchSort
  source?: ModSource
  projectType?: ProjectType
  filters?: ModSearchFilters
}
