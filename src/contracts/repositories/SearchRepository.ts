import { SearchRequest, SearchResult } from "../search";

export interface SearchRepository {
  search(request: SearchRequest): SearchResult[];
  verifyIntegrity(): boolean;
}
