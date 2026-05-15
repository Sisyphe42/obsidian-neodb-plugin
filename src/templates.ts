import {
    NeoDBUserMark,
    NeoDBCollection,
    NeoDBCollectionItem,
    NeoDBNote,
    NeoDBReview,
} from './types';

export type TemplateData = Record<string, unknown>;

export function sanitizeFileName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]/g, '')
        .replace(/\n/g, ' ')
        .trim()
        .substring(0, 200);
}

function isEmptyValue(value: unknown): boolean {
    if (value === undefined || value === null || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
}

function stringifyScalar(value: unknown): string {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value.map(stringifyScalar).join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
        return String(value);
    }
    return '';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function renderTemplate(template: string, data: object): string {
    const record = data as Record<string, unknown>;
    let result = template;

    const conditionalRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    result = result.replace(conditionalRegex, (_match, key: string, content: string) => {
        return isEmptyValue(record[key]) ? '' : content;
    });

    const arrayRegex = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    result = result.replace(arrayRegex, (_match, key: string, content: string) => {
        const value = record[key];
        if (!Array.isArray(value)) return '';
        return value.map(item => {
            if (isPlainObject(item)) {
                let itemContent = content;
                for (const k of Object.keys(item)) {
                    itemContent = itemContent.replace(
                        new RegExp(`\\{\\{\\.${k}\\}\\}`, 'g'),
                        stringifyScalar(item[k])
                    );
                }
                return itemContent.replace(/\{\{\.\}\}/g, stringifyScalar(item));
            }
            return content.replace(/\{\{\.\}\}/g, stringifyScalar(item));
        }).join('');
    });

    const simpleValueRegex = /\{\{(\w+)\}\}/g;
    result = result.replace(simpleValueRegex, (_match, key: string) => {
        return stringifyScalar(record[key]);
    });

    result = result.replace(/\n{3,}/g, '\n\n');
    return result.trim();
}

export interface ItemTemplateData {
    uuid: string;
    title: string;
    type: string;
    description?: string;
    cover_image_url?: string;
    url: string;
    rating?: number;
    shelf_type?: string;
    comment?: string;
    tags: string[];
    created_time: string;
    last_modified_time: string;
    author?: string | string[];
    translator?: string | string[];
    publisher?: string;
    publish_date?: string;
    language?: string;
    isbn?: string;
    genre?: string | string[];
    external_resources?: Array<{ url: string; title: string }>;
}

export function prepareItemData(mark: NeoDBUserMark): ItemTemplateData {
    const item = mark.item;
    return {
        uuid: item.uuid,
        title: item.title,
        type: item.type,
        description: item.description,
        cover_image_url: item.cover_image_url,
        url: item.url,
        rating: mark.rating ?? item.rating,
        shelf_type: mark.shelf_type,
        comment: mark.comment,
        tags: mark.tags || [],
        created_time: mark.created_time,
        last_modified_time: mark.last_modified_time,
        author: item.author,
        translator: item.translator,
        publisher: item.publisher,
        publish_date: item.publish_date,
        language: item.language,
        isbn: item.isbn,
        genre: item.genre,
        external_resources: item.external_resources,
    };
}

export interface CollectionTemplateData {
    uuid: string;
    title: string;
    description?: string;
    cover_image_url?: string;
    items_count: number;
    followers_count: number;
    visibility: number;
    created_time: string;
    last_modified_time: string;
    url: string;
    items: Array<{ order: number; item_title: string; item_uuid: string; note?: string }>;
}

export function prepareCollectionData(
    collection: NeoDBCollection,
    items: NeoDBCollectionItem[]
): CollectionTemplateData {
    return {
        uuid: collection.uuid,
        title: collection.title,
        description: collection.description,
        cover_image_url: collection.cover_image_url,
        items_count: collection.items_count,
        followers_count: collection.followers_count,
        visibility: collection.visibility,
        created_time: collection.created_time,
        last_modified_time: collection.last_modified_time,
        url: `${collection.uuid}`,
        items: items.map((item, index) => ({
            order: item.order ?? index + 1,
            item_title: item.item.title,
            item_uuid: item.item.uuid,
            note: item.note,
        })),
    };
}

export interface NoteTemplateData {
    uuid: string;
    item_title: string;
    item_uuid: string;
    content: string;
    visibility: number;
    created_time: string;
    last_modified_time: string;
}

export function prepareNoteData(note: NeoDBNote): NoteTemplateData {
    return {
        uuid: note.uuid,
        item_title: note.item.title,
        item_uuid: note.item.uuid,
        content: note.content,
        visibility: note.visibility,
        created_time: note.created_time,
        last_modified_time: note.last_modified_time,
    };
}

export interface ReviewTemplateData {
    uuid: string;
    item_title: string;
    item_uuid: string;
    title?: string;
    content: string;
    rating?: number;
    visibility: number;
    created_time: string;
    last_modified_time: string;
}

export function prepareReviewData(review: NeoDBReview): ReviewTemplateData {
    return {
        uuid: review.uuid,
        item_title: review.item.title,
        item_uuid: review.item.uuid,
        title: review.title,
        content: review.content,
        rating: review.rating,
        visibility: review.visibility,
        created_time: review.created_time,
        last_modified_time: review.last_modified_time,
    };
}

export function generateFileName(pattern: string, data: object): string {
    const record = data as Record<string, unknown>;
    let fileName = pattern;

    for (const key of Object.keys(record)) {
        const value = record[key];
        if (value === undefined || value === null) continue;
        const stringValue = stringifyScalar(value);
        fileName = fileName.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), stringValue);
    }

    return sanitizeFileName(fileName);
}
