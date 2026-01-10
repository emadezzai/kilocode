// kilocode_change - new file

import { describe, test, expect, beforeEach, afterEach } from "vitest"
import { AnalyticsService } from "../../services/analytics/analytics-service"
import { DatabaseManager } from "../../services/indexing/database-manager"
import { AnalyticsData, AnalyticsPeriod } from "../../types/analytics-types"

// Mock dependencies
const mockVSCode = {
	workspace: {
		getConfiguration: vi.fn(),
		getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: "/tmp/test-workspace" } })),
	},
}

vi.mock("vscode", () => mockVSCode)

describe("AnalyticsService Contract Tests", () => {
	let analyticsService: AnalyticsService
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

		analyticsService = new AnalyticsService({
			workspacePath: testWorkspacePath,
			dataDirectory: testDataDirectory,
			enabled: true,
			retentionDays: 30,
			anonymizeData: true,
			shareWithTeam: false,
			trackingLevel: "standard",
		})

		await databaseManager.initialize()
		await analyticsService.initialize()
	})

	afterEach(async () => {
		await analyticsService.dispose()
		await databaseManager.close()
	})

	describe("Core Contract Requirements", () => {
		test("should initialize successfully", () => {
			expect(analyticsService).toBeDefined()
		})

		test("should track analytics event", async () => {
			const event = {
				id: "test-event-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: {
					query: "test query",
					results: 5,
					duration: 150,
				},
				context: {
					activeFile: "/test/file.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await expect(analyticsService.trackEvent(event)).resolves.not.toThrow()
		})

		test("should generate analytics report", async () => {
			const report = await analyticsService.generateReport("daily", "test-user")

			expect(report).toBeDefined()
			expect(report.id).toBeDefined()
			expect(report.userId).toBe("test-user")
			expect(report.period).toBe("daily")
			expect(report.generatedAt).toBeInstanceOf(Date)
			expect(report.usageMetrics).toBeDefined()
			expect(report.performanceMetrics).toBeDefined()
			expect(report.qualityMetrics).toBeDefined()
			expect(report.insights).toBeDefined()
		})

		test("should get usage metrics", async () => {
			const metrics = await analyticsService.getMetrics("test-user")

			expect(metrics).toBeDefined()
			expect(metrics.totalSearches).toBeGreaterThanOrEqual(0)
			expect(metrics.averageSearchTime).toBeGreaterThanOrEqual(0)
			expect(metrics.mostCommonSearchTypes).toBeDefined()
		})

		test("should get performance metrics", async () => {
			const metrics = await analyticsService.getPerformanceMetrics("test-user")

			expect(metrics).toBeDefined()
			expect(metrics.indexingTime).toBeGreaterThanOrEqual(0)
			expect(metrics.searchResponseTime).toBeGreaterThanOrEqual(0)
			expect(metrics.memoryRetrievalTime).toBeGreaterThanOrEqual(0)
			expect(metrics.databaseSize).toBeGreaterThanOrEqual(0)
		})

		test("should get quality metrics", async () => {
			const metrics = await analyticsService.getQualityMetrics("test-user")

			expect(metrics).toBeDefined()
			expect(metrics.searchRelevanceScore).toBeGreaterThanOrEqual(0)
			expect(metrics.memoryHitRate).toBeGreaterThanOrEqual(0)
			expect(metrics.indexingAccuracy).toBeGreaterThanOrEqual(0)
			expect(metrics.userSatisfactionScore).toBeGreaterThanOrEqual(0)
		})

		test("should configure settings", async () => {
			const config = {
				enabled: false,
				retentionDays: 60,
				anonymizeData: false,
				shareWithTeam: true,
				trackingLevel: "minimal" as const,
			}

			await expect(analyticsService.configureSettings(config)).resolves.not.toThrow()

			// Verify settings were updated
			const updatedConfig = analyticsService.getConfig()
			expect(updatedConfig.enabled).toBe(false)
			expect(updatedConfig.retentionDays).toBe(60)
			expect(updatedConfig.anonymizeData).toBe(false)
			expect(updatedConfig.shareWithTeam).toBe(true)
			expect(updatedConfig.trackingLevel).toBe("minimal")
		})

		test("should export data", async () => {
			const data = await analyticsService.exportData("test-user")

			expect(data).toBeDefined()
			expect(typeof data).toBe("object")
		})

		test("should cleanup old data", async () => {
			const cleanedCount = await analyticsService.cleanupOldData()

			expect(typeof cleanedCount).toBe("number")
			expect(cleanedCount).toBeGreaterThanOrEqual(0)
		})
	})

	describe("Analytics Event Tracking", () => {
		test("should track different event types", async () => {
			const eventTypes = [
				"search_query",
				"memory_access",
				"code_indexed",
				"feature_used",
				"error_occurred",
				"performance_metric",
			]

			for (const eventType of eventTypes) {
				const event = {
					id: `test-${eventType}-1`,
					userId: "test-user",
					eventType: eventType as any,
					timestamp: new Date(),
					data: { test: true },
					context: {
						activeFile: "/test/file.ts",
						workspacePath: testWorkspacePath,
					},
				}

				await expect(analyticsService.trackEvent(event)).resolves.not.toThrow()
			}

			// Verify all events were tracked
			const stats = await analyticsService.getSearchStats()
			expect(stats.totalQueries).toBeGreaterThan(0)
		})

		test("should handle event context correctly", async () => {
			const event = {
				id: "test-context-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: {
					query: "context test",
				},
				context: {
					activeFile: "/src/components/Button.tsx",
					project: "react-project",
					language: "typescript",
					recentQueries: ["react", "component", "button"],
				},
			}

			await analyticsService.trackEvent(event)

			// Verify context was stored
			const report = await analyticsService.generateReport("daily", "test-user")
			expect(report.insights.length).toBeGreaterThan(0)
		})

		test("should handle large event data", async () => {
			const event = {
				id: "test-large-data-1",
				userId: "test-user",
				eventType: "performance_metric",
				timestamp: new Date(),
				data: {
					metrics: {
						indexingTime: 1500,
						searchTime: 200,
						memoryTime: 50,
						databaseSize: 1024 * 1024,
						memoryUsage: 512 * 1024 * 1024,
					},
					details: Array.from({ length: 1000 }, (_, i) => ({
						metric: `metric-${i}`,
						value: Math.random() * 100,
					})),
				},
				context: {
					activeFile: "/test/large-data.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await expect(analyticsService.trackEvent(event)).resolves.not.toThrow()
		})
	})

	describe("Report Generation", () => {
		test("should generate daily report", async () => {
			const report = await analyticsService.generateReport("daily", "test-user")

			expect(report.period).toBe("daily")
			expect(report.usageMetrics.totalSearches).toBeGreaterThanOrEqual(0)
			expect(report.performanceMetrics.indexingTime).toBeGreaterThanOrEqual(0)
			expect(report.qualityMetrics.searchRelevanceScore).toBeGreaterThanOrEqual(0)
		})

		test("should generate weekly report", async () => {
			const report = await analyticsService.generateReport("weekly", "test-user")

			expect(report.period).toBe("weekly")
			expect(report.usageMetrics.totalSearches).toBeGreaterThanOrEqual(0)
			expect(report.performanceMetrics.indexingTime).toBeGreaterThanOrEqual(0)
			expect(report.qualityMetrics.searchRelevanceScore).toBeGreaterThanOrEqual(0)
		})

		test("should generate monthly report", async () => {
			const report = await analyticsService.generateReport("monthly", "test-user")

			expect(report.period).toBe("monthly")
			expect(report.usageMetrics.totalSearches).toBeGreaterThanOrEqual(0)
			expect(report.performanceMetrics.indexingTime).toBeGreaterThanOrEqual(0)
			expect(report.qualityMetrics.searchRelevanceScore).toBeGreaterThanOrEqual(0)
		})

		test("should generate yearly report", async () => {
			const report = await analyticsService.generateReport("yearly", "test-user")

			expect(report.period).toBe("yearly")
			expect(report.usageMetrics.totalSearches).toBeGreaterThanOrEqual(0)
			expect(report.performanceMetrics.indexingTime).toBeGreaterThanOrEqual(0)
			expect(report.qualityMetrics.searchRelevanceScore).toBeGreaterThanOrEqual(0)
		})

		test("should include comprehensive insights", async () => {
			const report = await analyticsGenerator("daily", "test-user")

			expect(report.insights).toBeDefined()
			expect(report.insights.length).toBeGreaterThan(0)

			// Check insight structure
			report.insights.forEach((insight) => {
				expect(insight).toHaveProperty("type")
				expect(insight).toHaveProperty("title")
				expect(insight).toHaveProperty("description")
				expect(insight).toHaveProperty("impact")
				expect(insight).toHaveProperty("actionable")
				expect(insight).toHaveProperty("data")
			})
		})

		test("should calculate metrics correctly", async () => {
			// Track some events first
			const events = Array.from({ length: 10 }, (_, i) => ({
				id: `metric-test-${i}`,
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(Date.now() - i * 1000 * 60), // Staggered timestamps
				data: {
					query: `test query ${i}`,
					results: Math.floor(Math.random() * 20),
					duration: Math.floor(Math.random() * 1000),
				},
				context: {
					activeFile: `/test/file${i}.ts`,
					workspacePath: testWorkspacePath,
				},
			}))

			for (const event of events) {
				await analyticsService.trackEvent(event)
			}

			const report = await analyticsService.generateReport("daily", "test-user")

			// Verify metrics calculation
			expect(report.usageMetrics.totalSearches).toBe(10)
			expect(report.usageMetrics.averageSearchTime).toBeGreaterThan(0)
			expect(report.usageMetrics.mostCommonSearchTypes).toBeDefined()
		})
	})

	describe("Data Management", () => {
		test("should handle data retention correctly", async () => {
			// Add some old data
			const oldEvent = {
				id: "old-event-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days ago
				data: { query: "old query" },
				context: {
					activeFile: "/test/old.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await analyticsService.trackEvent(oldEvent)

			// Cleanup old data (30 days retention)
			const cleanedCount = await analyticsService.cleanupOldData()
			expect(cleanedCount).toBe(1)

			// Verify old data was removed
			const report = await analyticsService.generateReport("daily", "test-user")
			expect(report.usageMetrics.totalSearches).toBe(0)
		})

		test("should anonymize data when configured", async () => {
			await analyticsService.configureSettings({ anonymizeData: true })

			const event = {
				id: "privacy-test-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: {
					query: "sensitive information",
					userId: "real-user-name",
					email: "user@example.com",
				},
				context: {
					activeFile: "/sensitive/file.ts",
					workspacePath: "/sensitive/path",
				},
			}

			await analyticsService.trackEvent(event)

			const data = await analyticsService.exportData("test-user")

			// Data should be anonymized
			expect(data).not.toContain("real-user-name")
			expect(data).not.toContain("user@example.com")
			expect(data).not.toContain("sensitive")
		})

		test("should handle team data sharing", async () => {
			await analyticsService.configureSettings({ shareWithTeam: true })

			const event = {
				id: "team-test-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: { query: "team query" },
				context: {
					activeFile: "/team/file.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await analyticsService.trackEvent(event)

			const data = await analyticsService.exportData("test-user")
			expect(typeof data).toBe("object")
		})
	})

	describe("Performance Contract", () => {
		test("should handle high volume events efficiently", async () => {
			const startTime = Date.now()

			// Track many events
			const eventPromises = []
			for (let i = 0; i < 1000; i++) {
				const event = {
					id: `perf-test-${i}`,
					userId: "test-user",
					eventType: "search_query",
					timestamp: new Date(),
					data: {
						query: `performance test ${i}`,
						results: Math.floor(Math.random() * 10),
					},
					context: {
						activeFile: `/test/perf${i}.ts`,
						workspacePath: testWorkspacePath,
					},
				}
				eventPromises.push(analyticsService.trackEvent(event))
			}

			await Promise.all(eventPromises)
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(10000) // Should complete within 10 seconds
		})

		test("should generate reports quickly", async () => {
			const startTime = Date.now()

			const report = await analyticsService.generateReport("daily", "test-user")
			const duration = Date.now() - startTime

			expect(duration).toBeLessThan(5000) // Should complete within 5 seconds
		})

		test("should handle concurrent operations", async () => {
			const operations = [
				analyticsService.trackEvent({
					id: "concurrent-1",
					userId: "test-user",
					eventType: "search_query",
					timestamp: new Date(),
					data: { query: "concurrent 1" },
					context: { workspacePath: testWorkspacePath },
				}),
				analyticsService.generateReport("daily", "test-user"),
				analyticsService.getMetrics("test-user"),
				analyticsService.getPerformanceMetrics("test-user"),
				analyticsService.getQualityMetrics("test-user"),
			]

			const results = await Promise.allSettled(operations)

			results.forEach((result) => {
				expect(result.status).toBe("fulfilled")
			})
		})
	})

	describe("Error Handling Contract", () => {
		test("should handle invalid events gracefully", async () => {
			const invalidEvent = {
				id: "invalid-1",
				userId: "test-user",
				eventType: "invalid_type" as any,
				timestamp: new Date(),
				data: null,
				context: {
					activeFile: "/test/file.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await expect(analyticsService.trackEvent(invalidEvent)).resolves.not.toThrow()
		})

		test("should handle database errors gracefully", async () => {
			// Close database to simulate error
			await databaseManager.close()

			const event = {
				id: "db-error-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: { query: "database error test" },
				context: {
					activeFile: "/test/file.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await expect(analyticsService.trackEvent(event)).resolves.not.toThrow()
		})

		test("should handle configuration errors gracefully", async () => {
			const invalidConfig = {
				enabled: "invalid" as any,
				retentionDays: -1,
				anonymizeData: "invalid" as any,
				shareWithTeam: "invalid" as any,
				trackingLevel: "invalid" as any,
			}

			await expect(analyticsService.configureSettings(invalidConfig)).resolves.not.toThrow()
		})
	})

	describe("Resource Management Contract", () => {
		test("should properly dispose resources", async () => {
			await expect(analyticsService.dispose()).resolves.not.toThrow()
		})

		test("should handle multiple dispose calls gracefully", async () => {
			await analyticsService.dispose()
			await expect(analyticsService.dispose()).resolves.not.toThrow()
		})

		test("should handle operations after dispose gracefully", async () => {
			await analyticsService.dispose()

			const event = {
				id: "dispose-test-1",
				userId: "test-user",
				eventType: "search_query",
				timestamp: new Date(),
				data: { query: "dispose test" },
				context: {
					activeFile: "/test/file.ts",
					workspacePath: testWorkspacePath,
				},
			}

			await expect(analyticsService.trackEvent(event)).rejects.toThrow()
		})
	})
})
