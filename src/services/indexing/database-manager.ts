// kilocode_change - new file

import sqlite3 from "sqlite3"
import { open, Database } from "sqlite"
import * as path from "path"
import * as fs from "fs"

export interface DatabaseConfig {
	workspacePath: string
	dataDirectory: string
}

/**
 * Database manager for indexing, memory, and analytics features
 * Extends existing Kilo Code database infrastructure
 */
export class DatabaseManager {
	private db: Database | null = null
	private readonly config: DatabaseConfig
	private readonly dbPath: string

	constructor(config: DatabaseConfig) {
		this.config = config
		// Create database path in workspace .kilocode directory
		const kilocodeDir = path.join(config.workspacePath, ".kilocode")
		if (!fs.existsSync(kilocodeDir)) {
			fs.mkdirSync(kilocodeDir, { recursive: true })
		}
		this.dbPath = path.join(kilocodeDir, "indexing-memory.db")
	}

	/**
	 * Initialize database connection and create schema
	 */
	async initialize(): Promise<void> {
		this.db = await open({
			filename: this.dbPath,
			driver: sqlite3.Database,
		})

		await this.createSchema()
		await this.createIndexes()
	}

	/**
	 * Create database schema for indexing, memory, and analytics
	 */
	private async createSchema(): Promise<void> {
		if (!this.db) throw new Error("Database not initialized")

		// Code indexing tables
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS code_index (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                name TEXT NOT NULL,
                file_path TEXT NOT NULL,
                line_number INTEGER,
                signature TEXT,
                content TEXT,
                language TEXT,
                dependencies TEXT,
                tags TEXT,
                hash TEXT,
                last_modified INTEGER,
                indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `)

		// User memory tables
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS user_memory (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                session_id TEXT,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT,
                importance INTEGER DEFAULT 5,
                access_count INTEGER DEFAULT 0,
                last_accessed INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                expires_at INTEGER
            )
        `)

		// Search queries table
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS search_queries (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                query_text TEXT NOT NULL,
                processed_query TEXT,
                filters TEXT,
                search_type TEXT NOT NULL,
                context TEXT,
                execution_time INTEGER,
                timestamp INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `)

		// Search results table
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS search_results (
                id TEXT PRIMARY KEY,
                query_id TEXT NOT NULL,
                element_id TEXT NOT NULL,
                relevance_score REAL,
                match_type TEXT,
                matched_content TEXT,
                relationships TEXT,
                highlights TEXT,
                rank INTEGER,
                FOREIGN KEY (query_id) REFERENCES search_queries(id)
            )
        `)

		// Analytics data table
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS analytics_data (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                metric_type TEXT NOT NULL,
                data TEXT NOT NULL,
                period TEXT NOT NULL,
                computed_at INTEGER DEFAULT (strftime('%s', 'now')),
                version TEXT DEFAULT '1.0'
            )
        `)

		// Memory relationships table
		await this.db.exec(`
            CREATE TABLE IF NOT EXISTS memory_relationships (
                id TEXT PRIMARY KEY,
                source_memory_id TEXT NOT NULL,
                target_memory_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                strength REAL DEFAULT 1.0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (source_memory_id) REFERENCES user_memory(id),
                FOREIGN KEY (target_memory_id) REFERENCES user_memory(id)
            )
        `)
	}

	/**
	 * Create database indexes for optimal performance
	 */
	private async createIndexes(): Promise<void> {
		if (!this.db) throw new Error("Database not initialized")

		// Code index indexes
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_code_index_file_path ON code_index(file_path)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_code_index_type_name ON code_index(type, name)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_code_index_hash ON code_index(hash)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_code_index_last_modified ON code_index(last_modified)")

		// User memory indexes
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_user_memory_user_id ON user_memory(user_id)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_user_memory_type ON user_memory(type)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_user_memory_importance ON user_memory(importance)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_user_memory_expires_at ON user_memory(expires_at)")

		// Search queries indexes
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_search_queries_user_id ON search_queries(user_id)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_search_queries_timestamp ON search_queries(timestamp)")

		// Search results indexes
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_search_results_query_id ON search_results(query_id)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_search_results_element_id ON search_results(element_id)")
		await this.db.exec(
			"CREATE INDEX IF NOT EXISTS idx_search_results_relevance_score ON search_results(relevance_score)",
		)

		// Analytics indexes
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_analytics_user_id ON analytics_data(user_id)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_analytics_metric_type ON analytics_data(metric_type)")
		await this.db.exec("CREATE INDEX IF NOT EXISTS idx_analytics_period ON analytics_data(period)")

		// Memory relationships indexes
		await this.db.exec(
			"CREATE INDEX IF NOT EXISTS idx_memory_relationships_source ON memory_relationships(source_memory_id)",
		)
		await this.db.exec(
			"CREATE INDEX IF NOT EXISTS idx_memory_relationships_target ON memory_relationships(target_memory_id)",
		)
		await this.db.exec(
			"CREATE INDEX IF NOT EXISTS idx_memory_relationships_type ON memory_relationships(relationship_type)",
		)
	}

	/**
	 * Get database instance for direct access
	 */
	getDatabase(): Database {
		if (!this.db) throw new Error("Database not initialized")
		return this.db
	}

	/**
	 * Close database connection
	 */
	async close(): Promise<void> {
		if (this.db) {
			await this.db.close()
			this.db = null
		}
	}

	/**
	 * Get database statistics
	 */
	async getStats(): Promise<{
		codeIndexCount: number
		memoryCount: number
		searchQueryCount: number
		analyticsCount: number
		databaseSize: number
	}> {
		if (!this.db) throw new Error("Database not initialized")

		const [codeIndexCount, memoryCount, searchQueryCount, analyticsCount] = await Promise.all([
			this.db.get("SELECT COUNT(*) as count FROM code_index"),
			this.db.get("SELECT COUNT(*) as count FROM user_memory"),
			this.db.get("SELECT COUNT(*) as count FROM search_queries"),
			this.db.get("SELECT COUNT(*) as count FROM analytics_data"),
		])

		const stats = fs.statSync(this.dbPath)

		return {
			codeIndexCount: codeIndexCount.count,
			memoryCount: memoryCount.count,
			searchQueryCount: searchQueryCount.count,
			analyticsCount: analyticsCount.count,
			databaseSize: stats.size,
		}
	}

	/**
	 * Cleanup expired memories
	 */
	async cleanupExpiredMemories(): Promise<number> {
		if (!this.db) throw new Error("Database not initialized")

		const result = await this.db.run("DELETE FROM user_memory WHERE expires_at IS NOT NULL AND expires_at < ?", [
			Math.floor(Date.now() / 1000),
		])

		return result.changes || 0
	}

	/**
	 * Vacuum database to optimize storage
	 */
	async vacuum(): Promise<void> {
		if (!this.db) throw new Error("Database not initialized")
		await this.db.exec("VACUUM")
	}
}
