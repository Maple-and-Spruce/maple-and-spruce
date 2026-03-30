/**
 * Etsy Taxonomy Service
 *
 * Provides access to Etsy's seller taxonomy tree for categorizing listings.
 * The taxonomy is relatively stable, so results should be cached.
 *
 * @see https://developers.etsy.com/documentation/reference/
 */
import type { EtsyHttp } from '../http/etsy-http.js';
import type {
  EtsyTaxonomyNode,
  EtsyTaxonomyResponse,
} from '../types/taxonomy.types.js';

export class TaxonomyService {
  private cachedNodes: EtsyTaxonomyNode[] | null = null;

  constructor(private readonly http: EtsyHttp) {}

  /**
   * Get the full seller taxonomy tree.
   *
   * Results are cached in memory after the first call.
   * Call `clearCache()` to force a refresh.
   *
   * @returns Array of top-level taxonomy nodes (with nested children)
   */
  async getTaxonomyNodes(): Promise<EtsyTaxonomyNode[]> {
    if (this.cachedNodes) {
      return this.cachedNodes;
    }

    const response = await this.http.get<EtsyTaxonomyResponse>(
      '/seller-taxonomy/nodes'
    );

    this.cachedNodes = response.results;
    return this.cachedNodes;
  }

  /**
   * Find a taxonomy node by ID.
   *
   * Searches the full tree (depth-first) for a matching node.
   *
   * @param taxonomyId - The taxonomy node ID to find
   * @returns The matching node, or null if not found
   */
  async findNodeById(
    taxonomyId: number
  ): Promise<EtsyTaxonomyNode | null> {
    const nodes = await this.getTaxonomyNodes();
    return this.searchTree(nodes, taxonomyId);
  }

  /**
   * Get a flat list of all leaf nodes (categories with no children).
   *
   * Useful for building a searchable category picker.
   *
   * @returns Flat array of leaf taxonomy nodes
   */
  async getLeafNodes(): Promise<EtsyTaxonomyNode[]> {
    const nodes = await this.getTaxonomyNodes();
    const leaves: EtsyTaxonomyNode[] = [];
    this.collectLeaves(nodes, leaves);
    return leaves;
  }

  /**
   * Get the full path of category names for a taxonomy ID.
   *
   * @param taxonomyId - The taxonomy node ID
   * @returns Array of category names from root to the node, or null if not found
   */
  async getPath(taxonomyId: number): Promise<string[] | null> {
    const node = await this.findNodeById(taxonomyId);
    if (!node) return null;

    const names: string[] = [];
    const nodes = await this.getTaxonomyNodes();

    for (const id of node.full_path_taxonomy_ids) {
      const pathNode = this.searchTree(nodes, id);
      if (pathNode) {
        names.push(pathNode.name);
      }
    }

    return names;
  }

  /**
   * Clear the in-memory taxonomy cache.
   */
  clearCache(): void {
    this.cachedNodes = null;
  }

  private searchTree(
    nodes: EtsyTaxonomyNode[],
    targetId: number
  ): EtsyTaxonomyNode | null {
    for (const node of nodes) {
      if (node.id === targetId) return node;
      if (node.children.length > 0) {
        const found = this.searchTree(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  private collectLeaves(
    nodes: EtsyTaxonomyNode[],
    leaves: EtsyTaxonomyNode[]
  ): void {
    for (const node of nodes) {
      if (node.children.length === 0) {
        leaves.push(node);
      } else {
        this.collectLeaves(node.children, leaves);
      }
    }
  }
}
