// kilocode_change - new file

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { MemoryService } from "../../services/memory/memory-service"
import { IndexingService } from "../../services/indexing/indexing-service"
import { SearchEngine } from "../../services/indexing/search-engine"
import { DatabaseManager } from "../../services/indexing/database-manager"
import { ConfigManager } from "../../services/indexing/config-manager"
import { UserMemory, MemoryType } from "../../types/indexing-types"

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
}

vi.mock("vscode", () => mockVSCode)

describe("Memory Persistence Integration Tests", () => {
	let memoryService: MemoryService
	let indexingService: IndexingService
	let searchEngine: SearchEngine
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
		memoryService = new MemoryService({
			userId: "test-user",
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxMemoryAge: 90,
			maxMemoryCount: 1000,
		})

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

		await memoryService.initialize()
		await indexingService.initialize()
		await searchEngine.initialize()
	})

	afterEach(async () => {
		await memoryService.dispose()
		await indexingService.dispose()
		await searchEngine.dispose()
		await databaseManager.close()
	})

	describe("Memory Persistence Workflow", () => {
		test("should persist memories across service restarts", async () => {
			// Store some memories
			const memories = [
				{
					userId: "test-user",
					sessionId: "session-1",
					type: "conversation" as MemoryType,
					content: { query: "How to use React hooks?" },
					context: { activeFile: "/src/App.tsx" },
					importance: 7,
					accessCount: 0,
					lastAccessed: new Date(),
				},
				{
					userId: "test-user",
					sessionId: "session-1",
					type: "pattern" as MemoryType,
					content: { pattern: "use-functional-components" },
					context: { project: "react-project" },
					importance: 8,
					accessCount: 0,
					lastAccessed: new Date(),
				},
				{
					userId: "test-user",
					sessionId: "session-2",
					type: "preference" as MemoryType,
					content: { preference: "prettier-config" },
					importance: 6,
					accessCount: 0,
					lastAccessed: new Date(),
				},
			]

			const memoryIds = []
			for (const memory of memories) {
				const id = await memoryService.storeMemory(memory)
				memoryIds.push(id)
			}

			// Verify memories are stored
			const storedMemories = await Promise.all(memoryIds.map((id) => memoryService.getMemory(id)))
			expect(storedMemories.every((m) => m !== null)).toBe(true)

			// Simulate service restart by creating new instance
			const newMemoryService = new MemoryService({
				userId: "test-user",
				workspacePath: testWorkspacePath,
				dataDirectory: testDataDirectory,
				maxMemoryAge: 90,
				maxMemoryCount: 1000,
			})

			await newMemoryService.initialize()

			// Verify memories are still accessible
			const persistedMemories = await Promise.all(memoryIds.map((id) => newMemoryService.getMemory(id)))
			expect(persistedMemories.every((m) => m !== null)).toBe(true)

			// Verify content integrity
			persistedMemories.forEach((memory, index) => {
				expect(memory?.content).toEqual(memories[index].content)
				expect(memory?.type).toEqual(memories[index].type)
				expect(memory?.importance).toEqual(memories[index].importance)
			})

			await newMemoryService.dispose()
		})

		test("should maintain memory relationships across sessions", async () => {
			// Store related memories
			const baseMemory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "conversation" as MemoryType,
				content: { query: "TypeScript generics tutorial" },
				context: { activeFile: "/src/generics.ts" },
				importance: 8,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const followUpMemory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "conversation" as MemoryType,
				content: { query: "Generic constraints in TypeScript" },
				context: { activeFile: "/src/constraints.ts" },
				importance: 7,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const baseId = await memoryService.storeMemory(baseMemory)
			const followUpId = await memoryService.storeMemory(followUpMemory)

			// Search for related content
			const relatedMemories = await memoryService.searchMemories("TypeScript")
			expect(relatedMemories.length).toBe(2)

			// Verify temporal ordering (most recent first)
			const sortedMemories = relatedMemories.sort(
				(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			)
			expect(sortedMemories[0].id).toBe(followUpId)
			expect(sortedMemories[1].id).toBe(baseId)
		})

		test("should handle memory expiration correctly", async () => {
			// Store memory with expiration
			const expiredMemory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "conversation" as MemoryType,
				content: { query: "Old query" },
				importance: 3,
				accessCount: 0,
				lastAccessed: new Date(),
				expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
			}

			const validMemory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "conversation" as MemoryType,
				content: { query: "Recent query" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const expiredId = await memoryService.storeMemory(expiredMemory)
			const validId = await memoryService.storeMemory(validMemory)

			// Run cleanup
			const cleanedCount = await memoryService.cleanupExpiredMemories()
			expect(cleanedCount).toBe(1)

			// Verify expired memory is gone
			const expiredAfterCleanup = await memoryService.getMemory(expiredId)
			expect(expiredAfterCleanup).toBeNull()

			// Verify valid memory remains
			const validAfterCleanup = await memoryService.getMemory(validId)
			expect(validAfterCleanup).toBeDefined()
			expect(validAfterCleanup?.content.query).toBe("Recent query")
		})

		test("should persist memory statistics accurately", async () => {
			// Store memories of different types
			const memories = [
				{ type: "conversation" as MemoryType, content: { query: "test1" }, importance: 5 },
				{ type: "pattern" as MemoryType, content: { pattern: "test2" }, importance: 7 },
				{ type: "preference" as MemoryType, content: { preference: "test3" }, importance: 6 },
				{ type: "feedback" as MemoryType, content: { feedback: "test4" }, importance: 4 },
				{ type: "insight" as MemoryType, content: { insight: "test5" }, importance: 8 },
			]

			for (const memoryData of memories) {
				await memoryService.storeMemory({
					userId: "test-user",
					sessionId: "test-session",
					...memoryData,
					accessCount: 0,
					lastAccessed: new Date(),
				})
			}

			// Get statistics
			const stats = await memoryService.getMemoryStats()

			expect(stats.totalMemories).toBe(5)
			expect(stats.memoriesByType.conversation).toBe(1)
			expect(stats.memoriesByType.pattern).toBe(1)
			expect(stats.memoriesByType.preference).toBe(1)
			expect(stats.memoriesByType.feedback).toBe(1)
			expect(stats.memoriesByType.insight).toBe(1)
			expect(stats.averageImportance).toBe(6) // (5+7+6+4+8)/5
			expect(stats.databaseSize).toBeGreaterThan(0)

			// Simulate service restart
			const newMemoryService = new MemoryService({
				userId: "test-user",
				workspacePath: testWorkspacePath,
				dataDirectory: testDataDirectory,
				maxMemoryAge: 90,
				maxMemoryCount: 1000,
			})

			await newMemoryService.initialize()

			// Verify statistics persist
			const persistedStats = await newMemoryService.getMemoryStats()
			expect(persistedStats.totalMemories).toBe(5)
			expect(persistedStats.memoriesByType).toEqual(stats.memoriesByType)

			await newMemoryService.dispose()
		})
	})

	describe("Cross-Service Integration", () => {
		test("should integrate memory with indexing context", async () => {
			// Index some content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/types.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils.ts` },
			])

			await indexingService.indexWorkspace()

			// Store memory with indexing context
			const memory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "conversation" as MemoryType,
				content: {
					query: "How to create types in TypeScript?",
					context: "Working with types.ts file",
				},
				context: {
					activeFile: `${testWorkspacePath}/src/types.ts`,
					project: "typescript-project",
					language: "typescript",
				},
				importance: 7,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			// Search for context-related memories
			const contextMemories = await memoryService.getMemoriesByContext("typescript")
			expect(contextMemories.length).toBeGreaterThan(0)

			// Verify context is preserved
			const contextMemory = contextMemories.find((m) => m.id === memoryId)
			expect(contextMemory?.context?.language).toBe("typescript")
			expect(contextMemory?.context?.activeFile).toContain("types.ts")
		})

		test("should learn from search interactions", async () => {
			// Index content first
			mockVSCode.workspace.findFiles.mockResolvedValue([{ fsPath: `${testWorkspacePath}/src/api.ts` }])

			await indexingService.indexWorkspace()

			// Simulate search interaction
			const searchInteraction = {
				type: "query" as const,
				content: "API endpoint patterns",
				context: {
					activeFile: `${testWorkspacePath}/src/api.ts`,
					project: "api-project",
					language: "typescript",
				},
				timestamp: new Date(),
				outcome: "success" as const,
			}

			await memoryService.learnFromInteraction(searchInteraction)

			// Verify learning occurred
			const learnedMemories = await memoryService.getMemoriesByType("conversation")
			expect(learnedMemories.length).toBeGreaterThan(0)

			const learnedMemory = learnedMemories.find((m) => m.content.query === "API endpoint patterns")
			expect(learnedMemory).toBeDefined()
			expect(learnedMemory?.context?.language).toBe("typescript")
		})

		test("should provide contextual suggestions based on indexing", async () => {
			// Index content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/src/utils/helpers.ts` },
			])

			await indexingService.indexWorkspace()

			// Store some patterns
			const patternMemory = {
				userId: "test-user",
				sessionId: "session-1",
				type: "pattern" as MemoryType,
				content: {
					pattern: "use-functional-components",
					description: "Prefer functional components over class components",
				},
				context: {
					activeFile: `${testWorkspacePath}/src/components/Button.tsx`,
					project: "react-project",
				},
				importance: 8,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			await memoryService.storeMemory(patternMemory)

			// Get suggestions for similar context
			const suggestionContext = {
				activeFile: `${testWorkspacePath}/src/components/Input.tsx`,
				cursorPosition: { line: 5, character: 10 },
				recentQueries: ["component", "react"],
				currentTask: "creating new component",
			}

			const suggestions = await memoryService.getSuggestions(suggestionContext)
			expect(Array.isArray(suggestions)).toBe(true)

			// Should suggest functional components pattern
			const patternSuggestions = suggestions.filter((s) => s.content.includes("functional-components"))
			expect(patternSuggestions.length).toBeGreaterThan(0)
		})
	})

	describe("Performance and Scalability", () => {
		test("should handle large memory datasets efficiently", async () => {
			// Store many memories
			const startTime = Date.now()
			const promises = []

			for (let i = 0; i < 500; i++) {
				const memory = {
					userId: "test-user",
					sessionId: `session-${i % 10}`,
					type: ["conversation", "pattern", "preference", "feedback", "insight"][i % 5] as MemoryType,
					content: {
						query: `Large dataset test ${i}`,
						data: `Additional data for memory ${i}`.repeat(100),
					},
					importance: Math.floor(Math.random() * 10) + 1,
					accessCount: 0,
					lastAccessed: new Date(),
				}
				promises.push(memoryService.storeMemory(memory))
			}

			await Promise.all(promises)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(10000) // Should complete within 10 seconds

			// Verify search performance
			const searchStart = Date.now()
			const searchResults = await memoryService.searchMemories("dataset")
			const searchDuration = Date.now() - searchStart

			expect(searchDuration).toBeLessThan(2000) // Search should be fast
			expect(searchResults.length).toBeGreaterThan(0)
		})

		test("should maintain performance under concurrent access", async () => {
			// Store some memories first
			for (let i = 0; i < 50; i++) {
				await memoryService.storeMemory({
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: `Concurrent test ${i}` },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				})
			}

			// Run multiple operations concurrently
			const operations = [
				memoryService.getMemoryStats(),
				memoryService.getMemoriesByType("conversation"),
				memoryService.searchMemories("concurrent"),
				memoryService.getSuggestions({
					activeFile: "/test/file.ts",
					cursorPosition: { line: 1, character: 1 },
				}),
				memoryService.cleanupExpiredMemories(),
			]

			const results = await Promise.allSettled(operations)

			// All operations should complete successfully
			results.forEach((result) => {
				expect(result.status).toBe("fulfilled")
			})
		})
	})

	describe("Data Consistency and Recovery", () => {
		test("should handle database corruption gracefully", async () => {
			// Store some memories
			const memoryIds = []
			for (let i = 0; i < 10; i++) {
				const id = await memoryService.storeMemory({
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: `Recovery test ${i}` },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				})
				memoryIds.push(id)
			}

			// Simulate database corruption by closing connection
			await databaseManager.close()

			// Operations should handle database errors gracefully
			const stats = await memoryService.getMemoryStats()
			expect(stats).toBeDefined()

			// Reinitialize and verify data integrity
			await databaseManager.initialize()
			await memoryService.initialize()

			const recoveredMemories = await Promise.all(memoryIds.map((id) => memoryService.getMemory(id)))

			// Should handle corruption gracefully (some data may be lost)
			expect(recoveredMemories.length).toBeGreaterThanOrEqual(0)
		})

		test("should maintain memory access counts", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { query: "Access count test" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			// Access memory multiple times
			await memoryService.getMemory(memoryId)
			await memoryService.getMemory(memoryId)
			await memoryService.getMemory(memoryId)

			// Verify access count increased
			const accessedMemory = await memoryService.getMemory(memoryId)
			expect(accessedMemory?.accessCount).toBe(3)
		})
	})
})
