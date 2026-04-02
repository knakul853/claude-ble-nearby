export declare function generatePseudonym(bleUuid: string): string;
interface IdentityOptions {
    identity: 'pseudo' | 'git';
    displayName: string | null;
    gitName?: string;
}
export declare function resolveDisplayName(bleUuid: string, opts: IdentityOptions): string;
export {};
