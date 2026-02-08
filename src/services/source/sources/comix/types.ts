export interface ComixTerm {
  title: string;
}

export interface ComixPoster {
  small?: string;
  medium?: string;
  large?: string;
}

export interface ComixManga {
  hash_id: string;
  title: string;
  alt_titles?: string[];
  synopsis?: string;
  type?: string;
  poster: ComixPoster;
  status?: string;
  is_nsfw?: boolean;
  author?: ComixTerm[];
  artist?: ComixTerm[];
  genre?: ComixTerm[];
  theme?: ComixTerm[];
  demographic?: ComixTerm[];
}

export interface ComixPagination {
  current_page: number;
  last_page: number;
}

export interface ComixSearchResponse {
  result: {
    items: ComixManga[];
    pagination: ComixPagination;
  };
}

export interface ComixSingleMangaResponse {
  result: ComixManga;
}

export interface ComixScanlationGroup {
  name?: string;
}

export interface ComixChapter {
  chapter_id: number;
  scanlation_group_id?: number;
  number: number;
  name?: string;
  votes?: number;
  updated_at?: number;
  scanlation_group?: ComixScanlationGroup;
  is_official?: number;
}

export interface ComixChapterListResponse {
  result: {
    items: ComixChapter[];
    pagination: ComixPagination;
  };
}

export interface ComixChapterImage {
  url: string;
}

export interface ComixChapterResponse {
  result?: {
    chapter_id: number;
    images: ComixChapterImage[];
  };
}

