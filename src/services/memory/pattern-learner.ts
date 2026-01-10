// kilocode_change - new file

import { MemoryService } from "./memory-service"
import { MemoryPattern, PatternType, MemoryContext } from "../../types/memory-types"
import { UserMemory } from "../../types/indexing-types"
import { logger } from "../indexing/logging-service"

export interface PatternLearnerConfig {
	learningRate: number
	patternThreshold: number
	relationshipThreshold: number
	clusteringEnabled: boolean
	autoTagging: boolean
}

export interface PatternAnalysis {
	frequency: number
	confidence: number
	contexts: string[]
	examples: string[]
	relatedPatterns: string[]
	suggestedActions: string[]
}

/**
 * PatternLearner - Analyzes user interactions to identify coding patterns
 * and preferences for personalized AI assistance
 */
export class PatternLearner {
	private readonly memoryService: MemoryService
	private config: PatternLearnerConfig
	private patternCache: Map<string, PatternAnalysis> = new Map()

	constructor(memoryService: MemoryService, config: PatternLearnerConfig) {
		this.memoryService = memoryService
		this.config = { ...config }
	}

	/**
	 * Analyze user interactions to identify patterns
	 */
	async analyzeInteraction(interaction: {
		type: "query" | "code_action" | "feedback" | "preference_change"
		content: any
		context: MemoryContext
		timestamp: Date
		outcome?: "success" | "error" | "neutral"
	}): Promise<PatternAnalysis | null> {
		try {
			// Extract pattern features from interaction
			const features = this.extractFeatures(interaction)

			// Check if this matches existing patterns
			const existingPatterns = await this.findSimilarPatterns(features)

			if (existingPatterns.length > 0) {
				// Strengthen existing patterns
				return await this.strengthenPattern(existingPatterns[0], interaction)
			} else {
				// Check if this is a new pattern
				const isNewPattern = await this.evaluateNewPattern(features)

				if (isNewPattern) {
					return await this.createPattern(features, interaction)
				}
			}

			return null
		} catch (error) {
			logger.error("Error analyzing interaction for patterns", { error, interaction })
			return null
		}
	}

	/**
	 * Get learned patterns for a specific context
	 */
	async getPatternsForContext(context: MemoryContext): Promise<PatternAnalysis[]> {
		try {
			const allPatterns = await this.getAllPatterns()

			return allPatterns.filter((pattern) => pattern.contexts.some((ctx) => this.contextMatches(ctx, context)))
		} catch (error) {
			logger.error("Error getting patterns for context", { error, context })
			return []
		}
	}

	/**
	 * Get all learned patterns
	 */
	async getAllPatterns(): Promise<PatternAnalysis[]> {
		try {
			const patternMemories = await this.memoryService.getMemoriesByType("pattern")

			return patternMemories.map((memory) => ({
				frequency: memory.accessCount,
				confidence: this.calculateConfidence(memory),
				contexts: memory.context
					? [memory.context.activeFile || "", memory.context.project || ""].filter(Boolean)
					: [],
				examples: this.extractExamples(memory.content),
				relatedPatterns: [],
				suggestedActions: this.generateSuggestions(memory.content),
			}))
		} catch (error) {
			logger.error("Error getting all patterns", { error })
			return []
		}
	}

	/**
	 * Update pattern learning configuration
	 */
	updateConfig(config: Partial<PatternLearnerConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Extract features from user interaction
	 */
	private extractFeatures(interaction: any): Map<string, any> {
		const features = new Map<string, any>()

		// Extract content features
		if (typeof interaction.content === "string") {
			features.set("content_length", interaction.content.length)
			features.set("has_code_snippets", /```|`~`/.test(interaction.content))
			features.set("has_urls", /https?:\/\//.test(interaction.content))
		} else if (typeof interaction.content === "object") {
			features.set("content_keys", Object.keys(interaction.content).length)
			features.set("content_type", typeof interaction.content)
		}

		// Extract context features
		if (interaction.context) {
			features.set("file_extension", this.getFileExtension(interaction.context.activeFile))
			features.set("language", this.detectLanguage(interaction.context.activeFile))
			features.set("project_path", interaction.context.project || "")
		}

		// Extract outcome features
		if (interaction.outcome) {
			features.set("outcome", interaction.outcome)
			features.set("success", interaction.outcome === "success")
		}

		// Extract temporal features
		features.set("hour_of_day", interaction.timestamp.getHours())
		features.set("day_of_week", interaction.timestamp.getDay())
		features.set("interaction_type", interaction.type)

		return features
	}

	/**
	 * Find similar existing patterns
	 */
	private async findSimilarPatterns(features: Map<string, any>): Promise<UserMemory[]> {
		try {
			const allPatterns = await this.memoryService.getMemoriesByType("pattern")

			return allPatterns.filter((pattern) => {
				const patternFeatures = this.extractPatternFeatures(pattern)
				return this.calculateSimilarity(features, patternFeatures) >= this.config.relationshipThreshold
			})
		} catch (error) {
			logger.error("Error finding similar patterns", { error })
			return []
		}
	}

	/**
	 * Strengthen existing pattern with new interaction
	 */
	private async strengthenPattern(pattern: UserMemory, interaction: any): Promise<PatternAnalysis> {
		try {
			// Update access count and last accessed
			await this.memoryService.updateMemory(pattern.id, {
				accessCount: pattern.accessCount + 1,
				lastAccessed: new Date(),
			})

			// Update pattern content with new example
			const examples = this.extractExamples(pattern.content)
			const newExample = this.formatInteractionExample(interaction)
			examples.push(newExample)

			await this.memoryService.updateMemory(pattern.id, {
				content: {
					...pattern.content,
					examples,
				},
			})

			// Update confidence
			const updatedMemory = await this.memoryService.getMemory(pattern.id)
			if (!updatedMemory) return null

			return {
				frequency: updatedMemory.accessCount,
				confidence: this.calculateConfidence(updatedMemory),
				contexts: updatedMemory.context
					? [updatedMemory.context.activeFile || "", updatedMemory.context.project || ""].filter(Boolean)
					: [],
				examples,
				relatedPatterns: [],
				suggestedActions: this.generateSuggestions(updatedMemory.content),
			}
		} catch (error) {
			logger.error("Error strengthening pattern", { error, patternId: pattern.id })
			return null
		}
	}

	/**
	 * Evaluate if this represents a new pattern
	 */
	private async evaluateNewPattern(features: Map<string, any>): Promise<boolean> {
		try {
			// Check frequency of similar features
			const similarPatterns = await this.findSimilarPatterns(features)

			// If no similar patterns exist, this might be a new pattern
			if (similarPatterns.length === 0) {
				// Check if features are distinctive enough
				const distinctiveness = this.calculateDistinctiveness(features)
				return distinctiveness >= this.config.patternThreshold
			}

			return false
		} catch (error) {
			logger.error("Error evaluating new pattern", { error })
			return false
		}
	}

	/**
	 * Create a new pattern from features and interaction
	 */
	private async createPattern(features: Map<string, any>, interaction: any): Promise<PatternAnalysis> {
		try {
			const patternType = this.inferPatternType(features, interaction)
			const patternDescription = this.generatePatternDescription(features, interaction)

			const memoryId = await this.memoryService.storeMemory({
				userId: "pattern-learner",
				sessionId: "pattern-learning",
				type: "pattern",
				content: {
					type: patternType,
					description: patternDescription,
					features: Object.fromEntries(features),
					examples: [this.formatInteractionExample(interaction)],
					firstSeen: interaction.timestamp,
					lastSeen: interaction.timestamp,
					frequency: 1,
					confidence: 0.5, // Start with medium confidence
				},
				context: interaction.context,
				importance: this.calculateImportance(features, interaction),
				accessCount: 1,
				lastAccessed: new Date(),
			})

			// Cache the pattern analysis
			const analysis = {
				frequency: 1,
				confidence: 0.5,
				contexts: interaction.context
					? [interaction.context.activeFile || "", interaction.context.project || ""].filter(Boolean)
					: [],
				examples: [this.formatInteractionExample(interaction)],
				relatedPatterns: [],
				suggestedActions: this.generateSuggestions({ type: patternType, description: patternDescription }),
			}

			this.patternCache.set(memoryId, analysis)

			return analysis
		} catch (error) {
			logger.error("Error creating new pattern", { error })
			return null
		}
	}

	/**
	 * Extract features from existing pattern
	 */
	private extractPatternFeatures(pattern: UserMemory): Map<string, any> {
		const features = new Map<string, any>()

		if (pattern.content && pattern.content.features) {
			Object.entries(pattern.content.features).forEach(([key, value]) => {
				features.set(key, value)
			})
		}

		return features
	}

	/**
	 * Calculate similarity between feature sets
	 */
	private calculateSimilarity(features1: Map<string, any>, features2: Map<string, any>): number {
		const commonFeatures = new Set([...features1.keys()].filter((key) => features2.has(key)))
		const allFeatures = new Set([...features1.keys(), ...features2.keys()])

		if (allFeatures.size === 0) return 0

		return commonFeatures.size / allFeatures.size
	}

	/**
	 * Calculate how distinctive a feature set is
	 */
	private calculateDistinctiveness(features: Map<string, any>): number {
		// Simple heuristic: more unique features = more distinctive
		const uniqueFeatures = new Set(features.keys())

		// Weight certain features more heavily
		let distinctiveness = 0
		features.forEach((value, key) => {
			let weight = 1
			if (key.includes("code_")) weight = 2
			if (key.includes("file_extension")) weight = 1.5
			if (key.includes("language")) weight = 1.5
			if (key.includes("outcome_success")) weight = 3

			distinctiveness += weight
		})

		return distinctiveness / (uniqueFeatures.size * 3) // Normalize
	}

	/**
	 * Infer pattern type from features
	 */
	private inferPatternType(features: Map<string, any>, interaction: any): PatternType {
		const interactionType = features.get("interaction_type")
		const contentType = features.get("content_type")
		const hasCode = features.get("has_code_snippets")

		if (interactionType === "preference_change") {
			return "preference"
		}

		if (interactionType === "feedback") {
			return hasCode ? "problem_solving" : "general"
		}

		if (hasCode) {
			if (features.get("language") === "typescript") {
				return "coding_style"
			} else if (features.get("language") === "python") {
				return "coding_style"
			}
			return "workflow"
		}

		if (interactionType === "query") {
			return "problem_solving"
		}

		return "general"
	}

	/**
	 * Generate pattern description
	 */
	private generatePatternDescription(features: Map<string, any>, interaction: any): string {
		const interactionType = features.get("interaction_type")
		const fileExtension = features.get("file_extension")
		const language = features.get("language")

		if (interactionType === "preference_change") {
			return `User prefers ${this.formatInteractionContent(interaction.content)}`
		}

		if (fileExtension && language) {
			return `${language} ${fileExtension} usage pattern`
		}

		if (interactionType === "query") {
			return `Query pattern: ${this.formatInteractionContent(interaction.content)}`
		}

		return "General interaction pattern"
	}

	/**
	 * Format interaction content for storage
	 */
	private formatInteractionContent(content: any): string {
		if (typeof content === "string") {
			return content.length > 100 ? content.substring(0, 100) + "..." : content
		}
		return JSON.stringify(content).substring(0, 100) + "..."
	}

	/**
	 * Format interaction as example
	 */
	private formatInteractionExample(interaction: any): string {
		const timestamp = interaction.timestamp.toISOString()
		const type = interaction.type
		const outcome = interaction.outcome || "unknown"

		return `${timestamp} - ${type} (${outcome}): ${this.formatInteractionContent(interaction.content)}`
	}

	/**
	 * Extract examples from memory content
	 */
	private extractExamples(content: any): string[] {
		if (content && content.examples) {
			return Array.isArray(content.examples) ? content.examples : []
		}
		return []
	}

	/**
	 * Generate suggestions based on pattern
	 */
	private generateSuggestions(content: any): string[] {
		const suggestions = []

		if (content.type === "coding_style") {
			suggestions.push("Consider using this pattern consistently")
			suggestions.push("This pattern improves code readability")
		}

		if (content.description) {
			suggestions.push(`Remember: ${content.description}`)
		}

		return suggestions
	}

	/**
	 * Calculate confidence score for memory
	 */
	private calculateConfidence(memory: UserMemory): number {
		const baseConfidence = 0.5
		const frequencyBonus = Math.min(memory.accessCount / 10, 0.3) // Max 0.3 bonus for frequency
		const importanceBonus = (memory.importance - 5) / 5 // -1 to 1 range

		return Math.min(baseConfidence + frequencyBonus + importanceBonus, 1.0)
	}

	/**
	 * Calculate importance score for interaction
	 */
	private calculateImportance(features: Map<string, any>, interaction: any): number {
		let importance = 5 // Base importance

		// Higher importance for successful interactions
		if (interaction.outcome === "success") {
			importance += 2
		} else if (interaction.outcome === "error") {
			importance += 1
		}

		// Higher importance for preferences
		if (features.get("interaction_type") === "preference_change") {
			importance += 2
		}

		// Higher importance for complex content
		if (features.get("content_length") > 100) {
			importance += 1
		}

		return Math.min(importance, 10)
	}

	/**
	 * Check if context matches
	 */
	private contextMatches(ctx1: string, ctx2: MemoryContext): boolean {
		if (!ctx1 || !ctx2) return false

		const context2Str = `${ctx2.activeFile || ""} ${ctx2.project || ""} ${ctx2.language || ""}`
		return context2Str.toLowerCase().includes(ctx1.toLowerCase())
	}

	/**
	 * Get file extension from file path
	 */
	private getFileExtension(filePath: string): string {
		const lastDot = filePath.lastIndexOf(".")
		return lastDot > -1 ? filePath.substring(lastDot + 1) : ""
	}

	/**
	 * Detect programming language from file path
	 */
	private detectLanguage(filePath: string): string {
		const extension = this.getFileExtension(filePath)
		const extensionMap: Record<string, string> = {
			".ts": "typescript",
			".tsx": "typescript",
			".js": "javascript",
			".jsx": "javascript",
			".py": "python",
			".java": "java",
			".cpp": "cpp",
			".c": "c",
			".h": "c",
			".hpp": "cpp",
			".go": "go",
			".rs": "rust",
			".php": "php",
			".rb": "ruby",
			".swift": "swift",
			".kt": "kotlin",
		}

		return extensionMap[extension] || "unknown"
	}

	/**
	 * Get pattern cache statistics
	 */
	getCacheStats(): {
		totalPatterns: number
		cachedPatterns: number
		hitRate: number
	} {
		const totalPatterns = this.patternCache.size
		return {
			totalPatterns,
			cachedPatterns: totalPatterns,
			hitRate: totalPatterns > 0 ? 1.0 : 0,
		}
	}

	/**
	 * Clear pattern cache
	 */
	clearCache(): void {
		this.patternCache.clear()
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.clearCache()
	}
}
