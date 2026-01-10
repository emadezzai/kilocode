// kilocode_change - new file

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { MemoryService } from "../../services/memory/memory-service"
import { DatabaseManager } from "../../services/indexing/database-manager"
import { UserMemory, MemoryType } from "../../types/indexing-types"

describe("MemoryService Contract Tests", () => {
	let memoryService: MemoryService
	let databaseManager: DatabaseManager
	let testWorkspacePath: string
	let testDataDirectory: string

	beforeEach(async () => {
		testWorkspacePath = "/tmp/test-workspace"
		testDataDirectory = "/tmp/test-data"

		databaseManager = new DatabaseManager({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
		})

		memoryService = new MemoryService({
			userId: "test-user",
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxMemoryAge: 90,
			maxMemoryCount: 1000,
		})

		await databaseManager.initialize()
		await memoryService.initialize()
	})

	afterEach(async () => {
		await memoryService.dispose()
		await databaseManager.close()
	})

	describe("Core Contract Requirements", () => {
		test("should initialize successfully", () => {
			expect(memoryService).toBeDefined()
		})

		test("should store memory and return ID", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { message: "Hello world" },
				context: { activeFile: "/test/file.ts" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)
			expect(memoryId).toBeDefined()
			expect(typeof memoryId).toBe("string")
		})

		test("should retrieve stored memory", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "preference" as MemoryType,
				content: { preference: "dark-mode" },
				importance: 8,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)
			const retrievedMemory = await memoryService.getMemory(memoryId)

			expect(retrievedMemory).toBeDefined()
			expect(retrievedMemory?.content).toEqual(memory.content)
			expect(retrievedMemory?.type).toBe(memory.type)
			expect(retrievedMemory?.importance).toBe(memory.importance)
		})

		test("should update existing memory", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "pattern" as MemoryType,
				content: { pattern: "use-async-await" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			const updates = {
				importance: 7,
				content: { pattern: "use-async-await-improved" },
			}

			await memoryService.updateMemory(memoryId, updates)

			const updatedMemory = await memoryService.getMemory(memoryId)
			expect(updatedMemory?.importance).toBe(7)
			expect(updatedMemory?.content).toEqual(updates.content)
		})

		test("should delete memory", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "feedback" as MemoryType,
				content: { feedback: "good-experience" },
				importance: 6,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)
			await memoryService.deleteMemory(memoryId)

			const deletedMemory = await memoryService.getMemory(memoryId)
			expect(deletedMemory).toBeNull()
		})

		test("should get memories by type", async () => {
			const conversationMemory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { query: "How to code?" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const patternMemory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "pattern" as MemoryType,
				content: { pattern: "use-typescript" },
				importance: 7,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			await memoryService.storeMemory(conversationMemory)
			await memoryService.storeMemory(patternMemory)

			const conversationMemories = await memoryService.getMemoriesByType("conversation")
			const patternMemories = await memoryService.getMemoriesByType("pattern")

			expect(conversationMemories.length).toBe(1)
			expect(patternMemories.length).toBe(1)
			expect(conversationMemories[0].type).toBe("conversation")
			expect(patternMemories[0].type).toBe("pattern")
		})

		test("should search memories", async () => {
			const memories = [
				{
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: "typescript help" },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				},
				{
					userId: "test-user",
					sessionId: "test-session",
					type: "insight" as MemoryType,
					content: { insight: "typescript is powerful" },
					importance: 8,
					accessCount: 0,
					lastAccessed: new Date(),
				},
			]

			for (const memory of memories) {
				await memoryService.storeMemory(memory)
			}

			const searchResults = await memoryService.searchMemories("typescript")
			expect(searchResults.length).toBeGreaterThan(0)
			expect(searchResults.every((m) => m.content)).toBe(true)
		})

		test("should get memory statistics", async () => {
			const memories = [
				{
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: "test 1" },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				},
				{
					userId: "test-user",
					sessionId: "test-session",
					type: "pattern" as MemoryType,
					content: { pattern: "test 2" },
					importance: 7,
					accessCount: 0,
					lastAccessed: new Date(),
				},
			]

			for (const memory of memories) {
				await memoryService.storeMemory(memory)
			}

			const stats = await memoryService.getMemoryStats()

			expect(stats.totalMemories).toBe(2)
			expect(stats.memoriesByType.conversation).toBe(1)
			expect(stats.memoriesByType.pattern).toBe(1)
			expect(stats.averageImportance).toBe(6)
			expect(stats.databaseSize).toBeGreaterThan(0)
		})

		test("should learn from user interactions", async () => {
			const interaction = {
				type: "query" as const,
				content: "How do I use async/await?",
				context: {
					activeFile: "/test/async.ts",
					project: "test-project",
				},
				timestamp: new Date(),
				outcome: "success" as const,
			}

			await memoryService.learnFromInteraction(interaction)

			const memories = await memoryService.getMemoriesByType("conversation")
			expect(memories.length).toBeGreaterThan(0)

			const learningMemory = memories.find((m) => m.content.query === "How do I use async/await?")
			expect(learningMemory).toBeDefined()
		})

		test("should get suggestions based on context", async () => {
			const context = {
				activeFile: "/test/typescript.ts",
				cursorPosition: { line: 10, character: 5 },
				recentQueries: ["typescript", "async"],
				currentTask: "coding",
			}

			const suggestions = await memoryService.getSuggestions(context)
			expect(Array.isArray(suggestions)).toBe(true)
		})

		test("should cleanup expired memories", async () => {
			const expiredMemory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { query: "old memory" },
				importance: 3,
				accessCount: 0,
				lastAccessed: new Date(),
				expiresAt: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
			}

			const validMemory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { query: "valid memory" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			await memoryService.storeMemory(expiredMemory)
			await memoryService.storeMemory(validMemory)

			const cleanedCount = await memoryService.cleanupExpiredMemories()
			expect(cleanedCount).toBeGreaterThan(0)

			const validMemoryAfterCleanup = await memoryService.getMemory(
				(await memoryService.searchMemories("valid memory"))[0]?.id || "",
			)
			expect(validMemoryAfterCleanup).toBeDefined()
		})
	})

	describe("Error Handling Contract", () => {
		test("should handle invalid memory ID gracefully", async () => {
			const result = await memoryService.getMemory("invalid-id")
			expect(result).toBeNull()
		})

		test("should handle database errors gracefully", async () => {
			// Close database to simulate error
			await databaseManager.close()

			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { message: "test" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			await expect(memoryService.storeMemory(memory)).rejects.toThrow()
		})

		test("should handle invalid updates gracefully", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { message: "test" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			// Try to update with invalid data
			await expect(memoryService.updateMemory(memoryId, { type: "invalid-type" as MemoryType })).rejects.toThrow()
		})
	})

	describe("Performance Contract", () => {
		test("should handle large number of memories efficiently", async () => {
			const startTime = Date.now()

			// Store many memories
			const promises = []
			for (let i = 0; i < 100; i++) {
				const memory = {
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: `test query ${i}` },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				}
				promises.push(memoryService.storeMemory(memory))
			}

			await Promise.all(promises)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
		})

		test("should search memories quickly", async () => {
			// Store some memories first
			for (let i = 0; i < 50; i++) {
				const memory = {
					userId: "test-user",
					sessionId: "test-session",
					type: "conversation" as MemoryType,
					content: { query: `search test ${i}` },
					importance: 5,
					accessCount: 0,
					lastAccessed: new Date(),
				}
				await memoryService.storeMemory(memory)
			}

			const startTime = Date.now()
			const results = await memoryService.searchMemories("search")
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(1000) // Should complete within 1 second
			expect(results.length).toBeGreaterThan(0)
		})
	})

	describe("Data Integrity Contract", () => {
		test("should maintain data consistency across operations", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "preference" as MemoryType,
				content: { preference: "dark-mode" },
				importance: 8,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			// Update memory
			await memoryService.updateMemory(memoryId, { importance: 9 })

			// Verify update
			const updatedMemory = await memoryService.getMemory(memoryId)
			expect(updatedMemory?.importance).toBe(9)

			// Verify access count increased
			expect(updatedMemory?.accessCount).toBe(1)
		})

		test("should handle concurrent operations safely", async () => {
			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { query: "concurrent test" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			const memoryId = await memoryService.storeMemory(memory)

			// Run multiple operations concurrently
			const operations = [
				memoryService.getMemory(memoryId),
				memoryService.getMemoriesByType("conversation"),
				memoryService.searchMemories("concurrent"),
				memoryService.getMemoryStats(),
			]

			const results = await Promise.allSettled(operations)

			results.forEach((result) => {
				expect(result.status).toBe("fulfilled")
			})
		})
	})

	describe("Resource Management Contract", () => {
		test("should properly dispose resources", async () => {
			await expect(memoryService.dispose()).resolves.not.toThrow()
		})

		test("should handle multiple dispose calls gracefully", async () => {
			await memoryService.dispose()
			await expect(memoryService.dispose()).resolves.not.toThrow()
		})

		test("should handle operations after dispose gracefully", async () => {
			await memoryService.dispose()

			const memory = {
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation" as MemoryType,
				content: { message: "test" },
				importance: 5,
				accessCount: 0,
				lastAccessed: new Date(),
			}

			await expect(memoryService.storeMemory(memory)).rejects.toThrow()
		})
	})
})
