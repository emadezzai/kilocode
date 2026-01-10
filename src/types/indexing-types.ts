// kilocode_change - new file

export interface CodeIndex {
	id: string
	type: string
	name: string
	filePath: string
	lineNumber?: number
	signature?: string
	content?: string
	language?: string
	dependencies?: string[]
	tags?: string[]
	hash?: string
	lastModified?: number
	indexedAt: number
}

export interface UserMemory {
	id: string
	userId: string
	sessionId?: string
	type: MemoryType
	content: any
	context?: MemoryContext
	importance: number
	accessCount: number
	lastAccessed: Date
	createdAt: Date
	expiresAt?: Date
}

export type MemoryType = "conversation" | "pattern" | "preference" | "feedback" | "insight"

export interface MemoryContext {
	activeFile?: string
	cursorPosition?: Position
	project?: string
	language?: string
	recentQueries?: string[]
}

export interface Position {
	line: number
	character: number
}

export interface SearchQuery {
	id: string
	userId: string
	queryText: string
	processedQuery?: string
	filters?: SearchFilters
	searchType: "text" | "semantic" | "hybrid"
	context?: SearchContext
	results?: SearchResult[]
	executionTime?: number
	timestamp: Date
}

export interface SearchFilters {
	fileTypes?: string[]
	dateRange?: { start: Date; end: Date }
	authors?: string[]
	elementTypes?: string[]
}

export interface SearchContext {
	activeFile?: string
	cursorPosition?: Position
	project?: string
	language?: string
}

export interface SearchResult {
	id: string
	queryId: string
	elementId: string
	relevanceScore: number
	matchType: "exact" | "semantic" | "fuzzy" | "hybrid"
	matchedContent?: string
	relationships?: string[]
	highlights?: TextHighlight[]
	rank: number
}

export interface TextHighlight {
	start: number
	end: number
	text: string
}

export interface AnalyticsData {
	id: string
	userId: string
	metricType: string
	data: any
	period: string
	computedAt: Date
	version: string
}

export interface IndexingResult {
	success: boolean
	elementsIndexed: number
	errors: string[]
	duration: number
}

export interface IndexingProgress {
	totalFiles: number
	processedFiles: number
	errors: string[]
	currentFile: string
}

export interface IIndexingService {
	indexWorkspace(): Promise<IndexingResult>
	indexFile(filePath: string): Promise<IndexingResult>
	removeFile(filePath: string): Promise<void>
	updateFile(filePath: string): Promise<IndexingResult>
	getIndexStats(): Promise<{
		totalElements: number
		filesIndexed: number
		lastIndexed: Date
		databaseSize: number
	}>
	rebuildIndex(): Promise<void>
}

export interface IMemoryService {
	storeMemory(memory: UserMemory): Promise<string>
	getMemory(id: string): Promise<UserMemory | null>
	updateMemory(id: string, updates: Partial<UserMemory>): Promise<void>
	deleteMemory(id: string): Promise<void>
	getMemoriesByType(type: MemoryType): Promise<UserMemory[]>
	getMemoriesByContext(context: string): Promise<UserMemory[]>
	searchMemories(query: string): Promise<UserMemory[]>
	cleanupExpiredMemories(): Promise<number>
	getMemoryStats(): Promise<MemoryStats>
	learnFromInteraction(interaction: UserInteraction): Promise<void>
	getSuggestions(context: SuggestionContext): Promise<Suggestion[]>
}

export interface MemoryStats {
	totalMemories: number
	memoriesByType: Record<MemoryType, number>
	averageImportance: number
	oldestMemory: Date
	newestMemory: Date
	databaseSize: number
}

export interface UserInteraction {
	type: "query" | "code_action" | "feedback" | "preference_change"
	content: any
	context: MemoryContext
	timestamp: Date
	outcome?: "success" | "error" | "neutral"
}

export interface SuggestionContext {
	activeFile?: string
	cursorPosition?: Position
	recentQueries?: string[]
	currentTask?: string
}

export interface Suggestion {
	type: "code_completion" | "pattern_match" | "context_help" | "resource_recommendation"
	content: string
	confidence: number
	source: string
	metadata?: any
}
