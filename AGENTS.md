# AGENTS.md

Codebase guidance for agentic coding agents working on obsidian-neodb-plugin.

## Project Overview

Obsidian plugin that syncs NeoDB collection data (books, movies, music, games, etc.) to Obsidian notes. Supports shelf items, collections, notes, and reviews with customizable templates.

## Build Commands

```bash
# Development build with watch mode
npm run dev

# Production build (typecheck + bundle)
npm run build

# Type check only (no emit)
npx tsc -noEmit -skipLibCheck

# Lint with ESLint
npx eslint src/
```

## Testing

No test framework is currently configured. When adding tests, consider Jest or Vitest.

## Linting

ESLint is configured with `eslint-plugin-obsidianmd` for Obsidian-specific linting rules.

### Setup (Completed)

```bash
# Install ESLint
npm i eslint --save-dev

# Install Obsidian ESLint plugin
npm install eslint-plugin-obsidianmd --save-dev

# Config fetched from:
# https://github.com/obsidianmd/eslint-plugin/raw/refs/heads/master/eslint.config.mjs
```

## Code Style Guidelines

### Imports

- Group imports: external libraries first, then local modules
- Use `import type` for type-only imports
- Example order:
  ```typescript
  import { Plugin, Notice, TFile } from 'obsidian';
  import type NeoDBPlugin from './main';
  import { NeoDBSettings, DEFAULT_SETTINGS } from './settings';
  import { NeoDBItem, NeoDBUserMark } from './types';
  ```

### TypeScript Configuration

- Target: ES6, Module: ESNext
- Strict mode enabled: `noImplicitAny`, `strictNullChecks`
- No comments in production code unless explicitly requested

### Naming Conventions

- **Classes**: PascalCase (e.g., `NeoDBPlugin`, `NeoDBAPI`)
- **Interfaces**: PascalCase with descriptive names (e.g., `NeoDBSettings`, `NeoDBItem`)
- **Functions**: camelCase (e.g., `prepareItemData`, `renderTemplate`)
- **Constants**: UPPER_SNAKE_CASE for constants (e.g., `DEFAULT_SETTINGS`, `DEFAULT_TEMPLATE`)
- **Private class members**: Prefix with underscore or keep simple
- **Type aliases**: PascalCase (e.g., `ItemType`, `ShelfType`)

### Formatting

- Indent: 4 spaces (observed in codebase)
- No semicolons required (TypeScript handles ASI)
- Single quotes for strings (preferred in template strings)
- Max line length: follow existing patterns

### Types

- Define interfaces in `src/types.ts` for data models
- Export all types and interfaces from `types.ts`
- Use union types for finite sets (e.g., `ItemType`, `ShelfType`)
- Prefer `interface` over `type` for object shapes
- Use optional properties (`?`) for fields that may be undefined

### Error Handling

- Use try-catch blocks for async operations
- Catch errors with `error: any` type annotation
- Log errors to console with `console.error`
- Show user-friendly messages via `new Notice()`
- Example:
  ```typescript
  try {
      await someAsyncOperation();
  } catch (error: any) {
      console.error('Operation failed:', error);
      new Notice(`Failed: ${error.message}`);
  }
  ```

### Obsidian Plugin Patterns

- Extend `Plugin` class for main plugin
- Extend `PluginSettingTab` for settings UI
- Use `this.app` for vault operations
- Use `this.settings` for plugin settings
- Register commands with `this.addCommand()`
- Register ribbon icons with `this.addRibbonIcon()`
- Use `await this.loadData()` and `await this.saveData()` for persistence

### API Patterns

- Use Obsidian's `requestUrl()` for HTTP requests (not fetch)
- NeoDB API returns `{data: Array, pages: number, count: number}` structure
- Handle pagination using `pages` field
- Show progress notices for long operations
- Default page size: 50

### File Operations

- Use `this.app.vault.create()` for new files
- Use `this.app.vault.modify()` for existing files
- Use `this.app.vault.createFolder()` for directories
- Check file existence with `getAbstractFileByPath()`
- Sanitize file names to remove invalid characters

### Template System

- Use Mustache-like syntax: `{{variable}}`, `{{#array}}...{{/array}}`
- Support conditional blocks with `{{#field}}...{{/field}}`
- Support array iteration with `{{.}}` for current item
- Sanitize output values appropriately

## Project Structure

```
src/
  main.ts       # Plugin entry point, commands, sync logic
  settings.ts   # Settings interface and settings tab UI
  api.ts        # NeoDB API client
  types.ts      # TypeScript interfaces and types
  templates.ts  # Template rendering and data preparation
```

## Key Dependencies

- `obsidian`: Obsidian Plugin API
- `esbuild`: Build bundler
- `typescript`: Type checking
- `eslint`: Linting (dev)
- `eslint-plugin-obsidianmd`: Obsidian-specific lint rules (dev)

## Common Tasks

### Adding a new sync feature

1. Add types to `src/types.ts`
2. Add API method in `src/api.ts`
3. Add template preparation in `src/templates.ts`
4. Add sync method in `src/main.ts`
5. Add setting toggle in `src/settings.ts`

### Adding a new command

1. Add command in `main.ts` using `this.addCommand()`
2. Add corresponding method in plugin class
3. Update settings if user configuration needed

## TODO

### Features

- [ ] **i18n**: Internationalization support for multiple languages (Chinese, English, etc.)
- [ ] **Template Advanced Customization**: Allow users to create custom templates with more variables and conditional logic
- [ ] **Type-based Folder Organization**: Option to organize items into subfolders by type (movie/, book/, music/, game/, etc.)
- [ ] **Sync Preview**: Preview what will be synced before executing
- [ ] **Progress Bar**: Visual progress indicator during sync operations
- [ ] **Manual Interruption**: Allow users to cancel ongoing sync operations

### Improvements

- [ ] Notes API integration (currently not fully supported)
- [ ] Incremental sync optimization
- [ ] Error recovery and retry mechanism
- [ ] Batch operations support

## References

- [NeoDB Documentation](https://neodb.net/)
- [NeoDB API](https://neodb.social/developer/)
- [Obsidian Plugin API](https://docs.obsidian.md/Reference)
