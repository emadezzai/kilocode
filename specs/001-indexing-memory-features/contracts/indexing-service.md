# Indexing Service Contract

**Version**: 1.0  
**Date**: 2025-01-10  
**Service**: CodeIndexingService

## Interface Definition

```typescript
interface ICodeIndexingService {
	// Core indexing operations
	indexWorkspace(workspacePath: string): Promise<IndexingResult>
	indexFile(filePath: string): Promise<IndexingResult>
	removeFile(filePath: string): Promise<void>
	updateFile(filePath: string): Promise<IndexingResult>

	// Search operations
	search(query: SearchQuery): Promise<SearchResult[]>
	getSuggestions(context: SearchContext): Promise<Suggestion[]>

	// Index management
	getIndexStats(): Promise<IndexStats>
	rebuildIndex(): Promise<void>

	// Events
	onIndexingProgress: Event<IndexingProgressEvent>
	onIndexingComplete: Event<IndexingCompleteEvent>
}
```

## Data Types

```typescript
interface IndexingResult {
	success: boolean
	elementsIndexed: number
	errors: string[]
	duration: number
}

interface SearchQuery {
	text: string
	filters: SearchFilters
	type: "text" | "semantic" | "hybrid"
	context?: SearchContext
}

interface SearchResult {
	element: CodeIndexElement
	relevanceScore: number
	matchType: "exact" | "semantic" | "fuzzy"
	highlights: TextHighlight[]
}

interface SearchFilters {
	fileTypes?: string[]
	dateRange?: { start: Date; end: Date }
	elementTypes?: ElementType[]
	authors?: string[]
}
```

## Performance Requirements

- Index 100k LOC in <30 seconds
- Search results in <2 seconds
- Real-time file updates with <300ms delay
- Memory usage <200MB for full index

## Error Handling

- Graceful degradation for large files
- Retry mechanisms for failed indexing
- Validation for malformed code
- User-friendly error messages

## Integration Points

- VSCode FileSystemWatcher API
- Language Server Protocol for semantic analysis
- Existing Kilo Code database infrastructure
- Vector embedding service integration
