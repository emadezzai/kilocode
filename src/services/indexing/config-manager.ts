// kilocode_change - new file

import * as vscode from "vscode"
import * as path from "path"
import * as fs from "fs"

export interface IndexingConfig {
	enabled: boolean
	maxFileSize: number
	excludedPatterns: string[]
	batchSize: number
	indexingInterval: number
}

export interface MemoryConfig {
	enabled: boolean
	maxAge: number
	maxCount: number
	compressionEnabled: boolean
	encryptionEnabled: boolean
	autoCleanup: boolean
	learningRate: number
}

export interface SearchConfig {
	maxResults: number
	minScore: number
	enableSemantic: boolean
	enableHybrid: boolean
	cacheResults: boolean
	cacheTimeout: number
}

export interface AnalyticsConfig {
	enabled: boolean
	retentionDays: number
	anonymizeData: boolean
	shareWithTeam: boolean
	trackingLevel: "minimal" | "standard" | "detailed"
}

export interface LoggingConfig {
	level: "debug" | "info" | "warn" | "error"
	enableFileLogging: boolean
	enableConsoleLogging: boolean
	maxFileSize: number
	maxFiles: number
}

export interface EnvironmentConfig {
	indexing: IndexingConfig
	memory: MemoryConfig
	search: SearchConfig
	analytics: AnalyticsConfig
	logging: LoggingConfig
}

/**
 * Configuration manager for indexing and memory features
 * Integrates with VSCode settings and workspace configuration
 */
export class ConfigManager {
	private static instance: ConfigManager
	private readonly configPath: string
	private config: EnvironmentConfig
	private changeListeners: Map<string, ((newValue: any) => void)[]> = new Map()

	private constructor(workspacePath: string) {
		this.configPath = path.join(workspacePath, ".kilocode", "indexing-config.json")
		this.config = this.loadDefaultConfig()
		this.loadConfig()
		this.setupVSCodeIntegration()
	}

	static getInstance(workspacePath?: string): ConfigManager {
		if (!ConfigManager.instance) {
			if (!workspacePath) {
				const workspaceFolders = vscode.workspace.workspaceFolders
				if (!workspaceFolders || workspaceFolders.length === 0) {
					throw new Error("No workspace folder found")
				}
				workspacePath = workspaceFolders[0].uri.fsPath
			}
			ConfigManager.instance = new ConfigManager(workspacePath)
		}
		return ConfigManager.instance
	}

	/**
	 * Get full configuration
	 */
	getConfig(): EnvironmentConfig {
		return { ...this.config }
	}

	/**
	 * Get specific section of configuration
	 */
	getIndexingConfig(): IndexingConfig {
		return { ...this.config.indexing }
	}

	getMemoryConfig(): MemoryConfig {
		return { ...this.config.memory }
	}

	getSearchConfig(): SearchConfig {
		return { ...this.config.search }
	}

	getAnalyticsConfig(): AnalyticsConfig {
		return { ...this.config.analytics }
	}

	getLoggingConfig(): LoggingConfig {
		return { ...this.config.logging }
	}

	/**
	 * Update configuration section
	 */
	updateIndexingConfig(config: Partial<IndexingConfig>): void {
		this.config.indexing = { ...this.config.indexing, ...config }
		this.saveConfig()
		this.notifyListeners("indexing", this.config.indexing)
	}

	updateMemoryConfig(config: Partial<MemoryConfig>): void {
		this.config.memory = { ...this.config.memory, ...config }
		this.saveConfig()
		this.notifyListeners("memory", this.config.memory)
	}

	updateSearchConfig(config: Partial<SearchConfig>): void {
		this.config.search = { ...this.config.search, ...config }
		this.saveConfig()
		this.notifyListeners("search", this.config.search)
	}

	updateAnalyticsConfig(config: Partial<AnalyticsConfig>): void {
		this.config.analytics = { ...this.config.analytics, ...config }
		this.saveConfig()
		this.notifyListeners("analytics", this.config.analytics)
	}

	updateLoggingConfig(config: Partial<LoggingConfig>): void {
		this.config.logging = { ...this.config.logging, ...config }
		this.saveConfig()
		this.notifyListeners("logging", this.config.logging)
	}

	/**
	 * Update full configuration
	 */
	updateConfig(config: Partial<EnvironmentConfig>): void {
		this.config = {
			indexing: { ...this.config.indexing, ...config.indexing },
			memory: { ...this.config.memory, ...config.memory },
			search: { ...this.config.search, ...config.search },
			analytics: { ...this.config.analytics, ...config.analytics },
			logging: { ...this.config.logging, ...config.logging },
		}
		this.saveConfig()
		this.notifyAllListeners()
	}

	/**
	 * Reset configuration to defaults
	 */
	resetToDefaults(): void {
		this.config = this.loadDefaultConfig()
		this.saveConfig()
		this.notifyAllListeners()
	}

	/**
	 * Register configuration change listener
	 */
	onChange(section: keyof EnvironmentConfig, callback: (newValue: any) => void): void {
		if (!this.changeListeners.has(section)) {
			this.changeListeners.set(section, [])
		}
		this.changeListeners.get(section)!.push(callback)
	}

	/**
	 * Remove configuration change listener
	 */
	offChange(section: keyof EnvironmentConfig, callback: (newValue: any) => void): void {
		const listeners = this.changeListeners.get(section)
		if (listeners) {
			const index = listeners.indexOf(callback)
			if (index > -1) {
				listeners.splice(index, 1)
			}
		}
	}

	/**
	 * Export configuration
	 */
	exportConfig(): string {
		return JSON.stringify(this.config, null, 2)
	}

	/**
	 * Import configuration
	 */
	importConfig(configJson: string): void {
		try {
			const importedConfig = JSON.parse(configJson)
			this.validateConfig(importedConfig)
			this.config = this.mergeWithDefaults(importedConfig)
			this.saveConfig()
			this.notifyAllListeners()
		} catch (error) {
			throw new Error(`Invalid configuration format: ${error}`)
		}
	}

	/**
	 * Get configuration file path
	 */
	getConfigPath(): string {
		return this.configPath
	}

	/**
	 * Load default configuration
	 */
	private loadDefaultConfig(): EnvironmentConfig {
		return {
			indexing: {
				enabled: true,
				maxFileSize: 1024 * 1024, // 1MB
				excludedPatterns: [
					"**/node_modules/**",
					"**/dist/**",
					"**/build/**",
					"**/.git/**",
					"**/coverage/**",
					"**/*.min.js",
					"**/*.min.css",
				],
				batchSize: 50,
				indexingInterval: 5000, // 5 seconds
			},
			memory: {
				enabled: true,
				maxAge: 90, // days
				maxCount: 10000,
				compressionEnabled: true,
				encryptionEnabled: false,
				autoCleanup: true,
				learningRate: 0.1,
			},
			search: {
				maxResults: 50,
				minScore: 0.3,
				enableSemantic: true,
				enableHybrid: true,
				cacheResults: true,
				cacheTimeout: 300000, // 5 minutes
			},
			analytics: {
				enabled: true,
				retentionDays: 30,
				anonymizeData: true,
				shareWithTeam: false,
				trackingLevel: "standard",
			},
			logging: {
				level: "info",
				enableFileLogging: true,
				enableConsoleLogging: true,
				maxFileSize: 10 * 1024 * 1024, // 10MB
				maxFiles: 5,
			},
		}
	}

	/**
	 * Load configuration from file
	 */
	private loadConfig(): void {
		try {
			if (fs.existsSync(this.configPath)) {
				const configData = fs.readFileSync(this.configPath, "utf8")
				const loadedConfig = JSON.parse(configData)
				this.validateConfig(loadedConfig)
				this.config = this.mergeWithDefaults(loadedConfig)
			}
		} catch (error) {
			console.warn("Failed to load configuration, using defaults:", error)
			this.config = this.loadDefaultConfig()
		}
	}

	/**
	 * Save configuration to file
	 */
	private saveConfig(): void {
		try {
			const configDir = path.dirname(this.configPath)
			if (!fs.existsSync(configDir)) {
				fs.mkdirSync(configDir, { recursive: true })
			}
			fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2))
		} catch (error) {
			console.error("Failed to save configuration:", error)
		}
	}

	/**
	 * Setup VSCode settings integration
	 */
	private setupVSCodeIntegration(): void {
		// Listen for VSCode setting changes
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (event.affectsConfiguration("kiloCode.indexing")) {
				this.updateFromVSCodeSettings("indexing")
			}
			if (event.affectsConfiguration("kiloCode.memory")) {
				this.updateFromVSCodeSettings("memory")
			}
			if (event.affectsConfiguration("kiloCode.search")) {
				this.updateFromVSCodeSettings("search")
			}
			if (event.affectsConfiguration("kiloCode.analytics")) {
				this.updateFromVSCodeSettings("analytics")
			}
		})
	}

	/**
	 * Update configuration from VSCode settings
	 */
	private updateFromVSCodeSettings(section: keyof EnvironmentConfig): void {
		const config = vscode.workspace.getConfiguration("kiloCode")
		const sectionConfig = config.get(section) as any

		if (sectionConfig) {
			this.config[section] = { ...this.config[section], ...sectionConfig }
			this.saveConfig()
			this.notifyListeners(section, this.config[section])
		}
	}

	/**
	 * Validate configuration structure
	 */
	private validateConfig(config: any): void {
		const requiredSections = ["indexing", "memory", "search", "analytics", "logging"]

		for (const section of requiredSections) {
			if (!config[section]) {
				throw new Error(`Missing required configuration section: ${section}`)
			}
		}

		// Validate specific fields
		if (typeof config.indexing.enabled !== "boolean") {
			throw new Error("indexing.enabled must be a boolean")
		}

		if (typeof config.memory.maxAge !== "number" || config.memory.maxAge < 0) {
			throw new Error("memory.maxAge must be a positive number")
		}

		if (typeof config.search.maxResults !== "number" || config.search.maxResults < 0) {
			throw new Error("search.maxResults must be a positive number")
		}
	}

	/**
	 * Merge loaded config with defaults
	 */
	private mergeWithDefaults(loadedConfig: any): EnvironmentConfig {
		const defaults = this.loadDefaultConfig()

		return {
			indexing: { ...defaults.indexing, ...loadedConfig.indexing },
			memory: { ...defaults.memory, ...loadedConfig.memory },
			search: { ...defaults.search, ...loadedConfig.search },
			analytics: { ...defaults.analytics, ...loadedConfig.analytics },
			logging: { ...defaults.logging, ...loadedConfig.logging },
		}
	}

	/**
	 * Notify listeners of configuration change
	 */
	private notifyListeners(section: string, newValue: any): void {
		const listeners = this.changeListeners.get(section)
		if (listeners) {
			listeners.forEach((callback) => {
				try {
					callback(newValue)
				} catch (error) {
					console.error("Error in configuration change listener:", error)
				}
			})
		}
	}

	/**
	 * Notify all listeners
	 */
	private notifyAllListeners(): void {
		this.notifyListeners("indexing", this.config.indexing)
		this.notifyListeners("memory", this.config.memory)
		this.notifyListeners("search", this.config.search)
		this.notifyListeners("analytics", this.config.analytics)
		this.notifyListeners("logging", this.config.logging)
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this.changeListeners.clear()
	}
}

/**
 * Global configuration manager instance
 */
export const configManager = ConfigManager.getInstance()
