// kilocode_change - new file

import { AnalyticsService } from "./analytics-service"
import { MemoryService } from "../memory/memory-service"
import { IndexingService } from "../indexing/indexing-service"
import { logger } from "../indexing/logging-service"
import { AnalyticsReport, AnalyticsPeriod, Insight } from "../../types/analytics-types"

export interface InsightsGeneratorConfig {
	enablePatternAnalysis: boolean
	enableUsageAnalysis: boolean
	enableQualityAnalysis: boolean
	enableTeamAnalysis: boolean
	insightThreshold: number
}

/**
 * InsightsGenerator - Generates intelligent insights from analytics data
 */
export class InsightsGenerator {
	private readonly analyticsService: AnalyticsService
	private readonly memoryService: MemoryService
	private readonly indexingService: IndexingService
	private readonly config: InsightsGeneratorConfig
	private isInitialized: boolean = false

	constructor(
		analyticsService: AnalyticsService,
		memoryService: MemoryService,
		indexingService: IndexingService,
		config: InsightsGeneratorConfig = {
			enablePatternAnalysis: true,
			enableUsageAnalysis: true,
			enableQualityAnalysis: true,
			enableTeamAnalysis: false,
			insightThreshold: 0.7,
		},
	) {
		this.analyticsService = analyticsService
		this.memoryService = memoryService
		this.indexingService = indexingService
		this.config = config
	}

	/**
	 * Initialize insights generator
	 */
	async initialize(): Promise<void> {
		try {
			logger.info("Initializing insights generator")

			// Verify dependencies are available
			if (!this.analyticsService || !this.memoryService || !this.indexingService) {
				throw new Error("Required services not available for insights generation")
			}

			this.isInitialized = true
			logger.info("Insights generator initialized successfully")
		} catch (error) {
			logger.error("Error initializing insights generator", { error })
			throw error
		}
	}

	/**
	 * Generate insights for a specific period and user
	 */
	async generateInsights(period: AnalyticsPeriod, userId?: string): Promise<Insight[]> {
		if (!this.isInitialized) {
			throw new Error("Insights generator not initialized")
		}

		try {
			logger.info("Generating insights", { period, userId })

			const insights: Insight[] = []

			// Generate pattern insights
			if (this.config.enablePatternAnalysis) {
				const patternInsights = await this.generatePatternInsights(userId, period)
				insights.push(...patternInsights)
			}

			// Generate usage insights
			if (this.config.enableUsageAnalysis) {
				const usageInsights = await this.generateUsageInsights(userId, period)
				insights.push(...usageInsights)
			}

			// Generate quality insights
			if (this.config.enableQualityAnalysis) {
				const qualityInsights = await this.generateQualityInsights(userId, period)
				insights.push(...qualityInsights)
			}

			// Generate team insights
			if (this.config.enableTeamAnalysis) {
				const teamInsights = await this.generateTeamInsights(userId, period)
				insights.push(...teamInsights)
			}

			// Filter insights by threshold
			const filteredInsights = insights.filter(
				(insight) => this.calculateInsightScore(insight) >= this.config.insightThreshold,
			)

			// Sort insights by importance
			const sortedInsights = filteredInsights.sort(
				(a, b) => this.calculateInsightScore(b) - this.calculateInsightScore(a),
			)

			logger.info("Insights generated successfully", {
				totalInsights: insights.length,
				filteredInsights: filteredInsights.length,
				period,
				userId: userId || "all",
			})

			return sortedInsights
		} catch (error) {
			logger.error("Error generating insights", { error, period, userId })
			throw error
		}
	}

	/**
	 * Generate pattern insights
	 */
	private async generatePatternInsights(userId?: string, period: AnalyticsPeriod): Promise<Insight[]> {
		const insights: Insight[] = []

		try {
			// Get pattern memories
			const patternMemories = await this.memoryService.getMemoriesByType("pattern")

			// Analyze pattern frequency and consistency
			const patternAnalysis = this.analyzePatterns(patternMemories)

			// Generate insights from pattern analysis
			for (const pattern of patternAnalysis) {
				if (pattern.frequency > 10) {
					insights.push({
						type: "pattern",
						title: `High-Frequency Pattern: ${pattern.name}`,
						description: `You frequently use the "${pattern.name}" pattern (${pattern.frequency} times)`,
						impact: pattern.importance > 7 ? "high" : pattern.importance > 5 ? "medium" : "low",
						actionable: true,
						data: {
							patternName: pattern.name,
							frequency: pattern.frequency,
							importance: pattern.importance,
							examples: pattern.examples,
						},
						recommendations: [
							`Consider creating a template for ${pattern.name}`,
							`Document this pattern for team sharing`,
							`Look for opportunities to optimize ${pattern.name}`,
						],
					})
				}

				if (pattern.consistency < 0.7) {
					insights.push({
						type: "quality_concern",
						title: `Inconsistent Pattern Usage: ${pattern.name}`,
						description: `Your usage of "${pattern.name}" pattern is inconsistent (${Math.round(pattern.consistency * 100)}% consistency)`,
						impact: "medium",
						actionable: true,
						data: {
							patternName: pattern.name,
							consistency: pattern.consistency,
							variations: pattern.variations,
						},
						recommendations: [
							"Standardize your pattern usage",
							"Create coding guidelines for this pattern",
							"Review and refactor inconsistent implementations",
						],
					})
				}
			}

			// Analyze anti-patterns
			const antiPatterns = await this.detectAntiPatterns(patternMemories)
			for (const antiPattern of antiPatterns) {
				insights.push({
					type: "quality_concern",
					title: `Anti-Pattern Detected: ${antiPattern.name}`,
					description: `Potential anti-pattern "${antiPattern.name}" detected in your codebase`,
					impact: "high",
					actionable: true,
					data: {
						antiPatternName: antiPattern.name,
						occurrences: antiPattern.occurrences,
						severity: antiPattern.severity,
					},
					recommendations: [
						`Refactor ${antiPattern.name} implementations`,
						"Consider alternative patterns",
						"Review best practices documentation",
					],
				})
			}

			return insights
		} catch (error) {
			logger.error("Error generating pattern insights", { error })
			return []
		}
	}

	/**
	 * Generate usage insights
	 */
	private async generateUsageInsights(userId?: string, period: AnalyticsPeriod): Promise<Insight[]> {
		const insights: Insight[] = []

		try {
			// Get usage metrics
			const usageMetrics = await this.analyticsService.getMetrics(userId)

			// Analyze search patterns
			if (usageMetrics.totalSearches > 100) {
				insights.push({
					type: "usage_pattern",
					title: "High Search Activity",
					description: `You performed ${usageMetrics.totalSearches} searches in this period`,
					impact: "low",
					actionable: false,
					data: {
						totalSearches: usageMetrics.totalSearches,
						averageSearchTime: usageMetrics.averageSearchTime,
					},
					recommendations: [
						"Consider using bookmarks for frequent searches",
						"Explore advanced search features",
						"Review search history for optimization opportunities",
					],
				})
			}

			// Analyze search efficiency
			if (usageMetrics.averageSearchTime > 2000) {
				insights.push({
					type: "performance_concern",
					title: "Slow Search Performance",
					description: `Average search time is ${Math.round(usageMetrics.averageSearchTime)}ms, which is higher than optimal`,
					impact: "medium",
					actionable: true,
					data: {
						averageSearchTime: usageMetrics.averageSearchTime,
						optimalTime: 1000,
					},
					recommendations: [
						"Use more specific search terms",
						"Consider semantic search for complex queries",
						"Check indexing status for better performance",
					],
				})
			}

			// Analyze search type distribution
			const searchTypes = usageMetrics.mostCommonSearchTypes || []
			if (searchTypes.length > 0) {
				const dominantType = searchTypes[0]
				if (dominantType.count > usageMetrics.totalSearches * 0.7) {
					insights.push({
						type: "usage_pattern",
						title: `Dominant Search Type: ${dominantType.type}`,
						description: `${dominantType.count} searches (${Math.round((dominantType.count / usageMetrics.totalSearches) * 100)}%) use ${dominantType.type} search`,
						impact: "low",
						actionable: true,
						data: {
							dominantType: dominantType.type,
							count: dominantType.count,
							percentage: Math.round((dominantType.count / usageMetrics.totalSearches) * 100),
						},
						recommendations: [
							"Explore other search types for better results",
							"Consider hybrid search for complex queries",
							"Learn about advanced search features",
						],
					})
				}
			}

			return insights
		} catch (error) {
			logger.error("Error generating usage insights", { error })
			return []
		}
	}

	/**
	 * Generate quality insights
	 */
	private async generateQualityInsights(userId?: string, period: AnalyticsPeriod): Promise<Insight[]> {
		const insights: Insight[] = []

		try {
			// Get quality metrics
			const qualityMetrics = await this.analyticsService.getQualityMetrics(userId)

			// Analyze search relevance
			if (qualityMetrics.searchRelevanceScore < 0.5) {
				insights.push({
					type: "quality_concern",
					title: "Low Search Relevance",
					description: `Search relevance score is ${Math.round(qualityMetrics.searchRelevanceScore * 100)}%, which indicates room for improvement`,
					impact: "high",
					actionable: true,
					data: {
						searchRelevanceScore: qualityMetrics.searchRelevanceScore,
						targetScore: 0.7,
					},
					recommendations: [
						"Use more specific search terms",
						"Include context in your searches",
						"Try semantic search for better results",
					],
				})
			}

			// Analyze memory effectiveness
			if (qualityMetrics.memoryHitRate < 60) {
				insights.push({
					type: "opportunity",
					title: "Low Memory Hit Rate",
					description: `Memory hit rate is ${Math.round(qualityMetrics.memoryHitRate)}%, which suggests opportunities for better memory utilization`,
					impact: "medium",
					actionable: true,
					data: {
						memoryHitRate: qualityMetrics.memoryHitRate,
						targetRate: 80,
					},
					recommendations: [
						"Store more relevant information in memory",
						"Review and update memory entries",
						"Use memory for frequently accessed information",
					],
				})
			}

			// Analyze indexing quality
			if (qualityMetrics.indexingAccuracy < 0.8) {
				insights.push({
					type: "quality_concern",
					title: "Indexing Quality Issues",
					description: `Indexing accuracy is ${Math.round(qualityMetrics.indexingAccuracy * 100)}%, which may affect search quality`,
					impact: "high",
					actionable: true,
					data: {
						indexingAccuracy: qualityMetrics.indexingAccuracy,
						targetAccuracy: 0.9,
					},
					recommendations: [
						"Review indexing configuration",
						"Check for indexing errors",
						"Reindex problematic files",
					],
				})
			}

			// Positive quality insights
			if (qualityMetrics.userSatisfactionScore > 0.8) {
				insights.push({
					type: "opportunity",
					title: "High User Satisfaction",
					description: `User satisfaction score is ${Math.round(qualityMetrics.userSatisfactionScore * 100)}%, indicating excellent system performance`,
					impact: "low",
					actionable: false,
					data: {
						userSatisfactionScore: qualityMetrics.userSatisfactionScore,
					},
					recommendations: [
						"Share your experience with the team",
						"Consider advanced features for even better results",
						"Provide feedback for continuous improvement",
					],
				})
			}

			return insights
		} catch (error) {
			logger.error("Error generating quality insights", { error })
			return []
		}
	}

	/**
	 * Generate team insights
	 */
	private async generateTeamInsights(userId?: string, period: AnalyticsPeriod): Promise<Insight[]> {
		const insights: Insight[] = []

		try {
			// This would require team data sharing to be enabled
			// For now, return placeholder insights
			insights.push({
				type: "opportunity",
				title: "Team Collaboration Insights",
				description: "Team collaboration insights are available when data sharing is enabled",
				impact: "low",
				actionable: true,
				data: {
					teamSharingEnabled: false,
				},
				recommendations: [
					"Enable team data sharing for collaboration insights",
					"Configure team analytics settings",
					"Invite team members to share usage data",
				],
			})

			return insights
		} catch (error) {
			logger.error("Error generating team insights", { error })
			return []
		}
	}

	/**
	 * Analyze patterns from memories
	 */
	private analyzePatterns(patternMemories: any[]): Array<{
		name: string
		frequency: number
		importance: number
		consistency: number
		examples: string[]
		variations: string[]
	}> {
		const patternMap = new Map<string, any[]>()

		// Group patterns by name
		patternMemories.forEach((memory) => {
			if (memory.content && memory.content.pattern) {
				const patternName = memory.content.pattern
				if (!patternMap.has(patternName)) {
					patternMap.set(patternName, [])
				}
				patternMap.get(patternName).push(memory)
			}
		})

		// Analyze each pattern
		const patterns = []
		for (const [name, memories] of patternMap) {
			const frequency = memories.length
			const importance = memories.reduce((sum, m) => sum + (m.importance || 0), 0) / frequency
			const examples = memories.map((m) => m.content.examples || []).flat()
			const variations = [...new Set(memories.map((m) => m.content.description || ""))]

			// Calculate consistency (simplified)
			const consistency = Math.min(1, frequency / Math.max(1, variations.length))

			patterns.push({
				name,
				frequency,
				importance,
				consistency,
				examples,
				variations,
			})
		}

		return patterns
	}

	/**
	 * Detect anti-patterns
	 */
	private async detectAntiPatterns(patternMemories: any[]): Array<{
		name: string
		occurrences: number
		severity: "low" | "medium" | "high"
	}> {
		const antiPatterns = []

		// Common anti-patterns to detect
		const antiPatternKeywords = [
			"god object",
			"spaghetti code",
			"magic numbers",
			"copy-paste programming",
			"hardcoded values",
			"nested ternary",
			"deep nesting",
			"large functions",
			"long methods",
		]

		patternMemories.forEach((memory) => {
			if (memory.content && memory.content.description) {
				const description = memory.content.description.toLowerCase()

				antiPatternKeywords.forEach((keyword) => {
					if (description.includes(keyword)) {
						antiPatterns.push({
							name: keyword,
							occurrences: 1,
							severity: this.getAntiPatternSeverity(keyword),
						})
					}
				})
			}
		})

		return antiPatterns
	}

	/**
	 * Get anti-pattern severity
	 */
	private getAntiPatternSeverity(keyword: string): "low" | "medium" | "high" {
		const highSeverity = ["god object", "spaghetti code"]
		const mediumSeverity = ["magic numbers", "copy-paste programming", "hardcoded values"]

		if (highSeverity.includes(keyword)) return "high"
		if (mediumSeverity.includes(keyword)) return "medium"
		return "low"
	}

	/**
	 * Calculate insight score
	 */
	private calculateInsightScore(insight: Insight): number {
		let score = 0.5 // Base score

		// Impact weighting
		switch (insight.impact) {
			case "high":
				score += 0.3
				break
			case "medium":
				score += 0.2
				break
			case "low":
				score += 0.1
				break
		}

		// Actionable bonus
		if (insight.actionable) {
			score += 0.2
		}

		// Type weighting
		switch (insight.type) {
			case "quality_concern":
				score += 0.2
				break
			case "performance_concern":
				score += 0.15
				break
			case "opportunity":
				score += 0.1
				break
		}

		return Math.min(1.0, score)
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<InsightsGeneratorConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Get current configuration
	 */
	getConfig(): InsightsGeneratorConfig {
		return { ...this.config }
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.isInitialized = false
		logger.info("Insights generator disposed")
	}
}
