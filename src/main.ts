import { Plugin, Notice, TFile, TFolder, Modal, App, Setting } from 'obsidian';
import { NeoDBSettingTab, DEFAULT_SETTINGS } from './settings';
import type { NeoDBSettings } from './settings';
import { NeoDBAPI, setDebugMode, debugLog, SYNC_CANCELLED_MESSAGE } from './api';
import {
    renderTemplate,
    prepareItemData,
    prepareCollectionData,
    prepareNoteData,
    prepareReviewData,
    generateFileName,
    sanitizeFileName,
} from './templates';
import type { ItemTemplateData } from './templates';
import { SHELF_TYPES } from './types';
import type {
    NeoDBImportData,
    NeoDBUserMark,
    NeoDBCollection,
    NeoDBCollectionItem,
    NeoDBNote,
    NeoDBReview,
    ShelfType,
} from './types';
import { t, setLocale } from './i18n';

type SyncKind = 'items' | 'collections' | 'notes' | 'reviews';

const SYNC_KINDS: SyncKind[] = ['items', 'collections', 'notes', 'reviews'];
const PREVIEW_PATH_LIMIT = 100;

interface SyncToken {
    cancelled: boolean;
}

interface SyncPlanEntry {
    kind: SyncKind;
    title: string;
    folderPath: string;
    fileName: string;
    content: string;
}

interface SyncPlan {
    entries: SyncPlanEntry[];
    counts: Record<SyncKind, number>;
    skipped: Record<SyncKind, number>;
    kinds: SyncKind[];
    generatedAt: string;
}

interface RunSyncOptions {
    kinds?: SyncKind[];
    plan?: SyncPlan;
    showPreview?: boolean;
}

interface ActiveSync {
    token: SyncToken;
    progress: SyncProgressModal;
}

function errorMessage(err: unknown, fallback = 'Unknown error'): string {
    if (err instanceof Error) return err.message || fallback;
    if (typeof err === 'string') return err;
    return fallback;
}

function isSyncCancelled(error: unknown): boolean {
    return errorMessage(error) === SYNC_CANCELLED_MESSAGE;
}

function emptyKindCounts(): Record<SyncKind, number> {
    return {
        items: 0,
        collections: 0,
        notes: 0,
        reviews: 0,
    };
}

function totalCounts(counts: Record<SyncKind, number>): number {
    return SYNC_KINDS.reduce((total, kind) => total + counts[kind], 0);
}

export default class NeoDBPlugin extends Plugin {
    settings: NeoDBSettings;
    api: NeoDBAPI;
    private activeSync?: ActiveSync;

    async onload() {
        await this.loadSettings();
        this.api = new NeoDBAPI(
            this.settings.neodbDomain,
            this.settings.neodbApiKey,
            this.settings.retryAttempts,
            this.settings.batchSize,
        );
        setDebugMode(this.settings.debugMode);

        this.addRibbonIcon('puzzle', t('ribbon.syncNeoDB'), () => {
            void this.startSync();
        });

        this.addCommand({
            id: 'sync-neodb',
            name: t('command.syncData'),
            callback: () => {
                void this.startSync();
            },
        });

        this.addCommand({
            id: 'preview-neodb-sync',
            name: t('command.previewSync'),
            callback: () => {
                void this.previewSync();
            },
        });

        this.addCommand({
            id: 'cancel-neodb-sync',
            name: t('command.cancelSync'),
            callback: () => {
                this.cancelSync();
            },
        });

        this.addCommand({
            id: 'sync-neodb-items',
            name: t('command.syncShelfItems'),
            callback: () => {
                void this.syncItems();
            },
        });

        this.addCommand({
            id: 'sync-neodb-collections',
            name: t('command.syncCollections'),
            callback: () => {
                void this.syncCollections();
            },
        });

        this.addCommand({
            id: 'sync-neodb-notes',
            name: t('command.syncNotes'),
            callback: () => {
                void this.syncNotes();
            },
        });

        this.addCommand({
            id: 'sync-neodb-reviews',
            name: t('command.syncReviews'),
            callback: () => {
                void this.syncReviews();
            },
        });

        this.addCommand({
            id: 'import-neodb-data',
            name: t('command.importExportFile'),
            callback: () => {
                new ImportModal(this.app, this).open();
            },
        });

        this.addSettingTab(new NeoDBSettingTab(this.app, this));

        if (this.settings.syncOnStartup && this.settings.neodbApiKey) {
            this.app.workspace.onLayoutReady(() => {
                void this.startSync();
            });
        }
    }

    async loadSettings() {
        const saved = await this.loadData() as Partial<NeoDBSettings> | null;
        this.settings = Object.assign({}, DEFAULT_SETTINGS, saved ?? {});
        this.settings.syncShelfTypes = this.normalizeShelfTypes(this.settings.syncShelfTypes);
        this.settings.batchSize = this.normalizePositiveInteger(this.settings.batchSize, DEFAULT_SETTINGS.batchSize);
        this.settings.retryAttempts = this.normalizePositiveInteger(this.settings.retryAttempts, DEFAULT_SETTINGS.retryAttempts);
        setLocale(this.settings.locale || 'auto');
    }

    async saveSettings() {
        await this.saveData(this.settings);
        if (this.api) {
            this.api.updateConfig(
                this.settings.neodbDomain,
                this.settings.neodbApiKey,
                this.settings.retryAttempts,
                this.settings.batchSize,
            );
        }
    }

    async ensureFolder(path: string): Promise<TFolder> {
        debugLog('Ensuring folder:', path);
        const parts = path.split('/').filter(p => p.length > 0);
        let currentPath = '';

        for (const part of parts) {
            currentPath = currentPath ? `${currentPath}/${part}` : part;
            const folder = this.app.vault.getAbstractFileByPath(currentPath);

            if (!folder) {
                debugLog('Creating folder:', currentPath);
                await this.app.vault.createFolder(currentPath);
            } else if (!(folder instanceof TFolder)) {
                throw new Error(`Path "${currentPath}" exists but is not a folder`);
            }
        }

        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!folder || !(folder instanceof TFolder)) {
            throw new Error(`Failed to create folder: ${path}`);
        }
        return folder;
    }

    async writeNote(folderPath: string, fileName: string, content: string): Promise<TFile> {
        debugLog('writeNote called:', { folderPath, fileName });
        await this.ensureFolder(folderPath);
        const filePath = `${folderPath}/${fileName}.md`;

        const existingFile = this.app.vault.getAbstractFileByPath(filePath);
        if (existingFile instanceof TFile) {
            debugLog('Modifying existing file:', filePath);
            await this.app.vault.modify(existingFile, content);
            return existingFile;
        }

        debugLog('Creating new file:', filePath);
        return await this.app.vault.create(filePath, content);
    }

    async startSync(): Promise<number> {
        return await this.runSync({
            kinds: this.getEnabledSyncKinds(),
            showPreview: this.settings.showSyncPreview,
        });
    }

    async previewSync(): Promise<number> {
        return await this.runSync({
            kinds: this.getEnabledSyncKinds(),
            showPreview: true,
        });
    }

    cancelSync(): void {
        if (!this.activeSync) return;
        this.activeSync.token.cancelled = true;
        new Notice(t('notice.syncCancelled'));
    }

    async syncItems(): Promise<number> {
        return await this.runSync({ kinds: ['items'], showPreview: this.settings.showSyncPreview });
    }

    async syncCollections(): Promise<number> {
        return await this.runSync({ kinds: ['collections'], showPreview: this.settings.showSyncPreview });
    }

    async syncNotes(): Promise<number> {
        return await this.runSync({ kinds: ['notes'], showPreview: this.settings.showSyncPreview });
    }

    async syncReviews(): Promise<number> {
        return await this.runSync({ kinds: ['reviews'], showPreview: this.settings.showSyncPreview });
    }

    async runPreparedSync(plan: SyncPlan): Promise<number> {
        return await this.runSync({ plan, kinds: plan.kinds, showPreview: false });
    }

    async importData(data: NeoDBImportData): Promise<number> {
        let count = 0;

        if (data.marks && data.marks.length > 0) {
            new Notice(t('notice.importingMarks'));
            for (const mark of data.marks) {
                const entry = this.createItemEntry(mark);
                await this.writeNote(entry.folderPath, entry.fileName, entry.content);
                count++;
            }
        }

        if (data.collections && data.collections.length > 0) {
            new Notice(t('notice.importingCollections'));
            for (const collection of data.collections) {
                const entry = this.createCollectionEntry(collection, []);
                await this.writeNote(entry.folderPath, entry.fileName, entry.content);
                count++;
            }
        }

        if (data.notes && data.notes.length > 0) {
            new Notice(t('notice.importingNotes'));
            for (const note of data.notes) {
                const entry = this.createNoteEntry(note);
                await this.writeNote(entry.folderPath, entry.fileName, entry.content);
                count++;
            }
        }

        if (data.reviews && data.reviews.length > 0) {
            new Notice(t('notice.importingReviews'));
            for (const review of data.reviews) {
                const entry = this.createReviewEntry(review);
                await this.writeNote(entry.folderPath, entry.fileName, entry.content);
                count++;
            }
        }

        return count;
    }

    onunload() {
        if (this.activeSync) {
            this.activeSync.token.cancelled = true;
        }
    }

    private async runSync(options: RunSyncOptions): Promise<number> {
        if (!this.settings.neodbApiKey) {
            new Notice(t('notice.configureApiKey'));
            return 0;
        }

        if (this.activeSync) {
            new Notice(t('notice.syncAlreadyRunning'));
            return 0;
        }

        const kinds = this.normalizeSyncKinds(options.kinds ?? this.getEnabledSyncKinds());
        if (kinds.length === 0) {
            new Notice(t('notice.noSyncTargets'));
            return 0;
        }

        const token: SyncToken = { cancelled: false };
        const progress = new SyncProgressModal(this.app, token);
        this.activeSync = { token, progress };
        progress.open();

        try {
            if (options.showPreview && !options.plan) {
                new Notice(t('notice.buildingPreview'));
            } else {
                new Notice(t('notice.startingSync'));
            }

            const plan = options.plan ?? await this.buildSyncPlan(kinds, token, progress);
            this.throwIfCancelled(token);

            if (options.showPreview && !options.plan) {
                progress.close();
                this.activeSync = undefined;
                new SyncPreviewModal(this.app, this, plan).open();
                return 0;
            }

            const syncedCount = await this.executeSyncPlan(plan, token, progress);
            this.markSyncSuccess(plan.kinds);
            await this.saveSettings();

            if (syncedCount === 0) {
                new Notice(t('notice.noChanges'));
            } else {
                new Notice(t('notice.syncComplete', { count: syncedCount }));
            }
            return syncedCount;
        } catch (err: unknown) {
            if (isSyncCancelled(err)) {
                new Notice(t('notice.syncCancelled'));
                return 0;
            }

            // eslint-disable-next-line no-undef -- console is a global in Obsidian's runtime
            console.error('NeoDB sync error:', err);
            new Notice(t('notice.syncFailed', { message: errorMessage(err) }));
            return 0;
        } finally {
            progress.close();
            if (this.activeSync?.token === token) {
                this.activeSync = undefined;
            }
        }
    }

    private async buildSyncPlan(kinds: SyncKind[], token: SyncToken, progress: SyncProgressModal): Promise<SyncPlan> {
        const entries: SyncPlanEntry[] = [];
        const counts = emptyKindCounts();
        const skipped = emptyKindCounts();
        const syncKinds = this.normalizeSyncKinds(kinds);
        progress.addTotal(syncKinds.length);

        for (const kind of syncKinds) {
            this.throwIfCancelled(token);
            const result = await this.buildEntriesForKind(kind, token, progress);
            counts[kind] = result.entries.length;
            skipped[kind] = result.skipped;
            entries.push(...result.entries);
            progress.advance(1, t('syncProgress.preparedKind', { kind: t(`sync.kind.${kind}`) }));
        }

        return {
            entries,
            counts,
            skipped,
            kinds: syncKinds,
            generatedAt: new Date().toISOString(),
        };
    }

    private async buildEntriesForKind(
        kind: SyncKind,
        token: SyncToken,
        progress: SyncProgressModal,
    ): Promise<{ entries: SyncPlanEntry[]; skipped: number }> {
        if (kind === 'items') return await this.buildItemEntries(token, progress);
        if (kind === 'collections') return await this.buildCollectionEntries(token, progress);
        if (kind === 'notes') return await this.buildNoteEntries(token, progress);
        return await this.buildReviewEntries(token, progress);
    }

    private async buildItemEntries(
        token: SyncToken,
        progress: SyncProgressModal,
    ): Promise<{ entries: SyncPlanEntry[]; skipped: number }> {
        progress.setLabel(t('syncProgress.fetchingItems'));
        const marks = await this.api.getAllShelfItems(this.getSelectedShelfTypes(), this.getFetchOptions(token, progress));
        const filtered = this.filterIncremental(marks, 'items', mark => mark.last_modified_time || mark.created_time);
        progress.addTotal(filtered.records.length);
        const entries: SyncPlanEntry[] = [];
        for (const mark of filtered.records) {
            this.throwIfCancelled(token);
            const entry = this.createItemEntry(mark);
            entries.push(entry);
            progress.advance(1, t('syncProgress.preparingFile', { title: entry.title }));
        }
        return {
            entries,
            skipped: filtered.skipped,
        };
    }

    private async buildCollectionEntries(
        token: SyncToken,
        progress: SyncProgressModal,
    ): Promise<{ entries: SyncPlanEntry[]; skipped: number }> {
        progress.setLabel(t('syncProgress.fetchingCollections'));
        const collections = await this.api.getAllCollections(this.getFetchOptions(token, progress));
        const filtered = this.filterIncremental(collections, 'collections', collection => collection.last_modified_time || collection.created_time);
        const entries: SyncPlanEntry[] = [];
        progress.addTotal(filtered.records.length);

        for (const collection of filtered.records) {
            this.throwIfCancelled(token);
            progress.setLabel(t('syncProgress.fetchingCollectionItems', { title: collection.title }));
            const items = await this.api.getAllCollectionItems(
                collection.uuid,
                this.getFetchOptions(token, progress, t('syncProgress.fetchingCollectionItems', { title: collection.title }))
            );
            const entry = this.createCollectionEntry(collection, items);
            entries.push(entry);
            progress.advance(1, t('syncProgress.preparingFile', { title: entry.title }));
        }

        return { entries, skipped: filtered.skipped };
    }

    private async buildNoteEntries(
        token: SyncToken,
        progress: SyncProgressModal,
    ): Promise<{ entries: SyncPlanEntry[]; skipped: number }> {
        progress.setLabel(t('syncProgress.fetchingNotes'));
        const notes = await this.api.getAllNotes(this.getFetchOptions(token, progress));
        const filtered = this.filterIncremental(notes, 'notes', note => note.last_modified_time || note.created_time);
        progress.addTotal(filtered.records.length);
        const entries: SyncPlanEntry[] = [];
        for (const note of filtered.records) {
            this.throwIfCancelled(token);
            const entry = this.createNoteEntry(note);
            entries.push(entry);
            progress.advance(1, t('syncProgress.preparingFile', { title: entry.title }));
        }
        return {
            entries,
            skipped: filtered.skipped,
        };
    }

    private async buildReviewEntries(
        token: SyncToken,
        progress: SyncProgressModal,
    ): Promise<{ entries: SyncPlanEntry[]; skipped: number }> {
        progress.setLabel(t('syncProgress.fetchingReviews'));
        const reviews = await this.api.getAllReviews(this.getFetchOptions(token, progress));
        const filtered = this.filterIncremental(reviews, 'reviews', review => review.last_modified_time || review.created_time);
        progress.addTotal(filtered.records.length);
        const entries: SyncPlanEntry[] = [];
        for (const review of filtered.records) {
            this.throwIfCancelled(token);
            const entry = this.createReviewEntry(review);
            entries.push(entry);
            progress.advance(1, t('syncProgress.preparingFile', { title: entry.title }));
        }
        return {
            entries,
            skipped: filtered.skipped,
        };
    }

    private async executeSyncPlan(plan: SyncPlan, token: SyncToken, progress: SyncProgressModal): Promise<number> {
        if (plan.entries.length === 0) {
            progress.setLabel(t('notice.noChanges'));
            return 0;
        }

        progress.addTotal(plan.entries.length);
        let count = 0;
        const batchSize = this.getBatchSize();

        for (let i = 0; i < plan.entries.length; i += batchSize) {
            const batch = plan.entries.slice(i, i + batchSize);
            for (const entry of batch) {
                this.throwIfCancelled(token);
                progress.setLabel(t('syncProgress.writing', { title: entry.title }));
                await this.writeNote(entry.folderPath, entry.fileName, entry.content);
                count++;
                progress.advance(1);
            }
            await this.yieldToUi();
        }

        return count;
    }

    private createItemEntry(mark: NeoDBUserMark): SyncPlanEntry {
        const data = prepareItemData(mark);
        const content = renderTemplate(this.settings.itemTemplate, data);
        const fileName = this.ensureFileName(generateFileName(this.settings.fileNamePattern, data), data.title);

        return {
            kind: 'items',
            title: data.title,
            folderPath: this.getItemFolderPath(data),
            fileName,
            content,
        };
    }

    private createCollectionEntry(collection: NeoDBCollection, items: NeoDBCollectionItem[]): SyncPlanEntry {
        const data = prepareCollectionData(collection, items);
        const content = renderTemplate(this.settings.collectionTemplate, data);
        const fileName = this.ensureFileName(sanitizeFileName(collection.title), collection.uuid);

        return {
            kind: 'collections',
            title: data.title,
            folderPath: `${this.settings.notesFolder}/collections`,
            fileName,
            content,
        };
    }

    private createNoteEntry(note: NeoDBNote): SyncPlanEntry {
        const data = prepareNoteData(note);
        const content = renderTemplate(this.settings.noteTemplate, data);
        const fileName = this.ensureFileName(
            sanitizeFileName(`Note - ${note.item.title} - ${note.uuid.slice(0, 8)}`),
            note.uuid,
        );

        return {
            kind: 'notes',
            title: data.item_title,
            folderPath: `${this.settings.notesFolder}/notes`,
            fileName,
            content,
        };
    }

    private createReviewEntry(review: NeoDBReview): SyncPlanEntry {
        const data = prepareReviewData(review);
        const content = renderTemplate(this.settings.reviewTemplate, data);
        const title = review.title || `Review - ${review.item.title}`;
        const fileName = this.ensureFileName(sanitizeFileName(title), review.uuid);

        return {
            kind: 'reviews',
            title: data.title || data.item_title,
            folderPath: `${this.settings.notesFolder}/reviews`,
            fileName,
            content,
        };
    }

    private getItemFolderPath(data: ItemTemplateData): string {
        const base = `${this.settings.notesFolder}/items`;
        if (!this.settings.organizeItemsByType) return base;
        const itemType = sanitizeFileName(data.type || 'unknown') || 'unknown';
        return `${base}/${itemType}`;
    }

    private filterIncremental<T>(
        records: T[],
        kind: SyncKind,
        getModifiedTime: (_record: T) => string | undefined,
    ): { records: T[]; skipped: number } {
        const since = this.getLastSyncTime(kind);
        if (!this.settings.incrementalSync || !since) {
            return { records, skipped: 0 };
        }

        const filtered = records.filter(record => this.wasModifiedAfter(getModifiedTime(record), since));
        return {
            records: filtered,
            skipped: records.length - filtered.length,
        };
    }

    private wasModifiedAfter(value: string | undefined, since: string): boolean {
        if (!value) return true;
        const modified = Date.parse(value);
        const baseline = Date.parse(since);
        if (Number.isNaN(modified) || Number.isNaN(baseline)) return true;
        return modified > baseline;
    }

    private getLastSyncTime(kind: SyncKind): string {
        if (kind === 'items') return this.settings.lastItemSyncTime || this.settings.lastSyncTime;
        if (kind === 'collections') return this.settings.lastCollectionSyncTime || this.settings.lastSyncTime;
        if (kind === 'notes') return this.settings.lastNoteSyncTime || this.settings.lastSyncTime;
        return this.settings.lastReviewSyncTime || this.settings.lastSyncTime;
    }

    private markSyncSuccess(kinds: SyncKind[]): void {
        const completedAt = new Date().toISOString();
        for (const kind of kinds) {
            if (kind === 'items') this.settings.lastItemSyncTime = completedAt;
            if (kind === 'collections') this.settings.lastCollectionSyncTime = completedAt;
            if (kind === 'notes') this.settings.lastNoteSyncTime = completedAt;
            if (kind === 'reviews') this.settings.lastReviewSyncTime = completedAt;
        }
        this.settings.lastSyncTime = completedAt;
    }

    private getEnabledSyncKinds(): SyncKind[] {
        const kinds: SyncKind[] = [];
        if (this.settings.syncItems) kinds.push('items');
        if (this.settings.syncCollections) kinds.push('collections');
        if (this.settings.syncNotes) kinds.push('notes');
        if (this.settings.syncReviews) kinds.push('reviews');
        return kinds;
    }

    private normalizeSyncKinds(kinds: SyncKind[]): SyncKind[] {
        const selected = new Set(kinds);
        return SYNC_KINDS.filter(kind => selected.has(kind));
    }

    private getSelectedShelfTypes(): ShelfType[] {
        return this.normalizeShelfTypes(this.settings.syncShelfTypes);
    }

    private normalizeShelfTypes(value: unknown): ShelfType[] {
        if (!Array.isArray(value)) return DEFAULT_SETTINGS.syncShelfTypes;
        const selected = value.filter((type): type is ShelfType => SHELF_TYPES.includes(type as ShelfType));
        return selected.length > 0 ? selected : DEFAULT_SETTINGS.syncShelfTypes;
    }

    private normalizePositiveInteger(value: number | undefined, fallback: number): number {
        if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
        return Math.floor(value);
    }

    private getBatchSize(): number {
        return this.normalizePositiveInteger(this.settings.batchSize, DEFAULT_SETTINGS.batchSize);
    }

    private getFetchOptions(token: SyncToken, progress: SyncProgressModal, progressLabel?: string) {
        return {
            pageSize: this.getBatchSize(),
            shouldCancel: () => token.cancelled,
            progressLabel,
            onProgress: (event: { addTotal?: number; increment?: number; label?: string }) => {
                if (event.addTotal) progress.addTotal(event.addTotal);
                if (event.increment) progress.advance(event.increment, event.label ?? progressLabel);
                if (!event.increment && event.label) progress.setLabel(event.label);
            },
        };
    }

    private throwIfCancelled(token: SyncToken): void {
        if (token.cancelled) {
            throw new Error(SYNC_CANCELLED_MESSAGE);
        }
    }

    private ensureFileName(value: string, fallback: string): string {
        return sanitizeFileName(value || fallback || 'Untitled') || 'Untitled';
    }

    private async yieldToUi(): Promise<void> {
        // eslint-disable-next-line no-undef -- setTimeout is a global in Obsidian's runtime
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}

class SyncProgressModal extends Modal {
    private token: SyncToken;
    private label = t('syncProgress.preparing');
    private current = 0;
    private total = 0;
    private labelEl: HTMLElement | null = null;
    private countEl: HTMLElement | null = null;
    private barEl: HTMLElement | null = null;
    private cancelButton: HTMLButtonElement | null = null;

    constructor(app: App, token: SyncToken) {
        super(app);
        this.token = token;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('neodb-sync-progress-modal');
        contentEl.empty();

        contentEl.createEl('h2', { text: t('syncProgress.title') });
        this.labelEl = contentEl.createDiv({ cls: 'neodb-sync-progress-label' });
        this.countEl = contentEl.createDiv({ cls: 'neodb-sync-progress-count' });

        const track = contentEl.createDiv({ cls: 'neodb-sync-progress-track' });
        this.barEl = track.createDiv({ cls: 'neodb-sync-progress-bar' });

        const buttonRow = contentEl.createDiv({ cls: 'neodb-modal-button-row' });
        this.cancelButton = buttonRow.createEl('button', { text: t('syncProgress.cancel'), cls: 'mod-warning' });
        this.cancelButton.addEventListener('click', () => {
            this.token.cancelled = true;
            if (this.cancelButton) {
                this.cancelButton.disabled = true;
            }
        });

        this.renderState();
    }

    onClose() {
        this.contentEl.empty();
        this.labelEl = null;
        this.countEl = null;
        this.barEl = null;
        this.cancelButton = null;
    }

    setLabel(label: string): void {
        this.label = label;
        this.renderState();
    }

    setPreparing(label: string): void {
        this.setLabel(label);
    }

    setTotal(total: number): void {
        this.total = Math.max(0, total);
        this.current = 0;
        this.renderState();
    }

    addTotal(amount: number): void {
        this.total += Math.max(0, amount);
        this.renderState();
    }

    advance(amount: number = 1, label?: string): void {
        this.current = Math.min(this.total, this.current + Math.max(0, amount));
        if (label) this.label = label;
        this.renderState();
    }

    update(current: number, label?: string): void {
        this.current = Math.max(0, current);
        if (label) this.label = label;
        this.renderState();
    }

    private renderState(): void {
        if (!this.labelEl || !this.countEl || !this.barEl) return;

        this.labelEl.setText(this.label);
        if (this.total > 0) {
            this.countEl.setText(t('syncProgress.done', { current: this.current, total: this.total }));
        } else {
            this.countEl.setText('');
        }

        const percent = this.total > 0
            ? Math.min(100, Math.round((this.current / this.total) * 100))
            : 0;
        this.barEl.style.width = `${percent}%`;
    }
}

class SyncPreviewModal extends Modal {
    private plugin: NeoDBPlugin;
    private plan: SyncPlan;

    constructor(app: App, plugin: NeoDBPlugin, plan: SyncPlan) {
        super(app);
        this.plugin = plugin;
        this.plan = plan;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('neodb-preview-modal');
        contentEl.empty();

        const total = this.plan.entries.length;
        contentEl.createEl('h2', { text: t('modal.preview.title') });
        contentEl.createEl('p', {
            text: total > 0
                ? t('modal.preview.summary', { count: total })
                : t('modal.preview.empty'),
        });

        const summaryList = contentEl.createEl('ul', { cls: 'neodb-preview-summary' });
        for (const kind of this.plan.kinds) {
            summaryList.createEl('li', {
                text: `${t(`sync.kind.${kind}`)}: ${this.plan.counts[kind]}`,
            });
        }

        const skipped = totalCounts(this.plan.skipped);
        if (skipped > 0) {
            contentEl.createEl('p', {
                cls: 'neodb-preview-skipped',
                text: t('modal.preview.skipped', { count: skipped }),
            });
        }

        if (total > 0) {
            contentEl.createEl('h3', { text: t('modal.preview.paths') });
            const pathList = contentEl.createEl('ul', { cls: 'neodb-preview-paths' });
            for (const entry of this.plan.entries.slice(0, PREVIEW_PATH_LIMIT)) {
                pathList.createEl('li', { text: `${entry.folderPath}/${entry.fileName}.md` });
            }

            const remaining = total - PREVIEW_PATH_LIMIT;
            if (remaining > 0) {
                pathList.createEl('li', {
                    cls: 'neodb-preview-more',
                    text: t('modal.preview.more', { count: remaining }),
                });
            }
        }

        const buttonRow = contentEl.createDiv({ cls: 'neodb-modal-button-row' });
        const closeBtn = buttonRow.createEl('button', { text: t('modal.preview.close') });
        closeBtn.addEventListener('click', () => this.close());

        const syncBtn = buttonRow.createEl('button', { text: t('modal.preview.sync'), cls: 'mod-cta' });
        syncBtn.addEventListener('click', () => {
            this.close();
            void this.plugin.runPreparedSync(this.plan);
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ImportModal extends Modal {
    plugin: NeoDBPlugin;
    importText: string = '';

    constructor(app: App, plugin: NeoDBPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: t('modal.import.title') });

        contentEl.createEl('p', {
            text: t('modal.import.instruction'),
        });

        new Setting(contentEl)
            .setName(t('modal.import.jsonData'))
            .addTextArea(text => {
                text.setPlaceholder(t('modal.import.placeholder'))
                    .setValue(this.importText)
                    .onChange(value => {
                        this.importText = value;
                    });
                text.inputEl.rows = 10;
                text.inputEl.cols = 50;
            });

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText(t('modal.import.import'))
                .setCta()
                .onClick(() => {
                    void (async () => {
                        try {
                            const data = JSON.parse(this.importText) as NeoDBImportData;
                            const count = await this.plugin.importData(data);
                            new Notice(t('notice.importSuccess', { count }));
                            this.close();
                        } catch (error: unknown) {
                            new Notice(t('notice.importFailed', { message: errorMessage(error) }));
                        }
                    })();
                }))
            .addButton(button => button
                .setButtonText(t('modal.import.cancel'))
                .onClick(() => {
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
