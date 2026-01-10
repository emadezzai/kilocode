// kilocode_change - new file

import * as vscode from "vscode"

export enum ErrorSeverity {
	LOW = "low",
	MEDIUM = "medium",
	HIGH = "high",
	CRITICAL = "critical",
}

export enum ErrorCategory {
	DATABASE = "database",
	INDEXING = "indexing",
	SEARCH = "search",
	MEMORY = "memory",
	NETWORK = "network",
	VALIDATION = "validation",
	SYSTEM = "system",
}

export interface ErrorContext {
	operation: string
	userId?: string
	workspacePath?: string
	filePath?: string
	additionalData?: Record<string, any>
}

export interface ServiceError extends Error {
	code: string
	severity: ErrorSeverity
	category: ErrorCategory
	context?: ErrorContext
	timestamp: Date
	stack?: string
	originalError?: Error
}

export class IndexingError extends Error implements ServiceError {
	public readonly code: string
	public readonly severity: ErrorSeverity
	public readonly category: ErrorCategory
	public readonly context?: ErrorContext
	public readonly timestamp: Date
	public readonly originalError?: Error

	constructor(
		message: string,
		code: string,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		category: ErrorCategory = ErrorCategory.INDEXING,
		context?: ErrorContext,
		originalError?: Error,
	) {
		super(message)
		this.name = "IndexingError"
		this.code = code
		this.severity = severity
		this.category = category
		this.context = context
		this.timestamp = new Date()
		this.originalError = originalError

		// Maintain stack trace
		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, IndexingError)
		}
	}
}

export class DatabaseError extends Error implements ServiceError {
	public readonly code: string
	public readonly severity: ErrorSeverity
	public readonly category: ErrorCategory
	public readonly context?: ErrorContext
	public readonly timestamp: Date
	public readonly originalError?: Error

	constructor(
		message: string,
		code: string,
		severity: ErrorSeverity = ErrorSeverity.HIGH,
		category: ErrorCategory = ErrorCategory.DATABASE,
		context?: ErrorContext,
		originalError?: Error,
	) {
		super(message)
		this.name = "DatabaseError"
		this.code = code
		this.severity = severity
		this.category = category
		this.context = context
		this.timestamp = new Date()
		this.originalError = originalError

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, DatabaseError)
		}
	}
}

export class SearchError extends Error implements ServiceError {
	public readonly code: string
	public readonly severity: ErrorSeverity
	public readonly category: ErrorCategory
	public readonly context?: ErrorContext
	public readonly timestamp: Date
	public readonly originalError?: Error

	constructor(
		message: string,
		code: string,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		category: ErrorCategory = ErrorCategory.SEARCH,
		context?: ErrorContext,
		originalError?: Error,
	) {
		super(message)
		this.name = "SearchError"
		this.code = code
		this.severity = severity
		this.category = category
		this.context = context
		this.timestamp = new Date()
		this.originalError = originalError

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, SearchError)
		}
	}
}

export class MemoryError extends Error implements ServiceError {
	public readonly code: string
	public readonly severity: ErrorSeverity
	public readonly category: ErrorCategory
	public readonly context?: ErrorContext
	public readonly timestamp: Date
	public readonly originalError?: Error

	constructor(
		message: string,
		code: string,
		severity: ErrorSeverity = ErrorSeverity.MEDIUM,
		category: ErrorCategory = ErrorCategory.MEMORY,
		context?: ErrorContext,
		originalError?: Error,
	) {
		super(message)
		this.name = "MemoryError"
		this.code = code
		this.severity = severity
		this.category = category
		this.context = context
		this.timestamp = new Date()
		this.originalError = originalError

		if (Error.captureStackTrace) {
			Error.captureStackTrace(this, MemoryError)
		}
	}
}

/**
 * Error handler for indexing and memory services
 */
export class ErrorHandler {
	private static instance: ErrorHandler
	private errorCallbacks: Map<ErrorSeverity, ((error: ServiceError) => void)[]> = new Map()

	static getInstance(): ErrorHandler {
		if (!ErrorHandler.instance) {
			ErrorHandler.instance = new ErrorHandler()
		}
		return ErrorHandler.instance
	}

	/**
	 * Handle an error
	 */
	static async handleError(error: Error, context?: ErrorContext): Promise<void> {
		const handler = ErrorHandler.getInstance()
		await handler.processError(error, context)
	}

	/**
	 * Create and handle a service error
	 */
	static async createError(
		message: string,
		code: string,
		severity: ErrorSeverity,
		category: ErrorCategory,
		context?: ErrorContext,
		originalError?: Error,
	): Promise<void> {
		const error = new IndexingError(message, code, severity, category, context, originalError)
		await ErrorHandler.handleError(error, context)
	}

	/**
	 * Register error callback for specific severity
	 */
	static registerCallback(severity: ErrorSeverity, callback: (error: ServiceError) => void): void {
		const handler = ErrorHandler.getInstance()
		if (!handler.errorCallbacks.has(severity)) {
			handler.errorCallbacks.set(severity, [])
		}
		handler.errorCallbacks.get(severity)!.push(callback)
	}

	/**
	 * Process an error
	 */
	private async processError(error: Error, context?: ErrorContext): Promise<void> {
		const serviceError = this.wrapError(error, context)

		// Log the error
		await this.logError(serviceError)

		// Show user notification for high severity errors
		if (serviceError.severity === ErrorSeverity.HIGH || serviceError.severity === ErrorSeverity.CRITICAL) {
			this.showUserNotification(serviceError)
		}

		// Execute callbacks
		const callbacks = this.errorCallbacks.get(serviceError.severity) || []
		callbacks.forEach((callback) => {
			try {
				callback(serviceError)
			} catch (callbackError) {
				console.error("Error in error callback:", callbackError)
			}
		})
	}

	/**
	 * Wrap error in ServiceError if needed
	 */
	private wrapError(error: Error, context?: ErrorContext): ServiceError {
		if (this.isServiceError(error)) {
			return error
		}

		// Determine category based on error message or context
		let category = ErrorCategory.SYSTEM
		const message = error.message.toLowerCase()

		if (message.includes("database") || message.includes("sql")) {
			category = ErrorCategory.DATABASE
		} else if (message.includes("index") || message.includes("parse")) {
			category = ErrorCategory.INDEXING
		} else if (message.includes("search") || message.includes("query")) {
			category = ErrorCategory.SEARCH
		} else if (message.includes("memory") || message.includes("storage")) {
			category = ErrorCategory.MEMORY
		}

		return new IndexingError(error.message, "UNKNOWN_ERROR", ErrorSeverity.MEDIUM, category, context, error)
	}

	/**
	 * Check if error is already a ServiceError
	 */
	private isServiceError(error: Error): error is ServiceError {
		return (
			error instanceof IndexingError ||
			error instanceof DatabaseError ||
			error instanceof SearchError ||
			error instanceof MemoryError
		)
	}

	/**
	 * Log error to console and potentially external logging service
	 */
	private async logError(error: ServiceError): Promise<void> {
		const logEntry = {
			timestamp: error.timestamp.toISOString(),
			name: error.name,
			message: error.message,
			code: error.code,
			severity: error.severity,
			category: error.category,
			context: error.context,
			stack: error.stack,
		}

		// Log to console with appropriate level
		switch (error.severity) {
			case ErrorSeverity.LOW:
				console.info("Indexing Service Info:", logEntry)
				break
			case ErrorSeverity.MEDIUM:
				console.warn("Indexing Service Warning:", logEntry)
				break
			case ErrorSeverity.HIGH:
				console.error("Indexing Service Error:", logEntry)
				break
			case ErrorSeverity.CRITICAL:
				console.error("Indexing Service Critical Error:", logEntry)
				break
		}

		// Could also send to external logging service here
		// await this.sendToLoggingService(logEntry)
	}

	/**
	 * Show user notification for high severity errors
	 */
	private showUserNotification(error: ServiceError): void {
		const message = `${error.category}: ${error.message}`

		switch (error.severity) {
			case ErrorSeverity.HIGH:
				vscode.window.showErrorMessage(message, "Show Details").then((selection) => {
					if (selection === "Show Details") {
						this.showErrorDetails(error)
					}
				})
				break
			case ErrorSeverity.CRITICAL:
				vscode.window.showErrorMessage(message, "Show Details", "Report Issue").then((selection) => {
					if (selection === "Show Details") {
						this.showErrorDetails(error)
					} else if (selection === "Report Issue") {
						this.reportIssue(error)
					}
				})
				break
		}
	}

	/**
	 * Show detailed error information
	 */
	private showErrorDetails(error: ServiceError): void {
		const details = `
Error: ${error.name}
Code: ${error.code}
Message: ${error.message}
Category: ${error.category}
Severity: ${error.severity}
Timestamp: ${error.timestamp.toISOString()}
Context: ${JSON.stringify(error.context, null, 2)}
Stack: ${error.stack || "No stack trace available"}
        `.trim()

		vscode.window.showInformationMessage("Error Details", "Copy to Clipboard").then((selection) => {
			if (selection === "Copy to Clipboard") {
				vscode.env.clipboard.writeText(details)
			}
		})
	}

	/**
	 * Report issue (would integrate with issue tracking system)
	 */
	private reportIssue(error: ServiceError): void {
		// Implementation would create GitHub issue or send to support
		console.log("Issue reported:", error)
	}
}

/**
 * Utility function for async error handling
 */
export function withErrorHandling<T>(operation: () => Promise<T>, context: ErrorContext, fallback?: T): Promise<T> {
	return operation().catch((error) => {
		ErrorHandler.handleError(error, context)
		if (fallback !== undefined) {
			return Promise.resolve(fallback)
		}
		throw error
	})
}

/**
 * Decorator for automatic error handling
 */
export function handleErrors(category: ErrorCategory, severity: ErrorSeverity = ErrorSeverity.MEDIUM) {
	return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
		const method = descriptor.value

		descriptor.value = async function (...args: any[]) {
			try {
				return await method.apply(this, args)
			} catch (error) {
				const context: ErrorContext = {
					operation: `${target.constructor.name}.${propertyName}`,
					additionalData: { args },
				}

				await ErrorHandler.handleError(error as Error, context)
				throw error
			}
		}

		return descriptor
	}
}
