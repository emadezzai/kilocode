// kilocode_change - new file

import * as path from "path"
import * as fs from "fs"
import { createHash } from "crypto"
import { DatabaseManager } from "./database-manager"
import { CodeIndex } from "../../types/indexing-types"

/**
 * Code indexer for extracting and storing code elements
 * Integrates with existing Kilo Code parsing infrastructure
 */
export class CodeIndexer {
	private readonly databaseManager: DatabaseManager
	private readonly supportedExtensions = new Set([
		".ts",
		".tsx",
		".js",
		".jsx",
		".py",
		".java",
		".cpp",
		".c",
		".h",
		".hpp",
		".go",
		".rs",
		".php",
		".rb",
		".swift",
		".kt",
	])

	constructor(databaseManager: DatabaseManager) {
		this.databaseManager = databaseManager
	}

	/**
	 * Initialize the code indexer
	 */
	async initialize(): Promise<void> {
		// Initialization logic if needed
	}

	/**
	 * Index a single file
	 */
	async indexFile(filePath: string): Promise<number> {
		const extension = path.extname(filePath).toLowerCase()

		if (!this.supportedExtensions.has(extension)) {
			return 0
		}

		const content = fs.readFileSync(filePath, "utf-8")
		const hash = this.getFileHash(content)
		const stats = fs.statSync(filePath)
		const lastModified = Math.floor(stats.mtime.getTime() / 1000)

		// Check if file needs re-indexing
		const existingIndex = await this.getExistingIndex(filePath)
		if (existingIndex && existingIndex.hash === hash) {
			return 0 // File hasn't changed
		}

		// Remove existing index for this file
		await this.removeFileIndex(filePath)

		// Extract code elements based on file type
		const elements = await this.extractCodeElements(filePath, content, extension)

		// Store elements in database
		let indexedCount = 0
		for (const element of elements) {
			await this.storeCodeElement({
				...element,
				filePath,
				hash,
				lastModified,
				indexedAt: Math.floor(Date.now() / 1000),
			})
			indexedCount++
		}

		return indexedCount
	}

	/**
	 * Remove file from index
	 */
	async removeFile(filePath: string): Promise<void> {
		await this.removeFileIndex(filePath)
	}

	/**
	 * Get existing index for file
	 */
	private async getExistingIndex(filePath: string): Promise<{ hash: string } | null> {
		const db = this.databaseManager.getDatabase()
		const result = await db.get("SELECT hash FROM code_index WHERE file_path = ? LIMIT 1", [filePath])
		return result
	}

	/**
	 * Remove all index entries for a file
	 */
	private async removeFileIndex(filePath: string): Promise<void> {
		const db = this.databaseManager.getDatabase()
		await db.run("DELETE FROM code_index WHERE file_path = ?", [filePath])
	}

	/**
	 * Store code element in database
	 */
	private async storeCodeElement(element: CodeIndex): Promise<void> {
		const db = this.databaseManager.getDatabase()
		await db.run(
			`INSERT INTO code_index (
                id, type, name, file_path, line_number, signature, 
                content, language, dependencies, tags, hash, 
                last_modified, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				element.id,
				element.type,
				element.name,
				element.filePath,
				element.lineNumber,
				element.signature,
				element.content,
				element.language,
				JSON.stringify(element.dependencies || []),
				JSON.stringify(element.tags || []),
				element.hash,
				element.lastModified,
				element.indexedAt,
			],
		)
	}

	/**
	 * Extract code elements from file content
	 */
	private async extractCodeElements(
		filePath: string,
		content: string,
		extension: string,
	): Promise<Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[]> {
		const language = this.getLanguageFromExtension(extension)

		switch (language) {
			case "typescript":
			case "javascript":
				return this.extractTypeScriptElements(content, language)
			case "python":
				return this.extractPythonElements(content, language)
			case "java":
				return this.extractJavaElements(content, language)
			case "cpp":
			case "c":
				return this.extractCElements(content, language)
			default:
				return this.extractGenericElements(content, language)
		}
	}

	/**
	 * Get language from file extension
	 */
	private getLanguageFromExtension(extension: string): string {
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
	 * Extract TypeScript/JavaScript elements
	 */
	private extractTypeScriptElements(
		content: string,
		language: string,
	): Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] {
		const elements: Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] = []
		const lines = content.split("\n")

		// Extract functions
		const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g
		let match
		while ((match = functionRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("function", match[1], lineNumber),
				type: "function",
				name: match[1],
				lineNumber,
				signature: this.extractFunctionSignature(content, match.index),
				content: this.extractFunctionContent(content, match.index),
				language,
				dependencies: this.extractDependencies(content, match.index),
				tags: this.extractTags(content, match.index),
			})
		}

		// Extract classes
		const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("class", match[1], lineNumber),
				type: "class",
				name: match[1],
				lineNumber,
				signature: this.extractClassSignature(content, match.index),
				content: this.extractClassContent(content, match.index),
				language,
				dependencies: this.extractDependencies(content, match.index),
				tags: this.extractTags(content, match.index),
			})
		}

		// Extract interfaces
		const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g
		while ((match = interfaceRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("interface", match[1], lineNumber),
				type: "interface",
				name: match[1],
				lineNumber,
				signature: this.extractInterfaceSignature(content, match.index),
				content: this.extractInterfaceContent(content, match.index),
				language,
				dependencies: this.extractDependencies(content, match.index),
				tags: this.extractTags(content, match.index),
			})
		}

		// Extract variables
		const variableRegex = /(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=/g
		while ((match = variableRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("variable", match[1], lineNumber),
				type: "variable",
				name: match[1],
				lineNumber,
				signature: this.extractVariableSignature(content, match.index),
				content: this.extractVariableContent(content, match.index),
				language,
				dependencies: [],
				tags: [],
			})
		}

		return elements
	}

	/**
	 * Extract Python elements
	 */
	private extractPythonElements(
		content: string,
		language: string,
	): Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] {
		const elements: Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] = []

		// Extract functions
		const functionRegex = /def\s+(\w+)\s*\(/g
		let match
		while ((match = functionRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("function", match[1], lineNumber),
				type: "function",
				name: match[1],
				lineNumber,
				signature: this.extractPythonFunctionSignature(content, match.index),
				content: this.extractPythonFunctionContent(content, match.index),
				language,
				dependencies: this.extractPythonDependencies(content, match.index),
				tags: [],
			})
		}

		// Extract classes
		const classRegex = /class\s+(\w+)/g
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("class", match[1], lineNumber),
				type: "class",
				name: match[1],
				lineNumber,
				signature: this.extractPythonClassSignature(content, match.index),
				content: this.extractPythonClassContent(content, match.index),
				language,
				dependencies: this.extractPythonDependencies(content, match.index),
				tags: [],
			})
		}

		return elements
	}

	/**
	 * Extract Java elements
	 */
	private extractJavaElements(
		content: string,
		language: string,
	): Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] {
		const elements: Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] = []

		// Extract classes
		const classRegex = /(?:public\s+)?class\s+(\w+)/g
		let match
		while ((match = classRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("class", match[1], lineNumber),
				type: "class",
				name: match[1],
				lineNumber,
				signature: this.extractJavaClassSignature(content, match.index),
				content: this.extractJavaClassContent(content, match.index),
				language,
				dependencies: this.extractJavaDependencies(content, match.index),
				tags: [],
			})
		}

		// Extract methods
		const methodRegex = /(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:\w+\s+)?(\w+)\s*\(/g
		while ((match = methodRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("method", match[1], lineNumber),
				type: "method",
				name: match[1],
				lineNumber,
				signature: this.extractJavaMethodSignature(content, match.index),
				content: this.extractJavaMethodContent(content, match.index),
				language,
				dependencies: this.extractJavaDependencies(content, match.index),
				tags: [],
			})
		}

		return elements
	}

	/**
	 * Extract C/C++ elements
	 */
	private extractCElements(
		content: string,
		language: string,
	): Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] {
		const elements: Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] = []

		// Extract functions
		const functionRegex = /\w+\s+(\w+)\s*\([^)]*\)\s*\{/g
		let match
		while ((match = functionRegex.exec(content)) !== null) {
			const lineNumber = this.getLineNumber(content, match.index)
			elements.push({
				id: this.generateId("function", match[1], lineNumber),
				type: "function",
				name: match[1],
				lineNumber,
				signature: this.extractCFunctionSignature(content, match.index),
				content: this.extractCFunctionContent(content, match.index),
				language,
				dependencies: this.extractCDependencies(content, match.index),
				tags: [],
			})
		}

		return elements
	}

	/**
	 * Extract generic elements for unsupported languages
	 */
	private extractGenericElements(
		content: string,
		language: string,
	): Omit<CodeIndex, "filePath" | "hash" | "lastModified" | "indexedAt">[] {
		// Basic extraction for unsupported languages
		return []
	}

	// Helper methods for extracting specific content
	private getFileHash(content: string): string {
		return createHash("sha256").update(content).digest("hex")
	}

	private generateId(type: string, name: string, lineNumber: number): string {
		return `${type}:${name}:${lineNumber}`
	}

	private getLineNumber(content: string, index: number): number {
		return content.substring(0, index).split("\n").length
	}

	private extractFunctionSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractFunctionContent(content: string, index: number): string {
		// Simple extraction - would need more sophisticated parsing for production
		const start = content.indexOf("{", index)
		if (start === -1) return ""

		let braceCount = 1
		let end = start + 1
		while (end < content.length && braceCount > 0) {
			if (content[end] === "{") braceCount++
			if (content[end] === "}") braceCount--
			end++
		}

		return content.substring(start, end)
	}

	private extractClassSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractClassContent(content: string, index: number): string {
		const start = content.indexOf("{", index)
		if (start === -1) return ""

		let braceCount = 1
		let end = start + 1
		while (end < content.length && braceCount > 0) {
			if (content[end] === "{") braceCount++
			if (content[end] === "}") braceCount--
			end++
		}

		return content.substring(start, end)
	}

	private extractInterfaceSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractInterfaceContent(content: string, index: number): string {
		const start = content.indexOf("{", index)
		const end = content.indexOf("}", start)
		return start !== -1 && end !== -1 ? content.substring(start, end + 1) : ""
	}

	private extractVariableSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractVariableContent(content: string, index: number): string {
		const start = index
		const end = content.indexOf(";", start)
		return end !== -1 ? content.substring(start, end + 1) : ""
	}

	private extractDependencies(content: string, index: number): string[] {
		// Simple dependency extraction - would need more sophisticated parsing
		const importRegex = /import.*from\s+['"]([^'"]+)['"]/g
		const dependencies: string[] = []
		let match
		while ((match = importRegex.exec(content)) !== null) {
			dependencies.push(match[1])
		}
		return dependencies
	}

	private extractTags(content: string, index: number): string[] {
		// Extract JSDoc or other comment tags
		const tags: string[] = []
		const commentIndex = content.lastIndexOf("*/", index)
		if (commentIndex !== -1) {
			const commentStart = content.lastIndexOf("/*", commentIndex)
			if (commentStart !== -1) {
				const comment = content.substring(commentStart, commentIndex + 2)
				if (comment.includes("@deprecated")) tags.push("deprecated")
				if (comment.includes("@experimental")) tags.push("experimental")
				if (comment.includes("@internal")) tags.push("internal")
			}
		}
		return tags
	}

	// Language-specific extraction methods (simplified for demo)
	private extractPythonFunctionSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractPythonFunctionContent(content: string, index: number): string {
		const start = content.indexOf(":", index)
		if (start === -1) return ""

		let end = start + 1
		let indentLevel = 0
		while (end < content.length) {
			const line = content.substring(end).split("\n")[0]
			if (line.trim() === "") {
				end += line.length + 1
				continue
			}

			const currentIndent = line.match(/^\s*/)?.[0]?.length || 0
			if (currentIndent === 0 && indentLevel > 0) break

			if (indentLevel === 0) {
				indentLevel = currentIndent
			} else if (currentIndent < indentLevel) {
				break
			}

			end += line.length + 1
		}

		return content.substring(index, end)
	}

	private extractPythonClassSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractPythonClassContent(content: string, index: number): string {
		return this.extractPythonFunctionContent(content, index)
	}

	private extractPythonDependencies(content: string, index: number): string[] {
		const importRegex = /(?:from\s+(\w+)|import\s+(\w+))/g
		const dependencies: string[] = []
		let match
		while ((match = importRegex.exec(content)) !== null) {
			dependencies.push(match[1] || match[2])
		}
		return dependencies
	}

	private extractJavaClassSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractJavaClassContent(content: string, index: number): string {
		return this.extractClassContent(content, index)
	}

	private extractJavaMethodSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractJavaMethodContent(content: string, index: number): string {
		return this.extractFunctionContent(content, index)
	}

	private extractJavaDependencies(content: string, index: number): string[] {
		const importRegex = /import\s+([^;]+);/g
		const dependencies: string[] = []
		let match
		while ((match = importRegex.exec(content)) !== null) {
			dependencies.push(match[1].trim())
		}
		return dependencies
	}

	private extractCFunctionSignature(content: string, index: number): string {
		const lines = content.substring(index).split("\n")
		return lines[0]?.trim() || ""
	}

	private extractCFunctionContent(content: string, index: number): string {
		return this.extractFunctionContent(content, index)
	}

	private extractCDependencies(content: string, index: number): string[] {
		const includeRegex = /#include\s*[<"]([^>"]+)[>"]/g
		const dependencies: string[] = []
		let match
		while ((match = includeRegex.exec(content)) !== null) {
			dependencies.push(match[1])
		}
		return dependencies
	}
}
