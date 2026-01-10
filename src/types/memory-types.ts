// kilocode_change - new file

import type { MemoryType } from "./indexing-types"

export interface MemoryConfig {
	maxAge: number // days
	maxCount: number
	compressionEnabled: boolean
	encryptionEnabled: boolean
	autoCleanup: boolean
}

export interface MemorySearchOptions {
	query: string
	type?: MemoryType
	context?: string
	importance?: number
	dateRange?: {
		start: Date
		end: Date
	}
	limit?: number
}

export interface MemoryRelationship {
	id: string
	sourceMemoryId: string
	targetMemoryId: string
	relationshipType: RelationshipType
	strength: number
	createdAt: Date
}

export type RelationshipType = "similar" | "related" | "dependency" | "follow_up" | "correction" | "expansion"

export interface MemoryCluster {
	id: string
	name: string
	memoryIds: string[]
	type: ClusterType
	relevanceScore: number
	createdAt: Date
	updatedAt: Date
}

export type ClusterType = "topic" | "project" | "time_period" | "feature" | "pattern"

export interface MemoryPattern {
	id: string
	type: PatternType
	description: string
	frequency: number
	confidence: number
	contexts: string[]
	examples: string[]
	createdAt: Date
}

export type PatternType = "coding_style" | "naming_convention" | "problem_solving" | "workflow" | "preference"

export interface MemoryLearningConfig {
	learningRate: number
	patternThreshold: number
	relationshipThreshold: number
	clusteringEnabled: boolean
	autoTagging: boolean
}

export interface MemoryExportFormat {
	format: "json" | "csv" | "markdown"
	includeSensitive: boolean
	dateRange?: {
		start: Date
		end: Date
	}
	types?: MemoryType[]
}

export interface MemoryImportResult {
	imported: number
	skipped: number
	errors: string[]
	duplicates: number
}

export interface MemoryAnalytics {
	totalMemories: number
	memoriesByType: Record<MemoryType, number>
	memoriesByImportance: Record<number, number>
	growthRate: number
	retentionRate: number
	accessFrequency: number
	mostAccessedTypes: MemoryType[]
	storageUsage: number
}

// Re-export from main types for convenience
export type {
	UserMemory,
	MemoryType,
	MemoryContext,
	IMemoryService,
	MemoryStats,
	UserInteraction,
	SuggestionContext,
	Suggestion,
} from "./indexing-types"
