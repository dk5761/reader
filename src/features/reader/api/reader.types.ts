export interface ReaderArticle {
  id: string;
  title: string;
  summary?: string;
  source_url?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReaderArticlesResponse {
  articles: ReaderArticle[];
  page: number;
  limit: number;
  total: number;
}

export interface ReaderArticleListOptions {
  page?: number;
  limit?: number;
  query?: string;
  feed_id?: string;
}

export interface CreateArticlePayload {
  title: string;
  summary?: string;
  source_url: string;
  feed_id?: string;
}

export interface UpdateArticlePayload {
  title?: string;
  summary?: string;
  source_url?: string;
  feed_id?: string;
}
