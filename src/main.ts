import { Plugin, Notice, TFile, TFolder, Modal, App, Setting } from 'obsidian';
import { NeoDBSettings, NeoDBSettingTab, DEFAULT_SETTINGS } from './settings';
import { NeoDBAPI, setDebugMode, debugLog } from './api';
import {
    renderTemplate,
    prepareItemData,
    prepareCollectionData,
    prepareNoteData,
    prepareReviewData,
    generateFileName,
    sanitizeFileName,
} from './templates';
import { NeoDBImportData } from './types';

export default class NeoDBPlugin extends Plugin {
    settings: NeoDBSettings;
    api: NeoDBAPI;

    async onload() {
        await this.loadSettings();
        this.api = new NeoDBAPI(this.settings.neodbDomain, this.settings.neodbApiKey);
        setDebugMode(this.settings.debugMode);

        this.addRibbonIcon('puzzle', 'Sync NeoDB', () => {
            this.startSync();
        });

        this.addCommand({
            id: 'sync-neodb',
            name: 'Sync NeoDB Data',
            callback: () => {
                this.startSync();
            },
        });

        this.addCommand({
            id: 'sync-neodb-items',
            name: 'Sync Shelf Items',
            callback: () => {
                this.syncItems();
            },
        });

        this.addCommand({
            id: 'sync-neodb-collections',
            name: 'Sync Collections',
            callback: () => {
                this.syncCollections();
            },
        });

        this.addCommand({
            id: 'import-neodb-data',
            name: 'Import NeoDB Export File',
            callback: () => {
                new ImportModal(this.app, this).open();
            },
        });

        this.addSettingTab(new NeoDBSettingTab(this.app, this));

        if (this.settings.syncOnStartup && this.settings.neodbApiKey) {
            this.app.workspace.onLayoutReady(() => {
                this.startSync();
            });
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.api.updateConfig(this.settings.neodbDomain, this.settings.neodbApiKey);
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

    async startSync() {
        if (!this.settings.neodbApiKey) {
            new Notice('Please configure your NeoDB API key in settings');
            return;
        }

        new Notice('Starting NeoDB sync...');
        let syncedCount = 0;

        try {
            if (this.settings.syncItems) {
                syncedCount += await this.syncItems();
            }

            if (this.settings.syncCollections) {
                syncedCount += await this.syncCollections();
            }

            if (this.settings.syncNotes) {
                syncedCount += await this.syncNotes();
            }

            if (this.settings.syncReviews) {
                syncedCount += await this.syncReviews();
            }

            this.settings.lastSyncTime = new Date().toISOString();
            await this.saveSettings();

            new Notice(`NeoDB sync completed. ${syncedCount} items synced.`);
        } catch (err: any) {
            // eslint-disable-next-line no-undef
            console.error('NeoDB sync error:', err);
            new Notice(`Sync failed: ${err.message}`);
        }
    }

    async syncItems(): Promise<number> {
        debugLog('Starting syncItems...');
        new Notice('Syncing shelf items...');
        
        const marks = await this.api.getAllShelfItems();
        debugLog('Got marks:', marks.length, marks);
        
        let count = 0;

        for (const mark of marks) {
            debugLog('Processing mark:', mark.item.title);
            const data = prepareItemData(mark);
            const content = renderTemplate(this.settings.itemTemplate, data);
            const fileName = generateFileName(this.settings.fileNamePattern, data);
            
            debugLog('Writing file:', fileName, 'to folder:', this.settings.notesFolder);
            const folderPath = `${this.settings.notesFolder}/items`;
            await this.writeNote(folderPath, fileName, content);
            count++;
        }

        debugLog('syncItems complete, count:', count);
        new Notice(`Synced ${count} shelf items`);
        return count;
    }

    async syncCollections(): Promise<number> {
        debugLog('Starting syncCollections...');
        new Notice('Syncing collections...');
        
        const collections = await this.api.getAllCollections();
        debugLog('Got collections:', collections.length, collections);
        
        let count = 0;

        for (const collection of collections) {
            debugLog('Processing collection:', collection.title);
            const items = await this.api.getAllCollectionItems(collection.uuid);
            const data = prepareCollectionData(collection, items);
            const content = renderTemplate(this.settings.collectionTemplate, data);
            const fileName = sanitizeFileName(collection.title);

            const folderPath = `${this.settings.notesFolder}/collections`;
            await this.writeNote(folderPath, fileName, content);
            count++;
        }

        debugLog('syncCollections complete, count:', count);
        new Notice(`Synced ${count} collections`);
        return count;
    }

    async syncNotes(): Promise<number> {
        new Notice('Syncing notes...');
        const notes = await this.api.getAllNotes();
        let count = 0;

        for (const note of notes) {
            const data = prepareNoteData(note);
            const template = `---
neodb_note_uuid: {{uuid}}
item_title: {{item_title}}
item_uuid: {{item_uuid}}
created: {{created_time}}
modified: {{last_modified_time}}
---

# Note on {{item_title}}

{{content}}
`;
            const content = renderTemplate(template, data);
            const fileName = sanitizeFileName(`Note - ${note.item.title}`);

            const folderPath = `${this.settings.notesFolder}/notes`;
            await this.writeNote(folderPath, fileName, content);
            count++;
        }

        new Notice(`Synced ${count} notes`);
        return count;
    }

    async syncReviews(): Promise<number> {
        new Notice('Syncing reviews...');
        const reviews = await this.api.getAllReviews();
        let count = 0;

        for (const review of reviews) {
            const data = prepareReviewData(review);
            const template = `---
neodb_review_uuid: {{uuid}}
item_title: {{item_title}}
item_uuid: {{item_uuid}}
rating: {{rating}}
created: {{created_time}}
modified: {{last_modified_time}}
---

# {{title}}

{{content}}
`;
            const content = renderTemplate(template, data);
            const title = review.title || `Review - ${review.item.title}`;
            const fileName = sanitizeFileName(title);

            const folderPath = `${this.settings.notesFolder}/reviews`;
            await this.writeNote(folderPath, fileName, content);
            count++;
        }

        new Notice(`Synced ${count} reviews`);
        return count;
    }

    async importData(data: NeoDBImportData): Promise<number> {
        let count = 0;

        if (data.marks && data.marks.length > 0) {
            new Notice('Importing marks...');
            for (const mark of data.marks) {
                const itemData = prepareItemData(mark);
                const content = renderTemplate(this.settings.itemTemplate, itemData);
                const fileName = generateFileName(this.settings.fileNamePattern, itemData);

                const folderPath = `${this.settings.notesFolder}/items`;
                await this.writeNote(folderPath, fileName, content);
                count++;
            }
        }

        if (data.collections && data.collections.length > 0) {
            new Notice('Importing collections...');
            for (const collection of data.collections) {
                const collectionData = prepareCollectionData(collection, []);
                const content = renderTemplate(this.settings.collectionTemplate, collectionData);
                const fileName = sanitizeFileName(collection.title);

                const folderPath = `${this.settings.notesFolder}/collections`;
                await this.writeNote(folderPath, fileName, content);
                count++;
            }
        }

        if (data.notes && data.notes.length > 0) {
            new Notice('Importing notes...');
            for (const note of data.notes) {
                const noteData = prepareNoteData(note);
                const template = `---
neodb_note_uuid: {{uuid}}
item_title: {{item_title}}
item_uuid: {{item_uuid}}
created: {{created_time}}
modified: {{last_modified_time}}
---

# Note on {{item_title}}

{{content}}
`;
                const content = renderTemplate(template, noteData);
                const fileName = sanitizeFileName(`Note - ${note.item.title}`);

                const folderPath = `${this.settings.notesFolder}/notes`;
                await this.writeNote(folderPath, fileName, content);
                count++;
            }
        }

        if (data.reviews && data.reviews.length > 0) {
            new Notice('Importing reviews...');
            for (const review of data.reviews) {
                const reviewData = prepareReviewData(review);
                const template = `---
neodb_review_uuid: {{uuid}}
item_title: {{item_title}}
item_uuid: {{item_uuid}}
rating: {{rating}}
created: {{created_time}}
modified: {{last_modified_time}}
---

# {{title}}

{{content}}
`;
                const content = renderTemplate(template, reviewData);
                const title = review.title || `Review - ${review.item.title}`;
                const fileName = sanitizeFileName(title);

                const folderPath = `${this.settings.notesFolder}/reviews`;
                await this.writeNote(folderPath, fileName, content);
                count++;
            }
        }

        return count;
    }

    onunload() {}
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
        contentEl.createEl('h2', { text: 'Import NeoDB Data' });

        contentEl.createEl('p', {
            text: 'Paste your NeoDB exported JSON data below:',
        });

        new Setting(contentEl)
            .setName('JSON Data')
            .addTextArea(text => {
                text.setPlaceholder('Paste JSON here...')
                    .setValue(this.importText)
                    .onChange(value => {
                        this.importText = value;
                    });
                text.inputEl.rows = 10;
                text.inputEl.cols = 50;
            });

        new Setting(contentEl)
            .addButton(button => button
                .setButtonText('Import')
                .setCta()
                .onClick(async () => {
                    try {
                        const data = JSON.parse(this.importText) as NeoDBImportData;
                        const count = await this.plugin.importData(data);
                        new Notice(`Imported ${count} items successfully`);
                        this.close();
                    } catch (error: any) {
                        new Notice(`Import failed: ${error.message}`);
                    }
                }))
            .addButton(button => button
                .setButtonText('Cancel')
                .onClick(() => {
                    this.close();
                }));
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
