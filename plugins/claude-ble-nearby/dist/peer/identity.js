const ADJECTIVES = [
    'amber', 'azure', 'bold', 'calm', 'coral', 'crisp', 'dark', 'deep',
    'dusk', 'ember', 'fern', 'flint', 'frost', 'glow', 'gold', 'haze',
    'iron', 'ivy', 'jade', 'keen', 'lark', 'lime', 'lunar', 'maple',
    'mint', 'moss', 'neon', 'nova', 'opal', 'pale', 'pine', 'plum',
    'quartz', 'rain', 'reed', 'rose', 'rust', 'sage', 'sand', 'silk',
    'slate', 'snow', 'stone', 'storm', 'swift', 'teal', 'tide', 'vine',
    'warm', 'wild',
];
const ANIMALS = [
    'badger', 'bear', 'crane', 'crow', 'deer', 'dove', 'eagle', 'elk',
    'falcon', 'finch', 'fox', 'frog', 'hawk', 'hare', 'heron', 'jay',
    'kite', 'lark', 'lion', 'lynx', 'mink', 'moth', 'newt', 'orca',
    'otter', 'owl', 'panda', 'pike', 'quail', 'raven', 'robin', 'seal',
    'shrike', 'snake', 'sparrow', 'stag', 'stork', 'swan', 'tiger', 'toad',
    'trout', 'viper', 'vole', 'wasp', 'whale', 'wolf', 'wren', 'yak',
    'zebra', 'ibis',
];
function simpleHash(input) {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}
export function generatePseudonym(bleUuid) {
    const hash = simpleHash(bleUuid);
    const adj = ADJECTIVES[hash % ADJECTIVES.length];
    const animal = ANIMALS[Math.floor(hash / ADJECTIVES.length) % ANIMALS.length];
    return `${adj}-${animal}`;
}
export function resolveDisplayName(bleUuid, opts) {
    if (opts.displayName)
        return opts.displayName;
    if (opts.identity === 'git' && opts.gitName)
        return opts.gitName;
    return generatePseudonym(bleUuid);
}
//# sourceMappingURL=identity.js.map