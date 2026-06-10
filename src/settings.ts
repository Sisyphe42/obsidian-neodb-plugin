import { App, Modal, Notice, PluginSettingTab, Setting, TFile, TFolder, AbstractInputSuggest } from 'obsidian';
import type NeoDBPlugin from './main';
import {
    DEFAULT_TEMPLATE,
    DEFAULT_COLLECTION_TEMPLATE,
    DEFAULT_NOTE_TEMPLATE,
    DEFAULT_REVIEW_TEMPLATE,
    getDefaultItemTemplate,
    getDefaultCollectionTemplate,
    getDefaultNoteTemplate,
    getDefaultReviewTemplate,
    SHELF_TYPES,
} from './types';
import type { NeoDBProfile, ShelfType } from './types';
import { setDebugMode } from './api';
import type { NeoDBLibraryStats } from './api';
import { t, setLocale, LocaleSetting } from './i18n';

export interface NeoDBConnectedAccount {
    displayName: string;
    url: string;
    externalAccount?: string;
    avatar?: string;
    checkedAt: string;
    domain: string;
    remoteStats?: NeoDBLibraryStats;
}

interface LocalLibraryStats {
    items: number;
    collections: number;
    notes: number;
    reviews: number;
    total: number;
}

export interface NeoDBSettings {
    locale: LocaleSetting;
    neodbDomain: string;
    neodbApiKey: string;
    connectedAccount: NeoDBConnectedAccount | null;
    notesFolder: string;
    itemTemplate: string;
    collectionTemplate: string;
    noteTemplate: string;
    reviewTemplate: string;
    syncOnStartup: boolean;
    incrementalSync: boolean;
    lastSyncTime: string;
    lastItemSyncTime: string;
    lastCollectionSyncTime: string;
    lastNoteSyncTime: string;
    lastReviewSyncTime: string;
    syncShelfTypes: ShelfType[];
    syncItems: boolean;
    syncCollections: boolean;
    syncNotes: boolean;
    syncReviews: boolean;
    organizeItemsByType: boolean;
    showSyncPreview: boolean;
    batchSize: number;
    retryAttempts: number;
    fileNamePattern: string;
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: NeoDBSettings = {
    locale: 'auto',
    neodbDomain: 'https://neodb.social',
    neodbApiKey: '',
    connectedAccount: null,
    notesFolder: 'NeoDB',
    itemTemplate: DEFAULT_TEMPLATE,
    collectionTemplate: DEFAULT_COLLECTION_TEMPLATE,
    noteTemplate: DEFAULT_NOTE_TEMPLATE,
    reviewTemplate: DEFAULT_REVIEW_TEMPLATE,
    syncOnStartup: false,
    incrementalSync: true,
    lastSyncTime: '',
    lastItemSyncTime: '',
    lastCollectionSyncTime: '',
    lastNoteSyncTime: '',
    lastReviewSyncTime: '',
    syncShelfTypes: ['wishlist', 'progress', 'complete', 'dropped'],
    syncItems: true,
    syncCollections: true,
    syncNotes: true,
    syncReviews: true,
    organizeItemsByType: false,
    showSyncPreview: false,
    batchSize: 50,
    retryAttempts: 3,
    fileNamePattern: '{{title}}',
    debugMode: false,
};

type TemplateKind = 'item' | 'collection' | 'note' | 'review';

export class NeoDBSettingTab extends PluginSettingTab {
    plugin: NeoDBPlugin;

    constructor(app: App, plugin: NeoDBPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        new Setting(containerEl)
            .setName(t('settings.language.name'))
            .setDesc(t('settings.language.desc'))
            .addDropdown(dropdown => {
                dropdown
                    .addOption('auto', t('settings.language.auto'))
                    .addOption('en', t('settings.language.en'))
                    .addOption('zh-CN', t('settings.language.zhCN'))
                    .setValue(this.plugin.settings.locale || 'auto')
                    .onChange(async (value) => {
                        const locale = value as LocaleSetting;
                        this.plugin.settings.locale = locale;
                        setLocale(locale);
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });

        const apiStatusEl = containerEl.createDiv({ cls: 'neodb-api-status-container' });
        this.renderApiStatus(apiStatusEl);

        new Setting(containerEl)
            .setName(t('settings.notesFolder.name'))
            .setDesc(t('settings.notesFolder.desc'))
            .addText(text => {
                text.setPlaceholder('NeoDB')
                    .setValue(this.plugin.settings.notesFolder);
                new FolderSuggest(this.app, text.inputEl, (folder) => {
                    this.plugin.settings.notesFolder = folder;
                    void this.plugin.saveSettings();
                });
                text.onChange(async (value) => {
                    this.plugin.settings.notesFolder = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName(t('settings.fileNamePattern.name'))
            .setDesc(t('settings.fileNamePattern.desc'))
            .addText(text => text
                .setPlaceholder('{{title}}')
                .setValue(this.plugin.settings.fileNamePattern)
                .onChange(async (value) => {
                    this.plugin.settings.fileNamePattern = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.syncOnStartup.name'))
            .setDesc(t('settings.syncOnStartup.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.incrementalSync.name'))
            .setDesc(t('settings.incrementalSync.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.incrementalSync)
                .onChange(async (value) => {
                    this.plugin.settings.incrementalSync = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.showSyncPreview.name'))
            .setDesc(t('settings.showSyncPreview.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showSyncPreview)
                .onChange(async (value) => {
                    this.plugin.settings.showSyncPreview = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.organizeItemsByType.name'))
            .setDesc(t('settings.organizeItemsByType.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.organizeItemsByType)
                .onChange(async (value) => {
                    this.plugin.settings.organizeItemsByType = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.syncOptions.heading'))
            .setHeading();

        new Setting(containerEl)
            .setName(t('settings.syncItems.name'))
            .setDesc(t('settings.syncItems.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncItems)
                .onChange(async (value) => {
                    this.plugin.settings.syncItems = value;
                    await this.plugin.saveSettings();
                }));

        this.renderShelfTypeSettings();

        new Setting(containerEl)
            .setName(t('settings.syncCollections.name'))
            .setDesc(t('settings.syncCollections.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncCollections)
                .onChange(async (value) => {
                    this.plugin.settings.syncCollections = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.syncNotes.name'))
            .setDesc(t('settings.syncNotes.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncNotes)
                .onChange(async (value) => {
                    this.plugin.settings.syncNotes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.syncReviews.name'))
            .setDesc(t('settings.syncReviews.desc'))
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncReviews)
                .onChange(async (value) => {
                    this.plugin.settings.syncReviews = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.templates.heading'))
            .setHeading();

        this.renderTemplateSetting('item');
        this.renderTemplateSetting('collection');
        this.renderTemplateSetting('note');
        this.renderTemplateSetting('review');

        new Setting(containerEl)
            .setName(t('settings.advanced.heading'))
            .setHeading();

        this.renderNumberSetting(
            t('settings.batchSize.name'),
            t('settings.batchSize.desc'),
            this.plugin.settings.batchSize,
            async (value) => {
                this.plugin.settings.batchSize = value;
                await this.plugin.saveSettings();
            },
            50,
        );

        this.renderNumberSetting(
            t('settings.retryAttempts.name'),
            t('settings.retryAttempts.desc'),
            this.plugin.settings.retryAttempts,
            async (value) => {
                this.plugin.settings.retryAttempts = value;
                await this.plugin.saveSettings();
            },
            3,
        );

        new Setting(containerEl)
            .setName(t('settings.debugMode.name'))
            .setDesc(t('settings.debugMode.desc'))
            .addToggle(toggle => {
                const updateToggleStyle = (enabled: boolean) => {
                    if (enabled) {
                        toggle.toggleEl.classList.add('debug-enabled');
                    } else {
                        toggle.toggleEl.classList.remove('debug-enabled');
                    }
                };

                toggle.setValue(this.plugin.settings.debugMode)
                    .onChange(async (value) => {
                        this.plugin.settings.debugMode = value;
                        setDebugMode(value);
                        updateToggleStyle(value);
                        await this.plugin.saveSettings();
                    });
                updateToggleStyle(this.plugin.settings.debugMode);
            });
    }

    private toConnectedAccount(profile: NeoDBProfile, remoteStats?: NeoDBLibraryStats): NeoDBConnectedAccount {
        return {
            displayName: profile.display_name,
            url: profile.url,
            externalAccount: profile.external_acct,
            avatar: profile.avatar,
            checkedAt: new Date().toISOString(),
            domain: this.plugin.settings.neodbDomain,
            remoteStats,
        };
    }

    private renderApiStatus(container: HTMLElement): void {
        const account = this.plugin.settings.connectedAccount;
        if (!account) {
            this.renderLoginPanel(container);
            return;
        }

        const grid = container.createDiv({ cls: 'neodb-api-status-grid' });
        this.renderConnectedAccount(grid, account);
        this.renderLibraryStats(grid, account.remoteStats, this.getLocalLibraryStats());
    }

    private renderLoginPanel(container: HTMLElement): void {
        const panel = container.createDiv({ cls: 'neodb-api-status-panel neodb-api-login-panel' });
        panel.createEl('div', {
            cls: 'neodb-api-panel-title',
            text: t('settings.login.title'),
        });

        let domain = this.plugin.settings.neodbDomain || DEFAULT_SETTINGS.neodbDomain;
        let apiKey = '';

        new Setting(panel)
            .setName(t('settings.domain.name'))
            .setDesc(t('settings.domain.desc'))
            .addText(text => text
                .setPlaceholder(DEFAULT_SETTINGS.neodbDomain)
                .setValue(domain)
                .onChange((value) => {
                    domain = value.trim() || DEFAULT_SETTINGS.neodbDomain;
                }));

        new Setting(panel)
            .setName(t('settings.apiKey.name'))
            .setDesc(t('settings.apiKey.desc'))
            .addText(text => {
                text.setPlaceholder(t('settings.apiKey.placeholder'))
                    .setValue(apiKey)
                    .onChange((value) => {
                        apiKey = value.trim();
                    });
                text.inputEl.type = 'password';
            });

        const buttonRow = panel.createDiv({ cls: 'neodb-login-button-row' });
        const loginButton = buttonRow.createEl('button', {
            text: t('settings.login.connect'),
            cls: 'mod-cta',
        });
        loginButton.addEventListener('click', () => {
            void this.loginWithCredentials(domain, apiKey);
        });
    }

    private async loginWithCredentials(domain: string, apiKey: string): Promise<void> {
        if (!apiKey) {
            new Notice(t('notice.enterApiKey'));
            return;
        }

        new Notice(t('notice.verifyingAccount'));

        const previousDomain = this.plugin.settings.neodbDomain;
        const previousApiKey = this.plugin.settings.neodbApiKey;

        this.plugin.api.updateConfig(domain, apiKey, this.plugin.settings.retryAttempts, this.plugin.settings.batchSize);
        try {
            const profile = await this.plugin.api.getProfile();
            let remoteStats: NeoDBLibraryStats | undefined;
            try {
                remoteStats = await this.plugin.api.getLibraryStats();
            } catch {
                remoteStats = undefined;
            }

            this.plugin.settings.neodbDomain = domain;
            this.plugin.settings.neodbApiKey = apiKey;
            this.plugin.settings.connectedAccount = this.toConnectedAccount(profile, remoteStats);
            await this.plugin.saveSettings();
            new Notice(t('notice.connectedAs', { name: profile.display_name }));
            this.display();
        } catch {
            this.plugin.api.updateConfig(
                previousDomain,
                previousApiKey,
                this.plugin.settings.retryAttempts,
                this.plugin.settings.batchSize,
            );
            new Notice(t('notice.connectionFailed'));
        }
    }

    private renderConnectedAccount(container: HTMLElement, account: NeoDBConnectedAccount): void {
        const card = container.createDiv({ cls: 'neodb-api-status-panel neodb-api-account-panel' });
        const header = card.createDiv({ cls: 'neodb-api-panel-header' });
        header.createEl('div', {
            cls: 'neodb-api-panel-title',
            text: t('settings.connectedAccount.label'),
        });
        const logoutButton = header.createEl('button', {
            cls: 'neodb-api-logout-button',
            text: t('settings.connectedAccount.logout'),
        });
        logoutButton.addEventListener('click', () => {
            void this.logoutAccount();
        });

        const body = card.createDiv({ cls: 'neodb-api-account-body' });
        if (account.avatar) {
            const avatar = body.createEl('img', { cls: 'neodb-api-account-avatar' });
            avatar.src = account.avatar;
            avatar.alt = account.displayName;
        }

        const details = body.createDiv({ cls: 'neodb-api-account-details' });

        if (account.url) {
            const link = details.createEl('a', {
                cls: 'neodb-api-account-name',
                text: account.displayName,
            });
            link.href = account.url;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
        } else {
            details.createEl('div', {
                cls: 'neodb-api-account-name',
                text: account.displayName,
            });
        }

        const list = card.createDiv({ cls: 'neodb-api-info-list' });
        this.renderInfoRow(
            list,
            t('settings.connectedAccount.instance'),
            account.domain || this.plugin.settings.neodbDomain,
            this.formatInstanceUrl(account.domain || this.plugin.settings.neodbDomain),
        );
        this.renderInfoRow(list, t('settings.connectedAccount.lastSync'), this.formatLastSyncTime());
    }

    private async logoutAccount(): Promise<void> {
        this.plugin.settings.neodbApiKey = '';
        this.plugin.settings.connectedAccount = null;
        await this.plugin.saveSettings();
        this.display();
    }

    private renderLibraryStats(
        container: HTMLElement,
        remoteStats: NeoDBLibraryStats | undefined,
        localStats: LocalLibraryStats,
    ): void {
        const panel = container.createDiv({ cls: 'neodb-api-status-panel neodb-api-stats-panel' });
        panel.createEl('div', {
            cls: 'neodb-api-panel-title',
            text: t('settings.libraryStats.title'),
        });

        const columns = panel.createDiv({ cls: 'neodb-api-stats-columns' });
        const remoteColumn = columns.createDiv({ cls: 'neodb-api-stats-column' });
        remoteColumn.createEl('div', {
            cls: 'neodb-api-stats-heading',
            text: t('settings.libraryStats.remote'),
        });

        if (remoteStats) {
            this.renderStatGrid(remoteColumn, [
                [t('settings.libraryStats.shelf'), remoteStats.shelfTotal],
                [t('settings.libraryStats.collections'), remoteStats.collections],
                [t('settings.libraryStats.notes'), remoteStats.notes],
                [t('settings.libraryStats.reviews'), remoteStats.reviews],
            ]);
            remoteColumn.createEl('div', {
                cls: 'neodb-api-stats-breakdown',
                text: this.formatShelfBreakdown(remoteStats),
            });
        } else {
            remoteColumn.createEl('div', {
                cls: 'neodb-api-stats-empty',
                text: t('settings.libraryStats.remoteUnavailable'),
            });
        }

        const localColumn = columns.createDiv({ cls: 'neodb-api-stats-column' });
        localColumn.createEl('div', {
            cls: 'neodb-api-stats-heading',
            text: t('settings.libraryStats.local'),
        });
        this.renderStatGrid(localColumn, [
            [t('settings.libraryStats.items'), localStats.items],
            [t('settings.libraryStats.collections'), localStats.collections],
            [t('settings.libraryStats.notes'), localStats.notes],
            [t('settings.libraryStats.reviews'), localStats.reviews],
        ]);
        localColumn.createEl('div', {
            cls: 'neodb-api-stats-breakdown',
            text: t('settings.libraryStats.localTotal', { count: localStats.total }),
        });
    }

    private renderStatGrid(container: HTMLElement, stats: Array<[string, number | null]>): void {
        const grid = container.createDiv({ cls: 'neodb-api-stat-grid' });
        for (const [label, value] of stats) {
            const item = grid.createDiv({ cls: 'neodb-api-stat-item' });
            item.createEl('span', { cls: 'neodb-api-stat-value', text: value === null ? '-' : String(value) });
            item.createEl('span', { cls: 'neodb-api-stat-label', text: label });
        }
    }

    private renderInfoRow(container: HTMLElement, label: string, value: string, href?: string): void {
        const row = container.createDiv({ cls: 'neodb-api-info-row' });
        row.createEl('span', { cls: 'neodb-api-info-label', text: label });
        if (href) {
            const link = row.createEl('a', { cls: 'neodb-api-info-value', text: value || '-' });
            link.href = href;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            return;
        }
        row.createEl('span', { cls: 'neodb-api-info-value', text: value || '-' });
    }

    private formatLastSyncTime(): string {
        if (!this.plugin.settings.lastSyncTime) return t('settings.connectedAccount.neverSynced');
        return this.formatCheckedAt(this.plugin.settings.lastSyncTime);
    }

    private formatInstanceUrl(domain: string): string {
        if (!domain) return '';
        return /^https?:\/\//.test(domain) ? domain : `https://${domain}`;
    }

    private formatShelfBreakdown(stats: NeoDBLibraryStats): string {
        return SHELF_TYPES
            .map(type => `${t(`settings.shelfType.${type}.short`)} ${stats.shelf[type]}`)
            .join(' / ');
    }

    private getLocalLibraryStats(): LocalLibraryStats {
        const base = this.normalizeFolderPath(this.plugin.settings.notesFolder || DEFAULT_SETTINGS.notesFolder);
        const items = this.countMarkdownFilesUnder(`${base}/items`);
        const collections = this.countMarkdownFilesUnder(`${base}/collections`);
        const notes = this.countMarkdownFilesUnder(`${base}/notes`);
        const reviews = this.countMarkdownFilesUnder(`${base}/reviews`);

        return {
            items,
            collections,
            notes,
            reviews,
            total: items + collections + notes + reviews,
        };
    }

    private countMarkdownFilesUnder(folderPath: string): number {
        const prefix = `${this.normalizeFolderPath(folderPath)}/`;
        return this.app.vault.getMarkdownFiles()
            .filter((file: TFile) => file.path.startsWith(prefix))
            .length;
    }

    private normalizeFolderPath(path: string): string {
        return path.replace(/^\/+|\/+$/g, '');
    }

    private formatCheckedAt(value: string): string {
        const timestamp = Date.parse(value);
        if (Number.isNaN(timestamp)) return value;
        return new Date(timestamp).toLocaleString();
    }

    private renderShelfTypeSettings(): void {
        for (const shelfType of SHELF_TYPES) {
            new Setting(this.containerEl)
                .setName(t(`settings.shelfType.${shelfType}.name`))
                .setDesc(t(`settings.shelfType.${shelfType}.desc`))
                .addToggle(toggle => toggle
                    .setValue(this.plugin.settings.syncShelfTypes.includes(shelfType))
                    .onChange(async (value) => {
                        const selected = new Set(this.plugin.settings.syncShelfTypes);
                        if (value) {
                            selected.add(shelfType);
                        } else if (selected.size > 1) {
                            selected.delete(shelfType);
                        } else {
                            new Notice(t('notice.selectAtLeastOneShelf'));
                            toggle.setValue(true);
                            return;
                        }
                        this.plugin.settings.syncShelfTypes = SHELF_TYPES.filter(type => selected.has(type));
                        await this.plugin.saveSettings();
                    }));
        }
    }

    private renderNumberSetting(
        name: string,
        desc: string,
        value: number,
        onSave: (_value: number) => Promise<void>,
        fallback: number,
    ): void {
        new Setting(this.containerEl)
            .setName(name)
            .setDesc(desc)
            .addText(text => text
                .setPlaceholder(String(fallback))
                .setValue(String(value || fallback))
                .onChange(async (rawValue) => {
                    const parsed = Number.parseInt(rawValue, 10);
                    if (!Number.isFinite(parsed) || parsed < 1) return;
                    await onSave(parsed);
                }));
    }

    private renderTemplateSetting(kind: TemplateKind): void {
        const { containerEl } = this;
        const name = t(`settings.${kind}Template.name`);
        const desc = t(`settings.${kind}Template.desc`);

        const getValue = () => {
            if (kind === 'item') return this.plugin.settings.itemTemplate;
            if (kind === 'collection') return this.plugin.settings.collectionTemplate;
            if (kind === 'note') return this.plugin.settings.noteTemplate;
            return this.plugin.settings.reviewTemplate;
        };
        const setValue = async (value: string) => {
            if (kind === 'item') {
                this.plugin.settings.itemTemplate = value;
            } else if (kind === 'collection') {
                this.plugin.settings.collectionTemplate = value;
            } else if (kind === 'note') {
                this.plugin.settings.noteTemplate = value;
            } else {
                this.plugin.settings.reviewTemplate = value;
            }
            await this.plugin.saveSettings();
        };
        const getDefault = () => {
            if (kind === 'item') return getDefaultItemTemplate();
            if (kind === 'collection') return getDefaultCollectionTemplate();
            if (kind === 'note') return getDefaultNoteTemplate();
            return getDefaultReviewTemplate();
        };

        const setting = new Setting(containerEl)
            .setName(name)
            .setDesc(desc);

        setting.addExtraButton(btn => btn
            .setIcon('list')
            .setTooltip(t('settings.template.variables'))
            .onClick(() => {
                new VariablesModal(this.app, kind).open();
            }));

        setting.addExtraButton(btn => btn
            .setIcon('pencil')
            .setTooltip(t('settings.template.edit'))
            .onClick(() => {
                new TemplateEditorModal(this.app, kind, getValue(), async (newValue) => {
                    await setValue(newValue);
                    this.display();
                }).open();
            }));

        setting.addExtraButton(btn => btn
            .setIcon('rotate-ccw')
            .setTooltip(t('settings.template.reset'))
            .onClick(async () => {
                new ConfirmModal(
                    this.app,
                    t('modal.templateEditor.confirmReset'),
                    async () => {
                        await setValue(getDefault());
                        new Notice(t('notice.templateReset'));
                        this.display();
                    }
                ).open();
            }));

        const textareaContainer = containerEl.createDiv({ cls: 'neodb-template-preview' });
        const textarea = textareaContainer.createEl('textarea', {
            cls: 'neodb-setting-textarea',
        });
        textarea.value = getValue();
        textarea.spellcheck = false;
        textarea.addEventListener('change', () => {
            void setValue(textarea.value);
        });
    }
}

class FolderSuggest extends AbstractInputSuggest<string> {
    private folders: string[];
    private inputElement: HTMLInputElement;
    private onSelectCallback: (_folder: string) => void;

    constructor(app: App, inputEl: HTMLInputElement, onSelectCallback: (_folder: string) => void) {
        super(app, inputEl);
        this.inputElement = inputEl;
        this.onSelectCallback = onSelectCallback;
        this.folders = this.getFolders();
    }

    private getFolders(): string[] {
        const folders: string[] = [];
        const root = this.app.vault.getRoot();

        const recurse = (fld: TFolder) => {
            folders.push(fld.path);
            fld.children.forEach(child => {
                if (child instanceof TFolder) {
                    recurse(child);
                }
            });
        };
        recurse(root);
        return folders;
    }

    getSuggestions(inputStr: string): string[] {
        const lowerInputStr = inputStr.toLowerCase();
        return this.folders.filter(f =>
            f.toLowerCase().includes(lowerInputStr)
        );
    }

    renderSuggestion(f: string, el: HTMLElement): void {
        el.setText(f);
    }

    selectSuggestion(f: string): void {
        this.onSelectCallback(f);
        this.inputElement.value = f;
        this.inputElement.dispatchEvent(new Event('input'));
        this.close();
    }
}

class TemplateEditorModal extends Modal {
    private kind: TemplateKind;
    private value: string;
    private onSave: (_value: string) => void | Promise<void>;
    private textarea: HTMLTextAreaElement;

    constructor(app: App, kind: TemplateKind, initialValue: string, onSave: (_value: string) => void | Promise<void>) {
        super(app);
        this.kind = kind;
        this.value = initialValue;
        this.onSave = onSave;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('neodb-template-editor');
        contentEl.empty();

        contentEl.createEl('h2', {
            text: t(`modal.templateEditor.title.${this.kind}`),
        });

        const editorWrapper = contentEl.createDiv({ cls: 'neodb-template-editor-wrapper' });
        const variablesPane = editorWrapper.createDiv({ cls: 'neodb-template-editor-variables' });
        renderVariablesInto(variablesPane, this.kind, (token) => {
            insertAtCursor(this.textarea, token);
            this.value = this.textarea.value;
        });

        const editorPane = editorWrapper.createDiv({ cls: 'neodb-template-editor-pane' });
        this.textarea = editorPane.createEl('textarea', { cls: 'neodb-template-editor-textarea' });
        this.textarea.value = this.value;
        this.textarea.spellcheck = false;
        this.textarea.addEventListener('input', () => {
            this.value = this.textarea.value;
        });

        const buttonRow = contentEl.createDiv({ cls: 'neodb-modal-button-row' });

        const resetBtn = buttonRow.createEl('button', { text: t('modal.templateEditor.reset') });
        resetBtn.addEventListener('click', () => {
            new ConfirmModal(
                this.app,
                t('modal.templateEditor.confirmReset'),
                () => {
                    const def = getDefaultTemplate(this.kind);
                    this.textarea.value = def;
                    this.value = def;
                }
            ).open();
        });

        const cancelBtn = buttonRow.createEl('button', { text: t('modal.templateEditor.cancel') });
        cancelBtn.addEventListener('click', () => this.close());

        const saveBtn = buttonRow.createEl('button', { text: t('modal.templateEditor.save'), cls: 'mod-cta' });
        saveBtn.addEventListener('click', () => {
            void (async () => {
                await this.onSave(this.value);
                this.close();
            })();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

class VariablesModal extends Modal {
    private kind: TemplateKind;

    constructor(app: App, kind: TemplateKind) {
        super(app);
        this.kind = kind;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        modalEl.addClass('neodb-variables-modal');
        contentEl.empty();

        contentEl.createEl('h2', {
            text: t(`modal.variables.title.${this.kind}`),
        });

        renderVariablesInto(contentEl, this.kind, (token) => {
            copyToClipboard(token);
            new Notice(t('modal.variables.copied', { value: token }));
        });

        const buttonRow = contentEl.createDiv({ cls: 'neodb-modal-button-row' });
        const closeBtn = buttonRow.createEl('button', { text: t('modal.variables.close'), cls: 'mod-cta' });
        closeBtn.addEventListener('click', () => this.close());
    }

    onClose() {
        this.contentEl.empty();
    }
}

class ConfirmModal extends Modal {
    private message: string;
    private onConfirm: () => void | Promise<void>;

    constructor(app: App, message: string, onConfirm: () => void | Promise<void>) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl('p', { text: this.message });

        const buttonRow = contentEl.createDiv({ cls: 'neodb-modal-button-row' });
        const cancelBtn = buttonRow.createEl('button', { text: t('modal.templateEditor.cancel') });
        cancelBtn.addEventListener('click', () => this.close());

        const confirmBtn = buttonRow.createEl('button', {
            text: t('modal.templateEditor.reset'),
            cls: 'mod-warning',
        });
        confirmBtn.addEventListener('click', () => {
            void (async () => {
                await this.onConfirm();
                this.close();
            })();
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

interface VariableGroup {
    titleKey: string;
    descKey: string;
    tokens: string[];
}

const ITEM_SIMPLE_FIELDS = [
    'uuid', 'title', 'type', 'description', 'cover_image_url', 'url', 'rating',
    'shelf_type', 'comment', 'created_time', 'last_modified_time',
    'author', 'translator', 'publisher', 'publish_date', 'language', 'isbn', 'genre',
];

const ITEM_ARRAY_FIELDS: Array<{ name: string; itemFields?: string[] }> = [
    { name: 'tags' },
    { name: 'external_resources', itemFields: ['url', 'title'] },
];

const COLLECTION_SIMPLE_FIELDS = [
    'uuid', 'title', 'description', 'cover_image_url', 'items_count',
    'followers_count', 'visibility', 'created_time', 'last_modified_time', 'url',
];

const COLLECTION_ARRAY_FIELDS: Array<{ name: string; itemFields?: string[] }> = [
    { name: 'items', itemFields: ['order', 'item_title', 'item_uuid', 'note'] },
];

const NOTE_SIMPLE_FIELDS = [
    'uuid', 'item_title', 'item_uuid', 'item_type', 'item_url',
    'content', 'visibility', 'created_time', 'last_modified_time',
];

const REVIEW_SIMPLE_FIELDS = [
    'uuid', 'item_title', 'item_uuid', 'item_type', 'item_url',
    'title', 'content', 'rating', 'visibility', 'created_time', 'last_modified_time',
];

function getDefaultTemplate(kind: TemplateKind): string {
    if (kind === 'item') return getDefaultItemTemplate();
    if (kind === 'collection') return getDefaultCollectionTemplate();
    if (kind === 'note') return getDefaultNoteTemplate();
    return getDefaultReviewTemplate();
}

function buildVariableGroups(kind: TemplateKind): VariableGroup[] {
    let simpleFields: string[];
    let arrayFields: Array<{ name: string; itemFields?: string[] }>;

    if (kind === 'item') {
        simpleFields = ITEM_SIMPLE_FIELDS;
        arrayFields = ITEM_ARRAY_FIELDS;
    } else if (kind === 'collection') {
        simpleFields = COLLECTION_SIMPLE_FIELDS;
        arrayFields = COLLECTION_ARRAY_FIELDS;
    } else if (kind === 'note') {
        simpleFields = NOTE_SIMPLE_FIELDS;
        arrayFields = [];
    } else {
        simpleFields = REVIEW_SIMPLE_FIELDS;
        arrayFields = [];
    }

    const simple: string[] = simpleFields.map(f => `{{${f}}}`);
    const conditional: string[] = simpleFields.map(f => `{{#${f}}}...{{/${f}}}`);
    const iteration: string[] = [];
    for (const arr of arrayFields) {
        if (arr.itemFields && arr.itemFields.length > 0) {
            const inner = arr.itemFields.map(f => `{{.${f}}}`).join(' ');
            iteration.push(`{{#${arr.name}}}\n  ${inner}\n{{/${arr.name}}}`);
        } else {
            iteration.push(`{{#${arr.name}}}\n  {{.}}\n{{/${arr.name}}}`);
        }
    }

    return [
        { titleKey: 'modal.variables.simple', descKey: 'modal.variables.simpleDesc', tokens: simple },
        { titleKey: 'modal.variables.conditional', descKey: 'modal.variables.conditionalDesc', tokens: conditional },
        { titleKey: 'modal.variables.iteration', descKey: 'modal.variables.iterationDesc', tokens: iteration },
    ];
}

function renderVariablesInto(
    container: HTMLElement,
    kind: TemplateKind,
    onTokenClick: (_token: string) => void,
): void {
    const groups = buildVariableGroups(kind);
    const root = container.createDiv({ cls: 'neodb-variables-list' });

    for (const group of groups) {
        const section = root.createDiv({ cls: 'neodb-variables-group' });
        section.createEl('h4', { text: t(group.titleKey) });
        section.createEl('p', { text: t(group.descKey), cls: 'neodb-variables-desc' });

        const chipRow = section.createDiv({ cls: 'neodb-variables-chips' });
        for (const token of group.tokens) {
            const chip = chipRow.createEl('button', { cls: 'neodb-variable-chip' });
            chip.textContent = token;
            chip.addEventListener('click', (e) => {
                e.preventDefault();
                onTokenClick(token);
            });
        }
    }

    root.createEl('p', { text: t('modal.variables.copy'), cls: 'neodb-variables-hint' });
}

function insertAtCursor(textarea: HTMLTextAreaElement, text: string): void {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = textarea.value.substring(0, start);
    const after = textarea.value.substring(end);
    textarea.value = before + text + after;
    const cursorPos = start + text.length;
    textarea.selectionStart = cursorPos;
    textarea.selectionEnd = cursorPos;
    textarea.focus();
    textarea.dispatchEvent(new Event('input'));
}

function copyToClipboard(text: string): void {
    // eslint-disable-next-line no-undef -- navigator is a global in Obsidian's runtime
    const nav = (typeof navigator !== 'undefined') ? navigator : undefined;
    if (nav?.clipboard?.writeText) {
        nav.clipboard.writeText(text).catch(() => {});
    }
}
