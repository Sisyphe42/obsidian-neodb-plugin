import { App, Modal, Notice, PluginSettingTab, Setting, TFolder, AbstractInputSuggest } from 'obsidian';
import type NeoDBPlugin from './main';
import {
    DEFAULT_TEMPLATE,
    DEFAULT_COLLECTION_TEMPLATE,
    getDefaultItemTemplate,
    getDefaultCollectionTemplate,
} from './types';
import { setDebugMode } from './api';
import { t, setLocale, LocaleSetting } from './i18n';

export interface NeoDBSettings {
    locale: LocaleSetting;
    neodbDomain: string;
    neodbApiKey: string;
    notesFolder: string;
    itemTemplate: string;
    collectionTemplate: string;
    syncOnStartup: boolean;
    incrementalSync: boolean;
    lastSyncTime: string;
    syncShelfTypes: string[];
    syncItems: boolean;
    syncCollections: boolean;
    syncNotes: boolean;
    syncReviews: boolean;
    fileNamePattern: string;
    debugMode: boolean;
}

export const DEFAULT_SETTINGS: NeoDBSettings = {
    locale: 'auto',
    neodbDomain: 'https://neodb.social',
    neodbApiKey: '',
    notesFolder: 'NeoDB',
    itemTemplate: DEFAULT_TEMPLATE,
    collectionTemplate: DEFAULT_COLLECTION_TEMPLATE,
    syncOnStartup: false,
    incrementalSync: true,
    lastSyncTime: '',
    syncShelfTypes: ['wishlist', 'progress', 'complete', 'dropped'],
    syncItems: true,
    syncCollections: true,
    syncNotes: true,
    syncReviews: true,
    fileNamePattern: '{{title}}',
    debugMode: false,
};

type TemplateKind = 'item' | 'collection';

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

        new Setting(containerEl)
            .setName(t('settings.domain.name'))
            .setDesc(t('settings.domain.desc'))
            .addButton(button => button
                .setButtonText(t('settings.domain.open'))
                .onClick(() => {
                    const domain = this.plugin.settings.neodbDomain || 'https://neodb.social';
                    // eslint-disable-next-line no-undef -- window is a global in Obsidian's runtime
                    window.open(domain, '_blank');
                }))
            .addText(text => text
                .setPlaceholder('https://neodb.social')
                .setValue(this.plugin.settings.neodbDomain)
                .onChange(async (value) => {
                    this.plugin.settings.neodbDomain = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName(t('settings.apiKey.name'))
            .setDesc(t('settings.apiKey.desc'))
            .addButton(button => button
                .setButtonText(t('settings.apiKey.test'))
                .onClick(async () => {
                    if (!this.plugin.settings.neodbApiKey) {
                        new Notice(t('notice.enterApiKey'));
                        return;
                    }
                    try {
                        const profile = await this.plugin.api.getProfile();
                        new Notice(t('notice.connectedAs', { name: profile.display_name }));
                    } catch {
                        new Notice(t('notice.connectionFailed'));
                    }
                }))
            .addText(text => text
                .setPlaceholder(t('settings.apiKey.placeholder'))
                .setValue(this.plugin.settings.neodbApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.neodbApiKey = value;
                    await this.plugin.saveSettings();
                }));

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

        new Setting(containerEl)
            .setName(t('settings.advanced.heading'))
            .setHeading();

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

    private renderTemplateSetting(kind: TemplateKind): void {
        const { containerEl } = this;
        const isItem = kind === 'item';
        const name = isItem ? t('settings.itemTemplate.name') : t('settings.collectionTemplate.name');
        const desc = isItem ? t('settings.itemTemplate.desc') : t('settings.collectionTemplate.desc');

        const getValue = () => isItem
            ? this.plugin.settings.itemTemplate
            : this.plugin.settings.collectionTemplate;
        const setValue = async (value: string) => {
            if (isItem) {
                this.plugin.settings.itemTemplate = value;
            } else {
                this.plugin.settings.collectionTemplate = value;
            }
            await this.plugin.saveSettings();
        };
        const getDefault = () => isItem ? getDefaultItemTemplate() : getDefaultCollectionTemplate();

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
            f.toLowerCase().contains(lowerInputStr)
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
            text: this.kind === 'item'
                ? t('modal.templateEditor.titleItem')
                : t('modal.templateEditor.titleCollection'),
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
                    const def = this.kind === 'item'
                        ? getDefaultItemTemplate()
                        : getDefaultCollectionTemplate();
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
            text: this.kind === 'item'
                ? t('modal.variables.titleItem')
                : t('modal.variables.titleCollection'),
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

function buildVariableGroups(kind: TemplateKind): VariableGroup[] {
    const simpleFields = kind === 'item' ? ITEM_SIMPLE_FIELDS : COLLECTION_SIMPLE_FIELDS;
    const arrayFields = kind === 'item' ? ITEM_ARRAY_FIELDS : COLLECTION_ARRAY_FIELDS;

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
