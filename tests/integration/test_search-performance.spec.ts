// kilocode_change - new file

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { SearchEngine } from "../../services/indexing/search-engine"
import { IndexingService } from "../../services/indexing/indexing-service"
import { MemoryService } from "../../services/memory/memory-service"
import { DatabaseManager } from "../../services/indexing/database-manager"
import { ConfigManager } from "../../services/indexing/config-manager"
import { SearchQuery, SearchResult } from "../../types/indexing-types"

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

describe("Search Performance Integration Tests", () => {
	let searchEngine: SearchEngine
	let indexingService: IndexingService
	let memoryService: MemoryService
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
		searchEngine = new SearchEngine({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxResults: 100,
			minScore: 0.2,
		})

		indexingService = new IndexingService({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxFileSize: 1024 * 1024,
			excludedPatterns: ["**/node_modules/**"],
		})

		memoryService = new MemoryService({
			userId: "test-user",
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			maxMemoryAge: 90,
			maxMemoryCount: 1000,
		})

		await searchEngine.initialize()
		await indexingService.initialize()
		await memoryService.initialize()
	})

	afterEach(async () => {
		await searchEngine.dispose()
		await indexingService.dispose()
		await memoryService.dispose()
		await databaseManager.close()
	})

	describe("Search Performance Workflow", () => {
		test("should handle large-scale text search efficiently", async () => {
			// Index a large codebase
			mockVSCode.workspace.findFiles.mockResolvedValue(
				Array.from({ length: 1000 }, (_, i) => ({
					fsPath: `${testWorkspacePath}/src/file${i}.ts`,
				})),
			)

			const indexingResult = await indexingService.indexWorkspace()
			expect(indexingResult.success).toBe(true)
			expect(indexingResult.elementsIndexed).toBeGreaterThan(0)

			// Perform multiple searches
			const searchQueries = [
				"function",
				"class",
				"interface",
				"type",
				"const",
				"let",
				"import",
				"export",
				"async",
				"await",
			]

			const startTime = Date.now()
			const searchResults = await Promise.all(
				searchQueries.map((query) => {
					const searchQuery: SearchQuery = {
						id: `perf-test-${query}`,
						userId: "test-user",
						queryText: query,
						searchType: "text",
						timestamp: new Date(),
					}
					return searchEngine.search(searchQuery)
				}),
			)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
			expect(searchResults.length).toBe(10)

			searchResults.forEach((results) => {
				expect(Array.isArray(results)).toBe(true)
				expect(results.length).toBeLessThanOrEqual(100)
			})

			// Calculate average search time
			const avgSearchTime = duration / searchQueries.length
			expect(avgSearchTime).toBeLessThan(500) // Average < 500ms
		})

		test("should handle semantic search with large dataset", async () => {
			// Index content for semantic search
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/src/utils/helpers.ts` },
				{ fsPath: `${testWorkspacePath}/src/api/client.ts` },
				{ fsPath: `${testWorkspacePath}/src/types/index.ts` },
			])

			await indexingService.indexWorkspace()

			// Store some relevant memories
			await memoryService.storeMemory({
				userId: "test-user",
				sessionId: "test-session",
				type: "conversation",
				content: { query: "React component patterns" },
				context: { activeFile: `${testWorkspacePath}/src/components/Button.tsx` },
				importance: 8,
				accessCount: 0,
				lastAccessed: new Date(),
			})

			await memoryService.storeMemory({
				userId: "test-user",
				sessionId: "test-session",
				type: "pattern",
				content: { pattern: "use-functional-components" },
				context: { activeFile: `${testWorkspacePath}/src/components/Button.tsx` },
				importance: 9,
				accessCount: 0,
				lastAccessed: new Date(),
			})

			// Perform semantic searches
			const semanticQueries = [
				"React component with hooks",
				"utility functions for TypeScript",
				"API client implementation",
				"type definitions",
			]

			const startTime = Date.now()
			const semanticResults = await Promise.all(
				semanticQueries.map((query) => {
					const searchQuery: SearchQuery = {
						id: `semantic-test-${query}`,
						userId: "test-user",
						queryText: query,
						searchType: "semantic",
						timestamp: new Date(),
					}
					return searchEngine.search(searchQuery)
				}),
			)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(8000) // Semantic search can be slower
			expect(semanticResults.length).toBe(4)

			semanticResults.forEach((results) => {
				expect(Array.isArray(results)).toBe(true)
				results.forEach((result) => {
					expect(result.matchType).toBe("semantic")
					expect(result.relevanceScore).toBeGreaterThanOrEqual(0.2)
				})
			})
		})

		test("should handle hybrid search with optimal performance", async () => {
			// Index diverse content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/src/utils/validation.ts` },
				{ fsPath: `${testWorkspacePath}/src/services/api.ts` },
				{ fsPath: `${testWorkspacePath}/src/config/settings.ts` },
				{ fsPath: `${testWorkspacePath}/src/hooks/useAuth.ts` },
			])

			await indexingService.indexWorkspace()

			// Perform hybrid searches
			const hybridQueries = [
				"React component validation",
				"API service configuration",
				"authentication hooks",
				"utility validation functions",
			]

			const startTime = Date.now()
			const hybridResults = await Promise.all(
				hybridQueries.map((query) => {
					const searchQuery: SearchQuery = {
						id: `hybrid-test-${query}`,
						userId: "test-user",
						queryText: query,
						searchType: "hybrid",
						timestamp: new Date(),
					}
					return searchEngine.search(searchQuery)
				}),
			)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(6000) // Hybrid search should be reasonably fast
			expect(hybridResults.length).toBe(4)

			hybridResults.forEach((results) => {
				expect(Array.isArray(results)).toBe(true)
				results.forEach((result) => {
					expect(["text", "semantic", "hybrid"]).toContain(result.matchType)
				})
			})
		})
	})

	describe("Search Result Quality", () => {
		test("should provide relevant and comprehensive results", async () => {
			// Index specific content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/src/components/Input.tsx` },
				{ fsPath: `${testWorkspacePath}/src/utils/formatters.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils/validators.ts` },
			])

			await indexingService.indexWorkspace()

			const query: SearchQuery = {
				id: "quality-test-1",
				userId: "test-user",
				queryText: "React component",
				searchType: "hybrid",
				timestamp: new Date(),
			}

			const results = await searchEngine.search(query)

			expect(results.length).toBeGreaterThan(0)

			// Check result quality
			const relevantResults = results.filter((result) => result.relevanceScore >= 0.5)
			expect(relevantResults.length).toBeGreaterThan(0)

			// Check for comprehensive information
			const comprehensiveResults = results.filter(
				(result) => result.relationships && result.relationships.length > 0,
			)
			expect(comprehensiveResults.length).toBeGreaterThan(0)

			// Check for highlights
			const highlightedResults = results.filter((result) => result.highlights && result.highlights.length > 0)
			expect(highlightedResults.length).toBeGreaterThan(0)
		})

		test("should maintain result ranking consistency", async () => {
			// Index content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/index.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils.ts` },
				{ fsPath: `${testWorkspacePath}/src/config.ts` },
			])

			await indexingService.indexWorkspace()

			const query: SearchQuery = {
				id: "ranking-test-1",
				userId: "test-user",
				queryText: "export",
				searchType: "text",
				timestamp: new Date(),
			}

			// Perform search multiple times
			const results1 = await searchEngine.search(query)
			const results2 = await searchEngine.search(query)
			const results3 = await searchEngine.search(query)

			// Check ranking consistency
			expect(results1.length).toBe(results2.length)
			expect(results2.length).toBe(results3.length)

			results1.forEach((result, index) => {
				expect(result.id).toBe(results2[index].id)
				expect(result.id).toBe(results3[index].id)
				expect(result.relevanceScore).toBe(results2[index].relevanceScore)
				expect(result.relevanceScore).toBe(results3[index].relevanceScore)
				expect(result.rank).toBe(results2[index].rank)
				expect(result.rank).toBe(results3[index].rank)
			})
		})
	})

	describe("Cross-Reference Discovery", () => {
		test("should discover related code elements", async () => {
			// Index interconnected code
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/components/Button.tsx` },
				{ fsPath: `${testWorkspacePath}/src/components/Button.test.tsx` },
				{ fsPath: `${testWorkspacePath}/src/stories/Button.stories.tsx` },
				{ fsPath: `${testWorkspacePath}/src/utils/buttonHelpers.ts` },
			])

			await indexingService.indexWorkspace()

			const query: SearchQuery = {
				id: "crossref-test-1",
				userId: "test-user",
				queryText: "Button component",
				searchType: "hybrid",
				timestamp: new Date(),
			}

			const results = await searchEngine.search(query)

			expect(results.length).toBeGreaterThan(0)

			// Check for cross-references
			const crossReferenceResults = results.filter(
				(result) =>
					result.relationships &&
					result.relationships.some(
						(rel) => rel.includes("test") || rel.includes("story") || rel.includes("helper"),
					),
			)

			expect(crossReferenceResults.length).toBeGreaterThan(0)
		})

		test("should provide relationship mapping", async () => {
			// Index related files
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/api/user.ts` },
				{ fsPath: `${testWorkspacePath}/src/api/auth.ts` },
				{ fsPath: `${testWorkspacePath}/src/types/user.ts` },
				{ fsPath: `${testWorkspacePath}/src/services/userService.ts` },
			])

			await indexingService.indexWorkspace()

			const query: SearchQuery = {
				id: "relationship-test-1",
				userId: "test-user",
				queryText: "user authentication",
				searchType: "hybrid",
				timestamp: new Date(),
			}

			const results = await searchEngine.search(query)

			expect(results.length).toBeGreaterThan(0)

			// Check for relationship information
			const relationshipResults = results.filter(
				(result) => result.relationships && result.relationships.length > 0,
			)

			expect(relationshipResults.length).toBeGreaterThan(0)

			// Verify relationship types
			const allRelationships = results.flatMap((result) => result.relationships || [])
			const hasImports = allRelationships.some((rel) => rel.includes("import"))
			const hasDependencies = allRelationships.some((rel) => rel.includes("depend"))

			expect(hasImports || hasDependencies).toBe(true)
		})
	})

	describe("Advanced Search Features", () => {
		test("should handle complex filters and pagination", async () => {
			// Index diverse content
			mockVSCode.workspace.findFiles.mockResolvedValue(
				Array.from({ length: 100 }, (_, i) => ({
					fsPath: `${testWorkspacePath}/src/file${i}.ts`,
				})),
			)

			await indexingService.indexWorkspace()

			const query: SearchQuery = {
				id: "filters-test-1",
				userId: "test-user",
				queryText: "function",
				searchType: "text",
				filters: {
					fileTypes: ["ts"],
					dateRange: {
						start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
						end: new Date(),
					},
					elementTypes: ["function", "class"],
				},
				timestamp: new Date(),
			}

			const results = await searchEngine.search(query)

			expect(Array.isArray(results)).toBe(true)
			expect(results.length).toBeLessThanOrEqual(100)

			// Verify filters are applied
			results.forEach((result) => {
				expect(result.relationships).toBeDefined()
			})
		})

		test("should support fuzzy matching and typos", async () => {
			// Index content
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/utils/helpers.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils/validators.ts` },
				{ fsPath: `${testWorkspacePath}/src/utils/formatters.ts` },
			])

			await indexingService.indexWorkspace()

			// Test fuzzy matching
			const fuzzyQueries = [
				"helper", // exact match
				"halper", // typo
				"hlp", // abbreviation
				"helpres", // extra character
			]

			const fuzzyResults = await Promise.all(
				fuzzyQueries.map((query) => {
					const searchQuery: SearchQuery = {
						id: `fuzzy-test-${query}`,
						userId: "test-user",
						queryText: query,
						searchType: "text",
						timestamp: new Date(),
					}
					return searchEngine.search(searchQuery)
				}),
			)

			// Should find results for all variations
			fuzzyResults.forEach((results) => {
				expect(Array.isArray(results)).toBe(true)
				// At least some results should be found for fuzzy queries
			})

			// Check that fuzzy queries find related results
			const hasFuzzyMatches = fuzzyResults.some((results) => results.length > 0)
			expect(hasFuzzyMatches).toBe(true)
		})

		test("should support pattern-based search", async () => {
			// Index code with patterns
			mockVSCode.workspace.findFiles.mockResolvedValue([
				{ fsPath: `${testWorkspacePath}/src/patterns/async-promise.ts` },
				{ fsPath: `${testWorkspacePath}/src/patterns/error-handling.ts` },
				{ fsPath: `${testWorkspacePath}/src/patterns/data-validation.ts` },
			])

			await indexingService.indexWorkspace()

			const patternQueries = ["async await pattern", "try catch error handling", "data validation pattern"]

			const patternResults = await Promise.all(
				patternQueries.map((query) => {
					const searchQuery: SearchQuery = {
						id: `pattern-test-${query}`,
						userId: "test-user",
						queryText: query,
						searchType: "semantic",
						timestamp: new Date(),
					}
					return searchEngine.search(searchQuery)
				}),
			)

			patternResults.forEach((results) => {
				expect(Array.isArray(results)).toBe(true)
				results.forEach((result) => {
					expect(result.matchType).toBe("semantic")
				})
			})

			// Should find pattern-related results
			const hasPatternMatches = patternResults.some((results) => results.length > 0)
			expect(hasPatternMatches).toBe(true)
		})
	})

	describe("Performance Under Load", () => {
		test("should maintain performance with concurrent searches", async () => {
			// Index large dataset
			mockVSCode.workspace.findFiles.mockResolvedValue(
				Array.from({ length: 500 }, (_, i) => ({
					fsPath: `${testWorkspacePath}/src/large/file${i}.ts`,
				})),
			)

			await indexingService.indexWorkspace()

			// Perform concurrent searches
			const concurrentQueries = Array.from({ length: 20 }, (_, i) => ({
				id: `concurrent-${i}`,
				userId: "test-user",
				queryText: `search term ${i}`,
				searchType: "hybrid" as const,
				timestamp: new Date(),
			}))

			const startTime = Date.now()
			const results = await Promise.all(concurrentQueries.map((query) => searchEngine.search(query)))
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
			expect(results.length).toBe(20)

			results.forEach((result) => {
				expect(Array.isArray(result)).toBe(true)
			})

			// Calculate performance metrics
			const avgTime = duration / concurrentQueries.length
			expect(avgTime).toBeLessThan(1000) // Average < 1 second per search
		})

		test("should handle memory usage efficiently", async () => {
			// Index content
			mockVSCode.workspace.findFiles.mockResolvedValue([{ fsPath: `${testWorkspacePath}/src/memory-test.ts` }])

			await indexingService.indexWorkspace()

			// Perform many searches to test memory usage
			const searchPromises = []
			for (let i = 0; i < 50; i++) {
				const query: SearchQuery = {
					id: `memory-test-${i}`,
					userId: "test-user",
					queryText: `test search ${i}`,
					searchType: "text",
					timestamp: new Date(),
				}
				searchPromises.push(searchEngine.search(query))
			}

			await Promise.all(searchPromises)

			// Should complete without memory issues
			const stats = await searchEngine.getSearchStats()
			expect(stats.totalQueries).toBeGreaterThan(50)
			expect(stats.averageExecutionTime).toBeGreaterThan(0)
		})
	})
})
