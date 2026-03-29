# Feature Plan: Cache Management & Data Export

**Date**: 2026-03-29  
**Status**: Draft  
**Priority**: Medium (Enhancement)

---

## Overview

Two complementary features to enhance user experience:
1. **Cache Size Display** - Show current storage usage in Settings
2. **Data Export** - Export chat history, snapshots, and metadata as JSON or Markdown

---

## Feature 1: Cache Size Display in Settings

### Objective
Display current storage usage for IndexedDB and chrome.storage.local in the Settings panel, with a "Clear Cache" button for user control.

### Technical Requirements

#### 1.1 Calculate Storage Usage
- **IndexedDB Size**:
  - Estimate size of page snapshots (stored as strings/blobs)
  - Estimate size of attachment metadata and base64 content
  - Calculate total using `Dexie` or manual iteration through idb-keyval keys

- **chrome.storage.local Size**:
  - Get all items via `chrome.storage.local.get(null)`
  - Sum byte size of serialized JSON

- **Approach**: Create a utility function `calculateStorageSize()` in `src/utils/`

#### 1.2 Implement Clear Cache Function
- `clearCache()` function to:
  - Clear all IndexedDB keys (snapshots, attachments)
  - Clear chat history from chrome.storage.local (keep API keys & settings)
  - Reset current session
  - Show confirmation dialog

#### 1.3 UI Changes in Settings.tsx
- Add section: "Storage & Cache"
- Display:
  - Total cache size (e.g., "Cache: 24.5 MB")
  - Breakdown: IndexedDB size + Storage size
  - "Clear Cache" button with confirmation dialog

### Implementation Steps

```
1. Create src/utils/storageUtils.ts
   ├── calculateStorageSize(): Promise<{ indexedDb: number; storage: number }>
   ├── clearCache(): Promise<void>
   └── formatBytes(bytes: number): string

2. Update src/store/index.ts
   ├── Add async action: calculateCacheSize()
   ├── Add async action: clearCacheData()
   └── Add state: cacheSize: { indexedDb: number; storage: number }

3. Update Settings.tsx component
   ├── Add useEffect to fetch cache size on mount
   ├── Add StorageSection component
   ├── Display cache metrics
   ├── Add "Clear Cache" button with confirmation
   └── Handle clear action

4. Test
   ├── Verify size calculation accuracy
   ├── Test cache clearing
   ├── Verify session reset
```

### Data Structures

**Store additions**:
```typescript
cacheSize: { indexedDb: number; storage: number }
setCacheSize(size): void
calculateCacheSize(): Promise<void>
clearCacheData(): Promise<void>
```

---

## Feature 2: Data Export (JSON & Markdown)

### Objective
Allow users to export their chat history, snapshots, and session metadata in JSON or Markdown format for backup, sharing, or analysis.

### Technical Requirements

#### 2.1 Export Scope
- **JSON Format**:
  - Complete session data with all messages, attachments, metadata
  - Structure: `{ sessions: [...], agents: [...], settings: {...} }`
  - Include page snapshots (as text or reference URLs)

- **Markdown Format**:
  - Readable conversation format
  - One file per session or single file with all sessions
  - Include timestamps, agent info, page context
  - Code blocks preserved with syntax highlighting hints

#### 2.2 Implementation Options

**Option A: Export from Settings (Recommended)**
- Add "Export Data" button in Settings
- User selects export format (JSON / Markdown)
- User selects what to include (history, settings, agents, snapshots)
- Trigger download as `.json` or `.md`

**Option B: Export from HistoryDrawer**
- Right-click context menu on session
- Export individual session
- Available formats: JSON, Markdown

### Implementation Steps

```
1. Create src/utils/exportUtils.ts
   ├── exportAsJSON(sessions, agents, settings): string
   ├── exportAsMarkdown(sessions, pageSnapshots): string
   ├── downloadFile(content, filename, mimeType): void
   └── generateSessionMarkdown(session): string

2. Create component: src/components/ExportDialog.tsx
   ├── Format selection (JSON / Markdown)
   ├── Content selection (checkboxes: history, agents, snapshots)
   ├── Preview (optional)
   └── Download/Copy buttons

3. Update Settings.tsx
   ├── Add "Export Data" button
   ├── Open ExportDialog on click
   ├── Handle download action

4. Update HistoryDrawer.tsx (Optional for Phase 2)
   ├── Right-click menu on session
   ├── Export individual session

5. Test
   ├── Verify JSON structure
   ├── Verify Markdown readability
   ├── Test download functionality
   ├── Test copy-to-clipboard
```

### Data Structures

**Export JSON Structure**:
```json
{
  "version": "1.0",
  "exportDate": "2026-03-29T10:30:00Z",
  "sessions": [
    {
      "id": "uuid",
      "title": "Session Title",
      "updatedAt": 1711766400000,
      "agentId": "uuid",
      "messages": [
        {
          "id": "uuid",
          "role": "user|assistant",
          "content": "...",
          "timestamp": 1711766400000,
          "attachedContext": {...},
          "attachments": [...]
        }
      ]
    }
  ],
  "agents": [...],
  "settings": {
    "apiProvider": "gemini",
    "modelName": "gemini-1.5-flash"
  }
}
```

**Export Markdown Structure**:
```
# Chat Export - LuminaSider

**Export Date**: 2026-03-29  
**Total Sessions**: 3

---

## Session 1: Understanding React Hooks

**Date**: Mar 29, 2026  
**Agent**: Code Expert

### Message 1 (User)
What are React hooks?

### Message 2 (Assistant)
React hooks are functions that allow you to...

---
```

---

## Implementation Phases

### Phase 1 (Priority: High)
- [ ] Cache size display in Settings
- [ ] Clear cache functionality
- [ ] Storage utils created

### Phase 2 (Priority: Medium)
- [ ] JSON export
- [ ] Download functionality
- [ ] ExportDialog component

### Phase 3 (Optional)
- [ ] Markdown export
- [ ] Per-session export
- [ ] Settings/agents included in export

---

## UI/UX Mockup

### Settings Page - Storage Section
```
┌─────────────────────────────┐
│ Storage & Cache             │
├─────────────────────────────┤
│ Cache Usage:                │
│ ├─ IndexedDB: 18.2 MB       │
│ └─ Settings: 1.3 MB         │
│ Total: 19.5 MB              │
│                             │
│ [Clear Cache]  [Export]     │
│                             │
│ ⓘ Cache stores conversations│
│   and page snapshots.       │
└─────────────────────────────┘
```

### Export Dialog
```
┌────────────────────────────┐
│ Export Data                │
├────────────────────────────┤
│ Format:                    │
│ ◉ JSON  ○ Markdown         │
│                            │
│ Include:                   │
│ ☑ Chat History            │
│ ☑ Custom Agents           │
│ ☐ API Settings            │
│ ☐ Page Snapshots          │
│                            │
│ [Preview] [Download] [×]   │
└────────────────────────────┘
```

---

## Dependencies & Considerations

### No New External Dependencies Required
- Use native Web APIs for file download
- Use existing Zustand store
- Use IndexedDB (via idb-keyval, already imported)

### Browser Compatibility
- File download: Works in all modern browsers
- Storage APIs: Chrome 90+, Firefox 78+

### Performance
- Storage calculation might be slow for large cache (async operation)
- Export generation is fast for typical session counts
- Markdown export may be large; consider pagination for very long histories

### Testing
- Unit tests for calculation logic
- Manual testing of export formats
- Verify no data loss on clear
- Test with various cache sizes

---

## Success Criteria

### Feature 1: Cache Size Display
- [ ] Accurate storage size calculation
- [ ] Cache size updates on data changes
- [ ] Clear cache removes all snapshots and chat history
- [ ] User can see breakdown of storage usage
- [ ] No performance degradation

### Feature 2: Data Export
- [ ] Export generates valid JSON
- [ ] Export generates readable Markdown
- [ ] Download functionality works
- [ ] All selected data is included
- [ ] No sensitive data (API keys) in export by default

---

## Future Enhancements

- Import exported data (restore from backup)
- Scheduled automatic backups
- Cloud export option (optional)
- Granular cache management (delete per session)
- Storage quota alerts

---

