// kilocode_change - new file

import { DatabaseManager } from "../indexing/database-manager"
import { logger } from "../indexing/logging-service"
import {
	AnalyticsData,
	AnalyticsEvent,
	AnalyticsPeriod,
	AnalyticsReport,
	UsageMetrics,
	PerformanceMetrics,
	QualityMetrics,
} from "../../types/analytics-types"
import { AnalyticsConfig } from "../../types/analytics-types"

export interface AnalyticsServiceConfig {
	workspacePath: string
	dataDirectory: string
	enabled: boolean
	retentionDays: number
	anonymizeData: boolean
	shareWithTeam: boolean
	trackingLevel: "minimal" | "standard" | "detailed"
}

/**
 * AnalyticsService - Tracks and analyzes user interactions and system performance
 */
export class AnalyticsService {
	private readonly databaseManager: DatabaseManager
	private readonly config: AnalyticsServiceConfig
	private isInitialized: boolean = false

	constructor(config: AnalyticsServiceConfig) {
		this.config = config
		this.databaseManager = new DatabaseManager({
			workspacePath: config.workspacePath,
			dataDirectory: config.dataDirectory,
		})
	}

	/**
	 * Initialize analytics service
	 */
	async initialize(): Promise<void> {
		try {
			logger.info("Initializing analytics service", {
				workspacePath: this.config.workspacePath,
				enabled: this.config.enabled,
			})

			await this.databaseManager.initialize()

			// Create analytics tables
			await this.createAnalyticsTables()

			this.isInitialized = true
			logger.info("Analytics service initialized successfully")
		} catch (error) {
			logger.error("Error initializing analytics service", { error })
			throw error
		}
	}

	/**
	 * Track analytics event
	 */
	async trackEvent(event: AnalyticsEvent): Promise<void> {
		if (!this.isInitialized || !this.config.enabled) {
			return
		}

		try {
			// Anonymize data if configured
			const processedEvent = this.config.anonymizeData ? this.anonymizeEvent(event) : event

			// Store event in database
			await this.databaseManager.execute(
				`
                INSERT INTO analytics_events (
                    id, user_id, event_type, timestamp, data, context, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
				[
					processedEvent.id,
					processedEvent.userId,
					processedEvent.eventType,
					processedEvent.timestamp.toISOString(),
					JSON.stringify(processedEvent.data),
					JSON.stringify(processedEvent.context),
					new Date().toISOString(),
				],
			)

			logger.debug("Analytics event tracked", {
				eventId: event.id,
				eventType: event.eventType,
				userId: event.userId,
			})
		} catch (error) {
			logger.error("Error tracking analytics event", { error, event })
			// Don't throw - analytics failures shouldn't break the main functionality
		}
	}

	/**
	 * Generate analytics report
	 */
	async generateReport(period: AnalyticsPeriod, userId?: string): Promise<AnalyticsReport> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const reportId = `report-${period}-${userId || "all"}-${Date.now()}`
			const generatedAt = new Date()

			// Calculate date range for the period
			const { startDate, endDate } = this.getDateRange(period)

			// Generate metrics
			const usageMetrics = await this.calculateUsageMetrics(userId, startDate, endDate)
			const performanceMetrics = await this.calculatePerformanceMetrics(userId, startDate, endDate)
			const qualityMetrics = await this.calculateQualityMetrics(userId, startDate, endDate)

			// Generate insights
			const insights = await this.generateInsights(usageMetrics, performanceMetrics, qualityMetrics)

			const report: AnalyticsReport = {
				id: reportId,
				userId: userId || "all",
				period,
				startDate,
				endDate,
				generatedAt,
				usageMetrics,
				performanceMetrics,
				qualityMetrics,
				insights,
			}

			// Store report
			await this.storeReport(report)

			logger.info("Analytics report generated", {
				reportId,
				period,
				userId: userId || "all",
				insightsCount: insights.length,
			})

			return report
		} catch (error) {
			logger.error("Error generating analytics report", { error, period, userId })
			throw error
		}
	}

	/**
	 * Get usage metrics
	 */
	async getMetrics(userId?: string): Promise<UsageMetrics> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
			const endDate = new Date()

			return await this.calculateUsageMetrics(userId, startDate, endDate)
		} catch (error) {
			logger.error("Error getting usage metrics", { error, userId })
			throw error
		}
	}

	/**
	 * Get performance metrics
	 */
	async getPerformanceMetrics(userId?: string): Promise<PerformanceMetrics> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
			const endDate = new Date()

			return await this.calculatePerformanceMetrics(userId, startDate, endDate)
		} catch (error) {
			logger.error("Error getting performance metrics", { error, userId })
			throw error
		}
	}

	/**
	 * Get quality metrics
	 */
	async getQualityMetrics(userId?: string): Promise<QualityMetrics> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
			const endDate = new Date()

			return await this.calculateQualityMetrics(userId, startDate, endDate)
		} catch (error) {
			logger.error("Error getting quality metrics", { error, userId })
			throw error
		}
	}

	/**
	 * Configure analytics settings
	 */
	async configureSettings(config: Partial<AnalyticsServiceConfig>): Promise<void> {
		try {
			// Update configuration
			this.config = { ...this.config, ...config }

			// Store configuration in database
			await this.databaseManager.execute(
				`
                INSERT OR REPLACE INTO analytics_config (
                    workspace_path, enabled, retention_days, anonymize_data, 
                    share_with_team, tracking_level, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
				[
					this.config.workspacePath,
					this.config.enabled,
					this.config.retentionDays,
					this.config.anonymizeData,
					this.config.shareWithTeam,
					this.config.trackingLevel,
					new Date().toISOString(),
				],
			)

			logger.info("Analytics configuration updated", { config })
		} catch (error) {
			logger.error("Error configuring analytics settings", { error, config })
			throw error
		}
	}

	/**
	 * Export analytics data
	 */
	async exportData(userId?: string): Promise<any> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
			const endDate = new Date()

			// Export events
			const events = await this.databaseManager.all(
				`
                SELECT * FROM analytics_events 
                WHERE created_at BETWEEN ? AND ?
                ${userId ? "AND user_id = ?" : ""}
                ORDER BY created_at DESC
                LIMIT 10000
            `,
				userId
					? [startDate.toISOString(), endDate.toISOString(), userId]
					: [startDate.toISOString(), endDate.toISOString()],
			)

			// Export reports
			const reports = await this.databaseManager.all(
				`
                SELECT * FROM analytics_reports 
                WHERE created_at BETWEEN ? AND ?
                ${userId ? "AND user_id = ?" : ""}
                ORDER BY created_at DESC
                LIMIT 100
            `,
				userId
					? [startDate.toISOString(), endDate.toISOString(), userId]
					: [startDate.toISOString(), endDate.toISOString()],
			)

			return {
				events: events.map((event) => ({
					...event,
					data: JSON.parse(event.data),
					context: JSON.parse(event.context),
				})),
				reports: reports.map((report) => ({
					...report,
					usageMetrics: JSON.parse(report.usage_metrics),
					performanceMetrics: JSON.parse(report.performance_metrics),
					qualityMetrics: JSON.parse(report.quality_metrics),
					insights: JSON.parse(report.insights),
				})),
				exportedAt: new Date().toISOString(),
			}
		} catch (error) {
			logger.error("Error exporting analytics data", { error, userId })
			throw error
		}
	}

	/**
	 * Cleanup old data
	 */
	async cleanupOldData(): Promise<number> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const cutoffDate = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000)

			// Delete old events
			const eventsDeleted = await this.databaseManager.execute(
				`
                DELETE FROM analytics_events WHERE created_at < ?
            `,
				[cutoffDate.toISOString()],
			)

			// Delete old reports
			const reportsDeleted = await this.databaseManager.execute(
				`
                DELETE FROM analytics_reports WHERE created_at < ?
            `,
				[cutoffDate.toISOString()],
			)

			const totalDeleted = eventsDeleted + reportsDeleted

			logger.info("Old analytics data cleaned up", {
				cutoffDate: cutoffDate.toISOString(),
				eventsDeleted,
				reportsDeleted,
				totalDeleted,
			})

			return totalDeleted
		} catch (error) {
			logger.error("Error cleaning up old analytics data", { error })
			throw error
		}
	}

	/**
	 * Get current configuration
	 */
	getConfig(): AnalyticsServiceConfig {
		return { ...this.config }
	}

	/**
	 * Get search statistics
	 */
	async getSearchStats(): Promise<{
		totalQueries: number
		averageExecutionTime: number
		mostCommonSearchTypes: Array<{ type: string; count: number }>
	}> {
		if (!this.isInitialized) {
			throw new Error("Analytics service not initialized")
		}

		try {
			const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
			const endDate = new Date()

			// Get total queries
			const totalQueries = await this.databaseManager.get(
				`
                SELECT COUNT(*) as count FROM analytics_events 
                WHERE event_type = 'search_query' 
                AND created_at BETWEEN ? AND ?
            `,
				[startDate.toISOString(), endDate.toISOString()],
			)

			// Get average execution time
			const avgExecutionTime = await this.databaseManager.get(
				`
                SELECT AVG(CAST(JSON_EXTRACT(data, '$.duration') AS REAL)) as avg_time 
                FROM analytics_events 
                WHERE event_type = 'search_query' 
                AND created_at BETWEEN ? AND ?
                AND JSON_EXTRACT(data, '$.duration') IS NOT NULL
            `,
				[startDate.toISOString(), endDate.toISOString()],
			)

			// Get most common search types
			const searchTypes = await this.databaseManager.all(
				`
                SELECT 
                    JSON_EXTRACT(data, '$.searchType') as search_type,
                    COUNT(*) as count
                FROM analytics_events 
                WHERE event_type = 'search_query' 
                AND created_at BETWEEN ? AND ?
                AND JSON_EXTRACT(data, '$.searchType') IS NOT NULL
                GROUP BY JSON_EXTRACT(data, '$.searchType')
                ORDER BY count DESC
                LIMIT 5
            `,
				[startDate.toISOString(), endDate.toISOString()],
			)

			return {
				totalQueries: totalQueries?.count || 0,
				averageExecutionTime: avgExecutionTime?.avg_time || 0,
				mostCommonSearchTypes: searchTypes.map((row) => ({
					type: row.search_type,
					count: row.count,
				})),
			}
		} catch (error) {
			logger.error("Error getting search statistics", { error })
			throw error
		}
	}

	/**
	 * Dispose of resources
	 */
	async dispose(): Promise<void> {
		try {
			if (this.isInitialized) {
				await this.databaseManager.close()
				this.isInitialized = false
				logger.info("Analytics service disposed")
			}
		} catch (error) {
			logger.error("Error disposing analytics service", { error })
		}
	}

	/**
	 * Create analytics tables
	 */
	private async createAnalyticsTables(): Promise<void> {
		const tables = [
			// Analytics events table
			`CREATE TABLE IF NOT EXISTS analytics_events (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                data TEXT NOT NULL,
                context TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,

			// Analytics reports table
			`CREATE TABLE IF NOT EXISTS analytics_reports (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                period TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                generated_at TEXT NOT NULL,
                usage_metrics TEXT NOT NULL,
                performance_metrics TEXT NOT NULL,
                quality_metrics TEXT NOT NULL,
                insights TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,

			// Analytics configuration table
			`CREATE TABLE IF NOT EXISTS analytics_config (
                workspace_path TEXT PRIMARY KEY,
                enabled BOOLEAN NOT NULL DEFAULT 1,
                retention_days INTEGER NOT NULL DEFAULT 30,
                anonymize_data BOOLEAN NOT NULL DEFAULT 1,
                share_with_team BOOLEAN NOT NULL DEFAULT 0,
                tracking_level TEXT NOT NULL DEFAULT 'standard',
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )`,
		]

		const indexes = [
			"CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON analytics_events(user_id)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_events_event_type ON analytics_events(event_type)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_events_timestamp ON analytics_events(timestamp)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_reports_user_id ON analytics_reports(user_id)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_reports_period ON analytics_reports(period)",
			"CREATE INDEX IF NOT EXISTS idx_analytics_reports_created_at ON analytics_reports(created_at)",
		]

		// Create tables
		for (const table of tables) {
			await this.databaseManager.execute(table)
		}

		// Create indexes
		for (const index of indexes) {
			await this.databaseManager.execute(index)
		}

		logger.debug("Analytics tables created successfully")
	}

	/**
	 * Anonymize event data
	 */
	private anonymizeEvent(event: AnalyticsEvent): AnalyticsEvent {
		const anonymized = { ...event }

		// Anonymize user ID
		if (anonymized.userId) {
			anonymized.userId = this.hashString(anonymized.userId)
		}

		// Anonymize context data
		if (anonymized.context) {
			anonymized.context = {
				...anonymized.context,
				activeFile: this.anonymizePath(anonymized.context.activeFile),
				workspacePath: this.anonymizePath(anonymized.context.workspacePath),
			}
		}

		// Remove sensitive data from event data
		if (anonymized.data) {
			anonymized.data = this.removeSensitiveData(anonymized.data)
		}

		return anonymized
	}

	/**
	 * Hash string for anonymization
	 */
	private hashString(str: string): string {
		let hash = 0
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i)
			hash = (hash << 5) - hash + char
			hash = hash & hash // Convert to 32-bit integer
		}
		return `user_${Math.abs(hash)}`
	}

	/**
	 * Anonymize file path
	 */
	private anonymizePath(path?: string): string | undefined {
		if (!path) return undefined

		// Keep only the file name and basic structure
		const parts = path.split("/")
		const fileName = parts[parts.length - 1]
		const dirName = parts[parts.length - 2]

		return `${dirName}/${fileName}`
	}

	/**
	 * Remove sensitive data from event data
	 */
	private removeSensitiveData(data: any): any {
		if (typeof data !== "object" || data === null) {
			return data
		}

		const sensitiveKeys = ["email", "password", "token", "secret", "key", "auth"]
		const cleaned = { ...data }

		for (const key of Object.keys(cleaned)) {
			if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
				delete cleaned[key]
			}
		}

		return cleaned
	}

	/**
	 * Get date range for period
	 */
	private getDateRange(period: AnalyticsPeriod): { startDate: Date; endDate: Date } {
		const now = new Date()
		const endDate = new Date(now)
		let startDate: Date

		switch (period) {
			case "daily":
				startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
				break
			case "weekly":
				startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
				break
			case "monthly":
				startDate = new Date(now.getFullYear(), now.getMonth(), 1)
				break
			case "yearly":
				startDate = new Date(now.getFullYear(), 0, 1)
				break
			default:
				startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
		}

		return { startDate, endDate }
	}

	/**
	 * Calculate usage metrics
	 */
	private async calculateUsageMetrics(userId?: string, startDate?: Date, endDate?: Date): Promise<UsageMetrics> {
		const whereClause = userId ? "user_id = ?" : "1=1"
		const params = userId ? [userId] : []

		// Get total searches
		const totalSearches = await this.databaseManager.get(
			`
            SELECT COUNT(*) as count FROM analytics_events 
            WHERE event_type = 'search_query' AND ${whereClause}
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get average search time
		const avgSearchTime = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.duration') AS REAL)) as avg_time 
            FROM analytics_events 
            WHERE event_type = 'search_query' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.duration') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get most common search types
		const searchTypes = await this.databaseManager.all(
			`
            SELECT 
                JSON_EXTRACT(data, '$.searchType') as search_type,
                COUNT(*) as count
            FROM analytics_events 
            WHERE event_type = 'search_query' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.searchType') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
            GROUP BY JSON_EXTRACT(data, '$.searchType')
            ORDER BY count DESC
            LIMIT 5
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		return {
			totalSearches: totalSearches?.count || 0,
			averageSearchTime: avgSearchTime?.avg_time || 0,
			mostCommonSearchTypes: searchTypes.map((row) => ({
				type: row.search_type,
				count: row.count,
			})),
		}
	}

	/**
	 * Calculate performance metrics
	 */
	private async calculatePerformanceMetrics(
		userId?: string,
		startDate?: Date,
		endDate?: Date,
	): Promise<PerformanceMetrics> {
		const whereClause = userId ? "user_id = ?" : "1=1"
		const params = userId ? [userId] : []

		// Get indexing time
		const indexingTime = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.indexingTime') AS REAL)) as avg_time 
            FROM analytics_events 
            WHERE event_type = 'code_indexed' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.indexingTime') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get search response time
		const searchResponseTime = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.duration') AS REAL)) as avg_time 
            FROM analytics_events 
            WHERE event_type = 'search_query' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.duration') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get memory retrieval time
		const memoryRetrievalTime = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.memoryTime') AS REAL)) as avg_time 
            FROM analytics_events 
            WHERE event_type = 'memory_access' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.memoryTime') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get database size
		const databaseSize = await this.databaseManager.get(`
            SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()
        `)

		return {
			indexingTime: indexingTime?.avg_time || 0,
			searchResponseTime: searchResponseTime?.avg_time || 0,
			memoryRetrievalTime: memoryRetrievalTime?.avg_time || 0,
			databaseSize: databaseSize?.size || 0,
		}
	}

	/**
	 * Calculate quality metrics
	 */
	private async calculateQualityMetrics(userId?: string, startDate?: Date, endDate?: Date): Promise<QualityMetrics> {
		const whereClause = userId ? "user_id = ?" : "1=1"
		const params = userId ? [userId] : []

		// Get search relevance score
		const searchRelevanceScore = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.relevanceScore') AS REAL)) as avg_score 
            FROM analytics_events 
            WHERE event_type = 'search_query' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.relevanceScore') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get memory hit rate
		const memoryHitRate = await this.databaseManager.get(
			`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN JSON_EXTRACT(data, '$.hit') = true THEN 1 ELSE 0 END) as hits
            FROM analytics_events 
            WHERE event_type = 'memory_access' AND ${whereClause}
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get indexing accuracy
		const indexingAccuracy = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.accuracy') AS REAL)) as avg_accuracy 
            FROM analytics_events 
            WHERE event_type = 'code_indexed' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.accuracy') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		// Get user satisfaction score (from feedback events)
		const userSatisfactionScore = await this.databaseManager.get(
			`
            SELECT AVG(CAST(JSON_EXTRACT(data, '$.satisfaction') AS REAL)) as avg_satisfaction 
            FROM analytics_events 
            WHERE event_type = 'feedback' AND ${whereClause}
            AND JSON_EXTRACT(data, '$.satisfaction') IS NOT NULL
            ${startDate && endDate ? "AND created_at BETWEEN ? AND ?" : ""}
        `,
			startDate && endDate ? [...params, startDate.toISOString(), endDate.toISOString()] : params,
		)

		const hitRate = memoryHitRate ? (memoryHitRate.hits / memoryHitRate.total) * 100 : 0

		return {
			searchRelevanceScore: searchRelevanceScore?.avg_score || 0,
			memoryHitRate: hitRate,
			indexingAccuracy: indexingAccuracy?.avg_accuracy || 0,
			userSatisfactionScore: userSatisfactionScore?.avg_satisfaction || 0,
		}
	}

	/**
	 * Generate insights from metrics
	 */
	private async generateInsights(
		usageMetrics: UsageMetrics,
		performanceMetrics: PerformanceMetrics,
		qualityMetrics: QualityMetrics,
	): Promise<any[]> {
		const insights = []

		// Usage insights
		if (usageMetrics.totalSearches > 100) {
			insights.push({
				type: "usage_pattern",
				title: "High Search Activity",
				description: `You performed ${usageMetrics.totalSearches} searches in this period`,
				impact: "medium",
				actionable: false,
				data: { totalSearches: usageMetrics.totalSearches },
			})
		}

		// Performance insights
		if (performanceMetrics.searchResponseTime > 2000) {
			insights.push({
				type: "performance_concern",
				title: "Slow Search Response",
				description: "Search responses are taking longer than expected",
				impact: "high",
				actionable: true,
				data: { searchResponseTime: performanceMetrics.searchResponseTime },
			})
		}

		// Quality insights
		if (qualityMetrics.searchRelevanceScore < 0.5) {
			insights.push({
				type: "quality_concern",
				title: "Low Search Relevance",
				description: "Search results may not be as relevant as expected",
				impact: "medium",
				actionable: true,
				data: { searchRelevanceScore: qualityMetrics.searchRelevanceScore },
			})
		}

		// Positive insights
		if (qualityMetrics.userSatisfactionScore > 0.8) {
			insights.push({
				type: "opportunity",
				title: "High User Satisfaction",
				description: "Users are highly satisfied with the system performance",
				impact: "low",
				actionable: false,
				data: { userSatisfactionScore: qualityMetrics.userSatisfactionScore },
			})
		}

		return insights
	}

	/**
	 * Store report in database
	 */
	private async storeReport(report: AnalyticsReport): Promise<void> {
		await this.databaseManager.execute(
			`
            INSERT INTO analytics_reports (
                id, user_id, period, start_date, end_date, generated_at,
                usage_metrics, performance_metrics, quality_metrics, insights
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
			[
				report.id,
				report.userId,
				report.period,
				report.startDate.toISOString(),
				report.endDate.toISOString(),
				report.generatedAt.toISOString(),
				JSON.stringify(report.usageMetrics),
				JSON.stringify(report.performanceMetrics),
				JSON.stringify(report.qualityMetrics),
				JSON.stringify(report.insights),
			],
		)
	}
}
