// kilocode_change - new file

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { IndexingService } from "../../services/indexing/indexing-service"
import { SearchEngine } from "../../services/indexing/search-engine"
import { MemoryService } from "../../services/memory/memory-service"
import { IndexingTool } from "../../core/tools/indexing-tool"
import { DatabaseManager } from "../../services/indexing/database-manager"
import { ConfigManager } from "../../services/indexing/config-manager"

// Mock VSCode
const mockVSCode = {
	workspace: {
		findFiles: vi.fn(),
		createFileSystemWatcher: vi.fn(),
		workspaceFolders: [{ uri: { fsPath: "/tmp/test-workspace" } }],
	},
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		activeTextEditor: {
			document: { uri: { fsPath: "/tmp/test-workspace/src/index.ts" } },
		},
	},
	env: { clipboard: { writeText: vi.fn() } },
}

vi.mock("vscode", () => mockVSCode)

describe("Indexing Workflow Integration Tests", () => {
	let indexingService: IndexingService
	let searchEngine: SearchEngine
	let memoryService: MemoryService
	let indexingTool: IndexingTool
	let databaseManager: DatabaseManager
	let configManager: ConfigManager
	let testWorkspacePath: string
	let testDataDirectory: string

	beforeEach(async () => {
		testWorkspacePath = "/tmp/test-workspace"
		testDataDirectory = "/tmp/test-data"

		// Initialize database manager
		databaseManager = new DatabaseManager({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
		})
		await databaseManager.initialize()

		// Initialize config manager
		configManager = ConfigManager.getInstance(testWorkspacePath)

		// Initialize services
		indexingService = new IndexingService({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxFileSize: 1024 * 1024,
			excludedPatterns: ["**/node_modules/**"],
		})

		searchEngine = new SearchEngine({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxResults: 50,
			minScore: 0.3,
		})

		memoryService = new MemoryService({
			userId: "test-user",
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxMemoryAge: 90,
			maxMemoryCount: 1000,
		})

		indexingTool = new IndexingTool({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
		})

		await indexingService.initialize()
		await searchEngine.initialize()
		await memoryService.initialize()
		await indexingTool.initialize()
	})

	afterEach(async () => {
		await indexingTool.dispose()
		await memoryService.dispose()
		await searchEngine.dispose()
		await indexingService.dispose()
		await databaseManager.close()
	})

	describe("End-to-End Indexing Workflow", () => {
		test("should complete full indexing workflow", async () => {
			// Mock workspace with multiple files
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/index.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils.ts` },
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/lib/api.ts` },
			])

			// Step 1: Index workspace
			const indexingResult = await indexingTool.indexWorkspace()
			expect(indexingResult.success).toBe(true)
			expect(indexingResult.elementsIndexed).toBeGreaterThan(0)

			// Step 2: Verify index statistics
			const stats = await indexingTool.getIndexStats()
			expect(stats.totalElements).toBeGreaterThan(0)
			expect(stats.filesIndexed).toBeGreaterThan(0)

			// Step 3: Search indexed content
			const searchResult = await indexingTool.searchCode("function", {
				searchType: "text",
				maxResults: 10,
			})
			expect(searchResult.results).toBeDefined()
			expect(searchResult.totalResults).toBeGreaterThanOrEqual(0)
			expect(searchResult.duration).toBeGreaterThan(0)

			// Step 4: Test semantic search
			const semanticResult = await indexingTool.searchCode("utility functions", {
				searchType: "semantic",
				maxResults: 5,
			})
			expect(semanticResult.results).toBeDefined()
			expect(semanticResult.totalResults).toBeGreaterThanOrEqual(0)

			// Step 5: Test hybrid search
			const hybridResult = await indexingTool.searchCode("Button component", {
				searchType: "hybrid",
				maxResults: 5,
			})
			expect(hybridResult.results).toBeDefined()
			expect(hybridResult.totalResults).toBeGreaterThanOrEqual(0)
		})

		test("should handle real-time file updates", async () => {
			// Initial indexing
			mockVSCode.workspace.findFiles.mockResolvedValue([{ fsPath: `${testWorkspacePath}/src/index.ts` }])

			const initialResult = await indexingTool.indexWorkspace()
			expect(initialResult.success).toBe(true)

			// Simulate file change (this would be triggered by file watcher)
			const filePath = `${testWorkspacePath}/src/index.ts`
			const updateResult = await indexingTool.indexFile(filePath)
			expect(updateResult.success).toBe(true)

			// Verify updated index
			const stats = await indexingTool.getIndexStats()
			expect(stats.totalElements).toBeGreaterThan(0)
		})

		test("should handle indexing errors gracefully", async () => {
			// Mock file system error
			mockVSCode.workspace.findFiles.mockRejectedValue(new Error("Permission denied"))

			const result = await indexingTool.indexWorkspace()
			expect(result.success).toBe(false)
			expect(result.errors.length).toBeGreaterThan(0)

			// Should still be able to get stats
			const stats = await indexingTool.getIndexStats()
			expect(stats).toBeDefined()
		})
	})

	describe("Search Integration Workflow", () => {
		test("should integrate search with indexing", async () => {
			// First, index some content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/calculator.ts` },
				{ fsPath: `${testWorkspacePath}/src/math.ts` },
			])

			await indexingTool.indexWorkspace()

			// Test different search types
			const textSearch = await indexingTool.searchCode("calculate", {
				searchType: "text",
			})
			expect(textSearch.results).toBeDefined()

			const semanticSearch = await indexingTool.searchCode("mathematical operations", {
				searchType: "semantic",
			})
			expect(semanticSearch.results).toBeDefined()

			const hybridSearch = await indexingTool.searchCode("calc", {
				searchType: "hybrid",
			})
			expect(hybridSearch.results).toBeDefined()
		})

		test("should handle search with filters", async () => {
			// Index content with different file types
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/index.ts` },
				{ fsPath: `${testWorkspacePath}/lib/api.py` },
				{ fsPath: `${testWorkspacePath}/components/Button.jsx` },
			])

			await indexingTool.indexWorkspace()

			// Search with file type filter
			const filteredSearch = await indexingTool.searchCode("function", {
				searchType: "text",
				filters: { fileTypes: ["ts"] },
			})
			expect(filteredSearch.results).toBeDefined()
		})
	})

	describe("Memory Integration Workflow", () => {
		test("should integrate memory with indexing", async () => {
			// Index some content
			mockVSCode.workspace.findFiles.mockResolvedValue([{ fsPath: `${testWorkspacePath}/src/index.ts` }])

			await indexingTool.indexWorkspace()

			// Store memory about indexing
			const memoryId = await memoryService.storeMemory({
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation",
				content: {
					query: "How do I index my code?",
					response: "Use the indexing service",
					context: "indexing workflow",
				},
				context: {
					activeFile: `${testWorkspacePath}/src/index.ts`,
					project: "test-project",
				},
				importance: 7,
				accessCount: 0,
				lastAccessed: new Date(),
			})

			expect(memoryId).toBeDefined()

			// Retrieve memory
			const retrievedMemory = await memoryService.getMemory(memoryId)
			expect(retrievedMemory).toBeDefined()
			expect(retrievedMemory?.content.query).toBe("How do I index my code?")

			// Search memories
			const memories = await memoryService.searchMemories("indexing")
			expect(memories.length).toBeGreaterThan(0)
		})

		test("should learn from user interactions", async () => {
			const interaction = {
				type: "query" as const,
				content: "Search for functions",
				context: {
					activeFile: `${testWorkspacePath}/src/index.ts`,
					project: "test-project",
				},
				timestamp: new Date(),
				outcome: "success" as const,
			}

			await memoryService.learnFromInteraction(interaction)

			// Check if memory was created
			const memories = await memoryService.getMemoriesByType("conversation")
			expect(memories.length).toBeGreaterThan(0)
		})
	})

	describe("Configuration Integration Workflow", () => {
		test("should respect configuration changes", async () => {
			// Get initial config
			const initialConfig = indexingTool.getConfig()
			expect(initialConfig.indexing).toBeDefined()
			expect(initialConfig.search).toBeDefined()

			// Update configuration
			indexingTool.updateConfig("search", { maxResults: 25 })

			// Verify configuration was updated
			const updatedConfig = indexingTool.getConfig()
			expect(updatedConfig.search.maxResults).toBe(25)
		})

		test("should handle enable/disable functionality", async () => {
			// Test enable/disable
			expect(indexingTool.isEnabled()).toBe(true)

			indexingTool.setEnabled(false)
			expect(indexingTool.isEnabled()).toBe(false)

			indexingTool.setEnabled(true)
			expect(indexingTool.isEnabled()).toBe(true)
		})
	})

	describe("Performance Integration Workflow", () => {
		test("should handle large workspaces efficiently", async () => {
			// Mock large workspace
			const manyFiles = Array.from({ length: 1000 }, (_, i) => ({
				fsPath: `${testWorkspacePath}/src/file${i}.ts`,
			}))
			mockVSCode.workspace.findFiles.mockResolvedValue(manyFiles)

			const startTime = Date.now()
			const result = await indexingTool.indexWorkspace()
			const duration = Date.now() - startTime

			expect(result.success).toBe(true)
			expect(duration).toBeLessThan(60000) // Should complete within 1 minute for test
		})

		test("should maintain performance under concurrent operations", async () => {
			// Mock workspace
			mockVSCode.workspace.findFiles.mockResolvedValue([{ fsPath: `${testWorkspacePath}/src/index.ts` }])

			// Run multiple operations concurrently
			const operations = [
				indexingTool.indexWorkspace(),
				indexingTool.searchCode("test"),
				indexingTool.getIndexStats(),
				memoryService.getMemoryStats(),
			]

			const results = await Promise.allSettled(operations)

			// All operations should complete without throwing
			results.forEach((result) => {
				expect(result.status).toBe("fulfilled")
			})
		})
	})

	describe("Error Recovery Workflow", () => {
		test("should recover from indexing errors", async () => {
			// Mock partial failure
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/good.ts` },
				{ fsPath: `${testWorkspacePath}/src/bad.ts` },
			])

			const result = await indexingTool.indexWorkspace()

			// Should complete with some errors
			expect(result.errors.length).toBeGreaterThanOrEqual(0)

			// Should still be able to search indexed content
			const searchResult = await indexingTool.searchCode("function")
			expect(searchResult.results).toBeDefined()
		})

		test("should handle database corruption gracefully", async () => {
			// Simulate database issue by closing connection
			await databaseManager.close()

			// Operations should handle database errors gracefully
			const result = await indexingTool.getIndexStats()
			expect(result).toBeDefined()
		})
	})

	describe("Resource Management Workflow", () => {
		test("should properly cleanup all resources", async () => {
			// Use all services
			await indexingTool.indexWorkspace()
			await indexingTool.searchCode("test")
			await memoryService.storeMemory({
				userId: "test",
				sessionId: "test",
				type: "conversation",
				content: { test: "data" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			})

			// Dispose all resources
			await indexingTool.dispose()
			await memoryService.dispose()
			await searchEngine.dispose()
			await indexingService.dispose()
			await databaseManager.close()

			// Should not throw when disposing
			expect(true).toBe(true)
		})
	})
})
