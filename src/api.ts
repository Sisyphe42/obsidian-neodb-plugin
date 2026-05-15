import { requestUrl, RequestUrlParam, Notice } from 'obsidian';
import {
    NeoDBItem,
    NeoDBUserMark,
    NeoDBCollection,
    NeoDBCollectionItem,
    NeoDBNote,
    NeoDBReview,
    NeoDBProfile,
    ShelfType
} from './types';
import { t } from './i18n';

interface PaginatedResponse<T> {
    data: T[];
    pages?: number;
    count?: number;
    next?: string | null;
}

interface ApiErrorBody {
    detail?: string;
    error?: string;
}

let debugMode = false;

export function setDebugMode(enabled: boolean) {
    debugMode = enabled;
}

export function debugLog(...args: unknown[]) {
    if (debugMode) {
        // eslint-disable-next-line no-undef -- console is a global in Obsidian's runtime
        console.log('[NeoDB Debug]', ...args);
    }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
    return typeof value === 'object' && value !== null
        && ('detail' in value || 'error' in value);
}

function extractErrorMessage(err: unknown, fallback = 'Unknown error'): string {
    if (err instanceof Error) {
        const maybeJson = (err as { json?: unknown }).json;
        if (isApiErrorBody(maybeJson)) {
            return maybeJson.detail ?? maybeJson.error ?? err.message ?? fallback;
        }
        return err.message || fallback;
    }
    if (typeof err === 'string') return err;
    return fallback;
}

export class NeoDBAPI {
    private domain: string;
    private apiKey: string;

    constructor(domain: string, apiKey: string) {
        this.domain = domain.replace(/\/$/, '');
        this.apiKey = apiKey;
    }

    updateConfig(domain: string, apiKey: string) {
        this.domain = domain.replace(/\/$/, '');
        this.apiKey = apiKey;
    }

    private async request<T>(endpoint: string, method: string = 'GET', data?: unknown): Promise<T> {
        const url = `${this.domain}/api${endpoint}`;

        debugLog('Request:', method, url);

        const options: RequestUrlParam = {
            url,
            method,
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
        };

        if (data !== undefined) {
            options.body = JSON.stringify(data);
            debugLog('Request body:', data);
        }

        try {
            const response = await requestUrl(options);
            debugLog('Response status:', response.status);
            debugLog('Response data:', response.json);

            if (response.status >= 400) {
                const body: unknown = response.json;
                const message = isApiErrorBody(body)
                    ? (body.detail ?? body.error ?? `HTTP ${response.status}`)
                    : `HTTP ${response.status}`;
                throw new Error(message);
            }
            return response.json as T;
        } catch (err: unknown) {
            // eslint-disable-next-line no-undef -- console is a global in Obsidian's runtime
            console.error('[NeoDB Error]', err, 'URL:', url);
            const errorMessage = extractErrorMessage(err);
            if (debugMode) {
                new Notice(`[NeoDB Debug] Error: ${errorMessage}\nURL: ${url}`, 8000);
            }
            throw new Error(errorMessage);
        }
    }

    async getProfile(): Promise<NeoDBProfile> {
        return this.request<NeoDBProfile>('/me');
    }

    async getShelf(
        shelfType: ShelfType = 'complete',
        page: number = 1,
        pageSize: number = 50
    ): Promise<PaginatedResponse<ShelfItemResponse>> {
        const endpoint = `/me/shelf/${shelfType}?page=${page}&page_size=${pageSize}`;
        debugLog('Getting shelf:', shelfType);
        return this.request<PaginatedResponse<ShelfItemResponse>>(endpoint);
    }

    async getAllShelfItems(shelfType?: ShelfType): Promise<NeoDBUserMark[]> {
        const allItems: NeoDBUserMark[] = [];
        const types: ShelfType[] = shelfType ? [shelfType] : ['wishlist', 'progress', 'complete', 'dropped'];

        for (const type of types) {
            let page = 1;
            const pageSize = 50;
            let hasMore = true;
            let typeCount = 0;

            debugLog(`Fetching shelf type: ${type}`);
            new Notice(t('notice.fetchingShelf', { type }));

            while (hasMore) {
                try {
                    const response = await this.getShelf(type, page, pageSize);
                    const items = response.data || [];
                    if (items.length > 0) {
                        const marks = items.map(toUserMark);
                        allItems.push(...marks);
                        typeCount += items.length;
                        debugLog(`Page ${page}: ${items.length} items`);
                    }

                    if (items.length === pageSize && response.pages && page < response.pages) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                } catch (error: unknown) {
                    debugLog(`Error fetching ${type}:`, extractErrorMessage(error));
                    hasMore = false;
                }
            }

            if (typeCount > 0) {
                new Notice(t('notice.fetchedShelf', { count: typeCount, type }));
            }
        }

        debugLog(`Total shelf items: ${allItems.length}`);
        return allItems;
    }

    async getCollections(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<NeoDBCollection>> {
        const endpoint = `/me/collection/?page=${page}&page_size=${pageSize}`;
        debugLog('Getting collections, page:', page);
        return this.request<PaginatedResponse<NeoDBCollection>>(endpoint);
    }

    async getAllCollections(): Promise<NeoDBCollection[]> {
        const allCollections: NeoDBCollection[] = [];
        let page = 1;
        const pageSize = 50;
        let hasMore = true;

        debugLog('Fetching all collections');
        new Notice(t('notice.fetchingCollections'));

        while (hasMore) {
            try {
                const response = await this.getCollections(page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allCollections.push(...items);
                    debugLog(`Collections page ${page}: ${items.length} items`);
                }

                if (items.length === pageSize && response.pages && page < response.pages) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                debugLog('Error fetching collections:', extractErrorMessage(error));
                hasMore = false;
            }
        }

        debugLog(`Total collections: ${allCollections.length}`);
        if (allCollections.length === 0) {
            new Notice(t('notice.noCollections'));
        } else {
            new Notice(t('notice.fetchedCollections', { count: allCollections.length }));
        }
        return allCollections;
    }

    async getCollectionItems(collectionUuid: string, page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<NeoDBCollectionItem>> {
        const endpoint = `/me/collection/${collectionUuid}/item/?page=${page}&page_size=${pageSize}`;
        return this.request<PaginatedResponse<NeoDBCollectionItem>>(endpoint);
    }

    async getAllCollectionItems(collectionUuid: string): Promise<NeoDBCollectionItem[]> {
        const allItems: NeoDBCollectionItem[] = [];
        let page = 1;
        const pageSize = 50;
        let hasMore = true;

        while (hasMore) {
            try {
                const response = await this.getCollectionItems(collectionUuid, page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allItems.push(...items);
                }

                if (items.length === pageSize && response.pages && page < response.pages) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch {
                hasMore = false;
            }
        }

        return allItems;
    }

    async getReviews(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<NeoDBReview>> {
        const endpoint = `/me/review/?page=${page}&page_size=${pageSize}`;
        debugLog('Getting reviews, page:', page);
        return this.request<PaginatedResponse<NeoDBReview>>(endpoint);
    }

    async getAllReviews(): Promise<NeoDBReview[]> {
        const allReviews: NeoDBReview[] = [];
        let page = 1;
        const pageSize = 50;
        let hasMore = true;

        debugLog('Fetching all reviews');
        new Notice(t('notice.fetchingReviews'));

        while (hasMore) {
            try {
                const response = await this.getReviews(page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allReviews.push(...items);
                    debugLog(`Reviews page ${page}: ${items.length} items`);
                }

                if (items.length === pageSize && response.pages && page < response.pages) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                debugLog('Error fetching reviews:', extractErrorMessage(error));
                hasMore = false;
            }
        }

        debugLog(`Total reviews: ${allReviews.length}`);
        if (allReviews.length === 0) {
            new Notice(t('notice.noReviews'));
        } else {
            new Notice(t('notice.fetchedReviews', { count: allReviews.length }));
        }
        return allReviews;
    }

    async getItem(uuid: string): Promise<NeoDBItem> {
        return this.request<NeoDBItem>(`/item/${uuid}`);
    }

    async getAllNotes(): Promise<NeoDBNote[]> {
        debugLog('Notes API not fully supported - returning empty array');
        new Notice(t('notice.notesNotSupported'));
        return [];
    }
}

interface ShelfItemResponse {
    item: NeoDBItem;
    shelf_type: ShelfType;
    rating?: number;
    comment?: string;
    tags: string[];
    visibility: number;
    created_time: string;
    last_modified_time: string;
}

function toUserMark(item: ShelfItemResponse): NeoDBUserMark {
    return {
        item: item.item,
        shelf_type: item.shelf_type,
        rating: item.rating,
        comment: item.comment,
        tags: item.tags || [],
        visibility: item.visibility || 0,
        created_time: item.created_time || '',
        last_modified_time: item.last_modified_time || '',
    };
}
