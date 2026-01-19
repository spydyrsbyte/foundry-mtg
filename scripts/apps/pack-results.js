export class MTGPackResults extends Application {
    constructor(cards, options = {}) {
        super(options);
        this.cards = cards;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "pack-results",
            title: "Pack Results",
            template: "systems/foundry-mtg/templates/apps/pack-results.html",
            width: 800,
            height: 600,
            resizable: true,
            classes: ["foundry-mtg", "pack-results"]
        });
    }

    getData() {
        const cards = this.cards;

        // Rarity order
        const rarityOrder = ["mythic", "rare", "uncommon", "common"];

        // Group by rarity
        const rarityGroups = {
            mythic: [],
            rare: [],
            uncommon: [],
            common: []
        };

        // Sorting helper
        cards.forEach(card => {
            let rarity = card.system.rarity || "common";
            if (!rarityGroups[rarity]) rarityGroups[rarity] = [];
            rarityGroups[rarity].push(card);
        });

        // Create ordered array for template
        const groups = rarityOrder.map(r => {
            if (rarityGroups[r].length === 0) return null;
            return {
                label: r.charAt(0).toUpperCase() + r.slice(1),
                cards: rarityGroups[r]
            };
        }).filter(g => g !== null);

        return {
            groups: groups
        };
    }
}
