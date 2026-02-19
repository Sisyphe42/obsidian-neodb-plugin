export type ItemType = 'book' | 'movie' | 'tv' | 'music' | 'game' | 'podcast';

export type ShelfType = 'wishlist' | 'progress' | 'complete' | 'dropped';

export interface NeoDBItem {
  uuid: string;
  title: string;
  description?: string;
  cover_image_url?: string;
  type: ItemType;
  url: string;
  category?: string;
  rating?: number;
  rating_count?: number;
  author?: string[];
  translator?: string[];
  publisher?: string;
  publish_date?: string;
  language?: string;
  isbn?: string;
  duration?: string;
  genre?: string[];
  external_resources?: ExternalResource[];
  created_at?: string;
  last_modified?: string;
}

export interface ExternalResource {
  url: string;
  title: string;
}

export interface NeoDBUserMark {
  item: NeoDBItem;
  shelf_type: ShelfType;
  rating?: number;
  comment?: string;
  tags: string[];
  visibility: number;
  created_time: string;
  last_modified_time: string;
}

export interface NeoDBCollection {
  uuid: string;
  title: string;
  description?: string;
  cover_image_url?: string;
  items_count: number;
  followers_count: number;
  visibility: number;
  created_time: string;
  last_modified_time: string;
}

export interface NeoDBCollectionItem {
  item: NeoDBItem;
  note?: string;
  order: number;
  created_time: string;
}

export interface NeoDBFeaturedCollection {
  collection: NeoDBCollection;
  featured_time: string;
}

export interface NeoDBNote {
  uuid: string;
  item: NeoDBItem;
  content: string;
  visibility: number;
  created_time: string;
  last_modified_time: string;
}

export interface NeoDBReview {
  uuid: string;
  item: NeoDBItem;
  title?: string;
  content: string;
  rating?: number;
  visibility: number;
  created_time: string;
  last_modified_time: string;
}

export interface NeoDBProfile {
  url: string;
  external_acct?: string;
  display_name: string;
  avatar?: string;
}

export interface NeoDBPaginatedResponse<T> {
  data: T[];
  count: number;
  next?: string;
  previous?: string;
}

export interface NeoDBImportData {
  marks?: NeoDBUserMark[];
  collections?: NeoDBCollection[];
  reviews?: NeoDBReview[];
  notes?: NeoDBNote[];
}

export const DEFAULT_TEMPLATE = `---
type: {{type}}
neodb_uuid: {{uuid}}
rating: {{rating}}
shelf: {{shelf_type}}
tags:
{{#tags}}
  - {{.}}
{{/tags}}
created: {{created_time}}
modified: {{last_modified_time}}
neodb_url: {{url}}
---

# {{title}}

{{#cover_image_url}}
![cover]({{cover_image_url}})
{{/cover_image_url}}

{{#author}}
**作者**: {{.}}
{{/author}}

{{#description}}
## 简介
{{description}}
{{/description}}

{{#comment}}
## 我的备注
{{comment}}
{{/comment}}
`;

export const DEFAULT_COLLECTION_TEMPLATE = `---
neodb_collection_uuid: {{uuid}}
items_count: {{items_count}}
created: {{created_time}}
modified: {{last_modified_time}}
neodb_url: {{url}}
---

# {{title}}

{{#description}}
## 简介
{{description}}
{{/description}}

## 条目列表
{{#items}}
{{order}}. [[{{item_title}}]]
{{/items}}
`;
