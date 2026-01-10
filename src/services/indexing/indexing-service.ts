// kilocode_change - new file

import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"
import { DatabaseManager } from "./database-manager"
import { CodeIndexer } from "./code-indexer"
import { IIndexingService, IndexingResult, IndexingProgress } from "../types/indexing-types"

export interface IndexingServiceConfig {
	workspacePath: string
	dataDirectory: string
	maxFileSize?: number
	excludedPatterns?: string[]
}

/**
 * Core indexing service for code analysis and storage
 * Integrates with existing Kilo Code infrastructure
 */
export class IndexingService implements IIndexingService {
	private readonly config: IndexingServiceConfig
	private readonly databaseManager: DatabaseManager
	private readonly codeIndexer: CodeIndexer
	private readonly fileWatcher: vscode.FileSystemWatcher
	private isIndexing: boolean = false
	private indexingProgress: IndexingProgress = {
		totalFiles: 0,
		processedFiles: 0,
		errors: [],
		currentFile: "",
	}

	constructor(config: IndexingServiceConfig) {
		this.config = config
		this.databaseManager = new DatabaseManager({
			workspacePath: config.workspacePath,
			dataDirectory: config.dataDirectory,
		})
		this.codeIndexer = new CodeIndexer(this.databaseManager)

		// Set up file watcher for real-time updates
		const pattern = new vscode.RelativePattern(
			config.workspacePath,
			"**/*.{ts,js,tsx,jsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt}",
		)
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern)
		this.setupFileWatcher()
	}

	/**
	 * Initialize the indexing service
	 */
	async initialize(): Promise<void> {
		await this.databaseManager.initialize()
		await this.codeIndexer.initialize()
	}

	/**
	 * Index entire workspace
	 */
	async indexWorkspace(): Promise<IndexingResult> {
		if (this.isIndexing) {
			throw new Error("Indexing already in progress")
		}

		this.isIndexing = true
		this.indexingProgress = {
			totalFiles: 0,
			processedFiles: 0,
			errors: [],
			currentFile: "",
		}

		const startTime = Date.now()

		try {
			// Get all relevant files in workspace
			const files = await this.getWorkspaceFiles()
			this.indexingProgress.totalFiles = files.length

			// Process files in batches to avoid blocking
			const batchSize = 50
			for (let i = 0; i < files.length; i += batchSize) {
				const batch = files.slice(i, i + batchSize)
				await this.processBatch(batch)

				// Yield control to avoid blocking
				await new Promise((resolve) => setTimeout(resolve, 0))
			}

			const duration = Date.now() - startTime
			const elementsIndexed = await this.getIndexElementCount()

			return {
				success: true,
				elementsIndexed,
				errors: this.indexingProgress.errors,
				duration,
			}
		} catch (error) {
			return {
				success: false,
				elementsIndexed: 0,
				errors: [error instanceof Error ? error.message : "Unknown error"],
				duration: Date.now() - startTime,
			}
		} finally {
			this.isIndexing = false
		}
	}

	/**
	 * Index a single file
	 */
	async indexFile(filePath: string): Promise<IndexingResult> {
		const startTime = Date.now()

		try {
			const elementsIndexed = await this.codeIndexer.indexFile(filePath)

			return {
				success: true,
				elementsIndexed,
				errors: [],
				duration: Date.now() - startTime,
			}
		} catch (error) {
			return {
				success: false,
				elementsIndexed: 0,
				errors: [error instanceof Error ? error.message : "Unknown error"],
				duration: Date.now() - startTime,
			}
		}
	}

	/**
	 * Remove file from index
	 */
	async removeFile(filePath: string): Promise<void> {
		await this.codeIndexer.removeFile(filePath)
	}

	/**
	 * Update file in index
	 */
	async updateFile(filePath: string): Promise<IndexingResult> {
		await this.removeFile(filePath)
		return await this.indexFile(filePath)
	}

	/**
	 * Get indexing progress
	 */
	getProgress(): IndexingProgress {
		return { ...this.indexingProgress }
	}

	/**
	 * Get index statistics
	 */
	async getIndexStats(): Promise<{
		totalElements: number
		filesIndexed: number
		lastIndexed: Date
		databaseSize: number
	}> {
		const stats = await this.databaseManager.getStats()

		return {
			totalElements: stats.codeIndexCount,
			filesIndexed: await this.getIndexedFileCount(),
			lastIndexed: new Date(), // Would be stored in DB for accuracy
			databaseSize: stats.databaseSize,
		}
	}

	/**
	 * Rebuild entire index
	 */
	async rebuildIndex(): Promise<void> {
		// Clear existing index
		const db = this.databaseManager.getDatabase()
		await db.run("DELETE FROM code_index")

		// Re-index everything
		await this.indexWorkspace()
	}

	/**
	 * Get all relevant files in workspace
	 */
	private async getWorkspaceFiles(): Promise<string[]> {
		const workspaceFiles: string[] = []
		const excludedPatterns = this.config.excludedPatterns || [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.git/**",
			"**/coverage/**",
			"**/*.min.js",
			"**/*.min.css",
		]

		const files = await vscode.workspace.findFiles(
			"**/*.{ts,js,tsx,jsx,py,java,cpp,c,h,hpp,go,rs,php,rb,swift,kt}",
			excludedPatterns.join(", "),
		)

		return files.map((uri) => uri.fsPath)
	}

	/**
	 * Process a batch of files
	 */
	private async processBatch(files: string[]): Promise<void> {
		for (const file of files) {
			this.indexingProgress.currentFile = path.basename(file)

			try {
				await this.codeIndexer.indexFile(file)
				this.indexingProgress.processedFiles++
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error"
				this.indexingProgress.errors.push(`${file}: ${errorMessage}`)
			}
		}
	}

	/**
	 * Set up file watcher for real-time updates
	 */
	private setupFileWatcher(): void {
		this.fileWatcher.onDidChange(async (uri) => {
			await this.updateFile(uri.fsPath)
		})

		this.fileWatcher.onDidCreate(async (uri) => {
			await this.indexFile(uri.fsPath)
		})

		this.fileWatcher.onDidDelete(async (uri) => {
			await this.removeFile(uri.fsPath)
		})
	}

	/**
	 * Get total number of indexed elements
	 */
	private async getIndexElementCount(): Promise<number> {
		const stats = await this.databaseManager.getStats()
		return stats.codeIndexCount
	}

	/**
	 * Get number of indexed files
	 */
	private async getIndexedFileCount(): Promise<number> {
		const db = this.databaseManager.getDatabase()
		const result = await db.get("SELECT COUNT(DISTINCT file_path) as count FROM code_index")
		return result?.count || 0
	}

	/**
	 * Dispose of resources
	 */
	async dispose(): Promise<void> {
		this.fileWatcher.dispose()
		await this.databaseManager.close()
	}
}
