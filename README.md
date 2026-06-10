# NeoDB Sync

Sync [NeoDB](https://neodb.net/) data to your vault.

## Features

- Sync shelf items (wishlist, progress, complete, dropped)
- Sync collections, notes, and reviews
- Preview files before syncing
- Progress modal that covers fetching, planning, and writing
- Cancel an active sync
- Incremental sync based on per-content last sync timestamps
- Optional type-based item folders, such as `book/`, `movie/`, `music/`, and `game/`
- Customizable templates for items, collections, notes, and reviews
- Template variable picker and editor
- Custom NeoDB domain support
- Account connection panel with remote and local library stats
- English and Simplified Chinese UI
- Import NeoDB exported JSON data

## Installation

1. Download `main.js`, `manifest.json`, `styles.css`
2. Place in `.obsidian/plugins/neodb-sync/`
3. Enable in Obsidian settings

## Configuration

1. Open the plugin settings.
2. In **Connect NeoDB account**, enter your NeoDB domain and API key.
3. Get an API key from [NeoDB Developer](https://neodb.social/developer/) or your custom instance.
4. Choose the notes folder and sync options.
5. Adjust templates if you want a custom Markdown format.

After connection, the account panel shows the connected account, instance link, last sync time, NeoDB library stats, and local note counts.

## Usage

- Click the ribbon icon or run "Sync NeoDB data" command
- Use "Preview NeoDB sync" to review files before writing
- Use "Cancel NeoDB sync" while a sync is running
- Use individual commands for shelf items, collections, notes, and reviews
- Use "Import NeoDB export file" to import exported JSON

## Templates

Templates use Mustache-like syntax:

```text
{{title}}
{{#cover_image_url}}![cover]({{cover_image_url}}){{/cover_image_url}}
{{#tags}}
- {{.}}
{{/tags}}
```

Available variables can be viewed from each template setting.

## Acknowledgements

- [obsidian-douban](https://github.com/Wanxp/obsidian-douban)
- [obsidian-weread-plugin](https://github.com/zhaohongxuan/obsidian-weread-plugin)
