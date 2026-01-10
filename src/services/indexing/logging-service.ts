// kilocode_change - new file

import * as fs from "fs"
import * as path from "path"
import { ErrorHandler, ErrorSeverity, ErrorCategory } from "./error-handler"

export enum LogLevel {
	DEBUG = 0,
	INFO = 1,
	WARN = 2,
	ERROR = 3,
	FATAL = 4,
}

export interface LogEntry {
	timestamp: string
	level: LogLevel
	category: string
	message: string
	data?: any
	userId?: string
	workspacePath?: string
	sessionId?: string
}

export interface LoggingConfig {
	level: LogLevel
	enableFileLogging: boolean
	enableConsoleLogging: boolean
	logDirectory: string
	maxFileSize: number // bytes
	maxFiles: number
	enableStructuredLogging: boolean
}

/**
 * Logging service for indexing and memory operations
 */
export class LoggingService {
	private static instance: LoggingService
	private config: LoggingConfig
	private logFilePath: string

	private constructor(config: LoggingConfig) {
		this.config = config
		this.logFilePath = path.join(config.logDirectory, "indexing-memory.log")
		this.ensureLogDirectory()
	}

	static getInstance(config?: LoggingConfig): LoggingService {
		if (!LoggingService.instance) {
			const defaultConfig: LoggingConfig = {
				level: LogLevel.INFO,
				enableFileLogging: true,
				enableConsoleLogging: true,
				logDirectory: path.join(process.cwd(), ".kilocode", "logs"),
				maxFileSize: 10 * 1024 * 1024, // 10MB
				maxFiles: 5,
				enableStructuredLogging: true,
			}
			LoggingService.instance = new LoggingService(config || defaultConfig)
		}
		return LoggingService.instance
	}

	/**
	 * Log debug message
	 */
	debug(message: string, data?: any, context?: any): void {
		this.log(LogLevel.DEBUG, "DEBUG", message, data, context)
	}

	/**
	 * Log info message
	 */
	info(message: string, data?: any, context?: any): void {
		this.log(LogLevel.INFO, "INFO", message, data, context)
	}

	/**
	 * Log warning message
	 */
	warn(message: string, data?: any, context?: any): void {
		this.log(LogLevel.WARN, "WARN", message, data, context)
	}

	/**
	 * Log error message
	 */
	error(message: string, data?: any, context?: any): void {
		this.log(LogLevel.ERROR, "ERROR", message, data, context)
	}

	/**
	 * Log fatal message
	 */
	fatal(message: string, data?: any, context?: any): void {
		this.log(LogLevel.FATAL, "FATAL", message, data, context)
	}

	/**
	 * Log indexing operation
	 */
	logIndexing(operation: string, filePath: string, elementsCount: number, duration: number, context?: any): void {
		this.info(
			`Indexing: ${operation}`,
			{
				filePath,
				elementsCount,
				duration,
				operation,
			},
			context,
		)
	}

	/**
	 * Log search operation
	 */
	logSearch(query: string, resultsCount: number, duration: number, searchType: string, context?: any): void {
		this.info(
			`Search: ${searchType}`,
			{
				query,
				resultsCount,
				duration,
				searchType,
			},
			context,
		)
	}

	/**
	 * Log memory operation
	 */
	logMemory(operation: string, memoryType: string, memoryId?: string, context?: any): void {
		this.info(
			`Memory: ${operation}`,
			{
				operation,
				memoryType,
				memoryId,
			},
			context,
		)
	}

	/**
	 * Log performance metrics
	 */
	logPerformance(operation: string, metrics: Record<string, number>, context?: any): void {
		this.info(`Performance: ${operation}`, metrics, context)
	}

	/**
	 * Log user interaction
	 */
	logUserInteraction(action: string, feature: string, context?: any): void {
		this.info(
			`User: ${action}`,
			{
				action,
				feature,
			},
			context,
		)
	}

	/**
	 * Core logging method
	 */
	private log(level: LogLevel, category: string, message: string, data?: any, context?: any): void {
		if (level < this.config.level) {
			return
		}

		const logEntry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			category,
			message,
			data,
			userId: context?.userId,
			workspacePath: context?.workspacePath,
			sessionId: context?.sessionId,
		}

		// Console logging
		if (this.config.enableConsoleLogging) {
			this.logToConsole(logEntry)
		}

		// File logging
		if (this.config.enableFileLogging) {
			this.logToFile(logEntry)
		}
	}

	/**
	 * Log to console
	 */
	private logToConsole(entry: LogEntry): void {
		const timestamp = entry.timestamp
		const levelStr = LogLevel[entry.level].padEnd(5)
		const categoryStr = entry.category.padEnd(8)
		const message = `${timestamp} [${levelStr}] [${categoryStr}] ${entry.message}`

		switch (entry.level) {
			case LogLevel.DEBUG:
				console.debug(message, entry.data || "")
				break
			case LogLevel.INFO:
				console.info(message, entry.data || "")
				break
			case LogLevel.WARN:
				console.warn(message, entry.data || "")
				break
			case LogLevel.ERROR:
			case LogLevel.FATAL:
				console.error(message, entry.data || "")
				break
		}
	}

	/**
	 * Log to file
	 */
	private async logToFile(entry: LogEntry): Promise<void> {
		try {
			// Check file size and rotate if necessary
			await this.rotateLogFileIfNeeded()

			// Format log entry
			let logLine: string
			if (this.config.enableStructuredLogging) {
				logLine = JSON.stringify(entry) + "\n"
			} else {
				const timestamp = entry.timestamp
				const levelStr = LogLevel[entry.level].padEnd(5)
				const categoryStr = entry.category.padEnd(8)
				logLine = `${timestamp} [${levelStr}] [${categoryStr}] ${entry.message}`

				if (entry.data) {
					logLine += ` | ${JSON.stringify(entry.data)}`
				}

				if (entry.userId || entry.workspacePath || entry.sessionId) {
					logLine += ` | Context: ${JSON.stringify({
						userId: entry.userId,
						workspacePath: entry.workspacePath,
						sessionId: entry.sessionId,
					})}`
				}

				logLine += "\n"
			}

			// Write to file
			await fs.promises.appendFile(this.logFilePath, logLine, "utf8")
		} catch (error) {
			console.error("Failed to write to log file:", error)
		}
	}

	/**
	 * Rotate log file if it exceeds size limit
	 */
	private async rotateLogFileIfNeeded(): Promise<void> {
		try {
			const stats = await fs.promises.stat(this.logFilePath)

			if (stats.size >= this.config.maxFileSize) {
				// Rotate files
				for (let i = this.config.maxFiles - 1; i > 0; i--) {
					const oldFile = `${this.logFilePath}.${i}`
					const newFile = `${this.logFilePath}.${i + 1}`

					try {
						await fs.promises.rename(oldFile, newFile)
					} catch (error) {
						// File might not exist, that's okay
					}
				}

				// Move current file to .1
				await fs.promises.rename(this.logFilePath, `${this.logFilePath}.1`)
			}
		} catch (error) {
			// File might not exist yet, that's okay
		}
	}

	/**
	 * Ensure log directory exists
	 */
	private ensureLogDirectory(): void {
		if (!fs.existsSync(this.config.logDirectory)) {
			fs.mkdirSync(this.config.logDirectory, { recursive: true })
		}
	}

	/**
	 * Update logging configuration
	 */
	updateConfig(config: Partial<LoggingConfig>): void {
		this.config = { ...this.config, ...config }
		if (config.logDirectory) {
			this.logFilePath = path.join(config.logDirectory, "indexing-memory.log")
			this.ensureLogDirectory()
		}
	}

	/**
	 * Get log file path
	 */
	getLogFilePath(): string {
		return this.logFilePath
	}

	/**
	 * Clear log files
	 */
	async clearLogs(): Promise<void> {
		try {
			// Remove current log file
			if (fs.existsSync(this.logFilePath)) {
				await fs.promises.unlink(this.logFilePath)
			}

			// Remove rotated log files
			for (let i = 1; i <= this.config.maxFiles; i++) {
				const rotatedFile = `${this.logFilePath}.${i}`
				if (fs.existsSync(rotatedFile)) {
					await fs.promises.unlink(rotatedFile)
				}
			}
		} catch (error) {
			console.error("Failed to clear logs:", error)
		}
	}

	/**
	 * Get log statistics
	 */
	async getLogStats(): Promise<{
		fileSize: number
		fileCount: number
		totalEntries: number
		entriesByLevel: Record<string, number>
	}> {
		const stats = {
			fileSize: 0,
			fileCount: 0,
			totalEntries: 0,
			entriesByLevel: {} as Record<string, number>,
		}

		try {
			// Check main log file
			if (fs.existsSync(this.logFilePath)) {
				const fileStats = await fs.promises.stat(this.logFilePath)
				stats.fileSize += fileStats.size
				stats.fileCount++

				// Count entries (simplified - would need proper parsing for accuracy)
				const content = await fs.promises.readFile(this.logFilePath, "utf8")
				stats.totalEntries += content.split("\n").length
			}

			// Check rotated files
			for (let i = 1; i <= this.config.maxFiles; i++) {
				const rotatedFile = `${this.logFilePath}.${i}`
				if (fs.existsSync(rotatedFile)) {
					const fileStats = await fs.promises.stat(rotatedFile)
					stats.fileSize += fileStats.size
					stats.fileCount++
				}
			}
		} catch (error) {
			console.error("Failed to get log stats:", error)
		}

		return stats
	}
}

/**
 * Global logging instance
 */
export const logger = LoggingService.getInstance()

/**
 * Utility function for logging with error handling integration
 */
export function logAndHandleError(
	error: Error,
	context: any,
	severity: ErrorSeverity = ErrorSeverity.MEDIUM,
	category: ErrorCategory = ErrorCategory.SYSTEM,
): void {
	// Log the error
	logger.error(
		`Error in ${context.operation}: ${error.message}`,
		{
			error: error.message,
			stack: error.stack,
			context,
		},
		context,
	)

	// Handle the error
	ErrorHandler.handleError(error, {
		operation: context.operation,
		userId: context.userId,
		workspacePath: context.workspacePath,
		filePath: context.filePath,
		additionalData: context,
	})
}
