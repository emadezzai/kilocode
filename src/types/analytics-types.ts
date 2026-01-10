// kilocode_change - new file

export interface AnalyticsEvent {
	id: string
	userId: string
	eventType: AnalyticsEventType
	timestamp: Date
	data: any
	context?: AnalyticsContext
}

export type AnalyticsEventType =
	| "search_query"
	| "memory_access"
	| "code_indexed"
	| "feature_used"
	| "error_occurred"
	| "performance_metric"

export interface AnalyticsContext {
	workspacePath?: string
	activeFile?: string
	language?: string
	sessionId?: string
	feature?: string
}

export interface UsageMetrics {
	totalSearches: number
	averageSearchTime: number
	mostSearchedTerms: Array<{ term: string; count: number }>
	searchTypeDistribution: Record<string, number>
	memoryAccessCount: number
	codeElementsIndexed: number
	featureUsage: Record<string, number>
}

export interface PerformanceMetrics {
	indexingTime: number
	searchResponseTime: number
	memoryRetrievalTime: number
	databaseSize: number
	memoryUsage: number
	errorRate: number
}

export interface QualityMetrics {
	searchRelevanceScore: number
	memoryHitRate: number
	indexingAccuracy: number
	userSatisfactionScore: number
	systemReliability: number
}

export interface AnalyticsReport {
	id: string
	userId: string
	period: AnalyticsPeriod
	generatedAt: Date
	usageMetrics: UsageMetrics
	performanceMetrics: PerformanceMetrics
	qualityMetrics: QualityMetrics
	insights: AnalyticsInsight[]
}

export type AnalyticsPeriod = "daily" | "weekly" | "monthly" | "yearly"

export interface AnalyticsInsight {
	type: InsightType
	title: string
	description: string
	impact: "low" | "medium" | "high"
	actionable: boolean
	recommendations?: string[]
	data: any
}

export type InsightType = "usage_pattern" | "performance_issue" | "quality_concern" | "opportunity" | "anomaly"

export interface AnalyticsConfig {
	enabled: boolean
	retentionDays: number
	anonymizeData: boolean
	shareWithTeam: boolean
	trackingLevel: "minimal" | "standard" | "detailed"
}

export interface IAnalyticsService {
	trackEvent(event: AnalyticsEvent): Promise<void>
	generateReport(period: AnalyticsPeriod, userId?: string): Promise<AnalyticsReport>
	getMetrics(userId?: string): Promise<UsageMetrics>
	getPerformanceMetrics(userId?: string): Promise<PerformanceMetrics>
	getQualityMetrics(userId?: string): Promise<QualityMetrics>
	configureSettings(config: AnalyticsConfig): Promise<void>
	exportData(userId?: string): Promise<any>
	cleanupOldData(): Promise<number>
}
