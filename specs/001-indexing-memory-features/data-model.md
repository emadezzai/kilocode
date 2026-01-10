# Data Model: Professional Indexing and Memory Features

**Date**: 2025-01-10  
**Feature**: Professional Indexing and Memory Features

## Core Entities

### CodeIndex

Represents the indexed representation of codebase elements including functions, classes, variables, and their relationships.

**Properties**:

- `id`: Unique identifier for the indexed element
- `type`: Element type (function, class, variable, interface, etc.)
- `name`: Name of the code element
- `filePath`: Relative path to the source file
- `lineNumber`: Line number where element is defined
- `signature`: Function signature or class declaration
- `content`: Extracted content/body of the element
- `language`: Programming language (typescript, javascript, etc.)
- `dependencies`: Array of dependent element IDs
- `tags`: Array of semantic tags for categorization
- `hash`: Content hash for change detection
- `lastModified`: Timestamp of last modification
- `indexedAt`: Timestamp when element was indexed

**Indexes**:

- Primary index on `id`
- Composite index on `(filePath, type, name)`
- Full-text search index on `content` and `name`
- Vector embedding index for semantic search

### UserMemory

Stores user interactions, preferences, coding patterns, and learning data across sessions.

**Properties**:

- `id`: Unique memory entry identifier
- `userId`: User identifier (local storage)
- `sessionId`: Current session identifier
- `type`: Memory type (conversation, pattern, preference, feedback)
- `content`: Memory content (JSON serialized)
- `context`: Context information (current file, active project, etc.)
- `importance`: Importance score (1-10)
- `accessCount`: Number of times this memory was accessed
- `lastAccessed`: Timestamp of last access
- `createdAt`: Timestamp when memory was created
- `expiresAt`: Timestamp when memory should be expired (optional)

**Indexes**:

- Primary index on `id`
- Composite index on `(userId, type, importance)`
- TTL index on `expiresAt`

### SearchQuery

Represents user search requests including query text, filters, and context.

**Properties**:

- `id`: Unique query identifier
- `userId`: User identifier
- `queryText`: Raw search query text
- `processedQuery`: Processed/normalized query
- `filters`: Search filters object
    - `fileTypes`: Array of allowed file extensions
    - `dateRange`: Start and end date filters
    - `authors`: Array of author names
    - `elementTypes`: Array of element types to search
- `searchType`: Type of search (text, semantic, hybrid)
- `context`: Current context (active file, cursor position, etc.)
- `results`: Array of SearchResult references
- `executionTime`: Time taken to execute search
- `timestamp`: When the search was performed

### SearchResult

Contains matched code elements with relevance scores and relationship information.

**Properties**:

- `id`: Unique result identifier
- `queryId`: Reference to the originating SearchQuery
- `elementId`: Reference to CodeIndex element
- `relevanceScore`: Computed relevance score (0-1)
- `matchType`: How the match was found (exact, semantic, fuzzy)
- `matchedContent`: Specific content that matched
- `relationships`: Related elements and their relationship types
- `highlights`: Array of text highlight ranges
- `rank`: Result ranking position

### AnalyticsData

Aggregated statistics about code patterns, usage metrics, and team insights.

**Properties**:

- `id`: Unique analytics record identifier
- `userId`: User or team identifier
- `metricType`: Type of metric (usage, pattern, quality, collaboration)
- `data`: Metric data (JSON structure varies by type)
- `period`: Time period for the metrics (day, week, month)
- `computedAt`: When the analytics were computed
- `version`: Analytics schema version for migration

## Data Relationships

### Primary Relationships

```
CodeIndex (1) -----> (N) SearchResult
SearchQuery (1) -----> (N) SearchResult
UserMemory (1) -----> (N) SearchQuery (context)
CodeIndex (1) -----> (N) CodeIndex (dependencies)
```

### Data Flow

1. **Indexing Flow**: File System → CodeIndex → Vector Embeddings
2. **Search Flow**: SearchQuery → SearchResult ← CodeIndex
3. **Memory Flow**: User Interactions → UserMemory → Personalized Features
4. **Analytics Flow**: Usage Data → AnalyticsData → Insights

## Storage Schema

### SQLite Tables

```sql
-- Code indexing
CREATE TABLE code_index (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    line_number INTEGER,
    signature TEXT,
    content TEXT,
    language TEXT,
    dependencies TEXT, -- JSON array
    tags TEXT, -- JSON array
    hash TEXT,
    last_modified INTEGER,
    indexed_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- User memory
CREATE TABLE user_memory (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    context TEXT, -- JSON object
    importance INTEGER DEFAULT 5,
    access_count INTEGER DEFAULT 0,
    last_accessed INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER
);

-- Search history
CREATE TABLE search_queries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    query_text TEXT NOT NULL,
    processed_query TEXT,
    filters TEXT, -- JSON object
    search_type TEXT NOT NULL,
    context TEXT, -- JSON object
    execution_time INTEGER,
    timestamp INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Analytics
CREATE TABLE analytics_data (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    metric_type TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON object
    period TEXT NOT NULL,
    computed_at INTEGER DEFAULT (strftime('%s', 'now')),
    version TEXT DEFAULT '1.0'
);
```

## Performance Considerations

### Indexing Performance

- Batch processing for large files
- Incremental updates using file hashes
- Background processing to avoid UI blocking
- Memory-efficient streaming parsers

### Search Performance

- Pre-computed relevance scores
- Efficient vector similarity search
- Result caching for frequent queries
- Pagination for large result sets

### Memory Management

- Automatic cleanup of expired memories
- Compression for large content storage
- Memory usage monitoring and limits
- Graceful degradation under memory pressure

## Privacy and Security

### Data Protection

- All data stored locally
- Optional encryption for sensitive memories
- User control over data retention
- No telemetry that exposes code content

### Access Control

- User-based data isolation
- Secure memory storage
- Controlled data sharing for team features
- Audit logging for data access
