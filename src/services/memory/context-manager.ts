// kilocode_change - new file

import { MemoryService } from "./memory-service"
import { PatternLearner } from "./pattern-learner"
import { logger } from "../indexing/logging-service"
import { MemoryContext, MemoryConfig, Suggestion, ContextAnalysis } from "../../types/memory-types"
import { UserMemory } from "../../types/indexing-types"

export interface ContextAnalysis {
	currentContext: MemoryContext
	recentContexts: MemoryContext[]
	contextScore: number
	relevantMemories: string[]
	suggestions: Suggestion[]
}

export interface ContextManagerConfig {
	maxContextHistory: number
	contextWeight: number
	suggestionThreshold: number
	contextTimeout: number // milliseconds
}

/**
 * ContextManager - Manages and analyzes user context for personalized AI assistance
 */
export class ContextManager {
	private readonly memoryService: MemoryService
	private readonly config: ContextManagerConfig
	private contextHistory: MemoryContext[] = []
	private currentSession: string

	constructor(memoryService: MemoryService, config: ContextManagerConfig) {
		this.memoryService = memoryService
		this.config = { ...config }
		this.currentSession = this.generateSessionId()
	}

	/**
	 * Update current context
	 */
	async updateContext(context: Partial<MemoryContext>): Promise<ContextAnalysis> {
		try {
			const fullContext = this.buildFullContext(context)

			// Add to history
			this.addToHistory(fullContext)

			// Analyze context
			const analysis = await this.analyzeContext(fullContext)

			// Store context in memory
			await this.storeContext(fullContext, analysis)

			return analysis
		} catch (error) {
			logger.error("Error updating context", { error, context })
			return this.getDefaultAnalysis()
		}
	}

	/**
	 * Get current context analysis
	 */
	async getCurrentContextAnalysis(): Promise<ContextAnalysis> {
		try {
			if (this.contextHistory.length === 0) {
				return this.getDefaultAnalysis()
			}

			const currentContext = this.contextHistory[this.contextHistory.length - 1]
			return await this.analyzeContext(currentContext)
		} catch (error) {
			logger.error("Error getting current context analysis", { error })
			return this.getDefaultAnalysis()
		}
	}

	/**
	 * Get context-based suggestions
	 */
	async getContextualSuggestions(query?: string): Promise<Suggestion[]> {
		try {
			const analysis = await this.getCurrentContextAnalysis()

			// Get suggestions from memory service
			const suggestionContext: SuggestionContext = {
				activeFile: analysis.currentContext.activeFile,
				cursorPosition: analysis.currentContext.cursorPosition,
				recentQueries: analysis.recentContexts.map((ctx) => ctx.recentQueries || []).flat(),
				currentTask: analysis.currentContext.project,
			}

			const memorySuggestions = await this.memoryService.getSuggestions(suggestionContext)

			// Add context-specific suggestions
			const contextSuggestions = this.generateContextSuggestions(analysis, query)

			// Combine and rank suggestions
			const allSuggestions = [...memorySuggestions, ...contextSuggestions]

			return this.rankSuggestions(allSuggestions, analysis)
		} catch (error) {
			logger.error("Error getting contextual suggestions", { error })
			return []
		}
	}

	/**
	 * Get context history
	 */
	getContextHistory(limit?: number): MemoryContext[] {
		if (limit) {
			return this.contextHistory.slice(-limit)
		}
		return [...this.contextHistory]
	}

	/**
	 * Clear context history
	 */
	clearHistory(): void {
		this.contextHistory = []
		this.currentSession = this.generateSessionId()
	}

	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<ContextManagerConfig>): void {
		this.config = { ...this.config, ...config }
	}

	/**
	 * Build full context from partial context
	 */
	private buildFullContext(partial: Partial<MemoryContext>): MemoryContext {
		const lastContext = this.contextHistory[this.contextHistory.length - 1]

		return {
			activeFile: partial.activeFile || lastContext?.activeFile || "",
			cursorPosition: partial.cursorPosition || lastContext?.cursorPosition,
			project: partial.project || lastContext?.project || "",
			language: partial.language || lastContext?.language || this.detectLanguage(partial.activeFile),
			recentQueries: partial.recentQueries || lastContext?.recentQueries || [],
			sessionId: this.currentSession,
		}
	}

	/**
	 * Add context to history
	 */
	private addToHistory(context: MemoryContext): void {
		this.contextHistory.push(context)

		// Limit history size
		if (this.contextHistory.length > this.config.maxContextHistory) {
			this.contextHistory = this.contextHistory.slice(-this.config.maxContextHistory)
		}
	}

	/**
	 * Analyze current context
	 */
	private async analyzeContext(context: MemoryContext): Promise<ContextAnalysis> {
		try {
			// Calculate context score
			const contextScore = this.calculateContextScore(context)

			// Get relevant memories
			const relevantMemories = await this.findRelevantMemories(context)

			// Generate suggestions
			const suggestions = await this.generateSuggestions(context, relevantMemories)

			return {
				currentContext: context,
				recentContexts: this.contextHistory.slice(-5), // Last 5 contexts
				contextScore,
				relevantMemories: relevantMemories.map((m) => m.id),
				suggestions,
			}
		} catch (error) {
			logger.error("Error analyzing context", { error, context })
			return this.getDefaultAnalysis()
		}
	}

	/**
	 * Calculate context score based on various factors
	 */
	private calculateContextScore(context: MemoryContext): number {
		let score = 0

		// Active file presence
		if (context.activeFile) score += 0.3

		// Cursor position
		if (context.cursorPosition) score += 0.1

		// Project context
		if (context.project) score += 0.2

		// Language detection
		if (context.language) score += 0.2

		// Recent queries
		if (context.recentQueries && context.recentQueries.length > 0) score += 0.2

		return Math.min(score, 1.0)
	}

	/**
	 * Find relevant memories for current context
	 */
	private async findRelevantMemories(context: MemoryContext): Promise<UserMemory[]> {
		try {
			const relevantMemories: UserMemory[] = []

			// Search by file context
			if (context.activeFile) {
				const fileMemories = await this.memoryService.getMemoriesByContext(context.activeFile)
				relevantMemories.push(...fileMemories)
			}

			// Search by project context
			if (context.project) {
				const projectMemories = await this.memoryService.getMemoriesByContext(context.project)
				relevantMemories.push(...projectMemories)
			}

			// Search by language context
			if (context.language) {
				const languageMemories = await this.memoryService.getMemoriesByContext(context.language)
				relevantMemories.push(...languageMemories)
			}

			// Search by recent queries
			if (context.recentQueries && context.recentQueries.length > 0) {
				for (const query of context.recentQueries) {
					const queryMemories = await this.memoryService.searchMemories(query)
					relevantMemories.push(...queryMemories)
				}
			}

			// Remove duplicates and sort by relevance
			const uniqueMemories = this.removeDuplicateMemories(relevantMemories)
			return uniqueMemories.sort((a, b) => b.importance - a.importance).slice(0, 10)
		} catch (error) {
			logger.error("Error finding relevant memories", { error, context })
			return []
		}
	}

	/**
	 * Generate suggestions based on context and memories
	 */
	private async generateSuggestions(context: MemoryContext, memories: UserMemory[]): Promise<Suggestion[]> {
		const suggestions: Suggestion[] = []

		// Generate file-specific suggestions
		if (context.activeFile) {
			const fileSuggestions = this.generateFileSuggestions(context.activeFile, context.language)
			suggestions.push(...fileSuggestions)
		}

		// Generate project-specific suggestions
		if (context.project) {
			const projectSuggestions = this.generateProjectSuggestions(context.project, memories)
			suggestions.push(...projectSuggestions)
		}

		// Generate language-specific suggestions
		if (context.language) {
			const languageSuggestions = this.generateLanguageSuggestions(context.language, memories)
			suggestions.push(...languageSuggestions)
		}

		return suggestions
	}

	/**
	 * Generate file-specific suggestions
	 */
	private generateFileSuggestions(filePath: string, language?: string): Suggestion[] {
		const suggestions: Suggestion[] = []

		// File type suggestions
		const extension = this.getFileExtension(filePath)

		if (extension === "ts" || extension === "tsx") {
			suggestions.push({
				type: "code_completion",
				content: "Consider using TypeScript interfaces for type safety",
				confidence: 0.7,
				source: "context_manager",
				metadata: { fileType: "typescript" },
			})
		}

		if (extension === "py") {
			suggestions.push({
				type: "code_completion",
				content: "Consider using type hints for better code documentation",
				confidence: 0.6,
				source: "context_manager",
				metadata: { fileType: "python" },
			})
		}

		return suggestions
	}

	/**
	 * Generate project-specific suggestions
	 */
	private generateProjectSuggestions(project: string, memories: UserMemory[]): Suggestion[] {
		const suggestions: Suggestion[] = []

		// Check for project-specific patterns in memories
		const projectMemories = memories.filter((m) => m.context?.project === project)

		if (projectMemories.length > 0) {
			const patternMemories = projectMemories.filter((m) => m.type === "pattern")

			patternMemories.forEach((memory) => {
				if (memory.content && memory.content.description) {
					suggestions.push({
						type: "pattern_match",
						content: memory.content.description,
						confidence: memory.importance / 10,
						source: "project_memory",
						metadata: { memoryId: memory.id },
					})
				}
			})
		}

		return suggestions
	}

	/**
	 * Generate language-specific suggestions
	 */
	private generateLanguageSuggestions(language: string, memories: UserMemory[]): Suggestion[] {
		const suggestions: Suggestion[] = []

		// Language-specific best practices
		const languageSuggestions: Record<string, string[]> = {
			typescript: [
				"Use explicit return types for functions",
				"Prefer const over let when possible",
				"Use interface for object shapes",
			],
			python: [
				"Use list comprehensions for readability",
				"Follow PEP 8 naming conventions",
				"Use type hints for function signatures",
			],
			javascript: [
				"Use const and let instead of var",
				"Use arrow functions for callbacks",
				"Use template literals for string formatting",
			],
		}

		const suggestionsForLanguage = languageSuggestions[language]
		if (suggestionsForLanguage) {
			suggestionsForLanguage.forEach((content) => {
				suggestions.push({
					type: "context_help",
					content,
					confidence: 0.5,
					source: "language_best_practices",
					metadata: { language },
				})
			})
		}

		return suggestions
	}

	/**
	 * Generate context-specific suggestions
	 */
	private generateContextSuggestions(analysis: ContextAnalysis, query?: string): Suggestion[] {
		const suggestions: Suggestion[] = []

		// High context score suggestions
		if (analysis.contextScore > 0.7) {
			suggestions.push({
				type: "context_help",
				content: "Your current context is well-established. I can provide highly relevant assistance.",
				confidence: 0.8,
				source: "context_manager",
			})
		}

		// Low context score suggestions
		if (analysis.contextScore < 0.3) {
			suggestions.push({
				type: "context_help",
				content: "Consider providing more context for better assistance.",
				confidence: 0.6,
				source: "context_manager",
			})
		}

		// Query-specific suggestions
		if (query) {
			suggestions.push({
				type: "resource_recommendation",
				content: `Based on your query "${query}", here are relevant resources from your previous interactions.`,
				confidence: 0.7,
				source: "context_manager",
				metadata: { query },
			})
		}

		return suggestions
	}

	/**
	 * Rank suggestions by relevance
	 */
	private rankSuggestions(suggestions: Suggestion[], analysis: ContextAnalysis): Suggestion[] {
		return suggestions.sort((a, b) => {
			// Primary sort by confidence
			const confidenceDiff = b.confidence - a.confidence
			if (Math.abs(confidenceDiff) > 0.1) {
				return confidenceDiff
			}

			// Secondary sort by context relevance
			const aContextRelevance = this.calculateSuggestionContextRelevance(a, analysis)
			const bContextRelevance = this.calculateSuggestionContextRelevance(b, analysis)

			return bContextRelevance - aContextRelevance
		})
	}

	/**
	 * Calculate suggestion context relevance
	 */
	private calculateSuggestionContextRelevance(suggestion: Suggestion, analysis: ContextAnalysis): number {
		let relevance = 0

		// Boost suggestions from memory
		if (suggestion.source === "project_memory" || suggestion.source === "language_best_practices") {
			relevance += 0.3
		}

		// Boost suggestions matching current context
		if (suggestion.metadata?.language === analysis.currentContext.language) {
			relevance += 0.2
		}

		if (suggestion.metadata?.fileType === this.getFileExtension(analysis.currentContext.activeFile)) {
			relevance += 0.2
		}

		return relevance
	}

	/**
	 * Store context in memory
	 */
	private async storeContext(context: MemoryContext, analysis: ContextAnalysis): Promise<void> {
		try {
			await this.memoryService.storeMemory({
				userId: "context-manager",
				sessionId: this.currentSession,
				type: "conversation",
				content: {
					context: context,
					analysis: analysis,
					timestamp: new Date(),
				},
				context: context,
				importance: Math.floor(analysis.contextScore * 10),
				accessCount: 0,
				lastAccessed: new Date(),
			})
		} catch (error) {
			logger.error("Error storing context in memory", { error, context })
		}
	}

	/**
	 * Remove duplicate memories
	 */
	private removeDuplicateMemories(memories: UserMemory[]): UserMemory[] {
		const seen = new Set<string>()
		return memories.filter((memory) => {
			const key = `${memory.type}-${memory.content}`
			if (seen.has(key)) {
				return false
			}
			seen.add(key)
			return true
		})
	}

	/**
	 * Detect programming language from file path
	 */
	private detectLanguage(filePath?: string): string {
		if (!filePath) return "unknown"

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
	 * Get file extension from file path
	 */
	private getFileExtension(filePath: string): string {
		const lastDot = filePath.lastIndexOf(".")
		return lastDot > -1 ? filePath.substring(lastDot + 1) : ""
	}

	/**
	 * Generate session ID
	 */
	private generateSessionId(): string {
		return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
	}

	/**
	 * Get default analysis
	 */
	private getDefaultAnalysis(): ContextAnalysis {
		return {
			currentContext: {
				activeFile: "",
				project: "",
				language: "unknown",
				sessionId: this.currentSession,
			},
			recentContexts: [],
			contextScore: 0,
			relevantMemories: [],
			suggestions: [],
		}
	}

	/**
	 * Get context statistics
	 */
	getContextStats(): {
		totalContexts: number
		currentSession: string
		contextScore: number
		activeFile: string
		project: string
		language: string
	} {
		const currentContext =
			this.contextHistory[this.contextHistory.length - 1] || this.getDefaultAnalysis().currentContext

		return {
			totalContexts: this.contextHistory.length,
			currentSession: this.currentSession,
			contextScore: this.calculateContextScore(currentContext),
			activeFile: currentContext.activeFile || "",
			project: currentContext.project || "",
			language: currentContext.language || "unknown",
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.clearHistory()
	}
}
