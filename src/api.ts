import { requestUrl, RequestUrlParam, Notice } from 'obsidian';
import {
    NeoDBItem,
    NeoDBUserMark,
    NeoDBCollection,
    NeoDBCollectionItem,
    NeoDBNote,
    NeoDBReview,
    NeoDBProfile,
    ShelfType,
    SHELF_TYPES,
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

interface FetchAllOptions {
    pageSize?: number;
    shouldCancel?: () => boolean;
    progressLabel?: string;
    onProgress?: (_event: FetchProgressEvent) => void;
}

interface FetchProgressEvent {
    addTotal?: number;
    increment?: number;
    label?: string;
}

interface RequestOptions {
    suppressDebugNotice?: boolean;
}

export interface NeoDBLibraryStats {
    shelf: Record<ShelfType, number>;
    shelfTotal: number;
    collections: number | null;
    notes: number | null;
    reviews: number | null;
}

export const SYNC_CANCELLED_MESSAGE = 'NeoDB sync cancelled';

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

class ApiRequestError extends Error {
    status?: number;

    constructor(message: string, status?: number) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
    }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value) || value < 1) return fallback;
    return Math.floor(value);
}

function sleep(ms: number): Promise<void> {
    // eslint-disable-next-line no-undef -- setTimeout is a global in Obsidian's runtime
    return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureNotCancelled(options?: FetchAllOptions): void {
    if (options?.shouldCancel?.()) {
        throw new Error(SYNC_CANCELLED_MESSAGE);
    }
}

function isCancellationError(error: unknown): boolean {
    return extractErrorMessage(error) === SYNC_CANCELLED_MESSAGE;
}

function hasNextPage<T>(response: PaginatedResponse<T>, page: number): boolean {
    if (typeof response.pages === 'number') return page < response.pages;
    return Boolean(response.next);
}

function reportPageProgress<T>(
    options: FetchAllOptions,
    response: PaginatedResponse<T>,
    page: number,
    label: string,
): void {
    if (!options.onProgress) return;
    const pages = typeof response.pages === 'number' ? Math.max(response.pages, 1) : undefined;
    if (pages !== undefined && page === 1) {
        options.onProgress({ addTotal: pages });
    } else if (pages === undefined) {
        options.onProgress({ addTotal: 1 });
    }
    options.onProgress({ increment: 1, label });
}

export class NeoDBAPI {
    private domain: string;
    private apiKey: string;
    private retryAttempts: number;
    private pageSize: number;

    constructor(domain: string, apiKey: string, retryAttempts: number = 3, pageSize: number = 50) {
        this.domain = domain.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.retryAttempts = normalizePositiveInteger(retryAttempts, 3);
        this.pageSize = normalizePositiveInteger(pageSize, 50);
    }

    updateConfig(domain: string, apiKey: string, retryAttempts: number = this.retryAttempts, pageSize: number = this.pageSize) {
        this.domain = domain.replace(/\/$/, '');
        this.apiKey = apiKey;
        this.retryAttempts = normalizePositiveInteger(retryAttempts, 3);
        this.pageSize = normalizePositiveInteger(pageSize, 50);
    }

    private async request<T>(
        endpoint: string,
        method: string = 'GET',
        data?: unknown,
        options: RequestOptions = {},
    ): Promise<T> {
        const url = `${this.domain}/api${endpoint}`;
        debugLog('Request:', method, url);

        const maxAttempts = normalizePositiveInteger(this.retryAttempts, 3);
        let lastError: unknown;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
                    throw new ApiRequestError(message, response.status);
                }
                return response.json as T;
            } catch (err: unknown) {
                lastError = err;
                if (!this.shouldRetry(err, attempt, maxAttempts)) break;
                debugLog(`Request failed, retrying ${attempt}/${maxAttempts}:`, extractErrorMessage(err));
                await sleep(400 * attempt);
            }
        }

        // eslint-disable-next-line no-undef -- console is a global in Obsidian's runtime
        console.error('[NeoDB Error]', lastError, 'URL:', url);
        const errorMessage = extractErrorMessage(lastError);
        if (debugMode && !options.suppressDebugNotice) {
            new Notice(`[NeoDB Debug] Error: ${errorMessage}\nURL: ${url}`, 8000);
        }
        throw new Error(errorMessage);
    }

    private shouldRetry(error: unknown, attempt: number, maxAttempts: number): boolean {
        if (attempt >= maxAttempts) return false;
        if (error instanceof ApiRequestError) {
            if (error.status === 408 || error.status === 429) return true;
            return error.status === undefined || error.status >= 500;
        }
        return true;
    }

    async getProfile(): Promise<NeoDBProfile> {
        return this.request<NeoDBProfile>('/me');
    }

    async getLibraryStats(): Promise<NeoDBLibraryStats> {
        const shelf: Record<ShelfType, number> = {
            wishlist: 0,
            progress: 0,
            complete: 0,
            dropped: 0,
        };

        for (const shelfType of SHELF_TYPES) {
            shelf[shelfType] = await this.getStatsCount(`/me/shelf/${shelfType}?page=1&page_size=1`) ?? 0;
        }

        return {
            shelf,
            shelfTotal: SHELF_TYPES.reduce((total, type) => total + shelf[type], 0),
            collections: await this.getStatsCount('/me/collection/?page=1&page_size=1'),
            notes: await this.getStatsCount('/me/note/?page=1&page_size=1'),
            reviews: await this.getStatsCount('/me/review/?page=1&page_size=1'),
        };
    }

    private async getStatsCount(endpoint: string): Promise<number | null> {
        try {
            const response = await this.request<PaginatedResponse<unknown>>(
                endpoint,
                'GET',
                undefined,
                { suppressDebugNotice: true },
            );
            return response.count ?? response.data.length;
        } catch (error: unknown) {
            debugLog('Stats count unavailable:', endpoint, extractErrorMessage(error));
            return null;
        }
    }

    async getShelf(
        shelfType: ShelfType = 'complete',
        page: number = 1,
        pageSize: number = this.pageSize
    ): Promise<PaginatedResponse<ShelfItemResponse>> {
        const endpoint = `/me/shelf/${shelfType}?page=${page}&page_size=${pageSize}`;
        debugLog('Getting shelf:', shelfType);
        return this.request<PaginatedResponse<ShelfItemResponse>>(endpoint);
    }

    async getAllShelfItems(shelfTypes: ShelfType[] = SHELF_TYPES, options: FetchAllOptions = {}): Promise<NeoDBUserMark[]> {
        const allItems: NeoDBUserMark[] = [];
        const types = shelfTypes.filter(type => SHELF_TYPES.includes(type));
        const pageSize = normalizePositiveInteger(options.pageSize, this.pageSize);

        if (types.length === 0) return allItems;

        for (const type of types) {
            let page = 1;
            let hasMore = true;
            let typeCount = 0;

            debugLog(`Fetching shelf type: ${type}`);
            new Notice(t('notice.fetchingShelf', { type }));

            while (hasMore) {
                ensureNotCancelled(options);
                try {
                    const response = await this.getShelf(type, page, pageSize);
                    const items = response.data || [];
                    if (items.length > 0) {
                        const marks = items.map(toUserMark);
                        allItems.push(...marks);
                        typeCount += items.length;
                        debugLog(`Page ${page}: ${items.length} items`);
                    }

                    reportPageProgress(options, response, page, t('syncProgress.fetchingShelfPage', { type, page }));

                    if (hasNextPage(response, page)) {
                        page++;
                    } else {
                        hasMore = false;
                    }
                } catch (error: unknown) {
                    if (isCancellationError(error)) throw error;
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

    async getCollections(page: number = 1, pageSize: number = this.pageSize): Promise<PaginatedResponse<NeoDBCollection>> {
        const endpoint = `/me/collection/?page=${page}&page_size=${pageSize}`;
        debugLog('Getting collections, page:', page);
        return this.request<PaginatedResponse<NeoDBCollection>>(endpoint);
    }

    async getAllCollections(options: FetchAllOptions = {}): Promise<NeoDBCollection[]> {
        const allCollections: NeoDBCollection[] = [];
        let page = 1;
        const pageSize = normalizePositiveInteger(options.pageSize, this.pageSize);
        let hasMore = true;

        debugLog('Fetching all collections');
        new Notice(t('notice.fetchingCollections'));

        while (hasMore) {
            ensureNotCancelled(options);
            try {
                const response = await this.getCollections(page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allCollections.push(...items);
                    debugLog(`Collections page ${page}: ${items.length} items`);
                }

                reportPageProgress(options, response, page, t('syncProgress.fetchingCollectionsPage', { page }));

                if (hasNextPage(response, page)) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                if (isCancellationError(error)) throw error;
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

    async getCollectionItems(collectionUuid: string, page: number = 1, pageSize: number = this.pageSize): Promise<PaginatedResponse<NeoDBCollectionItem>> {
        const endpoint = `/me/collection/${collectionUuid}/item/?page=${page}&page_size=${pageSize}`;
        return this.request<PaginatedResponse<NeoDBCollectionItem>>(endpoint);
    }

    async getAllCollectionItems(collectionUuid: string, options: FetchAllOptions = {}): Promise<NeoDBCollectionItem[]> {
        const allItems: NeoDBCollectionItem[] = [];
        let page = 1;
        const pageSize = normalizePositiveInteger(options.pageSize, this.pageSize);
        let hasMore = true;

        while (hasMore) {
            ensureNotCancelled(options);
            try {
                const response = await this.getCollectionItems(collectionUuid, page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allItems.push(...items);
                }

                reportPageProgress(
                    options,
                    response,
                    page,
                    options.progressLabel ?? t('syncProgress.fetchingCollectionItemsPage', { page })
                );

                if (hasNextPage(response, page)) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                if (isCancellationError(error)) throw error;
                hasMore = false;
            }
        }

        return allItems;
    }

    async getNotes(page: number = 1, pageSize: number = this.pageSize): Promise<PaginatedResponse<NeoDBNote>> {
        const endpoint = `/me/note/?page=${page}&page_size=${pageSize}`;
        debugLog('Getting notes, page:', page);
        return this.request<PaginatedResponse<NeoDBNote>>(endpoint);
    }

    async getAllNotes(options: FetchAllOptions = {}): Promise<NeoDBNote[]> {
        const allNotes: NeoDBNote[] = [];
        let page = 1;
        const pageSize = normalizePositiveInteger(options.pageSize, this.pageSize);
        let hasMore = true;

        debugLog('Fetching all notes');
        new Notice(t('notice.fetchingNotes'));

        while (hasMore) {
            ensureNotCancelled(options);
            try {
                const response = await this.getNotes(page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allNotes.push(...items);
                    debugLog(`Notes page ${page}: ${items.length} items`);
                }

                reportPageProgress(options, response, page, t('syncProgress.fetchingNotesPage', { page }));

                if (hasNextPage(response, page)) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                if (isCancellationError(error)) throw error;
                debugLog('Error fetching notes:', extractErrorMessage(error));
                hasMore = false;
            }
        }

        debugLog(`Total notes: ${allNotes.length}`);
        if (allNotes.length === 0) {
            new Notice(t('notice.noNotes'));
        } else {
            new Notice(t('notice.fetchedNotes', { count: allNotes.length }));
        }
        return allNotes;
    }

    async getReviews(page: number = 1, pageSize: number = this.pageSize): Promise<PaginatedResponse<NeoDBReview>> {
        const endpoint = `/me/review/?page=${page}&page_size=${pageSize}`;
        debugLog('Getting reviews, page:', page);
        return this.request<PaginatedResponse<NeoDBReview>>(endpoint);
    }

    async getAllReviews(options: FetchAllOptions = {}): Promise<NeoDBReview[]> {
        const allReviews: NeoDBReview[] = [];
        let page = 1;
        const pageSize = normalizePositiveInteger(options.pageSize, this.pageSize);
        let hasMore = true;

        debugLog('Fetching all reviews');
        new Notice(t('notice.fetchingReviews'));

        while (hasMore) {
            ensureNotCancelled(options);
            try {
                const response = await this.getReviews(page, pageSize);
                const items = response.data || [];
                if (items.length > 0) {
                    allReviews.push(...items);
                    debugLog(`Reviews page ${page}: ${items.length} items`);
                }

                reportPageProgress(options, response, page, t('syncProgress.fetchingReviewsPage', { page }));

                if (hasNextPage(response, page)) {
                    page++;
                } else {
                    hasMore = false;
                }
            } catch (error: unknown) {
                if (isCancellationError(error)) throw error;
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
