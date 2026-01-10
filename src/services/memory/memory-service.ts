// kilocode_change - new file

import { v4 as uuidv4 } from "uuid"
import { DatabaseManager } from "../indexing/database-manager"
import {
	UserMemory,
	MemoryType,
	MemoryContext,
	IMemoryService,
	MemoryStats,
	UserInteraction,
	SuggestionContext,
	Suggestion,
} from "../../types/indexing-types"

export interface MemoryServiceConfig {
	userId: string
	workspacePath: string
	dataDirectory: string
	maxMemoryAge?: number // in days
	maxMemoryCount?: number
}

/**
 * Memory service for persistent user memory and learning
 * Integrates with existing Kilo Code infrastructure
 */
export class MemoryService implements IMemoryService {
	private readonly config: MemoryServiceConfig
	private readonly databaseManager: DatabaseManager

	constructor(config: MemoryServiceConfig) {
		this.config = config
		this.databaseManager = new DatabaseManager({
			workspacePath: config.workspacePath,
			dataDirectory: config.dataDirectory,
		})
	}

	/**
	 * Initialize the memory service
	 */
	async initialize(): Promise<void> {
		await this.databaseManager.initialize()
	}

	/**
	 * Store a memory entry
	 */
	async storeMemory(memory: Omit<UserMemory, "id" | "createdAt">): Promise<string> {
		const id = uuidv4()
		const now = new Date()

		const fullMemory: UserMemory = {
			...memory,
			id,
			createdAt: now,
			lastAccessed: now,
		}

		const db = this.databaseManager.getDatabase()
		await db.run(
			`INSERT INTO user_memory (
                id, user_id, session_id, type, content, context,
                importance, access_count, last_accessed, created_at, expires_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				fullMemory.id,
				fullMemory.userId,
				fullMemory.sessionId,
				fullMemory.type,
				JSON.stringify(fullMemory.content),
				JSON.stringify(fullMemory.context),
				fullMemory.importance,
				fullMemory.accessCount,
				Math.floor(fullMemory.lastAccessed.getTime() / 1000),
				Math.floor(fullMemory.createdAt.getTime() / 1000),
				fullMemory.expiresAt ? Math.floor(fullMemory.expiresAt.getTime() / 1000) : null,
			],
		)

		return id
	}

	/**
	 * Get a specific memory by ID
	 */
	async getMemory(id: string): Promise<UserMemory | null> {
		const db = this.databaseManager.getDatabase()
		const result = await db.get("SELECT * FROM user_memory WHERE id = ?", [id])

		if (!result) return null

		// Update access count and last accessed
		await db.run("UPDATE user_memory SET access_count = access_count + 1, last_accessed = ? WHERE id = ?", [
			Math.floor(Date.now() / 1000),
			id,
		])

		return this.mapDbRowToMemory(result)
	}

	/**
	 * Update an existing memory
	 */
	async updateMemory(id: string, updates: Partial<UserMemory>): Promise<void> {
		const db = this.databaseManager.getDatabase()
		const setClause = []
		const values = []

		if (updates.type !== undefined) {
			setClause.push("type = ?")
			values.push(updates.type)
		}
		if (updates.content !== undefined) {
			setClause.push("content = ?")
			values.push(JSON.stringify(updates.content))
		}
		if (updates.context !== undefined) {
			setClause.push("context = ?")
			values.push(JSON.stringify(updates.context))
		}
		if (updates.importance !== undefined) {
			setClause.push("importance = ?")
			values.push(updates.importance)
		}
		if (updates.expiresAt !== undefined) {
			setClause.push("expires_at = ?")
			values.push(updates.expiresAt ? Math.floor(updates.expiresAt.getTime() / 1000) : null)
		}

		if (setClause.length === 0) return

		values.push(id)
		await db.run(`UPDATE user_memory SET ${setClause.join(", ")} WHERE id = ?`, values)
	}

	/**
	 * Delete a memory
	 */
	async deleteMemory(id: string): Promise<void> {
		const db = this.databaseManager.getDatabase()
		await db.run("DELETE FROM user_memory WHERE id = ?", [id])
	}

	/**
	 * Get memories by type
	 */
	async getMemoriesByType(type: MemoryType): Promise<UserMemory[]> {
		const db = this.databaseManager.getDatabase()
		const results = await db.all(
			"SELECT * FROM user_memory WHERE user_id = ? AND type = ? ORDER BY created_at DESC",
			[this.config.userId, type],
		)

		return results.map((row) => this.mapDbRowToMemory(row))
	}

	/**
	 * Get memories by context
	 */
	async getMemoriesByContext(contextQuery: string): Promise<UserMemory[]> {
		const db = this.databaseManager.getDatabase()
		const results = await db.all(
			`SELECT * FROM user_memory 
             WHERE user_id = ? AND context LIKE ? 
             ORDER BY created_at DESC`,
			[this.config.userId, `%${contextQuery}%`],
		)

		return results.map((row) => this.mapDbRowToMemory(row))
	}

	/**
	 * Search memories
	 */
	async searchMemories(query: string): Promise<UserMemory[]> {
		const db = this.databaseManager.getDatabase()
		const results = await db.all(
			`SELECT * FROM user_memory 
             WHERE user_id = ? AND (
                 content LIKE ? OR 
                 context LIKE ?
             )
             ORDER BY 
                 CASE 
                     WHEN content LIKE ? THEN 1
                     WHEN context LIKE ? THEN 2
                     ELSE 3
                 END,
                 created_at DESC`,
			[this.config.userId, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`],
		)

		return results.map((row) => this.mapDbRowToMemory(row))
	}

	/**
	 * Clean up expired memories
	 */
	async cleanupExpiredMemories(): Promise<number> {
		return await this.databaseManager.cleanupExpiredMemories()
	}

	/**
	 * Get memory statistics
	 */
	async getMemoryStats(): Promise<MemoryStats> {
		const db = this.databaseManager.getDatabase()

		// Get total count
		const totalResult = await db.get("SELECT COUNT(*) as count FROM user_memory WHERE user_id = ?", [
			this.config.userId,
		])

		// Get counts by type
		const typeResults = await db.all(
			"SELECT type, COUNT(*) as count FROM user_memory WHERE user_id = ? GROUP BY type",
			[this.config.userId],
		)

		// Get average importance
		const importanceResult = await db.get(
			"SELECT AVG(importance) as avg_importance FROM user_memory WHERE user_id = ?",
			[this.config.userId],
		)

		// Get oldest and newest
		const dateResult = await db.get(
			"SELECT MIN(created_at) as oldest, MAX(created_at) as newest FROM user_memory WHERE user_id = ?",
			[this.config.userId],
		)

		// Get database size
		const dbStats = await this.databaseManager.getStats()

		const memoriesByType: Record<MemoryType, number> = {
			conversation: 0,
			pattern: 0,
			preference: 0,
			feedback: 0,
			insight: 0,
		}

		typeResults.forEach((row) => {
			if (row.type in memoriesByType) {
				memoriesByType[row.type as MemoryType] = row.count
			}
		})

		return {
			totalMemories: totalResult?.count || 0,
			memoriesByType,
			averageImportance: importanceResult?.avg_importance || 0,
			oldestMemory: new Date((dateResult?.oldest || 0) * 1000),
			newestMemory: new Date((dateResult?.newest || 0) * 1000),
			databaseSize: dbStats.databaseSize,
		}
	}

	/**
	 * Learn from user interaction
	 */
	async learnFromInteraction(interaction: UserInteraction): Promise<void> {
		// Extract patterns and preferences from interactions
		const memory = this.createMemoryFromInteraction(interaction)
		if (memory) {
			await this.storeMemory(memory)
		}
	}

	/**
	 * Get suggestions based on context
	 */
	async getSuggestions(context: SuggestionContext): Promise<Suggestion[]> {
		const suggestions: Suggestion[] = []

		// Get relevant memories for context
		const relevantMemories = await this.getRelevantMemories(context)

		// Generate suggestions based on patterns
		for (const memory of relevantMemories) {
			const suggestion = this.generateSuggestionFromMemory(memory, context)
			if (suggestion) {
				suggestions.push(suggestion)
			}
		}

		// Sort by confidence and limit results
		return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
	}

	/**
	 * Get relevant memories for context
	 */
	private async getRelevantMemories(context: SuggestionContext): Promise<UserMemory[]> {
		const memories: UserMemory[] = []

		// Get pattern memories for current file type
		if (context.activeFile) {
			const fileExtension = context.activeFile.split(".").pop()
			const patternMemories = await this.getMemoriesByType("pattern")
			memories.push(...patternMemories.filter((m) => m.context?.activeFile?.endsWith(`.${fileExtension}`)))
		}

		// Get recent conversation memories
		const conversationMemories = await this.getMemoriesByType("conversation")
		memories.push(...conversationMemories.slice(0, 10))

		// Get preference memories
		const preferenceMemories = await this.getMemoriesByType("preference")
		memories.push(...preferenceMemories)

		return memories
	}

	/**
	 * Create memory from interaction
	 */
	private createMemoryFromInteraction(interaction: UserInteraction): Omit<UserMemory, "id" | "createdAt"> | null {
		switch (interaction.type) {
			case "query":
				return {
					userId: this.config.userId,
					sessionId: "current", // Would be actual session ID
					type: "conversation",
					content: {
						query: interaction.content,
						outcome: interaction.outcome,
					},
					context: interaction.context,
					importance: this.calculateImportance(interaction),
					accessCount: 0,
					lastAccessed: new Date(),
				}

			case "preference_change":
				return {
					userId: this.config.userId,
					sessionId: "current",
					type: "preference",
					content: interaction.content,
					context: interaction.context,
					importance: 8, // Preferences are important
					accessCount: 0,
					lastAccessed: new Date(),
				}

			case "feedback":
				return {
					userId: this.config.userId,
					sessionId: "current",
					type: "feedback",
					content: interaction.content,
					context: interaction.context,
					importance: this.calculateImportance(interaction),
					accessCount: 0,
					lastAccessed: new Date(),
				}

			default:
				return null
		}
	}

	/**
	 * Calculate importance based on interaction
	 */
	private calculateImportance(interaction: UserInteraction): number {
		let importance = 5 // Base importance

		// Higher importance for successful interactions
		if (interaction.outcome === "success") {
			importance += 2
		} else if (interaction.outcome === "error") {
			importance += 1 // Errors are also important to learn from
		}

		// Higher importance for complex content
		if (typeof interaction.content === "string" && interaction.content.length > 100) {
			importance += 1
		}

		return Math.min(importance, 10)
	}

	/**
	 * Generate suggestion from memory
	 */
	private generateSuggestionFromMemory(memory: UserMemory, context: SuggestionContext): Suggestion | null {
		switch (memory.type) {
			case "pattern":
				return {
					type: "pattern_match",
					content: `Based on your previous patterns: ${memory.content.description}`,
					confidence: memory.importance / 10,
					source: "pattern_memory",
					metadata: { memoryId: memory.id },
				}

			case "preference":
				return {
					type: "context_help",
					content: `Your preference: ${memory.content.description}`,
					confidence: 0.9,
					source: "preference_memory",
					metadata: { memoryId: memory.id },
				}

			case "conversation":
				return {
					type: "resource_recommendation",
					content: `Previous relevant query: ${memory.content.query}`,
					confidence: 0.7,
					source: "conversation_memory",
					metadata: { memoryId: memory.id },
				}

			default:
				return null
		}
	}

	/**
	 * Map database row to UserMemory object
	 */
	private mapDbRowToMemory(row: any): UserMemory {
		return {
			id: row.id,
			userId: row.user_id,
			sessionId: row.session_id,
			type: row.type as MemoryType,
			content: JSON.parse(row.content),
			context: row.context ? JSON.parse(row.context) : undefined,
			importance: row.importance,
			accessCount: row.access_count,
			lastAccessed: new Date(row.last_accessed * 1000),
			createdAt: new Date(row.created_at * 1000),
			expiresAt: row.expires_at ? new Date(row.expires_at * 1000) : undefined,
		}
	}

	/**
	 * Dispose of resources
	 */
	async dispose(): Promise<void> {
		await this.databaseManager.close()
	}
}
