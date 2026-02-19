import { App, PluginSettingTab, Setting, Notice, TFolder, AbstractInputSuggest } from 'obsidian';
import type NeoDBPlugin from './main';
import { DEFAULT_TEMPLATE, DEFAULT_COLLECTION_TEMPLATE } from './types';
import { setDebugMode } from './api';

export interface NeoDBSettings {
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

export class NeoDBSettingTab extends PluginSettingTab {
    plugin: NeoDBPlugin;

    constructor(app: App, plugin: NeoDBPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: '🧩 NeoDB Sync Settings' });

        new Setting(containerEl)
            .setName('NeoDB Domain')
            .setDesc('The domain of your NeoDB instance')
            .addButton(button => button
                .setButtonText('Open')
                .onClick(() => {
                    const domain = this.plugin.settings.neodbDomain || 'https://neodb.social';
                    // eslint-disable-next-line no-undef
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
            .setName('NeoDB API Key')
            .setDesc('Your NeoDB API access token')
            .addButton(button => button
                .setButtonText('Test')
                .onClick(async () => {
                    if (!this.plugin.settings.neodbApiKey) {
                        new Notice('Please enter your API key first');
                        return;
                    }
                    try {
                        const profile = await this.plugin.api.getProfile();
                        new Notice(`Connected as: ${profile.display_name}`);
                    } catch {
                        new Notice('Connection failed. Please check your settings.');
                    }
                }))
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.neodbApiKey)
                .onChange(async (value) => {
                    this.plugin.settings.neodbApiKey = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Notes Folder')
            .setDesc('Folder where NeoDB notes will be stored')
            .addText(text => {
                text.setPlaceholder('NeoDB')
                    .setValue(this.plugin.settings.notesFolder);
                new FolderSuggest(this.app, text.inputEl, (folder) => {
                    this.plugin.settings.notesFolder = folder;
                    this.plugin.saveSettings();
                });
                text.onChange(async (value) => {
                    this.plugin.settings.notesFolder = value;
                    await this.plugin.saveSettings();
                });
            });

        new Setting(containerEl)
            .setName('File Name Pattern')
            .setDesc('Pattern for generating file names. Available: {{title}}, {{type}}, {{uuid}}, {{author}}')
            .addText(text => text
                .setPlaceholder('{{title}}')
                .setValue(this.plugin.settings.fileNamePattern)
                .onChange(async (value) => {
                    this.plugin.settings.fileNamePattern = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync on Startup')
            .setDesc('Automatically sync NeoDB data when Obsidian starts')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncOnStartup)
                .onChange(async (value) => {
                    this.plugin.settings.syncOnStartup = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Incremental Sync')
            .setDesc('Only sync items modified since last sync (recommended)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.incrementalSync)
                .onChange(async (value) => {
                    this.plugin.settings.incrementalSync = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Sync Options' });

        new Setting(containerEl)
            .setName('Sync Items')
            .setDesc('Sync shelf items (wishlist, progress, complete, dropped)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncItems)
                .onChange(async (value) => {
                    this.plugin.settings.syncItems = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync Collections')
            .setDesc('Sync collections')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncCollections)
                .onChange(async (value) => {
                    this.plugin.settings.syncCollections = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync Notes')
            .setDesc('Sync notes')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncNotes)
                .onChange(async (value) => {
                    this.plugin.settings.syncNotes = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync Reviews')
            .setDesc('Sync reviews')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.syncReviews)
                .onChange(async (value) => {
                    this.plugin.settings.syncReviews = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Templates' });

        new Setting(containerEl)
            .setName('Item Template')
            .setDesc('Template for item notes')
            .addTextArea(text => text
                .setPlaceholder(DEFAULT_TEMPLATE)
                .setValue(this.plugin.settings.itemTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.itemTemplate = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Collection Template')
            .setDesc('Template for collection notes')
            .addTextArea(text => text
                .setPlaceholder(DEFAULT_COLLECTION_TEMPLATE)
                .setValue(this.plugin.settings.collectionTemplate)
                .onChange(async (value) => {
                    this.plugin.settings.collectionTemplate = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: 'Advanced' });

        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('⚠️ Enable debug logging. Open console with Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (Mac) to view logs.')
            .addToggle(toggle => {
                const updateToggleStyle = (enabled: boolean) => {
                    if (enabled) {
                        toggle.toggleEl.style.backgroundColor = 'var(--text-error)';
                        toggle.toggleEl.classList.add('debug-enabled');
                    } else {
                        toggle.toggleEl.style.backgroundColor = '';
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
