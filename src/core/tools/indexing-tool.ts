// kilocode_change - new file

import * as vscode from "vscode"
import * as path from "path"
import { IndexingService } from "../../services/indexing/indexing-service"
import { SearchEngine } from "../../services/indexing/search-engine"
import { ConfigManager } from "../../services/indexing/config-manager"
import { logger, logAndHandleError } from "../../services/indexing/logging-service"
import { ErrorHandler, ErrorSeverity, ErrorCategory } from "../../services/indexing/error-handler"

export interface IndexingToolOptions {
	workspacePath: string
	dataDirectory: string
}

/**
 * Kilo Code tool for indexing and searching code
 * Integrates with existing tool infrastructure
 */
export class IndexingTool {
	private readonly indexingService: IndexingService
	private readonly searchEngine: SearchEngine
	private readonly configManager: ConfigManager
	private readonly options: IndexingToolOptions
	private isInitialized: boolean = false

	constructor(options: IndexingToolOptions) {
		this.options = options
		this.configManager = ConfigManager.getInstance(options.workspacePath)

		this.indexingService = new IndexingService({
			workspacePath: options.workspacePath,
			dataDirectory: options.dataDirectory,
			maxFileSize: this.configManager.getIndexingConfig().maxFileSize,
			excludedPatterns: this.configManager.getIndexingConfig().excludedPatterns,
		})

		this.searchEngine = new SearchEngine({
			workspacePath: options.workspacePath,
			dataDirectory: options.dataDirectory,
			maxResults: this.configManager.getSearchConfig().maxResults,
			minScore: this.configManager.getSearchConfig().minScore,
		})

		// Setup error handling
		ErrorHandler.registerCallback(ErrorSeverity.HIGH, (error) => {
			logger.error("High severity error in indexing tool", { error: error.message })
		})
	}

	/**
	 * Initialize the indexing tool
	 */
	async initialize(): Promise<void> {
		try {
			logger.info("Initializing indexing tool", { workspacePath: this.options.workspacePath })

			await this.indexingService.initialize()
			await this.searchEngine.initialize()

			this.isInitialized = true
			logger.info("Indexing tool initialized successfully")
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.initialize",
					workspacePath: this.options.workspacePath,
				},
				ErrorSeverity.HIGH,
				ErrorCategory.SYSTEM,
			)
			throw error
		}
	}

	/**
	 * Index entire workspace
	 */
	async indexWorkspace(): Promise<{
		success: boolean
		elementsIndexed: number
		duration: number
		errors: string[]
	}> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const startTime = Date.now()
		logger.info("Starting workspace indexing", { workspacePath: this.options.workspacePath })

		try {
			const result = await this.indexingService.indexWorkspace()

			logger.logIndexing(
				"workspace_indexing",
				this.options.workspacePath,
				result.elementsIndexed,
				result.duration,
			)

			// Show progress notification
			if (result.success) {
				vscode.window.showInformationMessage(
					`Successfully indexed ${result.elementsIndexed} code elements in ${result.duration}ms`,
				)
			} else {
				vscode.window.showWarningMessage(`Indexing completed with ${result.errors.length} errors`)
			}

			return result
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.indexWorkspace",
					workspacePath: this.options.workspacePath,
				},
				ErrorSeverity.HIGH,
				ErrorCategory.INDEXING,
			)
			throw error
		}
	}

	/**
	 * Index a specific file
	 */
	async indexFile(filePath: string): Promise<{
		success: boolean
		elementsIndexed: number
		duration: number
		errors: string[]
	}> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const startTime = Date.now()
		logger.info("Starting file indexing", { filePath })

		try {
			const result = await this.indexingService.indexFile(filePath)

			logger.logIndexing("file_indexing", filePath, result.elementsIndexed, result.duration)

			return result
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.indexFile",
					filePath,
				},
				ErrorSeverity.MEDIUM,
				ErrorCategory.INDEXING,
			)
			throw error
		}
	}

	/**
	 * Search indexed code
	 */
	async searchCode(
		query: string,
		options: {
			searchType?: "text" | "semantic" | "hybrid"
			maxResults?: number
			filters?: any
		} = {},
	): Promise<{
		results: Array<{
			id: string
			name: string
			type: string
			filePath: string
			lineNumber?: number
			content?: string
			relevanceScore: number
			matchType: string
			highlights?: Array<{
				start: number
				end: number
				text: string
			}>
		}>
		totalResults: number
		duration: number
	}> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		const startTime = Date.now()
		logger.info("Starting code search", { query, options })

		try {
			// Generate search query ID
			const queryId = `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

			const searchQuery = {
				id: queryId,
				userId: "current_user", // Would get from context
				queryText: query,
				searchType: options.searchType || "hybrid",
				filters: options.filters,
				context: {
					activeFile: vscode.window.activeTextEditor?.document?.uri?.fsPath,
					workspacePath: this.options.workspacePath,
				},
				timestamp: new Date(),
			}

			const results = await this.searchEngine.search(searchQuery)
			const duration = Date.now() - startTime

			logger.logSearch(query, results.length, duration, searchQuery.searchType)

			// Transform results for user interface
			const transformedResults = results.map((result) => ({
				id: result.elementId,
				name: "", // Would need to fetch from database
				type: "", // Would need to fetch from database
				filePath: "", // Would need to fetch from database
				lineNumber: undefined,
				content: result.matchedContent,
				relevanceScore: result.relevanceScore,
				matchType: result.matchType,
				highlights: result.highlights,
			}))

			return {
				results: transformedResults,
				totalResults: results.length,
				duration,
			}
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.searchCode",
					query,
					options,
				},
				ErrorSeverity.MEDIUM,
				ErrorCategory.SEARCH,
			)
			throw error
		}
	}

	/**
	 * Get indexing statistics
	 */
	async getIndexStats(): Promise<{
		totalElements: number
		filesIndexed: number
		lastIndexed: Date
		databaseSize: number
		indexingProgress?: {
			totalFiles: number
			processedFiles: number
			currentFile: string
			errors: string[]
		}
	}> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		try {
			const stats = await this.indexingService.getIndexStats()
			const progress = this.indexingService.getProgress()

			return {
				...stats,
				indexingProgress: progress,
			}
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.getIndexStats",
				},
				ErrorSeverity.LOW,
				ErrorCategory.SYSTEM,
			)
			throw error
		}
	}

	/**
	 * Rebuild index
	 */
	async rebuildIndex(): Promise<void> {
		if (!this.isInitialized) {
			await this.initialize()
		}

		logger.info("Starting index rebuild", { workspacePath: this.options.workspacePath })

		try {
			await this.indexingService.rebuildIndex()

			vscode.window.showInformationMessage("Index rebuilt successfully")
			logger.info("Index rebuild completed")
		} catch (error) {
			await logAndHandleError(
				error as Error,
				{
					operation: "IndexingTool.rebuildIndex",
				},
				ErrorSeverity.HIGH,
				ErrorCategory.INDEXING,
			)
			throw error
		}
	}

	/**
	 * Get configuration
	 */
	getConfig(): {
		indexing: any
		search: any
		logging: any
	} {
		return {
			indexing: this.configManager.getIndexingConfig(),
			search: this.configManager.getSearchConfig(),
			logging: this.configManager.getLoggingConfig(),
		}
	}

	/**
	 * Update configuration
	 */
	updateConfig(section: "indexing" | "search" | "logging", config: any): void {
		switch (section) {
			case "indexing":
				this.configManager.updateIndexingConfig(config)
				break
			case "search":
				this.configManager.updateSearchConfig(config)
				break
			case "logging":
				this.configManager.updateLoggingConfig(config)
				break
		}
	}

	/**
	 * Check if indexing is enabled
	 */
	isEnabled(): boolean {
		return this.configManager.getIndexingConfig().enabled
	}

	/**
	 * Enable/disable indexing
	 */
	setEnabled(enabled: boolean): void {
		this.configManager.updateIndexingConfig({ enabled })

		if (enabled && !this.isInitialized) {
			this.initialize()
		}
	}

	/**
	 * Dispose of resources
	 */
	async dispose(): Promise<void> {
		try {
			await this.indexingService.dispose()
			await this.searchEngine.dispose()
			this.configManager.dispose()
			this.isInitialized = false

			logger.info("Indexing tool disposed")
		} catch (error) {
			console.error("Error disposing indexing tool:", error)
		}
	}
}

/**
 * Global indexing tool instance
 */
let globalIndexingTool: IndexingTool | null = null

export function getIndexingTool(options?: IndexingToolOptions): IndexingTool {
	if (!globalIndexingTool && options) {
		globalIndexingTool = new IndexingTool(options)
	}

	if (!globalIndexingTool) {
		throw new Error("Indexing tool not initialized. Call getIndexingTool with options first.")
	}

	return globalIndexingTool
}

/**
 * Initialize indexing tool for current workspace
 */
export async function initializeIndexingTool(): Promise<IndexingTool> {
	const workspaceFolders = vscode.workspace.workspaceFolders
	if (!workspaceFolders || workspaceFolders.length === 0) {
		throw new Error("No workspace folder found")
	}

	const workspacePath = workspaceFolders[0].uri.fsPath
	const dataDirectory = path.join(workspacePath, ".kilocode")

	const tool = getIndexingTool({ workspacePath, dataDirectory })
	await tool.initialize()

	return tool
}
