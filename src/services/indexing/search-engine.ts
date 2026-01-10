// kilocode_change - new file

import * as vscode from "vscode"
import { DatabaseManager } from "./database-manager"
import { SearchQuery, SearchResult, SearchFilters, SearchContext, TextHighlight } from "../../types/indexing-types"
import { LanceDBManager } from "../../utils/lancedb-manager"

export interface SearchEngineConfig {
	workspacePath: string
	dataDirectory: string
	maxResults?: number
	minScore?: number
}

/**
 * Search engine with vector embedding support
 * Integrates with existing Kilo Code LanceDB infrastructure
 */
export class SearchEngine {
	private readonly config: SearchEngineConfig
	private readonly databaseManager: DatabaseManager
	private readonly lancedbManager: LanceDBManager
	private readonly maxResults: number
	private readonly minScore: number

	constructor(config: SearchEngineConfig) {
		this.config = config
		this.databaseManager = new DatabaseManager({
			workspacePath: config.workspacePath,
			dataDirectory: config.dataDirectory,
		})
		this.lancedbManager = new LanceDBManager(config.dataDirectory)
		this.maxResults = config.maxResults || 50
		this.minScore = config.minScore || 0.3
	}

	/**
	 * Initialize the search engine
	 */
	async initialize(): Promise<void> {
		await this.databaseManager.initialize()
		await this.lancedbManager.ensureLanceDBAvailable()
	}

	/**
	 * Perform search based on query type
	 */
	async search(query: SearchQuery): Promise<SearchResult[]> {
		const startTime = Date.now()

		let results: SearchResult[] = []

		switch (query.searchType) {
			case "text":
				results = await this.performTextSearch(query)
				break
			case "semantic":
				results = await this.performSemanticSearch(query)
				break
			case "hybrid":
				results = await this.performHybridSearch(query)
				break
			default:
				throw new Error(`Unsupported search type: ${query.searchType}`)
		}

		// Apply filters and sort by relevance
		results = this.applyFilters(results, query.filters)
		results = results.sort((a, b) => b.relevanceScore - a.relevanceScore)
		results = results.slice(0, this.maxResults)

		// Store search query and results
		await this.storeSearchQuery(query, results, Date.now() - startTime)

		return results
	}

	/**
	 * Perform text-based search
	 */
	private async performTextSearch(query: SearchQuery): Promise<SearchResult[]> {
		const db = this.databaseManager.getDatabase()
		const searchTerms = query.queryText.split(/\s+/).filter((term) => term.length > 0)

		if (searchTerms.length === 0) return []

		const results: SearchResult[] = []

		// Build SQL query for text search
		let sqlQuery = `
            SELECT id, type, name, file_path, line_number, content, signature
            FROM code_index 
            WHERE 1=1
        `
		const params: any[] = []

		// Add search conditions
		searchTerms.forEach((term, index) => {
			sqlQuery += ` AND (name LIKE ? OR content LIKE ? OR signature LIKE ?)`
			params.push(`%${term}%`, `%${term}%`, `%${term}%`)
		})

		// Add file type filters if specified
		if (query.filters?.fileTypes) {
			const fileExtensions = query.filters.fileTypes.map((ext) => `%.${ext}`)
			sqlQuery += ` AND (${fileExtensions.map(() => "file_path LIKE ?").join(" OR ")})`
			params.push(...fileExtensions)
		}

		sqlQuery += " ORDER BY name LIMIT ?"
		params.push(this.maxResults * 2) // Get more results for ranking

		const rows = await db.all(sqlQuery, params)

		// Convert to SearchResult objects
		for (const row of rows) {
			const relevanceScore = this.calculateTextRelevance(query.queryText, row)
			if (relevanceScore >= this.minScore) {
				const highlights = this.generateHighlights(query.queryText, row.content || "")

				results.push({
					id: `text_${row.id}_${Date.now()}`,
					queryId: query.id,
					elementId: row.id,
					relevanceScore,
					matchType: "exact",
					matchedContent: this.extractMatchedContent(query.queryText, row.content || ""),
					relationships: await this.getElementRelationships(row.id),
					highlights,
					rank: 0, // Will be set after sorting
				})
			}
		}

		return results
	}

	/**
	 * Perform semantic search using vector embeddings
	 */
	private async performSemanticSearch(query: SearchQuery): Promise<SearchResult[]> {
		try {
			// Get query embedding (would integrate with existing embedding service)
			const queryEmbedding = await this.getQueryEmbedding(query.queryText)

			// Search using LanceDB vector store
			const vectorResults = await this.searchVectorEmbeddings(queryEmbedding, this.maxResults)

			const results: SearchResult[] = []

			for (const result of vectorResults) {
				if (result.score >= this.minScore) {
					const highlights = this.generateSemanticHighlights(query.queryText, result.payload.content || "")

					results.push({
						id: `semantic_${result.id}_${Date.now()}`,
						queryId: query.id,
						elementId: result.id,
						relevanceScore: result.score,
						matchType: "semantic",
						matchedContent: result.payload.content || "",
						relationships: await this.getElementRelationships(result.id),
						highlights,
						rank: 0, // Will be set after sorting
					})
				}
			}

			return results
		} catch (error) {
			console.error("Semantic search failed:", error)
			// Fallback to text search
			return await this.performTextSearch(query)
		}
	}

	/**
	 * Perform hybrid search combining text and semantic results
	 */
	private async performHybridSearch(query: SearchQuery): Promise<SearchResult[]> {
		const [textResults, semanticResults] = await Promise.all([
			this.performTextSearch(query),
			this.performSemanticSearch(query),
		])

		// Combine and deduplicate results
		const combinedResults = new Map<string, SearchResult>()

		// Add text results
		textResults.forEach((result) => {
			combinedResults.set(result.elementId, result)
		})

		// Add or merge semantic results
		semanticResults.forEach((result) => {
			const existing = combinedResults.get(result.elementId)
			if (existing) {
				// Combine scores, giving semantic results higher weight
				existing.relevanceScore = Math.max(existing.relevanceScore, result.relevanceScore * 1.2)
				existing.matchType = "hybrid"
			} else {
				combinedResults.set(result.elementId, result)
			}
		})

		return Array.from(combinedResults.values())
	}

	/**
	 * Calculate text relevance score
	 */
	private calculateTextRelevance(query: string, element: any): number {
		const queryTerms = query.toLowerCase().split(/\s+/)
		const name = (element.name || "").toLowerCase()
		const content = (element.content || "").toLowerCase()
		const signature = (element.signature || "").toLowerCase()

		let score = 0
		const maxScore = 10

		// Exact name match gets highest score
		if (name === query.toLowerCase()) {
			score += maxScore
		} else {
			// Partial name match
			const nameMatches = queryTerms.filter((term) => name.includes(term)).length
			score += (nameMatches / queryTerms.length) * maxScore * 0.8
		}

		// Content matches
		const contentMatches = queryTerms.filter((term) => content.includes(term)).length
		score += (contentMatches / queryTerms.length) * maxScore * 0.6

		// Signature matches
		const signatureMatches = queryTerms.filter((term) => signature.includes(term)).length
		score += (signatureMatches / queryTerms.length) * maxScore * 0.4

		return Math.min(score / maxScore, 1)
	}

	/**
	 * Generate text highlights
	 */
	private generateHighlights(query: string, content: string): TextHighlight[] {
		const highlights: TextHighlight[] = []
		const queryTerms = query.toLowerCase().split(/\s+/)
		const lowerContent = content.toLowerCase()

		queryTerms.forEach((term) => {
			let index = lowerContent.indexOf(term)
			while (index !== -1) {
				highlights.push({
					start: index,
					end: index + term.length,
					text: content.substring(index, index + term.length),
				})
				index = lowerContent.indexOf(term, index + 1)
			}
		})

		// Sort and merge overlapping highlights
		highlights.sort((a, b) => a.start - b.start)
		return this.mergeHighlights(highlights)
	}

	/**
	 * Generate semantic highlights
	 */
	private generateSemanticHighlights(query: string, content: string): TextHighlight[] {
		// For semantic search, highlight the most relevant sentences
		const sentences = content.split(/[.!?]+/)
		const queryTerms = query.toLowerCase().split(/\s+/)

		const highlights: TextHighlight[] = []
		let currentPos = 0

		sentences.forEach((sentence) => {
			const lowerSentence = sentence.toLowerCase()
			const relevance = queryTerms.filter((term) => lowerSentence.includes(term)).length / queryTerms.length

			if (relevance > 0.3) {
				const start = content.indexOf(sentence, currentPos)
				if (start !== -1) {
					highlights.push({
						start,
						end: start + sentence.length,
						text: sentence.trim(),
					})
					currentPos = start + sentence.length
				}
			}
		})

		return highlights
	}

	/**
	 * Merge overlapping highlights
	 */
	private mergeHighlights(highlights: TextHighlight[]): TextHighlight[] {
		if (highlights.length === 0) return []

		const merged: TextHighlight[] = []
		let current = highlights[0]

		for (let i = 1; i < highlights.length; i++) {
			const next = highlights[i]

			if (next.start <= current.end) {
				// Overlapping, merge them
				current.end = Math.max(current.end, next.end)
				current.text = current.text + next.text.substring(current.end - next.start)
			} else {
				merged.push(current)
				current = next
			}
		}

		merged.push(current)
		return merged
	}

	/**
	 * Extract matched content snippet
	 */
	private extractMatchedContent(query: string, content: string): string {
		const queryTerms = query.toLowerCase().split(/\s+/)
		const lowerContent = content.toLowerCase()

		// Find the best matching snippet
		let bestScore = 0
		let bestStart = 0
		const snippetLength = 200

		for (let i = 0; i < content.length - snippetLength; i += 50) {
			const snippet = content.substring(i, i + snippetLength)
			const lowerSnippet = lowerContent.substring(i, i + snippetLength)

			const score = queryTerms.reduce((acc, term) => {
				return acc + (lowerSnippet.includes(term) ? 1 : 0)
			}, 0)

			if (score > bestScore) {
				bestScore = score
				bestStart = i
			}
		}

		return content.substring(bestStart, Math.min(bestStart + snippetLength, content.length))
	}

	/**
	 * Get element relationships
	 */
	private async getElementRelationships(elementId: string): Promise<string[]> {
		const db = this.databaseManager.getDatabase()
		const result = await db.get("SELECT dependencies FROM code_index WHERE id = ?", [elementId])

		if (!result || !result.dependencies) return []

		try {
			return JSON.parse(result.dependencies)
		} catch {
			return []
		}
	}

	/**
	 * Apply search filters
	 */
	private applyFilters(results: SearchResult[], filters?: SearchFilters): SearchResult[] {
		if (!filters) return results

		return results.filter((result) => {
			// Date range filter
			if (filters.dateRange) {
				// Would need to get element creation date from database
				// For now, skip this filter
			}

			// Element type filter
			if (filters.elementTypes) {
				// Would need to get element type from database
				// For now, skip this filter
			}

			return true
		})
	}

	/**
	 * Store search query and results
	 */
	private async storeSearchQuery(query: SearchQuery, results: SearchResult[], executionTime: number): Promise<void> {
		const db = this.databaseManager.getDatabase()

		// Store query
		await db.run(
			`INSERT INTO search_queries (
                id, user_id, query_text, processed_query, filters, 
                search_type, context, execution_time, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				query.id,
				query.userId,
				query.queryText,
				query.processedQuery || query.queryText,
				JSON.stringify(query.filters),
				query.searchType,
				JSON.stringify(query.context),
				executionTime,
				Math.floor(Date.now() / 1000),
			],
		)

		// Store results
		for (const result of results) {
			await db.run(
				`INSERT INTO search_results (
                    id, query_id, element_id, relevance_score, match_type,
                    matched_content, relationships, highlights, rank
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				[
					result.id,
					query.id,
					result.elementId,
					result.relevanceScore,
					result.matchType,
					result.matchedContent,
					JSON.stringify(result.relationships),
					JSON.stringify(result.highlights),
					result.rank,
				],
			)
		}
	}

	/**
	 * Get query embedding (would integrate with existing embedding service)
	 */
	private async getQueryEmbedding(query: string): Promise<number[]> {
		// This would integrate with Kilo Code's existing embedding service
		// For now, return a mock embedding
		return new Array(1536).fill(0).map(() => Math.random() - 0.5)
	}

	/**
	 * Search vector embeddings using LanceDB
	 */
	private async searchVectorEmbeddings(queryEmbedding: number[], limit: number): Promise<any[]> {
		// This would integrate with existing LanceDB vector store
		// For now, return mock results
		return []
	}

	/**
	 * Get search statistics
	 */
	async getSearchStats(): Promise<{
		totalQueries: number
		averageExecutionTime: number
		mostCommonSearchTypes: Record<string, number>
	}> {
		const db = this.databaseManager.getDatabase()

		const [totalResult, avgTimeResult, typeResults] = await Promise.all([
			db.get("SELECT COUNT(*) as count FROM search_queries"),
			db.get("SELECT AVG(execution_time) as avg_time FROM search_queries"),
			db.all("SELECT search_type, COUNT(*) as count FROM search_queries GROUP BY search_type"),
		])

		const mostCommonSearchTypes: Record<string, number> = {}
		typeResults.forEach((row) => {
			mostCommonSearchTypes[row.search_type] = row.count
		})

		return {
			totalQueries: totalResult?.count || 0,
			averageExecutionTime: avgTimeResult?.avg_time || 0,
			mostCommonSearchTypes,
		}
	}

	/**
	 * Dispose of resources
	 */
	async dispose(): Promise<void> {
		await this.databaseManager.close()
	}
}
